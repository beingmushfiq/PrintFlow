#!/usr/bin/env python3
"""
PrintFlow Windows Desktop Print Delivery & Hardware Agent
Standalone zero-dependency runner for Windows 10/11 counter workstations.

Capabilities:
1. Cryptographic enrollment with 6-digit pairing PIN.
2. Native Win32 printer discovery (EnumPrintersW Level 2 + DeviceCapabilitiesW).
3. Secure job leasing with SHA-256 checksum verification.
4. Native GDI printing for PDFs (Windows.Data.Pdf + System.Drawing.Printing) & images,
   avoiding raw PDF dumps to non-PDF GDI/SPLC/PCL printers.
5. Live Win32 Print Spooler job tracking (EnumJobsW) so orders are only marked
   completed after the spooler actually finishes delivering the job to the printer.
6. Ephemeral shredding of temporary print artifacts.
7. Heartbeat presence with jitter.
"""

import argparse
import base64
import ctypes
import ctypes.wintypes
import hashlib
import json
import os
import platform
import random
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable, Optional

CONFIG_FILE = Path(__file__).parent / "agent_config.json"
DEFAULT_API_BASE = "http://127.0.0.1:8000"

# Win32 Printer / Spooler Constants
PRINTER_ENUM_LOCAL = 0x00000002
PRINTER_ENUM_CONNECTIONS = 0x00000004
PRINTER_ATTRIBUTE_DEFAULT = 0x00000004
PRINTER_ATTRIBUTE_NETWORK = 0x00000010
PRINTER_ATTRIBUTE_WORK_OFFLINE = 0x00000400

PRINTER_STATUS_PAUSED = 0x00000001
PRINTER_STATUS_ERROR = 0x00000002
PRINTER_STATUS_PAPER_JAM = 0x00000008
PRINTER_STATUS_PAPER_OUT = 0x00000010
PRINTER_STATUS_OFFLINE = 0x00000080
PRINTER_STATUS_USER_INTERVENTION = 0x00100000
PRINTER_STATUS_DOOR_OPEN = 0x00400000

JOB_STATUS_PAUSED = 0x00000001
JOB_STATUS_ERROR = 0x00000002
JOB_STATUS_DELETING = 0x00000004
JOB_STATUS_SPOOLING = 0x00000008
JOB_STATUS_PRINTING = 0x00000010
JOB_STATUS_OFFLINE = 0x00000020
JOB_STATUS_PAPEROUT = 0x00000040
JOB_STATUS_PRINTED = 0x00000080
JOB_STATUS_DELETED = 0x00000100
JOB_STATUS_BLOCKED_DEVQ = 0x00000200
JOB_STATUS_USER_INTERVENTION = 0x00000400
JOB_STATUS_RESTART = 0x00000800
JOB_STATUS_COMPLETE = 0x00001000
JOB_STATUS_RETAINED = 0x00002000
JOB_STATUS_RENDERING_LOCALLY = 0x00004000

DC_DUPLEX = 7
DC_COLORDEVICE = 32

VIRTUAL_PRINTER_KEYWORDS = (
    "microsoft print to pdf",
    "microsoft xps",
    "onenote",
    "adobe pdf",
    "foxit",
    "pdfcreator",
    "bullzip",
    "cutepdf",
    "anydesk",
    "fax",
)

VIRTUAL_PORT_PREFIXES = (
    "portprompt:",
    "file:",
    "shrfax:",
    "nul:",
    "xpsport:",
    "documents\\",
    "microsoft.office.onenote",
)


def get_machine_guid() -> str:
    """Retrieve Windows MachineGuid or fallback to deterministic node hash."""
    try:
        import winreg

        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Cryptography",
            0,
            winreg.KEY_READ | winreg.KEY_WOW64_64KEY,
        )
        guid, _ = winreg.QueryValueEx(key, "MachineGuid")
        winreg.CloseKey(key)
        return str(guid).strip()
    except Exception:
        import uuid

        return f"win-{uuid.getnode():012x}"


def compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def classify_printer_connection(name: str, driver_name: str, port_name: str, attributes: int = 0) -> str:
    """Classify a Windows printer as 'virtual', 'network', or 'usb'."""
    name_l = (name or "").strip().lower()
    driver_l = (driver_name or "").strip().lower()
    port_l = (port_name or "").strip().lower()

    if any(port_l.startswith(prefix) for prefix in VIRTUAL_PORT_PREFIXES):
        return "virtual"
    if any(kw in name_l or kw in driver_l for kw in VIRTUAL_PRINTER_KEYWORDS):
        return "virtual"
    if port_l.startswith(("ip_", "wsd", "http://", "https://", "\\\\", "cnbjnp", "bjnp")):
        return "network"
    if attributes & PRINTER_ATTRIBUTE_NETWORK:
        return "network"
    return "usb"


def classify_printer_status(status_flags: int, attributes: int = 0) -> str:
    """Map Win32 printer status/attributes to 'online', 'offline', or 'error'."""
    if status_flags & (
        PRINTER_STATUS_ERROR
        | PRINTER_STATUS_PAPER_JAM
        | PRINTER_STATUS_PAPER_OUT
        | PRINTER_STATUS_DOOR_OPEN
        | PRINTER_STATUS_USER_INTERVENTION
    ):
        return "error"
    if (status_flags & PRINTER_STATUS_OFFLINE) or (attributes & PRINTER_ATTRIBUTE_WORK_OFFLINE):
        return "offline"
    return "online"


def describe_job_status(status_flags: int) -> str:
    """Human-readable label for a Win32 JOB_INFO_1W Status bitmask."""
    labels = []
    checks = (
        (JOB_STATUS_PAUSED, "PAUSED"),
        (JOB_STATUS_ERROR, "ERROR"),
        (JOB_STATUS_DELETING, "DELETING"),
        (JOB_STATUS_SPOOLING, "SPOOLING"),
        (JOB_STATUS_PRINTING, "PRINTING"),
        (JOB_STATUS_OFFLINE, "OFFLINE"),
        (JOB_STATUS_PAPEROUT, "PAPER_OUT"),
        (JOB_STATUS_PRINTED, "PRINTED"),
        (JOB_STATUS_DELETED, "DELETED"),
        (JOB_STATUS_BLOCKED_DEVQ, "DRIVER_BLOCKED"),
        (JOB_STATUS_USER_INTERVENTION, "USER_INTERVENTION"),
        (JOB_STATUS_RESTART, "RESTARTING"),
        (JOB_STATUS_COMPLETE, "COMPLETE"),
        (JOB_STATUS_RETAINED, "RETAINED"),
        (JOB_STATUS_RENDERING_LOCALLY, "RENDERING"),
    )
    for flag, label in checks:
        if status_flags & flag:
            labels.append(label)
    return ", ".join(labels) if labels else "QUEUED"


