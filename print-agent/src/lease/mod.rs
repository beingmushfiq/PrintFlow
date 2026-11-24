use crate::cleanup::FileShredder;
use crate::journal::DurableJournal;
use crate::spooler::PrinterSpooler;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeasedJob {
    pub job_id: String,
    pub order_id: String,
    pub order_file_id: String,
    pub lease_token: String,
    pub lease_expires_at: String,
    pub download_url: String,
    pub file_hash: String,
    pub pages_total: u32,
    pub print_settings: serde_json::Value,
}

pub struct JobLeaseManager;

impl JobLeaseManager {
    /// Calculate the SHA-256 hex digest of a byte slice.
    pub fn compute_sha256(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        let result = hasher.finalize();
        format!("{:x}", result)
    }

    /// Verify byte slice matches expected SHA-256 hex string (case-insensitive).
    pub fn verify_sha256(bytes: &[u8], expected_hex: &str) -> bool {
        let actual = Self::compute_sha256(bytes);
        actual.eq_ignore_ascii_case(expected_hex.trim())
    }

    /// Request the next available job lease from the PrintFlow backend.
    pub fn lease_next(
        api_base: &str,
        agent_token: &str,
        printer_id: Option<&str>,
    ) -> Result<Option<LeasedJob>, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("{}/api/v1/agent/jobs/next", api_base.trim_end_matches('/'));
        let mut req = client
            .post(&url)
            .bearer_auth(agent_token)
            .header("Accept", "application/json");

        if let Some(pid) = printer_id {
            req = req.json(&serde_json::json!({ "printer_id": pid }));
        }

        let resp = req.send().map_err(|e| format!("Lease request failed: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!("Lease request returned HTTP {}", resp.status()));
        }

        let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let data = &body["data"];

        if data.is_null() {
            return Ok(None);
        }

        let job: LeasedJob = serde_json::from_value(data.clone())
            .map_err(|e| format!("Failed to parse lease payload: {}", e))?;

        Ok(Some(job))
    }

    /// Download document bytes, write to secure temp file, and verify SHA-256 checksum.
    pub fn download_and_verify(
        download_url: &str,
        agent_token: Option<&str>,
        expected_hash: &str,
        dest_path: &Path,
    ) -> Result<Vec<u8>, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?;

        let mut req = client.get(download_url);
        if let Some(tok) = agent_token {
            req = req.bearer_auth(tok);
        }

        let resp = req.send().map_err(|e| format!("Download failed: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!("Download returned HTTP status {}", resp.status()));
        }

        let bytes = resp.bytes().map_err(|e| format!("Reading download stream failed: {}", e))?.to_vec();

        // Cryptographic integrity verification
        if !Self::verify_sha256(&bytes, expected_hash) {
            return Err(format!(
                "SHA-256 integrity mismatch. Expected: {}, Computed: {}",
                expected_hash,
                Self::compute_sha256(&bytes)
            ));
        }

        // Write to target temp file
        let mut file = File::create(dest_path).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.flush().map_err(|e| e.to_string())?;

        Ok(bytes)
    }

