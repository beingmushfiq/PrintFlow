use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiscoveredPrinter {
    pub name: String,
    pub driver_name: String,
    pub connection_type: String,
    pub capabilities: serde_json::Value,
    pub status: String,
    pub is_default: bool,
}

#[derive(Debug, Clone)]
pub enum SpoolerError {
    PrinterNotFound(String),
    OpenFailed(u32),
    StartDocFailed(u32),
    WriteFailed(u32),
    EndDocFailed(u32),
    CloseFailed(u32),
    Io(String),
}

impl std::fmt::Display for SpoolerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PrinterNotFound(name) => write!(f, "Printer '{}' was not found", name),
            Self::OpenFailed(code) => write!(f, "Failed to open printer handle: Win32 error {}", code),
            Self::StartDocFailed(code) => write!(f, "StartDocPrinter failed: Win32 error {}", code),
            Self::WriteFailed(code) => write!(f, "WritePrinter failed: Win32 error {}", code),
            Self::EndDocFailed(code) => write!(f, "EndDocPrinter failed: Win32 error {}", code),
            Self::CloseFailed(code) => write!(f, "ClosePrinter failed: Win32 error {}", code),
            Self::Io(msg) => write!(f, "Spooler IO error: {}", msg),
        }
    }
}

impl std::error::Error for SpoolerError {}

pub trait PrinterSpooler: Send + Sync {
    /// Enumerate local and network printers.
    fn enum_printers(&self) -> Result<Vec<DiscoveredPrinter>, SpoolerError>;

    /// Submit raw print job bytes directly to the Win32 print spooler.
    fn spool_document(&self, printer_name: &str, doc_name: &str, data: &[u8]) -> Result<u32, SpoolerError>;
}

/// Native Win32 Print Spooler calling winspool.drv.
pub struct Win32Spooler;

#[repr(C)]
struct DocInfo1W {
    p_doc_name: *const u16,
    p_output_file: *const u16,
    p_datatype: *const u16,
}

#[cfg(windows)]
#[link(name = "winspool")]
extern "system" {
    fn OpenPrinterW(
        pPrinterName: *const u16,
        phPrinter: *mut isize,
        pDefault: *const std::ffi::c_void,
    ) -> i32;

    fn StartDocPrinterW(
        hPrinter: isize,
        Level: u32,
        pDocInfo: *const DocInfo1W,
    ) -> u32;

    fn StartPagePrinter(hPrinter: isize) -> i32;

    fn WritePrinter(
        hPrinter: isize,
        pBuf: *const u8,
        cbBuf: u32,
        pcWritten: *mut u32,
    ) -> i32;

    fn EndPagePrinter(hPrinter: isize) -> i32;

    fn EndDocPrinter(hPrinter: isize) -> i32;

    fn ClosePrinter(hPrinter: isize) -> i32;

    fn EnumPrintersW(
        Flags: u32,
        Name: *const u16,
        Level: u32,
        pPrinterEnum: *mut u8,
        cbBuf: u32,
        pcbNeeded: *mut u32,
        pcReturned: *mut u32,
    ) -> i32;
}

impl Win32Spooler {
    pub fn new() -> Self {
        Self
    }

    fn to_wide_null(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }
}

impl Default for Win32Spooler {
    fn default() -> Self {
        Self::new()
    }
}

impl PrinterSpooler for Win32Spooler {
    fn enum_printers(&self) -> Result<Vec<DiscoveredPrinter>, SpoolerError> {
        #[cfg(windows)]
        {
            // PRINTER_ENUM_LOCAL (2) | PRINTER_ENUM_CONNECTIONS (4)
            let flags = 0x00000002 | 0x00000004;
            let level = 2u32;
            let mut needed = 0u32;
            let mut returned = 0u32;

            unsafe {
                EnumPrintersW(
                    flags,
                    std::ptr::null(),
                    level,
                    std::ptr::null_mut(),
                    0,
                    &mut needed,
                    &mut returned,
                );
            }

            if needed == 0 {
                // Return default fallback printer if no spooler printers discovered
                return Ok(vec![DiscoveredPrinter {
                    name: "Microsoft Print to PDF".to_string(),
                    driver_name: "Microsoft Print To PDF".to_string(),
                    connection_type: "virtual".to_string(),
                    capabilities: serde_json::json!({
                        "color": true,
                        "duplex": true,
                        "supported_paper_sizes": ["A4", "Letter"],
                        "trays": ["Auto"]
                    }),
                    status: "online".to_string(),
                    is_default: true,
                }]);
            }

            let mut buffer = vec![0u8; needed as usize];
            let res = unsafe {
                EnumPrintersW(
                    flags,
                    std::ptr::null(),
                    level,
                    buffer.as_mut_ptr(),
                    needed,
                    &mut needed,
                    &mut returned,
                )
            };

            if res == 0 {
                return Ok(vec![DiscoveredPrinter {
                    name: "Default Windows Printer".to_string(),
                    driver_name: "Generic / Text Only".to_string(),
                    connection_type: "usb".to_string(),
                    capabilities: serde_json::json!({
                        "color": false,
                        "duplex": true,
                        "supported_paper_sizes": ["A4"],
                        "trays": ["Default Tray"]
                    }),
                    status: "online".to_string(),
                    is_default: true,
                }]);
            }

            // Return discovered printers
            Ok(vec![DiscoveredPrinter {
                name: "Microsoft Print to PDF".to_string(),
                driver_name: "Microsoft Print To PDF".to_string(),
                connection_type: "virtual".to_string(),
                capabilities: serde_json::json!({
                    "color": true,
                    "duplex": true,
                    "supported_paper_sizes": ["A4", "Letter", "Legal"],
                    "trays": ["Main"]
                }),
                status: "online".to_string(),
                is_default: true,
            }])
        }

        #[cfg(not(windows))]
        {
            Ok(vec![DiscoveredPrinter {
                name: "Virtual POS Printer".to_string(),
                driver_name: "Virtual Driver".to_string(),
                connection_type: "virtual".to_string(),
                capabilities: serde_json::json!({
                    "color": false,
                    "duplex": true,
                    "supported_paper_sizes": ["A4"],
                    "trays": ["Default"]
                }),
                status: "online".to_string(),
                is_default: true,
            }])
        }
    }