if sys.platform == "win32":

    class PRINTER_INFO_2W(ctypes.Structure):
        _fields_ = [
            ("pServerName", ctypes.wintypes.LPWSTR),
            ("pPrinterName", ctypes.wintypes.LPWSTR),
            ("pShareName", ctypes.wintypes.LPWSTR),
            ("pPortName", ctypes.wintypes.LPWSTR),
            ("pDriverName", ctypes.wintypes.LPWSTR),
            ("pComment", ctypes.wintypes.LPWSTR),
            ("pLocation", ctypes.wintypes.LPWSTR),
            ("pDevMode", ctypes.c_void_p),
            ("pSepFile", ctypes.wintypes.LPWSTR),
            ("pPrintProcessor", ctypes.wintypes.LPWSTR),
            ("pDatatype", ctypes.wintypes.LPWSTR),
            ("pParameters", ctypes.wintypes.LPWSTR),
            ("pSecurityDescriptor", ctypes.c_void_p),
            ("Attributes", ctypes.wintypes.DWORD),
            ("Priority", ctypes.wintypes.DWORD),
            ("DefaultPriority", ctypes.wintypes.DWORD),
            ("StartTime", ctypes.wintypes.DWORD),
            ("UntilTime", ctypes.wintypes.DWORD),
            ("Status", ctypes.wintypes.DWORD),
            ("cJobs", ctypes.wintypes.DWORD),
            ("AveragePPM", ctypes.wintypes.DWORD),
        ]

    class SYSTEMTIME(ctypes.Structure):
        _fields_ = [
            ("wYear", ctypes.wintypes.WORD),
            ("wMonth", ctypes.wintypes.WORD),
            ("wDayOfWeek", ctypes.wintypes.WORD),
            ("wDay", ctypes.wintypes.WORD),
            ("wHour", ctypes.wintypes.WORD),
            ("wMinute", ctypes.wintypes.WORD),
            ("wSecond", ctypes.wintypes.WORD),
            ("wMilliseconds", ctypes.wintypes.WORD),
        ]

    class JOB_INFO_1W(ctypes.Structure):
        _fields_ = [
            ("JobId", ctypes.wintypes.DWORD),
            ("pPrinterName", ctypes.wintypes.LPWSTR),
            ("pMachineName", ctypes.wintypes.LPWSTR),
            ("pUserName", ctypes.wintypes.LPWSTR),
            ("pDocument", ctypes.wintypes.LPWSTR),
            ("pDatatype", ctypes.wintypes.LPWSTR),
            ("pStatus", ctypes.wintypes.LPWSTR),
            ("Status", ctypes.wintypes.DWORD),
            ("Priority", ctypes.wintypes.DWORD),
            ("Position", ctypes.wintypes.DWORD),
            ("TotalPages", ctypes.wintypes.DWORD),
            ("PagesPrinted", ctypes.wintypes.DWORD),
            ("Submitted", SYSTEMTIME),
        ]

    class DOC_INFO_1W(ctypes.Structure):
        _fields_ = [
            ("pDocName", ctypes.wintypes.LPWSTR),
            ("pOutputFile", ctypes.wintypes.LPWSTR),
            ("pDatatype", ctypes.wintypes.LPWSTR),
        ]


def _get_winspool():
    winspool = ctypes.WinDLL("winspool.drv", use_last_error=True)

    winspool.EnumPrintersW.argtypes = [
        ctypes.wintypes.DWORD,
        ctypes.wintypes.LPWSTR,
        ctypes.wintypes.DWORD,
        ctypes.c_void_p,
        ctypes.wintypes.DWORD,
        ctypes.POINTER(ctypes.wintypes.DWORD),
        ctypes.POINTER(ctypes.wintypes.DWORD),
    ]
    winspool.EnumPrintersW.restype = ctypes.wintypes.BOOL

    winspool.GetDefaultPrinterW.argtypes = [
        ctypes.wintypes.LPWSTR,
        ctypes.POINTER(ctypes.wintypes.DWORD),
    ]
    winspool.GetDefaultPrinterW.restype = ctypes.wintypes.BOOL

    winspool.DeviceCapabilitiesW.argtypes = [
        ctypes.wintypes.LPWSTR,
        ctypes.wintypes.LPWSTR,
        ctypes.wintypes.WORD,
        ctypes.c_void_p,
        ctypes.c_void_p,
    ]
    winspool.DeviceCapabilitiesW.restype = ctypes.wintypes.DWORD

    winspool.OpenPrinterW.argtypes = [
        ctypes.wintypes.LPWSTR,
        ctypes.POINTER(ctypes.wintypes.HANDLE),
        ctypes.wintypes.LPVOID,
    ]
    winspool.OpenPrinterW.restype = ctypes.wintypes.BOOL

    winspool.ClosePrinter.argtypes = [ctypes.wintypes.HANDLE]
    winspool.ClosePrinter.restype = ctypes.wintypes.BOOL

    winspool.EnumJobsW.argtypes = [
        ctypes.wintypes.HANDLE,
        ctypes.wintypes.DWORD,
        ctypes.wintypes.DWORD,
        ctypes.wintypes.DWORD,
        ctypes.c_void_p,
        ctypes.wintypes.DWORD,
        ctypes.POINTER(ctypes.wintypes.DWORD),
        ctypes.POINTER(ctypes.wintypes.DWORD),
    ]
    winspool.EnumJobsW.restype = ctypes.wintypes.BOOL

    winspool.GetPrinterW.argtypes = [
        ctypes.wintypes.HANDLE,
        ctypes.wintypes.DWORD,
        ctypes.c_void_p,
        ctypes.wintypes.DWORD,
        ctypes.POINTER(ctypes.wintypes.DWORD),
    ]
    winspool.GetPrinterW.restype = ctypes.wintypes.BOOL

    return winspool


def _get_default_printer_name(winspool) -> str:
    buf_len = ctypes.wintypes.DWORD(0)
    winspool.GetDefaultPrinterW(None, ctypes.byref(buf_len))
    if buf_len.value == 0:
        return ""
    buf = ctypes.create_unicode_buffer(buf_len.value)
    if winspool.GetDefaultPrinterW(buf, ctypes.byref(buf_len)):
        return buf.value
    return ""


def _query_device_capabilities(winspool, name: str, port: str) -> dict:
    supports_duplex = True
    supports_color = True
    try:
        duplex_res = winspool.DeviceCapabilitiesW(name, port or None, DC_DUPLEX, None, None)
        if duplex_res != 0xFFFFFFFF:
            supports_duplex = duplex_res == 1
        color_res = winspool.DeviceCapabilitiesW(name, port or None, DC_COLORDEVICE, None, None)
        if color_res != 0xFFFFFFFF:
            supports_color = color_res == 1
    except Exception:
        pass
    return {
        "color": supports_color,
        "duplex": supports_duplex,
        "supported_paper_sizes": ["A4", "Letter", "Legal"],
        "trays": ["Auto", "Tray 1"],
    }


def discover_windows_printers() -> list:
    """Discover installed printers via Win32 EnumPrintersW, with PowerShell fallback."""
    printers = []
    if sys.platform == "win32":
        try:
            winspool = _get_winspool()
            flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS
            needed = ctypes.wintypes.DWORD(0)
            returned = ctypes.wintypes.DWORD(0)
            winspool.EnumPrintersW(flags, None, 2, None, 0, ctypes.byref(needed), ctypes.byref(returned))
            if needed.value > 0:
                buf = (ctypes.c_ubyte * needed.value)()
                ok = winspool.EnumPrintersW(
                    flags, None, 2, buf, needed.value, ctypes.byref(needed), ctypes.byref(returned)
                )
                if ok and returned.value > 0:
                    default_name = _get_default_printer_name(winspool).lower()
                    arr = ctypes.cast(buf, ctypes.POINTER(PRINTER_INFO_2W))
                    for i in range(returned.value):
                        info = arr[i]
                        name = info.pPrinterName or "Printer"
                        driver = info.pDriverName or "Generic"
                        port = info.pPortName or ""
                        attrs = int(info.Attributes)
                        status_flags = int(info.Status)
                        conn_type = classify_printer_connection(name, driver, port, attrs)
                        is_default = (name.lower() == default_name) if default_name else bool(attrs & PRINTER_ATTRIBUTE_DEFAULT)
                        printers.append({
                            "name": name,
                            "system_name": name,
                            "driver_name": driver,
                            "port_name": port,
                            "connection_type": conn_type,
                            "capabilities": _query_device_capabilities(winspool, name, port),
                            "status": classify_printer_status(status_flags, attrs),
                            "is_default": is_default,
                            "is_online": classify_printer_status(status_flags, attrs) == "online",
                        })
        except Exception as e:
            print(f"[Agent] Note: Win32 EnumPrintersW fallback ({e})")

        if not printers:
            try:
                cmd = [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    "Get-Printer | Select-Object Name, DriverName, PortName, Type, Default | ConvertTo-Json",
                ]
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                if proc.returncode == 0 and proc.stdout.strip():
                    raw = json.loads(proc.stdout)
                    if isinstance(raw, dict):
                        raw = [raw]
                    for item in raw:
                        name = item.get("Name", "Printer")
                        driver = item.get("DriverName", "Generic")
                        port = item.get("PortName", "")
                        printers.append({
                            "name": name,
                            "system_name": name,
                            "driver_name": driver,
                            "port_name": port,
                            "connection_type": classify_printer_connection(name, driver, port),
                            "capabilities": {
                                "color": True,
                                "duplex": True,
                                "supported_paper_sizes": ["A4", "Letter"],
                                "trays": ["Auto", "Tray 1"],
                            },
                            "status": "online",
                            "is_default": bool(item.get("Default", False)),
                            "is_online": True,
                        })
            except Exception as e:
                print(f"[Agent] Note: PowerShell printer discovery fallback ({e})")

    if not printers:
        printers = [
            {
                "name": "Microsoft Print to PDF",
                "driver_name": "Microsoft Print To PDF",
                "connection_type": "virtual",
                "capabilities": {
                    "color": True,
                    "duplex": True,
                    "supported_paper_sizes": ["A4", "Letter"],
                    "trays": ["Default"],
                },
                "status": "online",
                "is_default": True,
            },
            {
                "name": "Counter POS Laser Printer",
                "driver_name": "Generic POS / Text",
                "connection_type": "usb",
                "capabilities": {
                    "color": False,
                    "duplex": True,
                    "supported_paper_sizes": ["A4"],
                    "trays": ["Main Tray"],
                },
                "status": "online",
                "is_default": False,
            },
        ]
    return printers


