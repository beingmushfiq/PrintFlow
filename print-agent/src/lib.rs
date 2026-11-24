pub mod cleanup;
pub mod connection;
pub mod journal;
pub mod lease;
pub mod spooler;

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrollmentResult {
    pub agent_id: String,
    pub tenant_id: String,
    pub shop_id: String,
    pub device_name: String,
    pub agent_token: String,
}

/// Perform initial cryptographic enrollment of print agent using a 6-digit pairing code.
pub fn enroll_agent(
    api_base: &str,
    pairing_code: &str,
    device_name: &str,
    machine_guid: &str,
    public_key_hash: &str,
) -> Result<EnrollmentResult, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/api/v1/agent/enroll", api_base.trim_end_matches('/'));
    let resp = client
        .post(&url)
        .json(&serde_json::json!({
            "pairing_code": pairing_code,
            "device_name": device_name,
            "machine_guid": machine_guid,
            "public_key_hash": public_key_hash,
        }))
        .header("Accept", "application/json")
        .send()
        .map_err(|e| format!("Enrollment request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Enrollment returned HTTP status {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    let data = &body["data"];

    Ok(EnrollmentResult {
        agent_id: data["agent_id"].as_str().unwrap_or_default().to_string(),
        tenant_id: data["tenant_id"].as_str().unwrap_or_default().to_string(),
        shop_id: data["shop_id"].as_str().unwrap_or_default().to_string(),
        device_name: data["device_name"].as_str().unwrap_or_default().to_string(),
        agent_token: data["agent_token"].as_str().unwrap_or_default().to_string(),
    })
}

/// Sync discovered local printers with the server.
pub fn sync_printers(
    api_base: &str,
    agent_token: &str,
    printers: &[spooler::DiscoveredPrinter],
) -> Result<usize, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/api/v1/agent/printers", api_base.trim_end_matches('/'));
    let resp = client
        .post(&url)
        .bearer_auth(agent_token)
        .json(&serde_json::json!({
            "printers": printers,
        }))
        .send()
        .map_err(|e| format!("Printer sync failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Printer sync returned HTTP status {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    let count = body["data"]["count"].as_u64().unwrap_or(0) as usize;

    Ok(count)
}
