# 07 — Contextual Development Prompt for the Coding Agent

Copy this prompt into the coding agent after attaching the complete `PrintFlow_Project_Context` folder. The prompt is intentionally repo-aware: the agent must inspect the existing codebase before deciding what to change.

---

## MASTER IMPLEMENTATION PROMPT

You are the lead software architect and senior full-stack engineer responsible for building **PrintFlow**, a production-grade QR-based print-shop automation platform. Read every project context document before writing code:

- `01_PRD.md`
- `02_TRP.md`
- `03_UI_UX_DESIGN.md`
- `04_BACKEND_SCHEMA.md`
- `05_AUTOMATION_INTEGRATION.md`
- `06_PAYMENT_SETUP.md`
- `08_RESEARCH_AND_DECISIONS.md`

The project is a functional rebuild of the business workflow observed on QR Se Print: a customer scans a shop-specific QR code, uploads documents from a phone, configures print settings, pays online, and the shop's local computer automatically receives the paid print job. Build original branding and original UI. Do not copy the reference site's source, logo, unique artwork, text or distinctive trade dress.

### 1. Product outcome

Deliver one maintainable codebase that can be sold in two editions:

1. **SaaS:** multi-tenant platform with central super-admin, subscriptions/plans, isolated tenant data, individual shop pages/QR codes, tenant-specific gateway connections, multiple outlets/staff/agents/printers, entitlements and usage metering.
2. **Standalone:** the same modules deployed for one business on its own infrastructure; single-tenant context; no SaaS platform UI or tenant switching.

Do not build separate forks. Edition behavior must be controlled through explicit configuration and domain services.

### 2. Technology baseline

Use the existing repository's established stack where possible. The target baseline is:

- Backend: Laravel API.
- Frontend: React + Vite + TypeScript.
- Production DB: MySQL.
- Local/test convenience: SQLite where compatible, plus MySQL integration tests.
- Redis for queue/cache/locks.
- Laravel queue workers and scheduler; Horizon or equivalent where appropriate.
- Private object storage for documents.
- Reverb/WebSocket or a compatible realtime transport for status updates.
- Print Agent: Tauri + Rust native Windows-first application; use a clear adapter boundary for Windows Print Spooler and later Linux/CUPS.
- Docker Compose/VPS deployment for full production services.

Do not perform an unrequested framework rewrite or invent framework versions. Inspect package manifests and current supported dependencies first.

### 3. Critical engineering constraints

- A hosted web server cannot directly print to a shop's local/USB printer. Build and integrate the local Print Agent. Do not fake auto-print with `window.print()` or a success toast.
- Payment must be verified server-side with provider signature/API validation. Never trust frontend payment status or a return URL.
- A verified paid order creates one idempotent print dispatch. Duplicate webhooks must not create duplicate print jobs.
- Do not auto-retry a print whose outcome is uncertain. Support `unknown` and operator reconciliation to prevent duplicate physical copies.
- Distinguish spooler submission from physical printer confirmation.
- Keep customer print-order payments separate from SaaS subscription payments.
- Tenant isolation must be enforced in backend queries, policies, queue jobs, object storage access and agent authorization.
- Files are sensitive temporary objects: private storage, scan/validate, bounded processing, delete after safe handoff/retention and write deletion events. Never claim OS/printer memory is erased unless verified.
- All financial amounts use integer minor units plus currency. Never use floating point.
- No production mock data, hardcoded fake metrics, placeholder payment success, fake printer status or non-functional buttons.

### 4. Start with repository discovery — do not code blindly

Before modifications:

1. Inspect the repository tree, README, package files, composer files, routes, migrations, models, services, frontend app structure, auth, roles, test suite, deployment files and existing integrations.
2. Identify existing working features and preserve them.
3. Identify reusable UI components, design tokens, API clients, error handling, logging and current coding conventions.
4. Check current PHP/Laravel/Node versions and dependency compatibility.
5. Report: current architecture, completed modules, gaps against the context docs, high-risk unknowns and a phased plan.
6. Do not ask the user to repeat information already in these documents or repository.
7. If a crucial provider credential or a physical printer is not available, implement a real sandbox/test adapter or simulator behind the correct interface; clearly label it as test-only. Never pretend a live integration was tested.

### 5. Required module implementation order

Implement in small, tested vertical slices. Keep the app runnable after every phase.

**Phase 0 — Foundation and repository alignment**
- Establish code conventions, API response/error standards, environment config, tenant/edition context, logging/correlation IDs and CI checks.
- Add architecture notes only when the real repository differs from this pack.

**Phase 1 — Identity, tenant and shop foundation**
- Owner auth, tenant provisioning, tenant membership/RBAC, shop CRUD, shop slug, standalone resolver, SaaS resolver, platform admin route protection.
- Add tenant isolation tests before building customer data flows.

**Phase 2 — Customer QR storefront and document intake**
- Public shop page, QR URL, upload authorization, private storage, file validation, scanning integration boundary, PDF/JPG/PNG processing, page count and previews.
- Add rate limits, size limits and deletion deadlines.

**Phase 3 — Quote and pricing engine**
- Versioned pricing profiles/rules, per-side/per-sheet calculation policy, minimum fee, fees/tax, immutable quotes, expiration and server-side validation.
- Add unit tests for price combinations and integer-money handling.

**Phase 4 — Payment abstraction**
- Payment driver interface, internal payment attempts, sandbox implementation, SSLCOMMERZ/Bangladesh adapter and/or Razorpay/India adapter according to real credentials, webhook verification, IPN/query, idempotency, reconciliation and refunds where supported.
- Add provider contract tests and signed webhook fixtures.
- Never make a payment successful through frontend state.