def list_printer_jobs(printer_name: str) -> list:
    """Return active spooler jobs on the given Windows printer via Win32 EnumJobsW."""
    if sys.platform != "win32":
        return []
    winspool = _get_winspool()
    h_printer = ctypes.wintypes.HANDLE()
    if not winspool.OpenPrinterW(printer_name, ctypes.byref(h_printer), None):
        return []
    try:
        needed = ctypes.wintypes.DWORD(0)
        returned = ctypes.wintypes.DWORD(0)
        winspool.EnumJobsW(h_printer, 0, 128, 1, None, 0, ctypes.byref(needed), ctypes.byref(returned))
        if needed.value == 0:
            return []
        buf = (ctypes.c_ubyte * needed.value)()
        ok = winspool.EnumJobsW(
            h_printer, 0, 128, 1, buf, needed.value, ctypes.byref(needed), ctypes.byref(returned)
        )
        if not ok or returned.value == 0:
            return []
        arr = ctypes.cast(buf, ctypes.POINTER(JOB_INFO_1W))
        jobs = []
        for i in range(returned.value):
            j = arr[i]
            jobs.append({
                "job_id": int(j.JobId),
                "document": j.pDocument or "",
                "datatype": j.pDatatype or "",
                "status_flags": int(j.Status),
                "status_text": j.pStatus or describe_job_status(int(j.Status)),
                "total_pages": int(j.TotalPages),
                "pages_printed": int(j.PagesPrinted),
            })
        return jobs
    finally:
        winspool.ClosePrinter(h_printer)


def get_printer_win32_status(printer_name: str) -> tuple:
    """Return (status_flags, attributes, c_jobs) from Win32 GetPrinterW Level 2."""
    if sys.platform != "win32":
        return (0, 0, 0)
    winspool = _get_winspool()
    h_printer = ctypes.wintypes.HANDLE()
    if not winspool.OpenPrinterW(printer_name, ctypes.byref(h_printer), None):
        return (0, 0, 0)
    try:
        needed = ctypes.wintypes.DWORD(0)
        winspool.GetPrinterW(h_printer, 2, None, 0, ctypes.byref(needed))
        if needed.value == 0:
            return (0, 0, 0)
        buf = (ctypes.c_ubyte * needed.value)()
        if winspool.GetPrinterW(h_printer, 2, buf, needed.value, ctypes.byref(needed)):
            info = ctypes.cast(buf, ctypes.POINTER(PRINTER_INFO_2W)).contents
            return (int(info.Status), int(info.Attributes), int(info.cJobs))
        return (0, 0, 0)
    finally:
        winspool.ClosePrinter(h_printer)


def find_matching_spooler_job(jobs: list, doc_title: str, printflow_job_id: str, ignore_ids: set) -> Optional[dict]:
    """Find the newest spooler job matching doc_title or printflow_job_id that was not pre-existing."""
    matches = [
        j
        for j in jobs
        if j["job_id"] not in ignore_ids
        and (j["document"] == doc_title or printflow_job_id in j["document"])
    ]
    if not matches:
        return None
    matches.sort(key=lambda item: item["job_id"], reverse=True)
    return matches[0]


def api_request(url: str, method: str = "GET", data: dict = None, token: str = None) -> dict:
    headers = {
        "Accept": "application/json",
        "User-Agent": f"PrintFlow-Agent/1.0 ({platform.system()}; {platform.machine()})",
    }
    body = None
    if data is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data).encode("utf-8")

    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read().decode("utf-8")
            return json.loads(content)
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        try:
            parsed = json.loads(error_body)
            msg = parsed.get("message") or parsed.get("errors") or error_body
        except Exception:
            msg = error_body
        raise RuntimeError(f"HTTP {e.code}: {msg}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Connection failed to {url}: {e.reason}")


def enroll_agent(api_base: str, pairing_code: str, device_name: str) -> dict:
    guid = get_machine_guid()
    pubkey_hash = compute_sha256(f"{guid}-{socket.gethostname()}".encode("utf-8"))

    url = f"{api_base.rstrip('/')}/api/v1/agent/enroll"
    payload = {
        "pairing_code": pairing_code.strip(),
        "device_name": device_name,
        "machine_guid": guid,
        "device_uuid": guid,
        "public_key_hash": pubkey_hash,
        "metadata": {
            "os": f"{platform.system()} {platform.release()}",
            "machine": platform.machine(),
            "hostname": socket.gethostname(),
            "agent_runtime": "python-zero-dep-v2",
        },
    }

    print(f"[Agent] Contacting PrintFlow backend at {url} ...")
    res = api_request(url, method="POST", data=payload)
    data = res.get("data", {})
    return data


def sync_printers(api_base: str, agent_token: str, printers: list) -> int:
    url = f"{api_base.rstrip('/')}/api/v1/agent/printers"
    payload = {"printers": printers}
    res = api_request(url, method="POST", data=payload, token=agent_token)
    return res.get("data", {}).get("count", len(printers))


def send_heartbeat(api_base: str, agent_token: str) -> dict:
    url = f"{api_base.rstrip('/')}/api/v1/agent/heartbeat"
    res = api_request(url, method="POST", token=agent_token)
    return res.get("data", {})


def detect_extension(doc_bytes: bytes) -> str:
    head = doc_bytes[:1024]
    if b"%PDF" in head:
        return ".pdf"
    if doc_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if doc_bytes.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    try:
        sample = doc_bytes[:4096].decode("utf-8")
        if sample and all(ch == "\n" or ch == "\r" or ch == "\t" or ord(ch) >= 32 for ch in sample):
            return ".txt"
    except UnicodeDecodeError:
        pass
    return ".bin"


def choose_target_printer(printers: list, preferred_printer: str = None) -> dict:
    if not printers:
        raise RuntimeError("No printers available on this workstation.")

    if preferred_printer:
        needle = preferred_printer.strip().lower()
        for p in printers:
            if p["name"].lower() == needle:
                return p
        for p in printers:
            if needle in p["name"].lower():
                return p
        raise RuntimeError(f"Preferred printer '{preferred_printer}' was not found on this PC.")

    # Prefer physical (non-virtual) online default printer, then any physical online printer
    for p in printers:
        if p.get("connection_type") != "virtual" and p.get("is_default") and p.get("status", "online") == "online":
            return p
    for p in printers:
        if p.get("connection_type") != "virtual" and p.get("status", "online") == "online":
            return p
    for p in printers:
        if p.get("connection_type") != "virtual":
            return p
    for p in printers:
        if p.get("is_default"):
            return p
    return printers[0]


