# 05 — Automation and Integration Specification

**Product:** PrintFlow  
**Version:** 1.0  
**Date:** 24 November 2026

## 1. Automation overview

The core automation is a trusted sequence of asynchronous steps:

```text
QR visit
  -> Upload authorization
  -> Private file upload
  -> Malware/type validation
  -> Page count / conversion / preview
  -> Quote calculation
  -> Payment session
  -> Provider verification
  -> Paid-order event
  -> Print job creation (idempotent)
  -> Agent lease
  -> Secure download + checksum
  -> Local print submission
  -> Agent acknowledgement
  -> Customer/owner status update
  -> Remote/local deletion
```

No individual step should silently skip its validation or turn an error into a success state.

## 2. Upload authorization and processing pipeline

### 2.1 Upload initiation

1. Customer requests an upload slot for a known public shop.
2. API checks shop active status, tenant subscription entitlement, rate limit and configured size/file-count limits.
3. API creates an order draft and upload record.
4. API returns short-lived presigned upload URL or controlled upload token scoped to the generated object key.
5. Browser uploads directly to private object storage where available; otherwise streams through a controlled backend endpoint.
6. Browser calls completion endpoint with upload identifier and expected size/hash.

### 2.2 Validation

- Detect actual MIME from bytes; do not trust extension or browser-provided MIME.
- Enforce per-file and per-order byte ceilings.
- Verify file signature and parser can open file.
- Scan with malware scanner before document conversion.
- Reject encrypted PDFs unless password flow is intentionally supported (never ask users to send passwords over an insecure channel).
- Reject or quarantine malformed files, polyglot files and suspicious archive bombs.
- Limit number of pages, pixel dimensions, decompression ratio, CPU time, memory and worker disk.
- Normalize filenames for display; use internal random object keys.

### 2.3 Document processing

MVP supported:
- PDF: page count, page dimensions, page preview thumbnails, validation.
- JPG/JPEG/PNG: dimensions, orientation and optional generated PDF print artifact.

P1 supported using isolated LibreOffice worker:
- DOCX/DOC, PPTX/PPT and XLSX/XLS converted to PDF.
- Preserve original file only until conversion/output policy allows deletion.
- Conversion results can vary by fonts, embedded media and application rendering. Show a preview and ask the customer to confirm when fidelity risk is material.

Processing result should include:
- `scan_status`, `processing_status`, page count and dimensions.
- detected MIME, file hash and processing version.
- preview object key (temporary).
- normalized print artifact hash/object key.
- safe failure reason for customer; detailed technical reason for logs.

## 3. Pricing and quote automation

The backend computes the price from tenant price rules. Never trust a submitted total.

Example calculation inputs:
- page count or selected page count;
- copies;
- mono/color;
- media size;
- single/double-sided;
- add-on finishing options;
- minimum order charge;
- service fee and tax settings.

Example conceptual calculation:

```text
billable_sides = selected_page_count * copies
base = sum(applicable unit price * billable quantity)
subtotal = max(base + add_ons, minimum_order_charge)
tax = configured tax calculation on configured taxable base
total = subtotal + service_fee + tax - discount
```

The product must define whether pricing is per printed side or per physical sheet. Duplex jobs cannot be priced consistently until this is explicit. Store the full line-item breakdown and calculation version in the quote snapshot.

Quote rules:
- Quote has an expiry time.
- Any print option, file, price profile or tax change invalidates the prior quote.
- Payment amount is copied from the accepted quote, not recomputed after payment initiation.
- If the price profile changes after quote creation, historical quote remains valid until its expiry unless cancelled under a documented policy.

## 4. Payment-to-print automation

1. Create internal payment attempt (`purpose=print_order`) in `pending` state.
2. Create provider order/session on the server using the exact accepted amount/currency/reference.
3. Redirect/open hosted checkout or provider SDK.
4. Customer return/callback is not authoritative.
5. Receive signed webhook/IPN and verify provider status/transaction using provider API as required.
6. Match provider order/payment reference, merchant account, amount, currency and expected order.
7. In one DB transaction, mark payment captured, order paid and add an immutable order event; write an outbox/domain event.
8. After commit, enqueue `CreatePrintJobsForPaidOrder` with a unique idempotency key.
9. Create one or more print jobs from immutable file/print settings snapshots.
10. Agent receives the job based on its registered shop/printer assignment.

