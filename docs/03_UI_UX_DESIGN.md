# 03 — UI/UX Design Specification

**Product:** PrintFlow  
**Version:** 1.0  
**Date:** 24 November 2026

## 1. Design principles

1. **Transaction clarity:** Customers must understand exactly what they are printing, how much it costs and what happens next.
2. **Mobile-first public flow:** The customer interface is designed for one-handed phone use at a shop counter, with weak mobile networks considered.
3. **Operational clarity:** Owners and staff need an unmistakable queue, device state and recovery actions—not decorative dashboards.
4. **Privacy visibility:** Explain what document data is processed and when it is deleted.
5. **Honest status:** Distinguish payment success, job queued, submitted to printer spooler and physically confirmed output.
6. **Original identity:** Use a new visual identity. Do not copy QR Se Print's logo, wording, layout details or illustrations.
7. **Accessible and localizable:** English/Bangla initially; currency, date, phone and labels are configurable by locale.

## 2. Proposed visual direction

A modern print-operations product: clean paper-like surfaces, dark ink typography, one distinctive accent color, strong information hierarchy and quiet status colors. It should feel trustworthy and efficient rather than like a generic admin template.

### Suggested design tokens (starting point)

| Token | Suggested value | Usage |
|---|---|---|
| Ink | `#121820` | Primary text and dark surfaces |
| Paper | `#F7F8FA` | App background |
| Surface | `#FFFFFF` | Cards and panels |
| Accent | `#245BDB` | Primary action, links, focus |
| Accent soft | `#EAF0FF` | Selected state and light emphasis |
| Success | `#16835D` | Paid/complete/online |
| Warning | `#B87518` | Pending/attention |
| Danger | `#C43D42` | Failed/destructive |
| Border | `#E2E6EC` | Dividers and inputs |
| Muted | `#667085` | Helper text |

Dark mode may be supported for the owner panel, but the public upload/checkout flow should default to a high-contrast light theme for document readability.

## 3. Information architecture

### Public/customer site

- `/s/{shopSlug}` — shop landing/upload start.
- `/s/{shopSlug}/upload` — upload and file list.
- `/s/{shopSlug}/configure` — print settings and quote.
- `/s/{shopSlug}/checkout` — payment selection and handoff.
- `/order/{publicToken}` — order status/tracking.
- `/order/{publicToken}/receipt` — payment/order receipt if enabled.

### Tenant owner panel

- Overview
- Orders
  - All orders
  - Active queue
  - Failed/attention
  - Order detail/timeline
- Shop setup
  - Shop profile
  - Public page and QR codes
  - Locations/outlets
- Printing
  - Agents/devices
  - Printers and capabilities
  - Test print
  - Default print rules
- Pricing
  - Price profiles
  - Per-page and add-on rates
  - Supported services
- Payments
  - Gateway connection
  - Transactions
  - Refunds/reconciliation
- Team and roles
- Reports
- Subscription/billing (SaaS)
- Settings
  - Language, currency, time zone
  - Notifications
  - Privacy and retention
  - Audit/activity log

### SaaS platform panel

- Platform overview
- Tenants
- Plans and entitlements
- Subscriptions/invoices
- Platform payment transactions
- Usage and limits
- Agent fleet health (metadata only)
- Webhook/queue/file-cleanup health
- Support and audit logs
- Platform configuration

Standalone edition hides SaaS platform navigation and subscription controls not relevant to its license model.

## 4. Customer flow screens

### 4.1 Shop landing (`/s/{shopSlug}`)

Purpose: establish trust and make it obvious which shop will receive the print job.

Components:
- Shop logo/name, address and optional contact number.
- Open/closed/temporarily unavailable status.
- Short service summary and accepted formats.
- Price guide (e.g., mono/color from configured rate; avoid misleading estimates).
- Primary CTA: **Upload documents**.
- Privacy note explaining temporary processing/deletion policy.
- Supported-language switch if enabled.

