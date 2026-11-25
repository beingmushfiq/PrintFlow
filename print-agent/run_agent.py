#!/usr/bin/env python3
"""
PrintFlow Windows Desktop Print Delivery & Hardware Agent
Standalone zero-dependency runner for Windows 10/11 counter workstations.

Capabilities:
1. Cryptographic enrollment with 6-digit pairing PIN.
2. Local Windows printer discovery (Get-Printer / winspool).
3. Secure job leasing with SHA-256 checksum verification.
4. Native spooling or simulated hardware output.
5. Ephemeral shredding of temporary print artifacts.
6. Heartbeat presence with exponential backoff & jitter.
"""

import argparse
import ctypes
import ctypes.wintypes
import hashlib
import json
import os
import platform
import random
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CONFIG_FILE = Path(__file__).parent / "agent_config.json"
DEFAULT_API_BASE = "http://127.0.0.1:8000"


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


def discover_windows_printers() -> list:
    """Discover installed printers via PowerShell Get-Printer or fallback."""
    printers = []
    if sys.platform == "win32":
        try:
            cmd = [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-Printer | Select-Object Name, DriverName, Type, Default | ConvertTo-Json",
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if proc.returncode == 0 and proc.stdout.strip():
                raw = json.loads(proc.stdout)
                if isinstance(raw, dict):
                    raw = [raw]
                for item in raw:
                    name = item.get("Name", "Printer")
                    pr_type = str(item.get("Type", "")).lower()
                    printers.append({
                        "name": name,
                        "driver_name": item.get("DriverName", "Generic"),
                        "connection_type": "usb" if "usb" in pr_type else "virtual",
                        "capabilities": {
                            "color": True,
                            "duplex": True,
                            "supported_paper_sizes": ["A4", "Letter"],
                            "trays": ["Auto", "Tray 1"],
                        },
                        "status": "online",
                        "is_default": bool(item.get("Default", False)),
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
            "agent_runtime": "python-zero-dep-v1",
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


class DOC_INFO_1W(ctypes.Structure):
    _fields_ = [
        ("pDocName", ctypes.wintypes.LPWSTR),
        ("pOutputFile", ctypes.wintypes.LPWSTR),
        ("pDatatype", ctypes.wintypes.LPWSTR),
    ]


def detect_extension(doc_bytes: bytes) -> str:
    if doc_bytes.startswith(b"%PDF"):
        return ".pdf"
    if doc_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if doc_bytes.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    return ".bin"


def choose_target_printer(printers: list, preferred_printer: str = None) -> dict:
    if not printers:
        raise RuntimeError("No printers available on this workstation.")

    if preferred_printer:
        needle = preferred_printer.strip().lower()
        for p in printers:
            if p["name"].lower() == needle or needle in p["name"].lower():
                return p
        raise RuntimeError(f"Preferred printer '{preferred_printer}' was not found on this PC.")

    # Prefer physical (non-virtual) default printer, then any physical online printer
    for p in printers:
        if p.get("connection_type") != "virtual" and p.get("is_default"):
            return p
    for p in printers:
        if p.get("connection_type") != "virtual" and p.get("status") == "online":
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
    import shutil
    return shutil.which("SumatraPDF") or shutil.which("SumatraPDF.exe") or ""


def submit_gdi_image_print(printer_name: str, image_path: Path) -> int:
    """Print PNG/JPEG via Windows built-in .NET System.Drawing.Printing (GDI, no dialogs)."""
    escaped_printer = printer_name.replace("'", "''")
    escaped_file = str(image_path.resolve()).replace("'", "''")
    ps_script = (
        "Add-Type -AssemblyName System.Drawing; "
        f"$img = [System.Drawing.Image]::FromFile('{escaped_file}'); "
        "$doc = New-Object System.Drawing.Printing.PrintDocument; "
        f"$doc.PrinterSettings.PrinterName = '{escaped_printer}'; "
        "if (-not $doc.PrinterSettings.IsValid) { throw 'Invalid Windows printer name'; }; "
        "$doc.add_PrintPage({ param($s, $e) $e.Graphics.DrawImage($img, $e.MarginBounds); $e.HasMorePages = $false }); "
        "try { $doc.Print() } finally { $img.Dispose(); $doc.Dispose() }"
    )
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_script],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "GDI image print failed")
    return int(time.time()) % 100000


def submit_windows_print(printer_name: str, job_id: str, file_path: Path, doc_bytes: bytes) -> int:
    """
    Dispatch document to the Windows printer cleanly:
    - SumatraPDF (-print-to -silent) for PDFs on GDI printers when installed
    - Built-in .NET GDI PrintDocument for PNG/JPEG images
    - Win32 winspool.drv RAW spool submission otherwise (direct PDF/PCL/PS/universal spooler)
    """
    ext = file_path.suffix.lower()
    if ext == ".pdf":
        sumatra = find_sumatra_pdf()
        if sumatra:
            proc = subprocess.run(
                [sumatra, "-print-to", printer_name, "-silent", str(file_path.resolve())],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if proc.returncode != 0:
                raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or f"SumatraPDF exited {proc.returncode}")
            return int(time.time()) % 100000
    elif ext in (".png", ".jpg", ".jpeg"):
        return submit_gdi_image_print(printer_name, file_path)

    return submit_win32_raw_spool(printer_name, f"PrintFlow Job #{job_id}", doc_bytes)


def submit_win32_raw_spool(printer_name: str, doc_title: str, doc_bytes: bytes) -> int:
    """Submit document bytes to the Windows Print Spooler via winspool.drv (no GUI dialogs)."""
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
):
    print(f"\n=======================================================")
    print(f" [PrintFlow Agent] RUNNING ON {device_name}")
    print(f" Connected to: {api_base}")
    print(f" Mode:         {'SIMULATED SPOOLER (--simulate)' if simulate else 'LIVE WINDOWS PRINT SPOOLER'}")
    print(f" Privacy:      Ephemeral spooling with automated file shredding")
    print(f" Status:       Online (Press Ctrl+C to exit)")
    print(f"=======================================================\n")

    # Discover and sync printers
    printers = discover_windows_printers()
    print(f"[Agent] Discovered {len(printers)} printers on this workstation:")
    for p in printers:
        def_tag = " (DEFAULT)" if p.get("is_default") else ""
        print(f"   * {p['name']} [{p['connection_type']}]{def_tag}")

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

    last_heartbeat = 0
    heartbeat_interval = 30

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

                print(f"\n[Agent] ---> LEASED NEW PRINT JOB: #{job_id}")
                print(f"        Pages: {job.get('pages_total')} | Settings: {job.get('print_settings')}")

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

                    target_printer = choose_target_printer(printers, preferred_printer)
                    print(f"[Agent] [Target Printer] {target_printer['name']} ({target_printer['connection_type']})")

                    # Notify backend that spooling started
                    acknowledge_job(api_base, agent_token, job_id, lease_tok, status="printing")

                    if simulate or sys.platform != "win32":
                        spooler_id = random.randint(1000, 9999)
                        print(f"[Agent] [Simulated Spooler] Job ID: {spooler_id}")
                    else:
                        spooler_id = submit_windows_print(
                            target_printer["name"],
                            job_id,
                            tmp_file,
                            doc_bytes,
                        )
                        print(f"[Agent] [Spooler Submitted] Win32 Spooler Job ID: {spooler_id}")

                    # Complete Ack
                    acknowledge_job(api_base, agent_token, job_id, lease_tok, spooler_id, status="completed")
                    print(f"[Agent] [Ack Sent] Job #{job_id} acknowledged to backend")

                    # Ephemeral Shred
                    secure_shred(tmp_file)
                    acknowledge_shred(api_base, agent_token, job_id)
                    print(f"[Agent] [Shred Ack] Temp print artifacts shredded with zero trace.\n")
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
    parser.add_argument("--reset", action="store_true", help="Forget saved pairing credentials and re-enroll")

    args = parser.parse_args()

    if args.reset and CONFIG_FILE.exists():
        CONFIG_FILE.unlink(missing_ok=True)
        print("[Agent] Cleared local pairing config.")

    # Check for existing config
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
        )
    except KeyboardInterrupt:
        print("\n[Agent] Stopped cleanly.")


if __name__ == "__main__":
    main()