**Phase 5 — Local Print Agent and print queue**
- Enrollment code, device identity, revocation, heartbeat, printer discovery, capabilities, secure job lease, short-lived file download, SHA-256 verification, PDF print, spooler acknowledgement, local journal, cleanup and safe retry/reconciliation.
- Build a test agent simulator for CI and a physical hardware acceptance checklist.
- Keep print transport behind an interface so QZ Tray can optionally be added without coupling the domain.

**Phase 6 — Owner console**
- Operational dashboard, active queue, order list/detail/timeline, printers/agents, QR downloads, pricing, gateway connection status, transaction history, settings and error/recovery actions.
- All buttons/actions must call real API functionality or be clearly disabled with a reason.

**Phase 7 — SaaS control plane and billing**
- Platform tenant directory, plans/entitlements, subscriptions, invoices, subscription payment ledger, grace/expiry and platform monitoring.
- Confirm that print-order payments never update SaaS subscription state and subscription payments never create print jobs.

**Phase 8 — Reporting, localization, hardening and release**
- Operational/business reports, exports, English/Bangla translations, accessibility, audit logs, security review, backups, observability, deployment docs and smoke tests.

### 6. Architecture requirements

- Thin controllers; domain/application services for business rules.
- Use events/outbox for payment-captured → print-job creation so DB commit and queue dispatch cannot lose a paid job.
- Use transactions and database uniqueness constraints for idempotency.
- Use tenant context middleware plus policies; Eloquent global scope alone is insufficient.
- Use provider adapters and print transport adapters; no provider-specific conditionals spread throughout controllers/components.
- Store quote/print-setting snapshots to preserve historic behavior.
- Add explicit state transition guards; reject invalid transitions.
- Queue document conversions, cleanup, reconciliation and printing; do not run heavy work inside user requests.
- Keep private objects inaccessible without authorized short-lived URLs.
- Provide an audit record for sensitive owner/platform actions.

### 7. UX and quality requirements

Use the UI/UX document as the design authority. Build a polished, responsive, coherent product—not a generic admin template. Prioritize mobile customer upload/checkout and desktop shop queue. Include loading, empty, error, offline, pending, success and permission-denied states. Implement accessible labels/focus, localized strings, responsive tables/cards, clear status labels, useful validation and proper toast behavior. Do not use mock charts or hardcoded values in production screens.

The product should feel like a trustworthy print-operations platform. Use an original type scale, spacing system, icon set and design tokens. Do not copy visual assets from the reference site.

### 8. Payments and money safety

- `purpose=print_order` and `purpose=saas_subscription` are separate.
- A payment attempt is created on the server from an accepted quote or subscription invoice.
- Match expected amount, currency, merchant account and order/invoice before capture.
- Verify raw webhook signatures and provider status.
- Treat duplicate/out-of-order webhooks as normal.
- Record unknown status and reconcile using provider query API.
- Do not use static UPI QR/screenshot as automatic payment proof.
- Do not collect all tenant shop payments into platform funds unless an approved marketplace/linked-account solution is configured.
- Secrets are encrypted and write-only in UI.

### 9. Print automation and privacy

- Agent connects outbound with TLS/WSS; no public inbound printer port.
- Pairing code is random, single-use and short-lived.
- Agent is scoped to one tenant/shop and selected printers.
- Job payload includes unique job/attempt ID, immutable settings, signed short-lived URL and SHA-256.
- Agent persists a local job journal before spooler submission.
- If the agent loses connectivity after submission, reconcile; do not blindly print again.
- Use `submitted_to_spooler`, `printer_confirmed`, `failed` and `unknown` separately.
- Delete remote document, preview and local temp copy after safe handoff under a documented retention policy.
- Preserve only necessary order/payment/job metadata.

### 10. Tests required for each feature

At minimum:
- Unit tests for domain services and price calculations.
- Feature tests for API/auth/validation/state transitions.
- MySQL integration tests for constraints/locking/idempotency.
- Cross-tenant authorization tests.
- Payment webhook signature and duplicate-delivery tests.
- File validation, malicious input, expiry and deletion tests.
- Agent pairing/revocation/lease/timeout/reconcile tests.
- Print adapter simulator tests.
- Frontend component/flow tests for customer upload, checkout pending, order tracking and owner queue.
- Build/lint/typecheck and automated smoke tests.

Never delete, weaken or skip tests to make a build pass. Fix the underlying issue.

### 11. Development behavior and reporting

- Work incrementally and keep a concise implementation log.
- Before modifying a module, trace its callers, database tables and existing behavior.
- Do not rewrite unrelated files.
- Do not leave TODO placeholders for P0 requirements.
- When something cannot be implemented without external credentials/hardware, build the integration boundary, sandbox/test path, exact setup steps and a clearly reported verification status.
- After each phase, report changed files, migrations, endpoints, tests run, results, unresolved risks and the next concrete phase.
- Do not claim an integration works unless it has been exercised in an appropriate sandbox or real test environment.

### 12. Definition of done

The product is not done when the screens look finished. It is done when the complete tested flow works:

1. Owner creates shop and pricing.
2. Owner configures a real/sandbox merchant connection.
3. Owner pairs a Print Agent and selects a real printer.
4. Customer scans QR, uploads a supported document, selects options and sees the server-calculated price.
5. Provider verifies the correct payment.
6. Exactly one paid print job is created.
7. The assigned agent validates and submits the correct output/options to the selected printer.
8. The dashboard and customer tracking show truthful status.
9. Retry/recovery does not create duplicate output.
10. Remote/local temporary document data is deleted and deletion is auditable.
11. Two SaaS tenants cannot access each other's records/files/jobs/credentials.
12. The same codebase also starts in standalone single-tenant mode.

Begin by auditing the repository and returning the repo-aware gap analysis and phased implementation plan. Then implement Phase 1 without disturbing existing working features.

---