    /// Acknowledge successful submission to spooler.
    pub fn acknowledge(
        api_base: &str,
        agent_token: &str,
        job_id: &str,
        lease_token: &str,
        spooler_job_id: u32,
    ) -> Result<(), String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("{}/api/v1/agent/jobs/{}/ack", api_base.trim_end_matches('/'), job_id);
        let resp = client
            .post(&url)
            .bearer_auth(agent_token)
            .json(&serde_json::json!({
                "lease_token": lease_token,
                "spooler_job_id": spooler_job_id,
            }))
            .send()
            .map_err(|e| format!("Ack failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Ack returned HTTP status {}", resp.status()));
        }

        Ok(())
    }

    /// Report job failure to backend.
    pub fn fail(
        api_base: &str,
        agent_token: &str,
        job_id: &str,
        lease_token: &str,
        error_code: &str,
        error_message: Option<&str>,
        retryable: bool,
    ) -> Result<(), String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("{}/api/v1/agent/jobs/{}/fail", api_base.trim_end_matches('/'), job_id);
        let resp = client
            .post(&url)
            .bearer_auth(agent_token)
            .json(&serde_json::json!({
                "lease_token": lease_token,
                "error_code": error_code,
                "error_message": error_message,
                "retryable": retryable,
            }))
            .send()
            .map_err(|e| format!("Fail report failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Fail report returned HTTP status {}", resp.status()));
        }

        Ok(())
    }

    /// Report local file shredding completion to backend audit log.
    pub fn ack_shred(
        api_base: &str,
        agent_token: &str,
        job_id: &str,
    ) -> Result<(), String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("{}/api/v1/agent/jobs/{}/shred-ack", api_base.trim_end_matches('/'), job_id);
        let resp = client
            .post(&url)
            .bearer_auth(agent_token)
            .send()
            .map_err(|e| format!("Shred ack failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Shred ack returned HTTP status {}", resp.status()));
        }

        Ok(())
    }

    /// Process a leased job from end to end:
    /// Check journal -> Record lease -> Verify hash -> Spool -> Shred local temp file -> Ack server -> Update journal.
    pub fn process_job(
        job: &LeasedJob,
        file_bytes: &[u8],
        printer_name: &str,
        journal: &DurableJournal,
        spooler: &dyn PrinterSpooler,
        temp_file_path: &Path,
    ) -> Result<u32, String> {
        // 1. Duplicate print prevention check
        if journal.has_been_spooled(&job.job_id).map_err(|e| e.to_string())? {
            return Err(format!("Duplicate prevention: Job {} was already submitted to spooler", job.job_id));
        }

        // 2. Record lease in durable journal
        journal.record_lease(&job.job_id, &job.lease_token, &job.file_hash)
            .map_err(|e| e.to_string())?;

        // 3. Cryptographic hash check
        if !Self::verify_sha256(file_bytes, &job.file_hash) {
            journal.record_failed(&job.job_id).map_err(|e| e.to_string())?;
            return Err(format!("SHA-256 verification failed for job {}", job.job_id));
        }

        // 4. Submit to spooler
        let doc_name = format!("PrintFlow_{}", job.job_id);
        let spooler_job_id = spooler.spool_document(printer_name, &doc_name, file_bytes)
            .map_err(|e| format!("Spooling failed: {}", e))?;

        // 5. Record spooled state in local journal
        journal.record_spooled(&job.job_id, spooler_job_id)
            .map_err(|e| e.to_string())?;

        // 6. Shred local temp file immediately upon spooler close
        if temp_file_path.exists() {
            let _ = FileShredder::shred_and_delete(temp_file_path);
        }

        Ok(spooler_job_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spooler::MockSpooler;

    #[test]
    fn test_sha256_computation_and_verification() {
        let sample = b"PrintFlow Test Document Content 2026";
        let hash = JobLeaseManager::compute_sha256(sample);

        assert!(JobLeaseManager::verify_sha256(sample, &hash));
        assert!(JobLeaseManager::verify_sha256(sample, &hash.to_uppercase()));
        assert!(!JobLeaseManager::verify_sha256(b"Tampered document content", &hash));
    }

    #[test]
    fn test_process_job_lifecycle_with_journal_and_shred() {
        let dir = tempfile::tempdir().unwrap();
        let temp_file = dir.path().join("test_doc.tmp");
        let content = b"%PDF-1.4 genuine bank statement";
        std::fs::write(&temp_file, content).unwrap();

        let hash = JobLeaseManager::compute_sha256(content);
        let journal = DurableJournal::in_memory().unwrap();
        let spooler = MockSpooler::new();

        let job = LeasedJob {
            job_id: "01ARZ3NDEKTSV4RRFFQ69G5ABC".to_string(),
            order_id: "01ARZ3NDEKTSV4RRFFQ69G5ORD".to_string(),
            order_file_id: "01ARZ3NDEKTSV4RRFFQ69G5FIL".to_string(),
            lease_token: "plt_valid_token".to_string(),
            lease_expires_at: "2026-11-24T15:00:00Z".to_string(),
            download_url: "https://example.com/download".to_string(),
            file_hash: hash,
            pages_total: 1,
            print_settings: serde_json::json!({ "copies": 1 }),
        };

        let spool_id = JobLeaseManager::process_job(
            &job,
            content,
            "Mock Shop Laser 1",
            &journal,
            &spooler,
            &temp_file,
        ).unwrap();

        assert_eq!(spool_id, 1);
        assert!(!temp_file.exists(), "Temporary file must be shredded after spooling");
        assert!(journal.has_been_spooled(&job.job_id).unwrap(), "Journal must record spooled status");

        // Attempting to re-process identical job ID must be rejected by duplicate check
        let second_attempt = JobLeaseManager::process_job(
            &job,
            content,
            "Mock Shop Laser 1",
            &journal,
            &spooler,
            &temp_file,
        );
        assert!(second_attempt.is_err(), "Duplicate job processing must be blocked by journal");
    }
}
