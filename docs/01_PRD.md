# 01 — Product Requirements Document (PRD)

**Product:** PrintFlow (working name)  
**Version:** 1.0  
**Date:** 24 November 2026  
**Status:** Proposed product specification based on public reference audit + recommended implementation design.

## 1. Product vision

Turn a walk-in print shop's document intake and payment process into a self-service digital workflow. A customer scans a shop-specific QR code, uploads files from a phone, selects print settings, pays, and the shop computer receives the job for automatic printing. The owner manages orders, prices, devices, QR assets, staff and reports from one panel.

The product must be sellable in two ways:

- **Standalone:** one business deploys and operates its own instance, on its own infrastructure or managed server.
- **SaaS:** many independent businesses subscribe to one centrally operated platform, each with isolated data, storefront settings, payment configuration and devices.

## 2. Problem statement

Traditional print-shop intake often requires customers to send files through messaging apps, email, USB drives or direct transfer. Staff must locate the file, confirm the print settings, calculate a price, collect money, and manually send it to a printer. This increases queue time, file-handling exposure, manual effort, payment confusion and order-tracking friction.

PrintFlow centralizes the workflow and introduces a verified payment-to-print automation pipeline.

## 3. Reference evidence vs. product decisions

### 3.1 Publicly observed on the reference site

The public landing/registration page advertises: scan QR, upload document, pay online, automatic printing; no WhatsApp/pendrive/file transfer; online UPI payment to the shop owner; a shop-owner admin panel and order records; file deletion after print; shop account creation after package payment; and four subscription terms (1, 3, 6, 12 months). The separate owner login page shows username/password login in Bengali.

### 3.2 Not verified on the reference

The public pages did not expose authenticated owner pages, customer upload form fields, printer protocol, payment integration internals, staff controls, detailed reporting, printer status feedback, file-format limits, security implementation, APIs or schema. All detailed requirements below are proposed to produce a complete, reliable commercial product.

## 4. Target users and personas

### 4.1 Customer (no account required)

- Walks into a print shop and scans the QR code displayed at the counter.
- Uses a mobile browser; must not need to install an app or create an account.
- Uploads one or more supported files.
- Chooses copies, page range, paper size, color mode and simplex/duplex where enabled.
- Reviews a clear quote and pays through the shop's configured gateway.
- Sees a reference/order code and live status.

### 4.2 Shop owner / tenant administrator

- Creates or activates the shop account.
- Configures shop name, address, contact, public slug, language, currency, opening state and brand mark.
- Connects a payment gateway or enters approved merchant credentials.
- Installs/links one or more Print Agents and selects default printers.
- Sets print pricing and format limits.
- Monitors orders, reprints when needed, resolves failed jobs and reviews reports.
- Manages staff permissions and subscription status.

### 4.3 Shop staff / operator

- Views the active queue and order detail.
- Pauses, holds, cancels or retries jobs within permission limits.
- Can mark physical handoff as collected/complete where configured.
- Cannot change tenant ownership, payment credentials or subscription unless permitted.

### 4.4 Platform super administrator (SaaS only)

- Manages tenant accounts, plans, subscription invoices, feature entitlements and platform payment transactions.
- Monitors queue health, agent/device health, file-cleanup backlog, provider webhooks and failed jobs.
- Can suspend a tenant for policy or billing reasons with a recorded reason and audit trail.
- Must not browse tenant document content by default; access requires an audited support elevation and a documented business reason.

### 4.5 Standalone system administrator

Equivalent to tenant owner + deployment administrator. Platform-wide SaaS controls are disabled or hidden in standalone mode.

## 5. Goals and non-goals

### Goals

- Minimize customer steps from QR scan to paid print job.
- Remove manual file transfer from the normal happy path.
- Ensure a print job can only be dispatched after payment is verified, unless the owner explicitly enables an authorized manual/credit workflow.
- Support multiple shops/outlets, agents and printers per tenant.
- Isolate every tenant's data and gateway credentials.
- Offer a sellable SaaS plan and a self-hosted standalone edition from one codebase.
- Delete document files after completion or after a short configured expiry while retaining non-sensitive order/payment metadata.
- Make failures visible, recoverable and auditable.

### Non-goals for MVP

- Full graphic-design/editor suite.
- Public document storage or long-term cloud drive.
- WhatsApp bot ingestion as a required path.
- AI document understanding or OCR-based editing.
- Physical printer firmware management.
- Guaranteed physical-page detection on printers that do not expose trustworthy telemetry.
- Marketplace payout/split settlement without provider approval and merchant onboarding.
- Mobile native apps; responsive mobile web is sufficient for customers.

## 6. Product modes and commercial model

### 6.1 SaaS edition

- Central platform URL and optional tenant subdomains/custom domains.
- Each tenant has one subscription account and can have multiple shops/outlets according to plan.
- Tenant-specific customer payment gateway credentials (BYO merchant account) for print-order payments.
- Platform-owned gateway account for SaaS subscriptions.
- Plan limits: shops/outlets, staff seats, connected agents, printers, monthly pages/orders, storage/temporary upload limits, custom domain, white-label, reports and automation features.
- Usage metering must be calculated from auditable events, not frontend counters.

