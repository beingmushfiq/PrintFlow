import unittest
from pathlib import Path
from unittest import mock

import run_agent


class PrintAgentTests(unittest.TestCase):
    def test_classify_printer_connection_distinguishes_usb_network_and_virtual(self):
        self.assertEqual(
            run_agent.classify_printer_connection("SHARP AR-7024D (USB)", "SHARP AR-7024D (USB)", "USB002", 0xA40),
            "usb",
        )
        self.assertEqual(
            run_agent.classify_printer_connection("HP LaserJet Pro M706n UPD PCL 6", "HP Universal Printing PCL 6", "USB003", 0xE40),
            "usb",
        )
        self.assertEqual(
            run_agent.classify_printer_connection("Office Canon", "Canon UFR II", "IP_192.168.1.50", 0x0),
            "network",
        )
        self.assertEqual(
            run_agent.classify_printer_connection("Microsoft Print to PDF", "Microsoft Print To PDF", "PORTPROMPT:", 0x240),
            "virtual",
        )
        self.assertEqual(
            run_agent.classify_printer_connection("Adobe PDF", "Adobe PDF Converter", "Documents\\*.pdf", 0x1240),
            "virtual",
        )

    def test_detect_extension_handles_pdf_with_bom_or_whitespace(self):
        self.assertEqual(run_agent.detect_extension(b"%PDF-1.7\n..."), ".pdf")
        self.assertEqual(run_agent.detect_extension(b"\xef\xbb\xbf\n%PDF-1.4\n..."), ".pdf")
        self.assertEqual(run_agent.detect_extension(b"\x89PNG\r\n\x1a\n\x00"), ".png")
        self.assertEqual(run_agent.detect_extension(b"\xff\xd8\xff\xe0"), ".jpg")
        self.assertEqual(run_agent.detect_extension(b"Hello plain text"), ".txt")
        self.assertEqual(run_agent.detect_extension(b"\x00\x01\x02\xff\xfe"), ".bin")

    def test_choose_target_printer_prefers_physical_online_default_then_requested(self):
        printers = [
            {"name": "Microsoft Print to PDF", "connection_type": "virtual", "is_default": True, "status": "online"},
            {"name": "SHARP AR-7024D (USB)", "connection_type": "usb", "is_default": False, "status": "online"},
            {"name": "EPSON L3250 Series", "connection_type": "usb", "is_default": False, "status": "online"},
        ]
        self.assertEqual(run_agent.choose_target_printer(printers)["name"], "SHARP AR-7024D (USB)")
        self.assertEqual(run_agent.choose_target_printer(printers, "EPSON L3250")["name"], "EPSON L3250 Series")

    def test_wait_for_spooler_completion_waits_for_sending_then_completes(self):
        polls = [
            [{"job_id": 42, "document": "PrintFlow Job #01abc", "status_flags": run_agent.JOB_STATUS_PRINTING, "pages_printed": 0, "total_pages": 1}],
            [{"job_id": 42, "document": "PrintFlow Job #01abc", "status_flags": run_agent.JOB_STATUS_PRINTED, "pages_printed": 1, "total_pages": 1}],
        ]
        idx = {"i": 0}

        def fake_poll(_printer):
            val = polls[min(idx["i"], len(polls) - 1)]
            idx["i"] += 1
            return val

        with mock.patch("time.sleep", return_value=None):
            done_id = run_agent.wait_for_spooler_completion(
                "SHARP AR-7024D (USB)",
                42,
                "PrintFlow Job #01abc",
                "01abc",
                set(),
                poll_fn=fake_poll,
            )
        self.assertEqual(done_id, 42)
        self.assertEqual(idx["i"], 2)

    def test_wait_for_spooler_completion_detects_cancelled_job(self):
        def fake_poll(_printer):
            return [
                {"job_id": 77, "document": "PrintFlow Job #01xyz", "status_flags": run_agent.JOB_STATUS_DELETING, "pages_printed": 0, "total_pages": 1}
            ]

        with self.assertRaises(RuntimeError) as ctx:
            run_agent.wait_for_spooler_completion(
                "SHARP AR-7024D (USB)",
                77,
                "PrintFlow Job #01xyz",
                "01xyz",
                set(),
                poll_fn=fake_poll,
            )
        self.assertIn("cancelled", str(ctx.exception).lower())

    def test_submit_windows_print_never_falls_back_to_raw_for_pdf(self):
        with mock.patch.object(run_agent, "list_printer_jobs", return_value=[]):
            with mock.patch.object(
                run_agent,
                "_run_encoded_powershell_and_track_spooler",
                side_effect=RuntimeError("WinRT error"),
            ):
                with mock.patch.object(run_agent, "find_sumatra_pdf", return_value=""):
                    with mock.patch.object(run_agent, "submit_win32_raw_spool") as raw_mock:
                        with self.assertRaises(RuntimeError):
                            run_agent.submit_windows_print(
                                "SHARP AR-7024D (USB)",
                                "01test",
                                Path("doc.pdf"),
                                b"%PDF-1.4 test",
                            )
                        raw_mock.assert_not_called()

    def test_ps_scripts_guard_against_nan_printable_area(self):
        settings = run_agent.normalize_print_settings({})
        pdf_ps = run_agent._build_winrt_pdf_print_ps("SHARP AR-7024D (USB)", Path("a.pdf"), "Doc", settings)
        img_ps = run_agent._build_gdi_image_print_ps("SHARP AR-7024D (USB)", Path("a.png"), "Doc", settings)
        self.assertIn("[double]::IsNaN($availW)", pdf_ps)
        self.assertIn("[double]::IsNaN($availW)", img_ps)


if __name__ == "__main__":
    unittest.main()
