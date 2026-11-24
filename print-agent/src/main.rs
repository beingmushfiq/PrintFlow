use print_agent::cleanup::FileShredder;
use print_agent::connection::HeartbeatManager;
use print_agent::journal::DurableJournal;
use print_agent::lease::JobLeaseManager;
use print_agent::spooler::{PrinterSpooler, Win32Spooler};
use print_agent::{enroll_agent, sync_printers};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

const DEFAULT_API_BASE: &str = "http://127.0.0.1:8000";

fn main() {
    let args: Vec<String> = env::args().collect();
    let mut pairing_code: Option<String> = None;
    let mut api_base = DEFAULT_API_BASE.to_string();
    let mut device_name = "Counter-WinStation".to_string();

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--pair" | "-p" => {
                if i + 1 < args.len() {
                    pairing_code = Some(args[i + 1].clone());
                    i += 1;
                }
            }
            "--api" => {
                if i + 1 < args.len() {
                    api_base = args[i + 1].clone();
                    i += 1;
                }
            }
            "--device" => {
                if i + 1 < args.len() {
                    device_name = args[i + 1].clone();
                    i += 1;
                }
            }
            "--help" | "-h" => {
                println!("PrintFlow Windows Desktop Agent");
                println!("Usage: print-agent [OPTIONS]");
                println!();
                println!("Options:");
                println!("  --pair, -p <CODE>    6-digit pairing code from Owner Dashboard");
                println!("  --api <URL>          Backend API base URL (default: http://127.0.0.1:8000)");
                println!("  --device <NAME>      Workstation identifier label (default: Counter-WinStation)");
                println!("  --help, -h           Show this help message");
                return;
            }
            _ => {}
        }
        i += 1;
    }

    println!("=======================================================");
    println!("        PrintFlow Windows Desktop Print Agent");
    println!("=======================================================");

    let config_path = PathBuf::from("agent_config.json");
    let mut token: Option<String> = None;

    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(t) = json["agent_token"].as_str() {
                    token = Some(t.to_string());
                    if let Some(dev) = json["device_name"].as_str() {
                        device_name = dev.to_string();
                    }
                    if let Some(api) = json["api_base"].as_str() {
                        api_base = api.to_string();
                    }
                    println!("[Agent] Loaded existing credentials for: {}", device_name);
                }
            }
        }
    }

    if token.is_none() {
        let code = match pairing_code {
            Some(c) => c,
            None => {
                println!("[Agent] No active session found.");
                println!("Please generate a 6-digit PIN in your PrintFlow Owner Dashboard.");
                print!("Enter 6-digit Pairing Code: ");
                let mut input = String::new();
                std::io::stdin().read_line(&mut input).expect("Failed to read PIN");
                input.trim().to_string()
            }
        };

        if code.len() != 6 {
            eprintln!("[Error] Pairing code must be exactly 6 digits.");
            std::process::exit(1);
        }

        println!("[Agent] Enrolling with PrintFlow at {} ...", api_base);
        let machine_guid = format!("win-guid-{}", rand::random::<u32>());
        let pubkey_hash = format!("hash-{}", rand::random::<u64>());

        match enroll_agent(&api_base, &code, &device_name, &machine_guid, &pubkey_hash) {
            Ok(result) => {
                println!("\n[SUCCESS] Workstation paired successfully!");
                println!("Agent ID: {}", result.agent_id);
                println!("Shop ID:  {}", result.shop_id);

                let saved = serde_json::json!({
                    "agent_id": result.agent_id,
                    "tenant_id": result.tenant_id,
                    "shop_id": result.shop_id,
                    "device_name": result.device_name,
                    "agent_token": result.agent_token,
                    "api_base": api_base,
                });
                let _ = fs::write(&config_path, serde_json::to_string_pretty(&saved).unwrap());
                token = Some(result.agent_token);
            }
            Err(e) => {
                eprintln!("\n[Enrollment Error] {}", e);
                std::process::exit(1);
            }
        }
    }

    let agent_token = token.unwrap();
    let spooler = Win32Spooler::new();
    let journal = DurableJournal::new("print_journal.db").expect("Failed to open journal db");
    let mut heartbeat_mgr = HeartbeatManager::default();

    // Initial printer discovery and sync
    if let Ok(printers) = spooler.enum_printers() {
        println!("[Agent] Discovered {} local printers. Syncing...", printers.len());
        for p in &printers {
            println!("   * {} ({})", p.name, p.connection_type);
        }
        let _ = sync_printers(&api_base, &agent_token, &printers);
    }

    println!("\n[Agent] Listening for print jobs... (Press Ctrl+C to terminate)");

    loop {
        // Send heartbeat
        if let Ok(hb) = heartbeat_mgr.send_heartbeat(&api_base, &agent_token) {
            // Heartbeat OK
            let _ = hb;
        }

        // Poll for next leased job
        match JobLeaseManager::lease_next(&api_base, &agent_token, None) {
            Ok(Some(job)) => {
                println!("\n[Agent] >>> Received Print Job: {}", job.job_id);
                let temp_path = PathBuf::from(format!("job_{}.tmp", job.job_id));

                match JobLeaseManager::download_and_verify(&job.download_url, Some(&agent_token), &job.file_hash, &temp_path) {
                    Ok(bytes) => {
                        let printer_name = "Microsoft Print to PDF";
                        match JobLeaseManager::process_job(&job, &bytes, printer_name, &journal, &spooler, &temp_path) {
                            Ok(spool_id) => {
                                println!("[Agent] Spooled to printer. Spooler Job ID: {}", spool_id);
                                let _ = JobLeaseManager::acknowledge(&api_base, &agent_token, &job.job_id, &job.lease_token, spool_id);
                                let _ = FileShredder::shred_and_delete(&temp_path);
                                let _ = JobLeaseManager::ack_shred(&api_base, &agent_token, &job.job_id);
                                println!("[Agent] Complete! Temp file shredded with zero trace.");
                            }
                            Err(e) => {
                                eprintln!("[Agent] Spooling failed: {}", e);
                                let _ = JobLeaseManager::fail(&api_base, &agent_token, &job.job_id, &job.lease_token, "SPOOL_ERR", Some(&e), true);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[Agent] Download/verification failed: {}", e);
                        let _ = JobLeaseManager::fail(&api_base, &agent_token, &job.job_id, &job.lease_token, "DL_ERR", Some(&e), false);
                    }
                }
            }
            Ok(None) => {
                // Queue idle
            }
            Err(e) => {
                eprintln!("[Agent] Polling warning: {}", e);
            }
        }

        thread::sleep(Duration::from_secs(3));
    }
}
