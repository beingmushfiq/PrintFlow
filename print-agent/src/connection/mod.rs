use rand::Rng;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatResponse {
    pub status: String,
    pub agent_id: Option<String>,
    pub last_seen_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct HeartbeatManager {
    pub base_interval_secs: u64,
    pub jitter_secs: u64,
    pub min_backoff_secs: u64,
    pub max_backoff_secs: u64,
    pub current_backoff_secs: u64,
}

impl Default for HeartbeatManager {
    fn default() -> Self {
        Self {
            base_interval_secs: 30,
            jitter_secs: 5,
            min_backoff_secs: 1,
            max_backoff_secs: 60,
            current_backoff_secs: 1,
        }
    }
}

impl HeartbeatManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Calculate next sleep duration based on connection status and exponential backoff with jitter.
    pub fn next_interval(&mut self, is_connected: bool) -> Duration {
        let mut rng = rand::thread_rng();

        if is_connected {
            self.current_backoff_secs = self.min_backoff_secs;
            // 30s ± 5s jitter => [25, 35]
            let min_s = self.base_interval_secs.saturating_sub(self.jitter_secs);
            let max_s = self.base_interval_secs.saturating_add(self.jitter_secs);
            let secs = rng.gen_range(min_s..=max_s);
            Duration::from_secs(secs)
        } else {
            // Exponential backoff up to max_backoff_secs
            let jitter: u64 = rng.gen_range(0..=2);
            let delay = std::cmp::min(self.current_backoff_secs + jitter, self.max_backoff_secs);
            self.current_backoff_secs = std::cmp::min(self.current_backoff_secs * 2, self.max_backoff_secs);
            Duration::from_secs(delay)
        }
    }

    /// Send HTTP heartbeat ping to server.
    pub fn send_heartbeat(
        &self,
        api_base: &str,
        agent_token: &str,
    ) -> Result<HeartbeatResponse, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("{}/api/v1/agent/heartbeat", api_base.trim_end_matches('/'));
        let response = client
            .post(&url)
            .bearer_auth(agent_token)
            .header("Accept", "application/json")
            .send()
            .map_err(|e| format!("Heartbeat request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Heartbeat HTTP status {}", response.status()));
        }

        let body: serde_json::Value = response.json().map_err(|e| e.to_string())?;
        let data = &body["data"];

        Ok(HeartbeatResponse {
            status: data["status"].as_str().unwrap_or("active").to_string(),
            agent_id: data["agent_id"].as_str().map(|s| s.to_string()),
            last_seen_at: data["last_seen_at"].as_str().map(|s| s.to_string()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_heartbeat_interval_with_jitter() {
        let mut manager = HeartbeatManager::default();

        for _ in 0..20 {
            let interval = manager.next_interval(true);
            let secs = interval.as_secs();
            assert!(secs >= 25 && secs <= 35, "Interval {} was outside [25, 35]", secs);
        }
    }

    #[test]
    fn test_exponential_backoff_on_disconnect() {
        let mut manager = HeartbeatManager::default();

        let d1 = manager.next_interval(false).as_secs();
        let d2 = manager.next_interval(false).as_secs();
        let d3 = manager.next_interval(false).as_secs();

        assert!(d2 >= d1 || d2 >= 2);
        assert!(d3 >= d2 || d3 >= 4);

        // Recovery resets backoff
        let recovery = manager.next_interval(true).as_secs();
        assert!(recovery >= 25 && recovery <= 35);
        assert_eq!(manager.current_backoff_secs, manager.min_backoff_secs);
    }
}