Do not perform provider HTTP calls, large file conversion or printer submission inside the webhook request. Verify and persist event, return quickly, then process the job asynchronously.

## 5. Print Agent specification

### 5.1 Supported MVP platform

Windows 10/11, 64-bit. The agent runs as a tray application and/or background service with a visible local status window. Linux/CUPS follows in a later adapter. Do not promise macOS support until it passes test hardware.

### 5.2 Agent modules

- Enrollment/pairing client.
- Device identity and credential store.
- Secure connection manager (WSS + reconnect/backoff).
- Heartbeat and presence reporter.
- Printer discovery and capability sync.
- Job lease manager.
- Secure download manager.
- Hash/signature verifier.
- Print settings mapper.
- Local spooler adapter.
- Local temp-file cleanup.
- Event/diagnostic log with PII/file-content redaction.
- Signed updater and version policy.

### 5.3 Pairing flow

1. Owner requests a pairing code in the panel.
2. Backend generates cryptographically random single-use code with short expiry (e.g. 5–10 minutes).
3. Agent submits code over TLS.
4. Backend validates the code, binds device to tenant/shop and returns a device identity plus rotating credential or certificate enrollment.
5. Pairing code is invalidated atomically.
6. Owner confirms device appears in the correct shop.
7. Owner may revoke the device immediately; revocation stops new job delivery.

Do not use permanent plaintext API keys pasted into an agent settings field.

### 5.4 Connection model

Preferred:
- Agent opens outbound `wss://` connection to the service.
- Server sends only a “jobs available” notification; agent requests/leases the next eligible job through authenticated API.
- Heartbeat every configurable interval with jitter.
- Reconnect uses exponential backoff with max ceiling.
- If WebSocket is unavailable, authenticated polling is a fallback.

Do not expose the shop computer's printer port or local web server to the public internet.

### 5.5 Job lease protocol

- Agent requests next job for its identity and selected printers.
- Server atomically leases one job and sets `lease_expires_at`.
- Lease includes job ID, attempt ID, settings snapshot, signed short-lived download URL, content hash, expiry and correlation ID.
- Agent validates all fields and tenant/shop/device assignment.
- Agent downloads to a restricted temporary directory.
- Agent verifies SHA-256 and file type.
- Agent submits to the selected local printer.
- Agent records `submitted_to_spooler` with local spooler job ID and attempt ID.
- Agent deletes its temporary source file as soon as safe according to the spooler integration; it must not claim the OS/printer has erased all cached spool data.
- Server reconciles lease timeout and agent connectivity before making a retry available.

### 5.6 Print states and honest telemetry

The API/UI must distinguish:

- `queued`: waiting for an eligible agent.
- `leased`: an agent has accepted the task.
- `downloading`: payload transfer in progress.
- `printing`: agent is issuing print operation.
- `submitted_to_spooler`: OS accepted the job; physical output may still fail.
- `printer_confirmed`: supported printer telemetry reports completion (only use when reliable).
- `unknown`: connection lost at a point where output may already have occurred.
- `failed`: known failure before or during spooler submission.

Windows print spooler provides the local print queue and job management interface; CUPS exposes IPP operations such as Print-Job, Get-Job-Attributes and Cancel-Job. Their existence does not guarantee all physical printer models report page completion reliably.

### 5.7 Duplicate-print prevention

This is a critical business rule. Network failure can occur after a printer accepts the job but before the agent sends its acknowledgement.

- Every print action has a stable internal job ID and attempt ID.
- Agent writes a local durable job journal before submission.
- Server retains lease/attempt state and spooler identifiers.
- If acknowledgement is lost, agent reconnects and reconciles local journal with server before reprinting.
- Mark uncertain outcomes `unknown`; present an operator decision to inspect the printer/output.
- Retry automatically only when the agent can prove the job was not submitted.
- Manual reprint creates a new attempt/event and requires permission.

### 5.8 Printer capabilities

Sync capability fields only when discovered or selected:
- Media sizes and source trays.
- Mono/color.
- Duplex.
- Resolutions/quality levels.
- Supported printable formats or rendering strategy.
- Status/availability where exposed.

Driver behavior varies. If an option cannot be honored, return a clear error or use a validated fallback agreed with the owner; never silently switch a paid color job to mono.

## 6. Local and remote file deletion

The reference landing page promises automatic file deletion after printing. Implement a verifiable lifecycle, not merely a marketing message.