### 6.2 Standalone edition

- Same application modules and migrations.
- Configuration forces a single tenant context.
- No SaaS platform dashboard, tenant switching or public tenant registry.
- Merchant connects its own print-order gateway. The product seller may also bill a separate license/subscription if the commercial agreement requires it.
- Deployment supports customer-owned VPS/Docker or a managed installation.
- License checks must not disable access to already created records or prevent export during a billing dispute; apply the commercial license policy transparently.

### 6.3 Reference pricing (not recommended selling price)

The reference page displayed ₹99 / 1 month, ₹249 / 3 months, ₹399 / 6 months and ₹599 / 12 months. These are reference-site prices only. Define new plans, limits and prices independently after cost and market validation.

## 7. Primary customer journey

1. Customer scans the shop QR code.
2. Public shop page loads with shop identity, service availability, accepted formats and indicative price guidance.
3. Customer selects or drags files into the uploader.
4. Backend validates file type, size, malware status and page count; document is rendered for preview when supported.
5. Customer selects print options per file or grouped selection.
6. Server calculates and stores an immutable quote snapshot with currency, price rules, tax/fees and total.
7. Customer enters optional contact details (phone/name only if needed for order lookup or receipt).
8. Server creates an internal payment attempt and initializes the selected tenant gateway.
9. Customer completes hosted/embedded checkout.
10. Server verifies payment through the signed webhook/IPN and/or provider validation/query API; never trust a client-side success flag.
11. After successful verification, the order transitions to paid and an idempotent print dispatch event is enqueued.
12. A registered online Print Agent leases the job, downloads its short-lived encrypted/signed payload, validates the checksum and submits the document to the selected local printer.
13. Agent reports acceptance/error and printer/spooler metadata; dashboard/customer tracking is updated.
14. Remote and local temporary document files are removed according to the deletion policy; deletion is logged.
15. Customer sees a completion/error state and order reference. Shop staff hands over printed pages.

## 8. Owner onboarding journey

1. Choose edition or SaaS plan.
2. Register owner account with verified contact method.
3. Create organization/tenant and first shop.
4. Set shop slug, name, address, currency, locale and contact details.
5. Configure print services and price profile.
6. Connect the shop's gateway credentials in test mode.
7. Download/install Print Agent on the shop computer.
8. Pair the agent using a short-lived one-time pairing code.
9. Discover available OS printers; choose default printer and paper defaults.
10. Run a test page and a test payment/job in sandbox.
11. Generate/download shop QR code (PNG/SVG/PDF) and display it at the counter.
12. Switch payment to live after provider onboarding and successful end-to-end checklist.

## 9. Functional requirements and priority

Priority definitions: **P0** required for a sellable MVP; **P1** important follow-up; **P2** optional/advanced.

### 9.1 Identity, tenancy and access

- P0: owner registration/login/logout, password reset, session revocation, email/mobile verification option.
- P0: SaaS tenant provisioning and tenant resolution from route/domain.
- P0: standalone single-tenant resolver.
- P0: tenant-scoped authorization for every business record and API.
- P0: owner and operator roles with server-side permission checks.
- P1: multiple staff roles, invitations, 2FA, SSO.
- P1: custom tenant domain with DNS/HTTPS verification.

### 9.2 Shop profile and QR

- P0: unique public shop slug/URL.
- P0: editable shop display name, address, contact, logo, open/closed/paused state.
- P0: QR generator for canonical HTTPS URL.
- P0: QR exports in PNG, SVG and print-ready PDF; quiet zone and contrast checked.
- P1: separate QR tokens for outlet/counter/marketing source, while resolving to the correct shop.

### 9.3 Upload and document processing

- P0: PDF, JPEG, PNG support.
- P0: multi-file upload, progress, cancel/remove before submission.
- P0: private storage and MIME/signature validation, not filename-only validation.
- P0: configurable per-file and per-order size limits; page count and page thumbnails for PDF where feasible.
- P0: reject encrypted/invalid/malformed files with a useful message; no silent success.
- P0: safe conversion/render pipeline with resource/time limits.
- P1: DOCX/DOC/PPTX/XLSX conversion via isolated LibreOffice worker.
- P1: HEIC/TIFF and additional image formats.
- P1: customer document preview and per-page selection.

### 9.4 Print configuration and pricing

- P0: per-file or grouped selection of copies, page range, paper size, color/mono, single/double-sided.
- P0: server calculates authoritative quote using tenant price profile.
- P0: immutable quote snapshot linked to order; no client-side amount trust.
- P0: owner can enable/disable print options and accepted file types.
- P1: A3, photo paper, custom media, binding/stapling/lamination as configurable add-ons.
- P1: discounts, promo codes, tax profiles, minimum charge and service fee.

### 9.5 Payment and order flow

