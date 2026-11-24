# 08 — Research Findings, Source Notes and Decision Register

**Research date:** 24 November 2026  
**Reference:** https://qr.habibaprint.site/

## 1. Public website inspection

### 1.1 Entry point

Opening `https://qr.habibaprint.site/` redirected to `https://qr.habibaprint.site/register.php`.

### 1.2 Public landing/registration page

The page title is **QR Se Print — Scan. Upload. Pay. Print.** It presents the main flow as:

- Scan QR Code
- Upload Document
- Pay Online
- Auto Print Instantly

It states “No WhatsApp • No Pendrive • No File Transfer.” It advertises privacy by saying files are automatically deleted from the server and shop owner's computer immediately after print.

The page advertises:
- Customers upload files from their phones.
- Online UPI payment directly to the shop owner.
- Auto print.
- Shop owner admin panel and order records.
- A shop's own link and QR code.
- User/shop ID and password created after payment.

Visible form labels include shop name (required), shop address and a 10-digit mobile number. It links to a video demonstration, but the video endpoint did not expose inspectable content during the audit.

### 1.3 Displayed subscription packages

| Term | Total | Displayed per-month equivalent |
|---|---:|---:|
| 1 month | ₹99 | ₹99/month |
| 3 months | ₹249 | ₹83/month |
| 6 months | ₹399 | ₹67/month |
| 12 months | ₹599 | ₹50/month |

The 12-month package is labelled popular. The reference page says that all packages include the shop link/QR, mobile uploads, direct UPI payment, auto print, file deletion and owner panel/order records.

### 1.4 Shop-owner login

The public login link resolves to `/admin/login.php`. The page displays a Bengali title for shop-owner login and username/password inputs with a login button. It includes a registration link.

### 1.5 Unavailable/unknown information

The public inspection did not provide authenticated credentials, and the following could not be verified:
- Detailed owner dashboard pages and actions.
- Actual customer upload/print-settings screen.
- Supported file extensions, file-size limits or page-count limits.
- Pricing per page, color mode, duplex, paper size or copy rules.
- How UPI payment is technically verified.
- Whether each shop enters a gateway credential, uses a platform aggregator or uses a manual QR flow.
- The physical printer connectivity software/agent.
- Whether the local computer agent is a browser extension, native service, QZ Tray or another bridge.
- Payment webhook configuration, refunds or subscription renewal behavior.
- Database schema, API endpoints, codebase or security controls.
- Exact deletion semantics for server storage, OS spooler and printer memory.

These must be treated as open discovery questions before claiming pixel/feature parity. The implementation architecture in this pack is a recommended reliable design, not a description of the reference's hidden internals.

## 2. External technical research

### 2.1 Local printing

**QZ Tray** documentation describes a cross-browser/cross-platform local application that connects to browser JavaScript over WebSocket and can print PDF, HTML and images. Its signing documentation says removal of print confirmation dialogues requires signed messages; certificate/private-key setup and signing are described. This supports the conclusion that a local agent/bridge is the practical architecture for unattended printing.

- Getting started: https://qz.io/docs/getting-started
- Using QZ Tray: https://qz.io/docs/using-qz-tray
- Signing messages: https://qz.io/docs/signing
- API: https://qz.io/api
- Print server: https://qz.io/docs/print-server

**Windows Print Spooler** documentation says the spooler manages print jobs, drivers and scheduling. Its Win32 APIs can manage printer and print jobs. This is the native Windows integration boundary for a custom agent.

- https://learn.microsoft.com/en-us/windows/win32/printdocs/print-spooler
- https://learn.microsoft.com/en-us/windows/win32/printdocs/printing-and-spooler-functions

**CUPS** documentation lists IPP operations such as Print-Job, Get-Job-Attributes and Cancel-Job, supporting a future Linux adapter.

- https://www.cups.org/documentation
- https://www.cups.org/doc/spec-ipp.html

### 2.2 SSLCOMMERZ

The official developer page describes a three-step flow: create transaction session, receive IPN, then validate the order/payment through the Order Validation API. It also recommends IPN because customer redirect sessions can be lost.

- https://developer.sslcommerz.com/
- https://developer.sslcommerz.com/doc/v4/
- https://sslcommerz.com/integration-document/

### 2.3 Razorpay

Razorpay's integration documentation describes server-side Orders API, passing the order ID to checkout, signature verification, capture and webhooks. Webhook guidance emphasizes raw-body signature verification, event idempotency, out-of-order handling and provider API fetch for reconciliation where needed.

- https://hdfcbank-collectnow-docs.razorpay.com/payments/payment-gateway/flutter-integration/standard/integration-steps/
- https://hdfcbank-collectnow-docs.razorpay.com/webhooks/
- https://hdfcbank-collectnow-docs.razorpay.com/webhooks/validate-test/

Razorpay Route describes linked accounts, transfers and settlement controls for marketplace/vendor use cases. This does not mean every platform/merchant automatically qualifies; merchant onboarding and provider approval are still required.

- https://razorpay.com/route/

### 2.4 bKash

The official bKash developer entry point is the source of truth for the merchant's currently enabled Checkout version and API contract. The public portal URL below should be checked during actual integration/onboarding; versioned endpoints and required operations can vary by merchant product/version.