### Remote storage
- Private object storage only.
- Generate `expires_at` at upload time.
- After confirmed spooler submission or configured terminal state, enqueue object deletion.
- Retry deletion failures and alert if overdue.
- Delete preview and conversion artifacts too.
- Have a scheduled cleanup job as a fallback for orphaned uploads and timed-out orders.

### Local agent
- Use a dedicated restricted temp directory.
- Never write to user Downloads/Desktop by default.
- Delete local source file after safe handoff to the OS spooler or after the bounded retry period.
- Store only non-sensitive job metadata in the local journal.
- The OS spooler and printer hardware may retain internal spool data; do not claim immediate erasure from the operating system or printer memory unless the device/vendor supports and verifies it.

### Recommended default retention policy

- Unpaid abandoned upload: 30–60 minutes (configurable).
- Paid job waiting for an offline agent: configurable short operational window (e.g. 24 hours), with owner alert and explicit extension if needed.
- Successfully submitted job: delete remote and local source immediately after safe handoff/acknowledgement, target within minutes.
- Failed job: short retry window (e.g. up to 24 hours), then delete unless an authorized owner explicitly places it on hold with a reason.
- Keep order/payment metadata according to the business's retention/legal policy; do not keep document bytes just for reporting.

These values are initial product defaults to validate with pilot shops and local privacy obligations.

## 7. Realtime updates and notifications

Events:
- `order.uploaded`
- `document.scan.completed|failed`
- `order.quote.created|expired`
- `payment.pending|captured|failed|unknown|refunded`
- `print_job.queued|leased|printing|submitted|confirmed|failed|unknown|cancelled`
- `file.deletion.completed|failed`
- `agent.online|offline|revoked|update_required`

Use WebSocket for the owner panel and optional customer tracking. Polling fallback must remain functional. Notification channels (email/SMS) are optional and must respect consent and provider availability.

## 8. Scheduled automations

- Expire unpaid orders and quotes.
- Reconcile pending/unknown payment attempts using provider query APIs.
- Reconcile stale print leases and agent presence.
- Clean remote/local temporary files and previews.
- Alert on paid orders without a print job.
- Alert on oldest queued jobs and offline agents.
- Expire pairing codes and rotate credentials.
- Enforce SaaS subscription grace/expiry entitlements.
- Aggregate metered usage from idempotent source events.
- Generate daily shop summaries if enabled.

## 9. Optional integrations (P1/P2)

- SMS: regional providers, opt-in order status notification.
- Email: order receipt, subscription invoice, device/offline alerts.
- WhatsApp: optional notification/inbound intake only after provider policy review; not part of core MVP.
- Accounting export: CSV/standard journal export.
- Barcode/receipt printer: optional order-token slip.
- Webhooks/API: tenant's external POS or order system, with signed outbound events and retry queue.

## 10. Failure matrix

| Failure | Required behavior |
|---|---|
| Upload interrupted | Keep draft and allow resumable/retry upload; do not quote incomplete file |
| Malware detected | Quarantine/reject; never send to converter/agent |
| PDF parse failed | Mark unsupported/corrupt with safe explanation |
| Conversion timeout | Retry bounded times; isolate worker; do not charge for unquoted output |
| Payment callback but no webhook | Query provider; status remains pending until verified |
| Duplicate webhook | Acknowledge harmlessly; process once |
| Webhook valid but amount differs | Quarantine/reconcile; never print automatically |
| Agent offline | Keep paid job queued until expiry; show offline and notify owner |
| Agent crash before print | Lease expires; reconcile local journal then allow safe retry |
| Agent crash after submission before ack | Mark unknown; require reconciliation, no blind retry |
| Printer disconnected/out of paper | Return specific error if driver reports; keep job failed/attention |
| File deletion fails | Retry, alert, preserve restricted access; never claim deleted |
| SaaS subscription expires | Apply grace/read-only/new-order policy; preserve records/export |

## 11. Automation acceptance tests

- Duplicate payment event generates one print dispatch.
- Agent A cannot lease Agent B's tenant jobs.
- Expired pairing token cannot enroll.
- Revoked agent cannot fetch/ack new jobs.
- File tampering fails checksum and blocks printing.
- Job lease timeout does not immediately duplicate a job whose spooler status is uncertain.
- Successful/failed file deletion is visible in audit/ops status.
- Agent offline/online transitions reach owner panel.
- Print option unsupported by driver is rejected or safely mapped with visible user confirmation.
