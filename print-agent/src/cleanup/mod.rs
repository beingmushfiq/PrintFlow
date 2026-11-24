use rand::RngCore;
use std::fs::OpenOptions;
use std::io::{self, Seek, SeekFrom, Write};
use std::path::Path;

/// Ephemeral file shredder that overwrites file contents with zeros and pseudo-random
/// entropy before deletion to prevent recovery of sensitive customer documents.
pub struct FileShredder;

impl FileShredder {
    /// Securely overwrite file in place, flush to disk, and remove the file.
    pub fn shred_and_delete<P: AsRef<Path>>(path: P) -> io::Result<u64> {
        let path = path.as_ref();
        if !path.exists() {
            return Ok(0);
        }

        let metadata = std::fs::metadata(path)?;
        let file_len = metadata.len();

        if file_len > 0 {
            let mut file = OpenOptions::new()
                .read(true)
                .write(true)
                .open(path)?;

            // Pass 1: Zero overwrite
            file.seek(SeekFrom::Start(0))?;
            let zero_buffer = vec![0u8; 8192];
            let mut written = 0u64;
            while written < file_len {
                let chunk_size = std::cmp::min(zero_buffer.len() as u64, file_len - written) as usize;
                file.write_all(&zero_buffer[..chunk_size])?;
                written += chunk_size as u64;
            }
            file.flush()?;
            file.sync_all()?;

            // Pass 2: Cryptographic / pseudo-random byte overwrite
            file.seek(SeekFrom::Start(0))?;
            let mut rng = rand::thread_rng();
            let mut random_buffer = vec![0u8; 8192];
            written = 0u64;
            while written < file_len {
                let chunk_size = std::cmp::min(random_buffer.len() as u64, file_len - written) as usize;
                rng.fill_bytes(&mut random_buffer[..chunk_size]);
                file.write_all(&random_buffer[..chunk_size])?;
                written += chunk_size as u64;
            }
            file.flush()?;
            file.sync_all()?;
        }

        // Pass 3: Unlink from filesystem
        std::fs::remove_file(path)?;

        Ok(file_len)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_shredding_removes_file() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("customer_statement.pdf");

        // Write sensitive test content
        let sensitive_data = b"CONFIDENTIAL FINANCIAL RECORD - JOHN DOE 2026";
        std::fs::write(&file_path, sensitive_data).unwrap();
        assert!(file_path.exists());

        // Shred and delete
        let bytes_shredded = FileShredder::shred_and_delete(&file_path).unwrap();
        assert_eq!(bytes_shredded, sensitive_data.len() as u64);
        assert!(!file_path.exists());
    }

    #[test]
    fn test_shredding_non_existent_file_is_noop() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("non_existent.pdf");
        let bytes = FileShredder::shred_and_delete(&file_path).unwrap();
        assert_eq!(bytes, 0);
    }
}