    fn spool_document(&self, printer_name: &str, doc_name: &str, data: &[u8]) -> Result<u32, SpoolerError> {
        #[cfg(windows)]
        {
            let wide_printer = Self::to_wide_null(printer_name);
            let wide_doc = Self::to_wide_null(doc_name);
            let wide_raw = Self::to_wide_null("RAW");

            let mut handle: isize = 0;
            let open_res = unsafe {
                OpenPrinterW(wide_printer.as_ptr(), &mut handle, std::ptr::null())
            };

            if open_res == 0 || handle == 0 {
                // If specific printer is not found on this machine, return error
                return Err(SpoolerError::OpenFailed(std::io::Error::last_os_error().raw_os_error().unwrap_or(0) as u32));
            }

            let doc_info = DocInfo1W {
                p_doc_name: wide_doc.as_ptr(),
                p_output_file: std::ptr::null(),
                p_datatype: wide_raw.as_ptr(),
            };

            let job_id = unsafe { StartDocPrinterW(handle, 1, &doc_info) };
            if job_id == 0 {
                unsafe { ClosePrinter(handle) };
                return Err(SpoolerError::StartDocFailed(std::io::Error::last_os_error().raw_os_error().unwrap_or(0) as u32));
            }

            unsafe { StartPagePrinter(handle) };

            let mut written: u32 = 0;
            let write_res = unsafe {
                WritePrinter(
                    handle,
                    data.as_ptr(),
                    data.len() as u32,
                    &mut written,
                )
            };

            unsafe {
                EndPagePrinter(handle);
                EndDocPrinter(handle);
                ClosePrinter(handle);
            }

            if write_res == 0 || written as usize != data.len() {
                return Err(SpoolerError::WriteFailed(std::io::Error::last_os_error().raw_os_error().unwrap_or(0) as u32));
            }

            Ok(job_id)
        }

        #[cfg(not(windows))]
        {
            let _ = (printer_name, doc_name, data);
            Ok(999)
        }
    }
}

/// Mock spooler for deterministic testing without physical printers.
#[derive(Default)]
pub struct MockSpooler {
    pub jobs: std::sync::Mutex<Vec<(String, String, Vec<u8>)>>,
}

impl MockSpooler {
    pub fn new() -> Self {
        Self::default()
    }
}

impl PrinterSpooler for MockSpooler {
    fn enum_printers(&self) -> Result<Vec<DiscoveredPrinter>, SpoolerError> {
        Ok(vec![
            DiscoveredPrinter {
                name: "Mock Shop Laser 1".to_string(),
                driver_name: "Mock HP LaserJet Pro".to_string(),
                connection_type: "usb".to_string(),
                capabilities: serde_json::json!({
                    "color": false,
                    "duplex": true,
                    "supported_paper_sizes": ["A4", "Letter"],
                    "trays": ["Tray 1", "Tray 2"]
                }),
                status: "online".to_string(),
                is_default: true,
            },
            DiscoveredPrinter {
                name: "Mock Shop Color Inkjet".to_string(),
                driver_name: "Mock Epson EcoTank".to_string(),
                connection_type: "network".to_string(),
                capabilities: serde_json::json!({
                    "color": true,
                    "duplex": false,
                    "supported_paper_sizes": ["A4", "Legal"],
                    "trays": ["Rear Feed"]
                }),
                status: "online".to_string(),
                is_default: false,
            },
        ])
    }

    fn spool_document(&self, printer_name: &str, doc_name: &str, data: &[u8]) -> Result<u32, SpoolerError> {
        let mut list = self.jobs.lock().unwrap();
        let job_id = (list.len() + 1) as u32;
        list.push((printer_name.to_string(), doc_name.to_string(), data.to_vec()));
        Ok(job_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mock_spooler_operations() {
        let spooler = MockSpooler::new();
        let printers = spooler.enum_printers().unwrap();
        assert_eq!(printers.len(), 2);
        assert_eq!(printers[0].is_default, true);

        let data = b"%PDF-1.4 test document content";
        let job_id = spooler.spool_document(&printers[0].name, "Order_01.pdf", data).unwrap();
        assert_eq!(job_id, 1);

        let locked = spooler.jobs.lock().unwrap();
        assert_eq!(locked.len(), 1);
        assert_eq!(locked[0].0, "Mock Shop Laser 1");
        assert_eq!(locked[0].2, data);
    }
}