States:
- Shop active.
- Shop paused/closed (explain whether uploads are disabled or queued for later).
- Invalid/disabled slug.
- Subscription suspended (do not expose internal reason to public customer; show service unavailable).

### 4.2 Upload

Components:
- Large drop area plus mobile **Choose files** button.
- File type/size limit text from shop configuration.
- Upload progress per file with cancel/retry.
- File card: safe display name, file type, size, page count when available, validation state, remove action.
- Preview thumbnail for supported PDF/image.
- Clear handling for password-protected, corrupted, unsupported or malware-flagged files.

Interaction details:
- Upload one or more files.
- Do not navigate away on a transient upload failure; allow retry.
- Never mark a file ready until server validation/scan is complete.
- If a conversion is pending, show “Preparing document” rather than guessing page count.

### 4.3 Print settings and quote

For each document or selected group:
- Copies (bounded by shop policy).
- Page range: all pages or custom range; validate against actual page count.
- Color: black & white / color; show unavailable options as disabled with explanation.
- Paper size: A4 default; other media only where configured.
- Sides: one-sided / two-sided, with driver support caveat if needed.
- Orientation: auto/portrait/landscape where relevant.
- Optional finishing add-ons if enabled.

Summary block:
- Document name.
- Page count × copies.
- Selected modes.
- Line-item cost, fees/tax/discount.
- Total with currency.
- Price policy/cancellation note.

The server quote is authoritative. If the quote expires or settings change, refresh it and show the new amount before checkout.

### 4.4 Checkout

- Display shop name, order reference and final amount.
- Available gateways according to tenant configuration and customer location.
- Do not show a payment method that is not active/approved.
- Explain that printing starts only after the payment is verified.
- Optional phone/email for receipt/status, with consent.
- Loading/pending state that prevents double submission.
- On payment-provider redirect return, query server status; never show “paid” solely because a success URL was loaded.

### 4.5 Order status page

Use a compact vertical timeline:

1. Files received
2. Preparing documents
3. Awaiting payment / Payment verified
4. Waiting for shop printer
5. Sent to printer / Printer reported complete (if supported)
6. Ready for collection

Alternative states:
- Payment pending: explain not to pay again until status refresh/reconciliation.
- Payment failed/cancelled: offer retry if the quote is still valid.
- Print failed: say the shop is reviewing the issue; do not claim that a refund was issued unless verified.
- Unknown print outcome: say the shop must confirm before a retry to avoid duplicate pages.
- Expired/deleted file: order metadata may remain but document is no longer available.

## 5. Owner-panel screens

### 5.1 Overview

Top-level cards:
- Orders today.
- Paid amount today.
- Waiting for print.
- Failed/needs attention.
- Print Agent status.

Main content:
- Active queue with age and status.
- Recent orders table.
- Printer/agent status panel.
- Quick actions: Download QR, Test print, Edit pricing.

Avoid chart overload. Every KPI should have a defined calculation and date/timezone.

### 5.2 Orders list

Columns: order reference, created time, customer label (if supplied), files/pages, amount, payment status, print status, assigned printer, actions.

Filters: date range, payment state, print state, printer/agent, file type, outlet. Search by public reference, internal order code or contact where authorized.

Bulk actions must be safe. Never bulk reprint or refund without confirmation and audit trail.

### 5.3 Order detail

- Full timeline and event timestamps.
- Quote snapshot and print settings.
- Payment attempt history/provider references (mask sensitive values).
- File metadata, not file contents after deletion.
- Print job attempts, assigned agent/printer and spooler ID.
- Retry, hold, cancel, refund request or mark ready-for-collection according to permissions.
- Clear warning before a reprint if a prior spooler submission has an unknown outcome.

### 5.4 Shop profile and QR

- Shop identity and public page preview.
- Editable slug with collision check and redirect policy.
- QR preview and download: PNG, SVG and print-ready PDF.
- Optional counter labels and logo lockup created from the new brand identity.
- Copy public URL action.

### 5.5 Printer and agent setup