- P0: separate print-order and SaaS subscription payment purposes.
- P0: payment attempt and immutable ledger records.
- P0: payment provider adapter interface.
- P0: server-side transaction verification and signed webhook/IPN handling.
- P0: idempotent webhook processing.
- P0: pending/failed/cancelled/refund/unknown states; no false success.
- P0: paid order dispatches a print job only once.
- P1: refunds and partial refunds subject to provider capability.
- P1: provider transaction reconciliation report.

### 9.6 Printer and automation

- P0: Windows Print Agent enrollment and secure pairing.
- P0: agent heartbeat/online-offline state.
- P0: local printer discovery and default printer selection.
- P0: PDF printing with copies, page range, monochrome/color and media options where driver supports them.
- P0: signed job payload, short-lived download URL, checksum verification.
- P0: job lease, retry policy and duplicate-print protection.
- P0: separate `submitted_to_spooler` and `printer_confirmed` states.
- P0: manual hold, cancel-before-print, controlled retry/reprint.
- P0: local and remote file deletion; deletion logs.
- P1: Linux/CUPS agent and network printer health.
- P1: agent auto-update with signed releases and rollback.
- P1: agent local queue for transient connectivity loss, with clear unknown/reconciliation state.

### 9.7 Owner panel and reports

- P0: dashboard summary (today's orders, paid revenue, waiting/printing/failed jobs, agent status).
- P0: searchable orders table with filters and detail timeline.
- P0: live queue and printer status.
- P0: shop profile, pricing, QR and printer settings.
- P0: payment transaction history.
- P1: CSV/PDF exports, daily/weekly/monthly/custom reports.
- P1: staff and outlet management.
- P1: cost-per-page, printer utilization and job failure analytics.

### 9.8 SaaS control plane

- P0: platform admin login and tenant directory.
- P0: plan CRUD, subscription lifecycle and invoice records.
- P0: tenant status, expiry and feature entitlements.
- P0: subscription payment reconciliation.
- P0: audit log for administrative actions.
- P1: tenant usage dashboard, support tickets and announcements.
- P1: white-label branding and custom domain entitlements.

## 10. Business rules

1. The server determines total price; browser calculations are previews only.
2. Every quote stores a price snapshot so later price changes do not rewrite historical orders.
3. A job cannot enter `queued_for_agent` until payment is verified or an authorized owner grants a recorded credit/manual-payment exception.
4. A webhook can be delivered more than once; duplicate events must not create duplicate print jobs or ledger entries.
5. A print attempt with uncertain outcome must not be automatically reprinted without reconciliation or explicit operator action.
6. Reprint is a new auditable attempt/job linked to the original; never erase the original history.
7. Tenant files and credentials are private and tenant-scoped.
8. Successful print submission triggers file deletion according to configured policy; failures have a short bounded retention window for retry, followed by deletion.
9. A cancelled order after payment follows a documented refund/credit policy; do not silently mark it unpaid.
10. SaaS expiry restricts new usage according to grace-period policy but does not delete business records.
11. Platform subscription invoices and tenant customer-print invoices are distinct objects and reports.
12. Store currency using integer minor units (paise/paisa) plus ISO currency code; never use floating-point money values.

## 11. Acceptance criteria for MVP

### Customer flow

- A first-time customer can complete the flow on a mid-range mobile browser without creating an account.
- Upload progress and validation errors are understandable.
- File settings and final quote are visible before payment.
- A payment return URL alone cannot mark the order paid.
- A verified payment creates exactly one dispatchable print job.
- Customer can see a stable order reference and truthful job state.

### Shop owner flow

- Owner can create a shop, configure prices, set the gateway, pair an agent, pick a printer and download QR artwork.
- Owner can find an order by reference/date/status and inspect its event timeline.
- Owner can see offline agent, failed conversion, pending payment and print error states.
- Owner can cancel a job before printing and trigger a controlled retry after resolving the error.

### Data and security

- Cross-tenant object access is denied at API/database query layer.
- Payment webhook signature and provider validation are tested.
- Duplicate event deliveries are harmless.
- Files are not public and cannot be fetched after expiration/deletion.
- Agent cannot fetch jobs for a different tenant/shop/device.
- Audit logs exist for gateway changes, manual paid overrides, cancellations, refunds, reprints and staff changes.

### Commercial editions

- Standalone install boots in single-tenant mode with no SaaS admin routes.
- SaaS install provisions two tenants and proves data isolation.
- Both editions run the same core order, pricing, payment and print-job services.

## 12. Success metrics

Initial operational targets (validate with pilot shops; these are targets, not observed facts):

- QR page first meaningful render under 2.5 seconds on typical mobile broadband.
- Upload starts within 2 seconds after file selection (excluding file transfer time).
- Verified-payment-to-agent-dispatch latency p95 under 10 seconds while an agent is online.
- At least 98% of supported PDF jobs reach a terminal agent-reported state in pilot testing.
- Duplicate physical print incidents below 0.1% of jobs after reconciliation controls.
- 100% of files have a deletion deadline and auditable deletion result.
- Zero cross-tenant data disclosure in automated authorization tests.
- Payment reconciliation has no unexplained amount/currency mismatches.