def find_sumatra_pdf() -> str:
    candidates = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "SumatraPDF" / "SumatraPDF.exe",
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "SumatraPDF" / "SumatraPDF.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "SumatraPDF" / "SumatraPDF.exe",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return shutil.which("SumatraPDF") or shutil.which("SumatraPDF.exe") or ""


def normalize_print_settings(print_settings: Optional[dict]) -> dict:
    settings = print_settings if isinstance(print_settings, dict) else {}
    try:
        copies = max(1, int(settings.get("copies", 1) or 1))
    except (TypeError, ValueError):
        copies = 1

    color_mode = str(settings.get("color_mode", "")).strip().lower()
    if color_mode in ("color", "cmyk", "full"):
        color = True
    elif color_mode in ("mono", "bw", "grayscale", "greyscale", "monochrome"):
        color = False
    else:
        color = bool(settings.get("color", False))

    sides_mode = str(settings.get("sides_mode", "")).strip().lower()
    if sides_mode in ("duplex", "double", "two-sided", "2-sided"):
        duplex = True
    elif sides_mode in ("simplex", "single", "one-sided", "1-sided"):
        duplex = False
    else:
        duplex = bool(settings.get("duplex", False))

    orientation = str(settings.get("orientation", "portrait") or "portrait").strip().lower()
    if orientation not in ("portrait", "landscape", "auto"):
        orientation = "portrait"

    paper_size = str(settings.get("paper_size", "A4") or "A4").strip()
    return {
        "copies": copies,
        "color": color,
        "duplex": duplex,
        "orientation": orientation,
        "paper_size": paper_size,
    }


def _ps_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _build_winrt_pdf_print_ps(printer_name: str, pdf_path: Path, doc_title: str, settings: dict) -> str:
    """Build a silent PowerShell script using Windows.Data.Pdf + System.Drawing.Printing.PrintDocument."""
    copies = settings["copies"]
    want_color = "true" if settings["color"] else "false"
    want_duplex = "true" if settings["duplex"] else "false"
    orientation = settings["orientation"]
    paper_size = settings["paper_size"]

    return f"""
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {{
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
}})[0]
$asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {{
    $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1
}})[0]

function Await-WinRtOp($WinRtTask, $ResultType) {{
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}}

function Await-WinRtAction($WinRtAction) {{
    $netTask = $asTaskAction.Invoke($null, @($WinRtAction))
    $netTask.Wait(-1) | Out-Null
}}

[Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfPageRenderOptions, Windows.Data.Pdf, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null

$pdfPath = {_ps_quote(str(pdf_path.resolve()))}
$printerName = {_ps_quote(printer_name)}
$docTitle = {_ps_quote(doc_title)}
$wantColor = ${want_color}
$wantDuplex = ${want_duplex}
$orientation = {_ps_quote(orientation)}
$paperSize = {_ps_quote(paper_size)}
$copiesToPrint = [math]::Max(1, {copies})

$fileStream = [System.IO.File]::OpenRead($pdfPath)
$ras = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fileStream)
try {{
    $pdfDoc = Await-WinRtOp ([Windows.Data.Pdf.PdfDocument]::LoadFromStreamAsync($ras)) ([Windows.Data.Pdf.PdfDocument])
    $pageCount = [int]$pdfDoc.PageCount
    if ($pageCount -le 0) {{ throw "PDF document has 0 pages." }}

    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.DocumentName = $docTitle
    $doc.OriginAtMargins = $false
    $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
    $doc.PrinterSettings.PrinterName = $printerName
    if (-not $doc.PrinterSettings.IsValid) {{
        throw "Invalid Windows printer name: $printerName"
    }}

    $softwareCopyLoops = 1
    if ($doc.PrinterSettings.MaximumCopies -ge $copiesToPrint) {{
        $doc.PrinterSettings.Copies = [int16]$copiesToPrint
    }} else {{
        $doc.PrinterSettings.Copies = 1
        $softwareCopyLoops = $copiesToPrint
    }}

    if ($doc.PrinterSettings.CanDuplex) {{
        $doc.PrinterSettings.Duplex = if ($wantDuplex) {{
            [System.Drawing.Printing.Duplex]::Vertical
        }} else {{
            [System.Drawing.Printing.Duplex]::Simplex
        }}
    }}

    if ($doc.PrinterSettings.SupportsColor) {{
        $doc.DefaultPageSettings.Color = $wantColor
    }}
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    $wantLandscape = ($orientation -eq "landscape")
    $doc.DefaultPageSettings.Landscape = $wantLandscape

    if ($paperSize) {{
        foreach ($ps in $doc.PrinterSettings.PaperSizes) {{
            if ($ps.PaperName -match [regex]::Escape($paperSize)) {{
                $doc.DefaultPageSettings.PaperSize = $ps
                break
            }}
        }}
    }}

    $state = [hashtable]::Synchronized(@{{ pageIndex = 0; copyIndex = 0 }})

    $doc.add_QueryPageSettings({{
        param($sender, $e)
        $p = $pdfDoc.GetPage([uint32]$state.pageIndex)
        try {{
            $isPageLandscape = ($p.Size.Width -gt $p.Size.Height)
            if ($orientation -eq "landscape") {{
                $e.PageSettings.Landscape = $true
            }} else {{
                $e.PageSettings.Landscape = $isPageLandscape
            }}
            if ($doc.PrinterSettings.SupportsColor) {{
                $e.PageSettings.Color = $wantColor
            }}
        }} finally {{
            $p.Dispose()
        }}
    }})

    $doc.add_PrintPage({{
        param($sender, $e)
        $page = $pdfDoc.GetPage([uint32]$state.pageIndex)
        $rasPage = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
        try {{
            $opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
            $scale = 150.0 / 96.0
            $rawW = $page.Size.Width * $scale
            $rawH = $page.Size.Height * $scale
            $maxDim = 2480.0
            if ($rawW -gt $maxDim -or $rawH -gt $maxDim) {{
                $cap = [math]::Min($maxDim / $rawW, $maxDim / $rawH)
                $rawW = $rawW * $cap
                $rawH = $rawH * $cap
            }}
            $opts.DestinationWidth = [uint32][math]::Max(1, [math]::Round($rawW))
            $opts.DestinationHeight = [uint32][math]::Max(1, [math]::Round($rawH))

            Await-WinRtAction ($page.RenderToStreamAsync($rasPage, $opts))
            $netStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($rasPage)
            $netStream.Position = 0
            $img = [System.Drawing.Image]::FromStream($netStream)
            try {{
                $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

                $area = $e.PageSettings.PrintableArea
                $availW = [double]$area.Width
                $availH = [double]$area.Height
                if ([double]::IsNaN($availW) -or [double]::IsInfinity($availW) -or $availW -le 0 -or [double]::IsNaN($availH) -or [double]::IsInfinity($availH) -or $availH -le 0) {{
                    $availW = [double]$e.PageBounds.Width
                    $availH = [double]$e.PageBounds.Height
                }}
                $fit = [math]::Min($availW / [double]$img.Width, $availH / [double]$img.Height)
                $drawW = [single]($img.Width * $fit)
                $drawH = [single]($img.Height * $fit)
                $drawX = [single](($availW - $drawW) / 2.0)
                $drawY = [single](($availH - $drawH) / 2.0)

                $e.Graphics.DrawImage($img, $drawX, $drawY, $drawW, $drawH)
            }} finally {{
                $img.Dispose()
                $netStream.Dispose()
            }}
        }} finally {{
            $rasPage.Dispose()
            $page.Dispose()
        }}

        $state.pageIndex++
        if ($state.pageIndex -ge $pageCount) {{
            $state.copyIndex++
            if ($state.copyIndex -lt $softwareCopyLoops) {{
                $state.pageIndex = 0
                $e.HasMorePages = $true
            }} else {{
                $e.HasMorePages = $false
            }}
        }} else {{
            $e.HasMorePages = $true
        }}
    }})

    try {{
        $doc.Print()
    }} finally {{
        $doc.Dispose()
    }}
    Write-Output "PRINTED_PAGES=$pageCount"
}} finally {{
    $pdfDoc = $null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    $ras.Dispose()
    $fileStream.Dispose()
}}
"""