Onboarding wizard:
1. Download agent installer and show supported OS/version.
2. Generate one-time pairing code.
3. Open agent app and enter code / scan pairing QR.
4. Agent reports device identity and discovered printers.
5. Owner selects default printer, paper defaults and supported modes.
6. Send test page.
7. Show connected/idle/busy/offline state and last heartbeat.

Agent cards should show last seen, version, OS, assigned outlet, available printer names and pending updates. Do not expose secrets or local paths.

### 5.6 Pricing setup

- Currency selection at tenant creation; changing currency later requires an explicit migration/confirmation.
- Configurable base rates for monochrome/color and supported paper sizes.
- Charge basis: per printed page/side or per physical sheet (must be explicit).
- Duplex pricing rule.
- Minimum order fee, service fee, tax and add-ons.
- Preview calculator with sample page/copy values.
- Effective date/version so historical quotes remain intact.

### 5.7 Payment settings

- Provider cards by country/currency.
- Test/live environment toggle with clear warning.
- Credential fields write-only after save, masked status after.
- Connection test and webhook endpoint/status.
- Merchant display name and settlement account are provider-managed, not arbitrary frontend text.
- Separate section for SaaS billing where platform operator configures its own gateway.

## 6. SaaS platform screens

### Tenant directory

Columns: tenant, owner, plan, status, created date, renewal date, shops, active agents, usage. Actions: view summary, suspend/reactivate with reason, adjust plan, view invoice/payment history.

### Plan editor

- Name, billing term, currency/amount, features and limits.
- Unlimited uses `null`/explicit unlimited flag, not magic large numbers.
- Version plan changes; existing subscriptions retain their current agreed terms until renewal unless migrated explicitly.

### Platform health

- Queue depth and oldest job.
- Paid-but-not-dispatched count.
- Offline agents by tenant (metadata only).
- Webhook failures/retries.
- File cleanup overdue.
- Payment reconciliation mismatch.
- Storage usage and worker errors.

## 7. Design system and components

Required shared components:
- App shell with tenant/shop switcher when applicable.
- Responsive sidebar/top navigation.
- Data table with filters, sorting, pagination and empty states.
- Status badge system with consistent labels and colors.
- File uploader with upload/scan/convert sub-states.
- Document preview and print options form.
- Money/quote summary.
- Payment method chooser.
- Timeline/activity feed.
- Printer/agent status card.
- QR preview/export card.
- Confirm modal for destructive/reprint/refund actions.
- Toast system that is accessible and never the only place an important error is shown.
- Skeleton, empty, offline, error and retry states.

## 8. Responsive behavior

- Customer flow: 320px+ wide, no horizontal scrolling; large touch targets; fixed bottom CTA only when it does not hide form fields.
- Owner panel: mobile can view/operate active orders; desktop is optimized for queue and data tables.
- Platform panel: desktop-first, with mobile read-only operational overview where useful.
- At 768px breakpoint, tables may convert to cards or permit controlled horizontal scroll with pinned key fields.

## 9. Localization and accessibility

- All user-facing strings come from translation files, not hardcoded JSX.
- Support English and Bangla initial locale; RTL not required unless later added.
- Format dates/times using shop timezone and locale.
- Format currency using ISO currency and locale.
- Input labels remain visible; error text is associated with controls.
- Keyboard navigation and visible focus indicators.
- Color is not the only status indicator.
- Respect reduced-motion preference; use motion only to reinforce progress/state.
- Announce upload, payment and job status changes to assistive technology.

## 10. UX acceptance checklist

- A new customer understands which shop receives the document.
- Supported formats, file limits and price basis are visible before upload.
- Upload/scan/conversion/payment/printing statuses cannot be confused.
- The total price is visible before the payment provider opens.
- On provider return, state is fetched from backend and can remain pending.
- Owner can find a failed order and understand what failed.
- Retry controls warn about duplicate output risk.
- Every major screen has loading, empty, error, offline and permission-denied states.
- No dead buttons, fake charts, hardcoded sample orders or placeholder payment success.
