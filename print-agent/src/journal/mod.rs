use chrono::Utc;
use rusqlite::{params, Connection, Result};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JournalEntry {
    pub job_id: String,
    pub lease_token: String,
    pub status: String,
    pub file_hash: String,
    pub spooler_job_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct DurableJournal {
    conn: Connection,
}

impl DurableJournal {
    /// Initialize durable SQLite journal at the specified path or in-memory.
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        let journal = Self { conn };
        journal.init_schema()?;
        Ok(journal)
    }

    /// In-memory durable journal for isolated unit tests.
    pub fn in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let journal = Self { conn };
        journal.init_schema()?;
        Ok(journal)
    }

    fn init_schema(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS journal_jobs (
                job_id TEXT PRIMARY KEY,
                lease_token TEXT NOT NULL,
                status TEXT NOT NULL,
                file_hash TEXT NOT NULL,
                spooler_job_id INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;
        Ok(())
    }

    /// Record newly leased job prior to spooling.
    pub fn record_lease(&self, job_id: &str, lease_token: &str, file_hash: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO journal_jobs (job_id, lease_token, status, file_hash, spooler_job_id, created_at, updated_at)
             VALUES (?1, ?2, 'leased', ?3, NULL, ?4, ?4)
             ON CONFLICT(job_id) DO UPDATE SET
                lease_token = excluded.lease_token,
                status = 'leased',
                updated_at = excluded.updated_at",
            params![job_id, lease_token, file_hash, now],
        )?;
        Ok(())
    }

    /// Record that the job was submitted to the local spooler.
    pub fn record_spooled(&self, job_id: &str, spooler_job_id: u32) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE journal_jobs
             SET status = 'spooled', spooler_job_id = ?1, updated_at = ?2
             WHERE job_id = ?3",
            params![spooler_job_id as i64, now, job_id],
        )?;
        Ok(())
    }

    /// Record that the server acknowledged completion.
    pub fn record_acked(&self, job_id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE journal_jobs
             SET status = 'acked', updated_at = ?1
             WHERE job_id = ?2",
            params![now, job_id],
        )?;
        Ok(())
    }

    /// Record job failure.
    pub fn record_failed(&self, job_id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE journal_jobs
             SET status = 'failed', updated_at = ?1
             WHERE job_id = ?2",
            params![now, job_id],
        )?;
        Ok(())
    }

    /// Check if a job ID has already been spooled or completed locally.
    /// This is the primary duplicate-print prevention check.
    pub fn has_been_spooled(&self, job_id: &str) -> Result<bool> {
        let mut stmt = self.conn.prepare(
            "SELECT status FROM journal_jobs WHERE job_id = ?1",
        )?;
        let mut rows = stmt.query(params![job_id])?;

        if let Some(row) = rows.next()? {
            let status: String = row.get(0)?;
            Ok(status == "spooled" || status == "acked")
        } else {
            Ok(false)
        }
    }

    /// Retrieve an entry by job ID.
    pub fn get_entry(&self, job_id: &str) -> Result<Option<JournalEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT job_id, lease_token, status, file_hash, spooler_job_id, created_at, updated_at
             FROM journal_jobs WHERE job_id = ?1",
        )?;
        let mut rows = stmt.query(params![job_id])?;

        if let Some(row) = rows.next()? {
            Ok(Some(JournalEntry {
                job_id: row.get(0)?,
                lease_token: row.get(1)?,
                status: row.get(2)?,
                file_hash: row.get(3)?,
                spooler_job_id: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            }))
        } else {
            Ok(None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_durable_journal_lifecycle() {
        let journal = DurableJournal::in_memory().expect("in memory journal created");

        let job_id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
        let token = "plt_test_token_1234567890";
        let hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

        assert_eq!(journal.has_been_spooled(job_id).unwrap(), false);

        journal.record_lease(job_id, token, hash).unwrap();
        let entry = journal.get_entry(job_id).unwrap().unwrap();
        assert_eq!(entry.status, "leased");
        assert_eq!(entry.spooler_job_id, None);
        assert_eq!(journal.has_been_spooled(job_id).unwrap(), false);

        journal.record_spooled(job_id, 42).unwrap();
        assert_eq!(journal.has_been_spooled(job_id).unwrap(), true);
        let entry = journal.get_entry(job_id).unwrap().unwrap();
        assert_eq!(entry.status, "spooled");
        assert_eq!(entry.spooler_job_id, Some(42));

        journal.record_acked(job_id).unwrap();
        assert_eq!(journal.has_been_spooled(job_id).unwrap(), true);
        let entry = journal.get_entry(job_id).unwrap().unwrap();
        assert_eq!(entry.status, "acked");
    }

    #[test]
    fn test_duplicate_spool_prevention() {
        let journal = DurableJournal::in_memory().expect("in memory journal created");
        let job_id = "01ARZ3NDEKTSV4RRFFQ69G5TEST";

        journal.record_lease(job_id, "token1", "hash1").unwrap();
        journal.record_spooled(job_id, 101).unwrap();

        // Check that any attempt to check spool status immediately identifies prior spooling
        assert!(journal.has_been_spooled(job_id).unwrap());
    }
}