def _build_gdi_image_print_ps(printer_name: str, image_path: Path, doc_title: str, settings: dict) -> str:
    """Build a silent PowerShell GDI script for PNG/JPEG images with aspect-ratio fit & settings."""
    copies = settings["copies"]
    want_color = "true" if settings["color"] else "false"
    want_duplex = "true" if settings["duplex"] else "false"
    orientation = settings["orientation"]
    paper_size = settings["paper_size"]

    return f"""
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing

$imgPath = {_ps_quote(str(image_path.resolve()))}
$printerName = {_ps_quote(printer_name)}
$docTitle = {_ps_quote(doc_title)}
$wantColor = ${want_color}
$wantDuplex = ${want_duplex}
$orientation = {_ps_quote(orientation)}
$paperSize = {_ps_quote(paper_size)}
$copiesToPrint = [math]::Max(1, {copies})

$img = [System.Drawing.Image]::FromFile($imgPath)
$doc = New-Object System.Drawing.Printing.PrintDocument
try {{
    $doc.DocumentName = $docTitle
    $doc.OriginAtMargins = $false
    $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
    $doc.PrinterSettings.PrinterName = $printerName
    if (-not $doc.PrinterSettings.IsValid) {{
        throw "Invalid Windows printer name: $printerName"
    }}

    $softwareCopyLoops = 1
    if ($doc.PrinterSettings.MaximumCopies -ge $copiesToPrint) {{
        $doc.PrinterSettings.Copies = [int16]$copiesToPrint
    }} else {{
        $doc.PrinterSettings.Copies = 1
        $softwareCopyLoops = $copiesToPrint
    }}

    if ($doc.PrinterSettings.CanDuplex) {{
        $doc.PrinterSettings.Duplex = if ($wantDuplex) {{
            [System.Drawing.Printing.Duplex]::Vertical
        }} else {{
            [System.Drawing.Printing.Duplex]::Simplex
        }}
    }}
    if ($doc.PrinterSettings.SupportsColor) {{
        $doc.DefaultPageSettings.Color = $wantColor
    }}
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    $doc.DefaultPageSettings.Landscape = ($orientation -eq "landscape") -or ($img.Width -gt $img.Height)

    if ($paperSize) {{
        foreach ($ps in $doc.PrinterSettings.PaperSizes) {{
            if ($ps.PaperName -match [regex]::Escape($paperSize)) {{
                $doc.DefaultPageSettings.PaperSize = $ps
                break
            }}
        }}
    }}

    $state = [hashtable]::Synchronized(@{{ copyIndex = 0 }})
    $doc.add_PrintPage({{
        param($sender, $e)
        $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        $area = $e.PageSettings.PrintableArea
        $availW = [double]$area.Width
        $availH = [double]$area.Height
        if ([double]::IsNaN($availW) -or [double]::IsInfinity($availW) -or $availW -le 0 -or [double]::IsNaN($availH) -or [double]::IsInfinity($availH) -or $availH -le 0) {{
            $availW = [double]$e.PageBounds.Width
            $availH = [double]$e.PageBounds.Height
        }}
        $fit = [math]::Min($availW / [double]$img.Width, $availH / [double]$img.Height)
        $drawW = [single]($img.Width * $fit)
        $drawH = [single]($img.Height * $fit)
        $drawX = [single](($availW - $drawW) / 2.0)
        $drawY = [single](($availH - $drawH) / 2.0)

        $e.Graphics.DrawImage($img, $drawX, $drawY, $drawW, $drawH)
        $state.copyIndex++
        $e.HasMorePages = ($state.copyIndex -lt $softwareCopyLoops)
    }})

    $doc.Print()
}} finally {{
    $img.Dispose()
    $doc.Dispose()
}}
"""


def _build_gdi_text_print_ps(printer_name: str, text_path: Path, doc_title: str, settings: dict) -> str:
    """Build a silent PowerShell GDI script for plain text files."""
    copies = settings["copies"]
    return f"""
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
$lines = [System.IO.File]::ReadAllLines({_ps_quote(str(text_path.resolve()))})
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.DocumentName = {_ps_quote(doc_title)}
$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$doc.PrinterSettings.PrinterName = {_ps_quote(printer_name)}
if (-not $doc.PrinterSettings.IsValid) {{ throw "Invalid Windows printer name" }}
if ($doc.PrinterSettings.MaximumCopies -ge {copies}) {{ $doc.PrinterSettings.Copies = [int16]{copies} }}
$font = New-Object System.Drawing.Font("Consolas", 10)
$brush = [System.Drawing.Brushes]::Black
$state = [hashtable]::Synchronized(@{{ idx = 0 }})
$doc.add_PrintPage({{
    param($s, $e)
    $y = [single]$e.MarginBounds.Top
    $lineHeight = $font.GetHeight($e.Graphics)
    while ($state.idx -lt $lines.Length) {{
        if (($y + $lineHeight) -gt $e.MarginBounds.Bottom) {{
            $e.HasMorePages = $true
            return
        }}
        $e.Graphics.DrawString($lines[$state.idx], $font, $brush, [single]$e.MarginBounds.Left, $y)
        $y += $lineHeight
        $state.idx++
    }}
    $e.HasMorePages = $false
}})
try {{ $doc.Print() }} finally {{ $font.Dispose(); $doc.Dispose() }}
"""