- https://developer.bka.sh/docs/checkout-url-process-overview
- https://pgw-integration.bkash.com/sign-up
- https://www.bkash.com/en/page/tokenized_checkout

Do not copy sandbox credentials from example repositories, PDFs or blog posts. Use credentials issued for the actual merchant account.

## 3. Architecture decisions (ADR-style)

### ADR-001 — One codebase for SaaS and standalone

**Decision:** Use one application with explicit edition mode and a tenant resolver.  
**Reason:** Shared domain logic, lower maintenance cost, feature parity and easier upgrade path.  
**Consequence:** Tenant isolation must be strong and tested; standalone mode must reliably disable SaaS-only routes/features.

### ADR-002 — Local Print Agent, not browser-only printing

**Decision:** Build a native local agent for the first-party product; preserve an optional QZ Tray adapter path.  
**Reason:** The remote server cannot directly access a local shop printer; browser print dialogs are not reliable for unattended production.  
**Consequence:** The product requires installation, pairing, updates and device support. First MVP is Windows-first.

### ADR-003 — Separate payment purposes

**Decision:** Keep print-order merchant payments and platform subscription payments in independent ledgers/configuration.  
**Reason:** They have different merchants, business purposes, settlement flows and state transitions.  
**Consequence:** Reports, webhook mapping and subscription activation must branch by payment purpose.

### ADR-004 — Bring-your-own gateway credentials for customer print payments

**Decision:** MVP tenant connects its own approved merchant account.  
**Reason:** Closest match to the advertised direct-to-shop flow and avoids silently turning the SaaS vendor into a payment aggregator.  
**Consequence:** Onboarding requires each shop to obtain provider credentials; marketplace/split settlement is a later approved integration.

### ADR-005 — Shared-schema multi-tenancy for MVP

**Decision:** Shared MySQL schema with mandatory `tenant_id`, composite indexes and policy enforcement.  
**Reason:** Simpler SaaS operations and lower cost for a small platform.  
**Consequence:** Cross-tenant test suite and tenant-aware queue/storage code are mandatory. Higher-isolation DB-per-tenant can be added for enterprise later.

### ADR-006 — Private temporary document storage

**Decision:** Store files in a private object store with expiry/deletion workflow and audit metadata.  
**Reason:** Documents may contain personal or business information; no permanent file archive is needed for core print service.  
**Consequence:** Cleanup service, retry monitoring and honest retention disclosure are required.

### ADR-007 — Honest print completion states

**Decision:** Distinguish OS spooler submission from confirmed physical output.  
**Reason:** A printer/driver may accept a job and still fail physically or provide insufficient telemetry.  
**Consequence:** UI must explain “sent to printer” versus “ready for pickup” only when business process confirms it.

## 4. Open discovery questions for product owner/pilot

These can be resolved during a pilot without blocking the architecture:

1. Which launch geography is first: Bangladesh, India, or both? This determines default locale, currency and provider onboarding priority.
2. Which printer/OS combinations are in the first pilot (Windows 10/11, USB or network, brand/model)?
3. What is the charging basis: printed side, physical sheet, copy, job, or a combination?
4. Which file formats are required for launch: PDF/images only, or Office documents on day one?
5. Does the print shop require customer phone verification, or should the flow be completely anonymous?
6. Does the owner need to approve each job before print, or is verified-payment auto-print always enabled?
7. What should happen if the shop agent is offline after payment: queue for a limited time, refund, or owner review?
8. Are multiple outlets under one shop owner required at launch?
9. Which SaaS plans/usage limits should be sold, and is renewal manual initially?
10. Does the standalone product require offline licensing, source-code delivery or a managed annual license?

## 5. Source list

1. Reference product landing/registration: https://qr.habibaprint.site/ (redirects to `/register.php`).
2. Reference shop-owner login: https://qr.habibaprint.site/admin/login.php.
3. QZ Tray Getting Started: https://qz.io/docs/getting-started.
4. QZ Tray Signing: https://qz.io/docs/signing.
5. Microsoft Windows Print Spooler: https://learn.microsoft.com/en-us/windows/win32/printdocs/print-spooler.
6. CUPS IPP documentation: https://www.cups.org/doc/spec-ipp.html.
7. SSLCOMMERZ Developer Arena: https://developer.sslcommerz.com/.
8. SSLCOMMERZ v4 documentation: https://developer.sslcommerz.com/doc/v4/.
9. Razorpay payment integration steps: https://hdfcbank-collectnow-docs.razorpay.com/payments/payment-gateway/flutter-integration/standard/integration-steps/.
10. Razorpay webhook overview: https://hdfcbank-collectnow-docs.razorpay.com/webhooks/.
11. Razorpay webhook validation/idempotency: https://hdfcbank-collectnow-docs.razorpay.com/webhooks/validate-test/.
12. Razorpay Route: https://razorpay.com/route/.
13. bKash Developer Portal: https://developer.bka.sh/docs/checkout-url-process-overview.
14. bKash Merchant Integration Portal: https://pgw-integration.bkash.com/sign-up.

---

**Research limitation:** The reference site's authenticated features and actual printer/payment internals were not accessible. This pack describes the public claims and a production-grade implementation plan; it does not certify that the reference has the same backend architecture.