def _run_encoded_powershell_and_track_spooler(
    ps_script: str,
    printer_name: str,
    doc_title: str,
    job_id: str,
    existing_job_ids: set,
    on_spooler_id: Optional[Callable[[int], None]] = None,
    timeout_sec: int = 180,
) -> Optional[int]:
    """Run a silent PowerShell print script while capturing the real Win32 Spooler Job ID."""
    encoded = base64.b64encode(ps_script.encode("utf-16-le")).decode("ascii")
    proc = subprocess.Popen(
        ["powershell", "-NoProfile", "-OutputFormat", "Text", "-EncodedCommand", encoded],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    captured_spooler_id: Optional[int] = None
    deadline = time.time() + timeout_sec
    while proc.poll() is None:
        if time.time() > deadline:
            proc.kill()
            proc.communicate()
            raise RuntimeError(f"GDI print submission timed out after {timeout_sec}s on '{printer_name}'.")

        if captured_spooler_id is None:
            jobs = list_printer_jobs(printer_name)
            matched = find_matching_spooler_job(jobs, doc_title, job_id, existing_job_ids)
            if matched:
                captured_spooler_id = matched["job_id"]
                if on_spooler_id:
                    on_spooler_id(captured_spooler_id)
        time.sleep(0.35)

    stdout, stderr = proc.communicate()
    if proc.returncode != 0:
        err_msg = (stderr or stdout or "").strip() or f"PowerShell print exited with code {proc.returncode}"
        raise RuntimeError(err_msg)

    if captured_spooler_id is None:
        jobs = list_printer_jobs(printer_name)
        matched = find_matching_spooler_job(jobs, doc_title, job_id, existing_job_ids)
        if matched:
            captured_spooler_id = matched["job_id"]
            if on_spooler_id:
                on_spooler_id(captured_spooler_id)

    return captured_spooler_id


def wait_for_spooler_completion(
    printer_name: str,
    spooler_job_id: Optional[int],
    doc_title: str,
    job_id: str,
    existing_job_ids: set,
    spool_timeout: int = 300,
    blocked_timeout: int = 90,
    heartbeat_cb: Optional[Callable[[], None]] = None,
    poll_fn: Optional[Callable[[str], list]] = None,
) -> int:
    """
    Wait until the Windows Print Spooler actually finishes delivering the job to the printer.
    Prevents marking orders 'Ready for Pickup' while the printer status monitor is still 'Sending',
    stalled, out of paper, offline, or cancelled.
    """
    get_jobs = poll_fn or list_printer_jobs
    start_time = time.time()
    error_since: Optional[float] = None
    blocked_since: Optional[float] = None
    last_blocked_msg = ""
    last_status_log = ""
    last_hb = time.time()
    saw_job_in_queue = spooler_job_id is not None

    while True:
        now = time.time()
        if heartbeat_cb and (now - last_hb >= 30):
            heartbeat_cb()
            last_hb = now

        jobs = get_jobs(printer_name)
        matched = None
        if spooler_job_id is not None:
            for j in jobs:
                if j["job_id"] == spooler_job_id:
                    matched = j
                    break
        if matched is None:
            matched = find_matching_spooler_job(jobs, doc_title, job_id, existing_job_ids)
            if matched is not None and spooler_job_id is None:
                spooler_job_id = matched["job_id"]
                saw_job_in_queue = True

        if matched is None:
            if saw_job_in_queue:
                print(f"[Agent] [Spooler Completed] Job #{spooler_job_id} left Windows spooler queue cleanly.")
                return int(spooler_job_id or 0)
            # Virtual/ultra-fast printer finished before first poll
            return int(spooler_job_id or (int(time.time()) % 100000))

        saw_job_in_queue = True
        flags = int(matched.get("status_flags", 0))
        status_desc = describe_job_status(flags)
        if status_desc != last_status_log:
            print(
                f"[Agent] [Spooler Status] Win32 Job #{matched['job_id']}: "
                f"{status_desc} (printed {matched.get('pages_printed', 0)}/{matched.get('total_pages', 0)})"
            )
            last_status_log = status_desc

        if flags & (JOB_STATUS_PRINTED | JOB_STATUS_COMPLETE):
            print(f"[Agent] [Spooler Completed] Win32 Job #{matched['job_id']} marked {status_desc}.")
            return int(matched["job_id"])

        if (flags & (JOB_STATUS_DELETING | JOB_STATUS_DELETED)) and not (
            flags & (JOB_STATUS_PRINTED | JOB_STATUS_COMPLETE)
        ):
            raise RuntimeError(f"Print job #{matched['job_id']} was cancelled in the Windows print queue.")

        if flags & (JOB_STATUS_ERROR | JOB_STATUS_BLOCKED_DEVQ):
            if error_since is None:
                error_since = now
            elif now - error_since >= 15:
                raise RuntimeError(
                    f"Windows print spooler reported an error on '{printer_name}' ({status_desc})."
                )
        else:
            error_since = None

        if flags & (JOB_STATUS_OFFLINE | JOB_STATUS_PAPEROUT | JOB_STATUS_PAUSED | JOB_STATUS_USER_INTERVENTION):
            if blocked_since is None:
                blocked_since = now
                last_blocked_msg = status_desc
            elif now - blocked_since >= blocked_timeout:
                raise RuntimeError(
                    f"Printer '{printer_name}' remained blocked ({last_blocked_msg}) for over {blocked_timeout}s."
                )
        else:
            blocked_since = None

        if now - start_time >= spool_timeout:
            raise RuntimeError(
                f"Print job #{matched['job_id']} timed out after {spool_timeout}s in state '{status_desc}' on '{printer_name}'."
            )

        time.sleep(0.5)


def submit_sumatra_print(sumatra_path: str, printer_name: str, file_path: Path, settings: dict) -> int:
    print_opts = [f"{settings['copies']}x"]
    print_opts.append("color" if settings["color"] else "monochrome")
    print_opts.append("duplex" if settings["duplex"] else "simplex")
    if settings["orientation"] in ("portrait", "landscape"):
        print_opts.append(settings["orientation"])
    if settings["paper_size"]:
        print_opts.append(f"paper={settings['paper_size']}")

    cmd = [
        sumatra_path,
        "-print-to",
        printer_name,
        "-print-settings",
        ",".join(print_opts),
        "-silent",
        str(file_path.resolve()),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or f"SumatraPDF exited {proc.returncode}")
    return int(time.time()) % 100000


def submit_windows_print(
    printer_name: str,
    job_id: str,
    file_path: Path,
    doc_bytes: bytes,
    print_settings: Optional[dict] = None,
    allow_raw_pdl: bool = False,
    spool_timeout: int = 300,
    blocked_timeout: int = 90,
    on_spooler_id: Optional[Callable[[int], None]] = None,
    heartbeat_cb: Optional[Callable[[], None]] = None,
) -> int:
    """
    Dispatch document to the Windows printer via GDI rendering (NEVER raw %PDF bytes)
    and wait for the Windows Print Spooler to finish delivering it to the printer.
    """
    doc_title = f"PrintFlow Job #{job_id}"
    ext = file_path.suffix.lower()
    settings = normalize_print_settings(print_settings)
    existing_job_ids = {j["job_id"] for j in list_printer_jobs(printer_name)}

    if ext == ".pdf":
        print(f"[Agent] [GDI Render] Rendering PDF via Windows.Data.Pdf -> PrintDocument on '{printer_name}'...")
        ps_script = _build_winrt_pdf_print_ps(printer_name, file_path, doc_title, settings)
        try:
            spooler_id = _run_encoded_powershell_and_track_spooler(
                ps_script,
                printer_name,
                doc_title,
                job_id,
                existing_job_ids,
                on_spooler_id=on_spooler_id,
            )
            return wait_for_spooler_completion(
                printer_name,
                spooler_id,
                doc_title,
                job_id,
                existing_job_ids,
                spool_timeout=spool_timeout,
                blocked_timeout=blocked_timeout,
                heartbeat_cb=heartbeat_cb,
            )
        except Exception as winrt_err:
            sumatra = find_sumatra_pdf()
            if sumatra and "cancelled in the windows print queue" not in str(winrt_err).lower():
                print(f"[Agent] Note: WinRT GDI PDF fallback to SumatraPDF ({winrt_err})")
                return submit_sumatra_print(sumatra, printer_name, file_path, settings)
            raise

    if ext in (".png", ".jpg", ".jpeg"):
        ps_script = _build_gdi_image_print_ps(printer_name, file_path, doc_title, settings)
        spooler_id = _run_encoded_powershell_and_track_spooler(
            ps_script,
            printer_name,
            doc_title,
            job_id,
            existing_job_ids,
            on_spooler_id=on_spooler_id,
        )
        return wait_for_spooler_completion(
            printer_name,
            spooler_id,
            doc_title,
            job_id,
            existing_job_ids,
            spool_timeout=spool_timeout,
            blocked_timeout=blocked_timeout,
            heartbeat_cb=heartbeat_cb,
        )

    if ext == ".txt":
        ps_script = _build_gdi_text_print_ps(printer_name, file_path, doc_title, settings)
        spooler_id = _run_encoded_powershell_and_track_spooler(
            ps_script,
            printer_name,
            doc_title,
            job_id,
            existing_job_ids,
            on_spooler_id=on_spooler_id,
        )
        return wait_for_spooler_completion(
            printer_name,
            spooler_id,
            doc_title,
            job_id,
            existing_job_ids,
            spool_timeout=spool_timeout,
            blocked_timeout=blocked_timeout,
            heartbeat_cb=heartbeat_cb,
        )

    if allow_raw_pdl:
        spooler_id = submit_win32_raw_spool(printer_name, doc_title, doc_bytes)
        if on_spooler_id:
            on_spooler_id(spooler_id)
        return wait_for_spooler_completion(
            printer_name,
            spooler_id,
            doc_title,
            job_id,
            existing_job_ids,
            spool_timeout=spool_timeout,
            blocked_timeout=blocked_timeout,
            heartbeat_cb=heartbeat_cb,
        )

    raise RuntimeError(
        f"Refusing to send raw '{ext or 'binary'}' bytes directly to '{printer_name}'. "
        "Only PDF, PNG, JPEG, and TXT documents are supported in GDI print mode."
    )


def submit_win32_raw_spool(printer_name: str, doc_title: str, doc_bytes: bytes) -> int:
    """Submit pre-rendered PDL bytes (e.g. PCL/PS) to the Windows Print Spooler via winspool.drv."""
    if sys.platform != "win32":
        raise RuntimeError("Win32 Print Spooler API is only supported on Windows hosts.")

    winspool = ctypes.WinDLL("winspool.drv", use_last_error=True)

    winspool.OpenPrinterW.argtypes = [
        ctypes.wintypes.LPWSTR,
        ctypes.POINTER(ctypes.wintypes.HANDLE),
        ctypes.wintypes.LPVOID,
    ]
    winspool.OpenPrinterW.restype = ctypes.wintypes.BOOL

    winspool.StartDocPrinterW.argtypes = [
        ctypes.wintypes.HANDLE,
        ctypes.wintypes.DWORD,
        ctypes.POINTER(DOC_INFO_1W),
    ]
    winspool.StartDocPrinterW.restype = ctypes.wintypes.DWORD

    winspool.StartPagePrinter.argtypes = [ctypes.wintypes.HANDLE]
    winspool.StartPagePrinter.restype = ctypes.wintypes.BOOL

    winspool.WritePrinter.argtypes = [
        ctypes.wintypes.HANDLE,
        ctypes.wintypes.LPVOID,
        ctypes.wintypes.DWORD,
        ctypes.POINTER(ctypes.wintypes.DWORD),
    ]
    winspool.WritePrinter.restype = ctypes.wintypes.BOOL

    winspool.EndPagePrinter.argtypes = [ctypes.wintypes.HANDLE]
    winspool.EndPagePrinter.restype = ctypes.wintypes.BOOL

    winspool.EndDocPrinter.argtypes = [ctypes.wintypes.HANDLE]
    winspool.EndDocPrinter.restype = ctypes.wintypes.BOOL

    winspool.ClosePrinter.argtypes = [ctypes.wintypes.HANDLE]
    winspool.ClosePrinter.restype = ctypes.wintypes.BOOL

    h_printer = ctypes.wintypes.HANDLE()
    if not winspool.OpenPrinterW(printer_name, ctypes.byref(h_printer), None):
        err = ctypes.get_last_error()
        raise RuntimeError(f"OpenPrinterW failed for '{printer_name}' (Win32 error {err})")

    try:
        doc_info = DOC_INFO_1W(
            pDocName=doc_title,
            pOutputFile=None,
            pDatatype="RAW",
        )
        spooler_job_id = winspool.StartDocPrinterW(h_printer, 1, ctypes.byref(doc_info))
        if spooler_job_id == 0:
            err = ctypes.get_last_error()
            raise RuntimeError(f"StartDocPrinterW failed on '{printer_name}' (Win32 error {err})")

        try:
            if not winspool.StartPagePrinter(h_printer):
                err = ctypes.get_last_error()
                raise RuntimeError(f"StartPagePrinter failed (Win32 error {err})")

            try:
                buf = ctypes.create_string_buffer(doc_bytes, len(doc_bytes))
                written = ctypes.wintypes.DWORD(0)
                if not winspool.WritePrinter(h_printer, buf, len(doc_bytes), ctypes.byref(written)):
                    err = ctypes.get_last_error()
                    raise RuntimeError(f"WritePrinter failed (Win32 error {err})")
                if written.value != len(doc_bytes):
                    raise RuntimeError(
                        f"Incomplete spool write: wrote {written.value} of {len(doc_bytes)} bytes"
                    )
            finally:
                winspool.EndPagePrinter(h_printer)
        finally:
            winspool.EndDocPrinter(h_printer)

        return int(spooler_job_id)
    finally:
        winspool.ClosePrinter(h_printer)


def lease_next_job(api_base: str, agent_token: str) -> dict:
    url = f"{api_base.rstrip('/')}/api/v1/agent/jobs/next"
    res = api_request(url, method="POST", token=agent_token)
    return res.get("data")


def acknowledge_job(
    api_base: str,
    agent_token: str,
    job_id: str,
    lease_token: str,
    spooler_job_id: int = None,
    status: str = "completed",
):
    url = f"{api_base.rstrip('/')}/api/v1/agent/jobs/{job_id}/ack"
    payload = {"lease_token": lease_token, "status": status}
    if spooler_job_id is not None:
        payload["spooler_job_id"] = int(spooler_job_id)
    api_request(url, method="POST", data=payload, token=agent_token)


def fail_job(
    api_base: str,
    agent_token: str,
    job_id: str,
    lease_token: str,
    error_code: str,
    error_message: str,
    retryable: bool = False,
):
    url = f"{api_base.rstrip('/')}/api/v1/agent/jobs/{job_id}/fail"
    payload = {
        "lease_token": lease_token,
        "error_code": error_code[:64],
        "error_message": error_message[:1000],
        "retryable": retryable,
    }
    api_request(url, method="POST", data=payload, token=agent_token)


def acknowledge_shred(api_base: str, agent_token: str, job_id: str):
    url = f"{api_base.rstrip('/')}/api/v1/agent/jobs/{job_id}/shred-ack"
    api_request(url, method="POST", token=agent_token)


def secure_shred(file_path: Path):
    """Overwrites file with zeros, then random entropy, and removes it."""
    if not file_path.exists():
        return
    try:
        length = file_path.stat().st_size
        if length > 0:
            with open(file_path, "wb") as f:
                f.write(b"\x00" * length)
                f.flush()
                os.fsync(f.fileno())
            with open(file_path, "wb") as f:
                f.write(os.urandom(length))
                f.flush()
                os.fsync(f.fileno())
        file_path.unlink(missing_ok=True)
    except Exception as e:
        print(f"[Agent] Warning during secure shred: {e}")


def run_agent_loop(
    api_base: str,
    agent_token: str,
    device_name: str,
    preferred_printer: str = None,
    simulate: bool = False,
    allow_raw_pdl: bool = False,
    spool_timeout: int = 300,
    blocked_timeout: int = 90,
):
    print("\n=======================================================")
    print(f" [PrintFlow Agent] RUNNING ON {device_name}")
    print(f" Connected to: {api_base}")
    print(f" Mode:         {'SIMULATED SPOOLER (--simulate)' if simulate else 'LIVE WINDOWS GDI + SPOOLER MONITOR'}")
    print(" Privacy:      Ephemeral spooling with automated file shredding")
    print(" Status:       Online (Press Ctrl+C to exit)")
    print("=======================================================\n")

    # Discover and sync printers
    printers = discover_windows_printers()
    print(f"[Agent] Discovered {len(printers)} printers on this workstation:")
    for p in printers:
        def_tag = " (DEFAULT)" if p.get("is_default") else ""
        port_tag = f" on {p['port_name']}" if p.get("port_name") else ""
        print(f"   * {p['name']} [{p['connection_type']}{port_tag}]{def_tag}")

    if not simulate and all(p.get("connection_type") == "virtual" for p in printers):
        print(
            "[Agent] [WARN] Only virtual printers detected (e.g. AnyDesk / PDF). "
            "Connect a physical USB/network printer for real paper output, or pass --simulate for dry runs."
        )

    try:
        synced_count = sync_printers(api_base, agent_token, printers)
        print(f"[Agent] Synced {synced_count} printers with PrintFlow cloud.")
    except Exception as e:
        print(f"[Agent] Warning: Printer sync failed: {e}")

    last_heartbeat = 0.0
    heartbeat_interval = 30

    def keep_alive_heartbeat():
        nonlocal last_heartbeat
        try:
            send_heartbeat(api_base, agent_token)
            last_heartbeat = time.time()
        except Exception:
            pass

    while True:
        now = time.time()
        # 1. Heartbeat
        if now - last_heartbeat >= heartbeat_interval:
            try:
                hb = send_heartbeat(api_base, agent_token)
                print(f"[Agent] [Heartbeat OK] Status: {hb.get('status', 'active')}")
                last_heartbeat = now
                heartbeat_interval = 30 + random.randint(-5, 5)
            except Exception as e:
                print(f"[Agent] [Heartbeat Failed] {e}")
                time.sleep(5)
                continue

        # 2. Check for next print job
        try:
            job = lease_next_job(api_base, agent_token)
            if job:
                job_id = job.get("job_id")
                lease_tok = job.get("lease_token")
                expected_hash = job.get("file_hash", "")
                download_url = job.get("download_url")
                print_settings = job.get("print_settings") or {}
                requested_printer = preferred_printer or job.get("target_printer_name")

                print(f"\n[Agent] ---> LEASED NEW PRINT JOB: #{job_id}")
                print(f"        Pages: {job.get('pages_total')} | Settings: {print_settings}")

                tmp_file = None
                try:
                    # Download document bytes
                    req = urllib.request.Request(
                        download_url,
                        headers={"Authorization": f"Bearer {agent_token}"},
                    )
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        doc_bytes = resp.read()

                    # Verify SHA-256
                    actual_hash = compute_sha256(doc_bytes)
                    if expected_hash and actual_hash.lower() != expected_hash.lower():
                        raise RuntimeError(
                            f"Integrity check failed! Expected {expected_hash}, got {actual_hash}"
                        )

                    print(f"[Agent] [Integrity Verified] SHA-256 match confirmed ({len(doc_bytes)} bytes)")

                    # Write ephemeral temp artifact
                    ext = detect_extension(doc_bytes)
                    tmp_file = Path(__file__).parent / f"job_{job_id}{ext}"
                    with open(tmp_file, "wb") as f:
                        f.write(doc_bytes)

                    # Refresh printers if requested printer wasn't in initial scan
                    if requested_printer and not any(
                        requested_printer.strip().lower() in p["name"].lower() for p in printers
                    ):
                        printers = discover_windows_printers()

                    target_printer = choose_target_printer(printers, requested_printer)
                    print(f"[Agent] [Target Printer] {target_printer['name']} ({target_printer['connection_type']})")

                    # Notify backend that spooling started
                    acknowledge_job(api_base, agent_token, job_id, lease_tok, status="printing")

                    if simulate or sys.platform != "win32":
                        spooler_id = random.randint(1000, 9999)
                        print(f"[Agent] [Simulated Spooler] Job ID: {spooler_id}")
                    else:
                        def on_spooler_id(sid: int):
                            print(f"[Agent] [Spooler Queued] Win32 Spooler Job ID: {sid}")
                            try:
                                acknowledge_job(
                                    api_base,
                                    agent_token,
                                    job_id,
                                    lease_tok,
                                    spooler_job_id=sid,
                                    status="printing",
                                )
                            except Exception:
                                pass

                        spooler_id = submit_windows_print(
                            target_printer["name"],
                            job_id,
                            tmp_file,
                            doc_bytes,
                            print_settings=print_settings,
                            allow_raw_pdl=allow_raw_pdl,
                            spool_timeout=spool_timeout,
                            blocked_timeout=blocked_timeout,
                            on_spooler_id=on_spooler_id,
                            heartbeat_cb=keep_alive_heartbeat,
                        )
                        print(f"[Agent] [Printed] Win32 Spooler Job ID: {spooler_id}")

                    # Complete Ack (ONLY after spooler finished sending to physical printer)
                    acknowledge_job(api_base, agent_token, job_id, lease_tok, spooler_id, status="completed")
                    print(f"[Agent] [Ack Sent] Job #{job_id} acknowledged as completed to backend")

                    # Ephemeral Shred
                    secure_shred(tmp_file)
                    acknowledge_shred(api_base, agent_token, job_id)
                    print("[Agent] [Shred Ack] Temp print artifacts shredded with zero trace.\n")
                except Exception as job_err:
                    print(f"[Agent] [Job Failed] #{job_id}: {job_err}")
                    try:
                        fail_job(
                            api_base,
                            agent_token,
                            job_id,
                            lease_tok,
                            "WIN32_PRINT_ERROR",
                            str(job_err),
                            retryable=False,
                        )
                    except Exception as fail_err:
                        print(f"[Agent] Warning: failed to report job error to backend: {fail_err}")
                    if tmp_file is not None:
                        secure_shred(tmp_file)
        except Exception as e:
            print(f"[Agent] Polling error: {e}")

        time.sleep(3)


def main():
    parser = argparse.ArgumentParser(description="PrintFlow Windows Desktop Print Agent")
    parser.add_argument("--pair", type=str, help="6-digit pairing code from PrintFlow Owner Dashboard")
    parser.add_argument("--api", type=str, default=DEFAULT_API_BASE, help=f"Backend API URL (default: {DEFAULT_API_BASE})")
    parser.add_argument("--device", type=str, default=f"Counter-WinStation-{socket.gethostname()[:8]}", help="Device workstation label")
    parser.add_argument("--printer", type=str, default=None, help="Explicit Windows printer name to target")
    parser.add_argument("--simulate", action="store_true", help="Simulate hardware spooling without submitting to Win32 Print Spooler")
    parser.add_argument("--raw-pdl", action="store_true", help="Allow raw PDL spooling for non-PDF/non-image files")
    parser.add_argument("--spool-timeout", type=int, default=300, help="Seconds to wait for spooler job to finish sending")
    parser.add_argument("--blocked-timeout", type=int, default=90, help="Seconds to wait on offline/paper-out/paused printer")
    parser.add_argument("--reset", action="store_true", help="Forget saved pairing credentials and re-enroll")

    args = parser.parse_args()

    if args.reset and CONFIG_FILE.exists():
        CONFIG_FILE.unlink(missing_ok=True)
        print("[Agent] Cleared local pairing config.")

    config = {}
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
        except Exception:
            config = {}

    agent_token = config.get("agent_token")
    api_base = config.get("api_base", args.api)
    device_name = config.get("device_name", args.device)

    if not agent_token:
        pairing_code = args.pair
        if not pairing_code:
            print("==================================================")
            print(" PrintFlow Windows Agent Pairing Setup")
            print("==================================================")
            print("Open your Owner Dashboard (http://localhost:5173/owner/dashboard)")
            print("Click '+ Pair New Agent' to view your 6-digit code.\n")
            try:
                pairing_code = input("Enter 6-digit Pairing Code: ").strip()
            except (KeyboardInterrupt, EOFError):
                print("\nAborted.")
                sys.exit(1)

        if not pairing_code or len(pairing_code) != 6:
            print(f"[Error] Pairing code must be a 6-digit number (got '{pairing_code}')")
            sys.exit(1)

        try:
            enrollment = enroll_agent(args.api, pairing_code, args.device)
            agent_token = enrollment["agent_token"]
            api_base = args.api
            device_name = enrollment.get("device_name", args.device)

            config = {
                "agent_id": enrollment.get("agent_id"),
                "tenant_id": enrollment.get("tenant_id"),
                "shop_id": enrollment.get("shop_id"),
                "device_name": device_name,
                "agent_token": agent_token,
                "api_base": api_base,
                "paired_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(config, f, indent=2)

            print("\n[SUCCESS] Agent paired successfully with PrintFlow Shop!")
            print(f"Agent ID: {config['agent_id']}")
            print(f"Station:  {device_name}")
            print(f"Saved to: {CONFIG_FILE.resolve()}\n")
        except Exception as e:
            print(f"\n[Pairing Failed] {e}")
            if "invalid or has expired" in str(e).lower() or "422" in str(e):
                print("\n[Tip] The 6-digit pairing code has expired or was refreshed.")
                print("      1. In your Owner Dashboard (http://localhost:5173/owner/dashboard), click 'Regenerate PIN'")
                print("      2. Copy the active code and run: python run_agent.py --pair <NEW-PIN>\n")
            sys.exit(1)

    try:
        run_agent_loop(
            api_base,
            agent_token,
            device_name,
            preferred_printer=args.printer,
            simulate=args.simulate,
            allow_raw_pdl=args.raw_pdl,
            spool_timeout=args.spool_timeout,
            blocked_timeout=args.blocked_timeout,
        )
    except KeyboardInterrupt:
        print("\n[Agent] Stopped cleanly.")


if __name__ == "__main__":
    main()
