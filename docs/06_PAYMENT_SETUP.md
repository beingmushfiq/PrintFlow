# 06 — Payment Setup and Financial Workflow

**Product:** PrintFlow  
**Version:** 1.0  
**Date:** 24 November 2026

## 1. Core payment architecture

PrintFlow has two separate money flows. They must remain separate in code, configuration, reporting and reconciliation.

### Flow A — Customer pays the print shop

- The shop/tenant is the merchant for printing services.
- Customer chooses a shop-specific payment method.
- Payment is recorded against a print order.
- A print job is dispatched only after the transaction is verified.
- Gateway credentials and settlement are controlled by the shop's approved merchant account (or an approved marketplace/submerchant arrangement).

### Flow B — Shop pays the SaaS platform

- The platform operator is the merchant for software subscription.
- Shop owner pays a SaaS invoice/subscription.
- Payment is recorded against a subscription invoice.
- Subscription status/entitlements change only after verified payment or authorized admin action.

Never use the SaaS subscription payment account as a default collector for all print-order payments unless the platform has the necessary provider product, merchant onboarding, settlement design and legal approvals.

## 2. Gateway adapter design

Create a common interface, for example:

```php
interface PaymentGatewayDriver
{
    public function createCheckout(PaymentIntentData $data): CheckoutSession;
    public function verifyReturn(PaymentReturnData $data): VerificationResult;
    public function verifyWebhook(RawWebhookRequest $request): WebhookVerificationResult;
    public function fetchTransaction(string $providerReference): ProviderPaymentStatus;
    public function refund(RefundRequestData $data): RefundResult;
    public function capabilities(): GatewayCapabilities;
}
```

Implement providers behind adapters:

- `SslCommerzDriver`
- `BkashCheckoutDriver`
- `RazorpayDriver`
- additional country-specific providers later

The domain layer depends on the interface, not on provider-specific fields. Provider credentials are resolved from a secure connection record at the server only.

## 3. Merchant account model

### Preferred MVP: bring-your-own merchant account (BYO)

Each shop obtains its own eligible merchant account and connects credentials to PrintFlow. This most closely matches the reference claim that payments go directly to the shop owner. It also avoids treating PrintFlow as a payment aggregator by default.

Before enabling live payment, confirm with the provider that the shop's business category, settlement account, website/domain, currency and use case are approved.

### Marketplace/aggregator model (advanced)

If PrintFlow wants to collect one payment and split/settle it to multiple shops, use a provider's approved marketplace/split-settlement product and complete all required onboarding/contractual checks. Do not implement an informal pooled-wallet payout model.

Razorpay Route advertises linked accounts, transfers and settlement controls for marketplace-style flows; eligibility and onboarding still need confirmation with Razorpay. For Bangladesh, confirm an applicable SI/aggregator or submerchant arrangement directly with bKash/SSLCOMMERZ and the acquiring provider rather than assuming it is available to every account.

## 4. Country/provider recommendations

### Bangladesh-first launch

Potential provider adapters:

1. **SSLCOMMERZ** — broad hosted checkout option; use the official session API, IPN listener and order validation API.
2. **bKash Payment Gateway** — use the merchant-onboarded Checkout API flow (token/grant, create, execute, query and refund/search APIs as enabled in the merchant account).
3. **Nagad** — integrate only after obtaining current merchant documentation, credentials and sandbox access directly from the provider/authorized aggregator.

Keep each provider behind an adapter and do not hardcode BDT-only assumptions into orders.

### India support

- **Razorpay** can support checkout flows and UPI/card/netbanking options subject to the merchant account and current provider capabilities.
- Use server-side Orders API and verify Checkout signature; use webhooks for asynchronous final status and reconciliation.
- If marketplace settlement is needed, evaluate Razorpay Route and complete linked-account onboarding.

Payment methods are country, merchant, product and KYC dependent. Display only provider-enabled methods returned/allowed for that merchant.

## 5. SSLCOMMERZ setup (Bangladesh)

Official reference documentation describes this high-level sequence:

1. Create a transaction session using Session API.
2. Redirect the customer to `GatewayPageURL` returned by the provider.
3. Configure an IPN listener on the merchant panel.
4. On IPN, call the Order Validation API and verify the transaction.
5. Process callback redirects for UX, but rely on verified server-side status for the ledger and print dispatch.

### Setup checklist

- Obtain merchant Store ID and Store Password directly from SSLCOMMERZ.
- Register the correct live/staging domain and callback URLs.
- Enable IPN listener in the merchant panel.
- Use TLS 1.2 or higher.
- Store sandbox/live credentials separately and encrypt them at rest.
- Send the correct internal order reference, amount and currency.
- Validate provider transaction ID, amount, currency, status, merchant and risk fields.
- Handle valid/failed/cancelled and risk-held payments; do not automatically print a transaction flagged for additional verification.
- Test customer closing browser, delayed IPN, duplicate IPN, failed payment, cancel and amount mismatch.

References:
- https://developer.sslcommerz.com/
- https://developer.sslcommerz.com/doc/v4/
- https://sslcommerz.com/integration-document/

## 6. bKash Checkout setup (Bangladesh)

Use only the current documentation and credentials supplied during merchant onboarding. The publicly indexed developer portal describes a checkout flow with token grant/refresh, create payment, execute payment, query/search transaction and refund operations, depending on the enabled product/version.

### Integration checklist

- Apply through the official bKash merchant integration/onboarding process.
- Obtain sandbox and production credentials through the merchant portal/provider.
- Store app key/secret and merchant username/password securely; never expose them to React.
- Implement token acquisition/refresh with a shared cache/lock so multiple workers do not race token refresh.
- Create payment server-side with exact amount/reference/callback.
- Execute/confirm payment using the provider's documented operation.
- Query provider when callback status is ambiguous or a request timed out.
- Validate amount, currency and invoice/order reference before marking captured.
- Implement refund only if approved for the merchant/product.
- Use provider-specified timeout values and retry semantics from the current merchant docs.

Official entry point: https://developer.bka.sh/docs/checkout-url-process-overview  
Merchant integration portal: https://pgw-integration.bkash.com/sign-up

Do not use sandbox credentials found in public code or web pages. Use only credentials issued to the actual merchant.

## 7. Razorpay setup (India)

Recommended checkout pattern:

1. Server creates an internal payment attempt.
2. Server creates a Razorpay Order for the exact amount/currency.
3. Pass the provider `order_id` to Checkout.
4. Receive payment ID/order ID/signature from Checkout.
5. Verify the signature server-side using the order ID stored by the server and the provider secret.
6. Capture/confirm as required by the merchant capture configuration.
7. Configure webhooks for payment/order events and verify raw-body HMAC signature.
8. Use webhook event ID for idempotency; handle out-of-order events and late authorization/capture.
9. Fetch/query payment when immediate UI status is needed but webhook has not arrived.

Important implementation rules:
- Do not create an accepted payment without an internal provider order mapping.
- Do not trust client-submitted amount/order mapping.
- Keep webhook secret separate from API key secret if provider configuration separates them.
- Preserve old webhook secret during provider retry windows if rotating secrets.
- Reconcile pending/unknown transactions.

References:
- https://hdfcbank-collectnow-docs.razorpay.com/payments/payment-gateway/flutter-integration/standard/integration-steps/
- https://hdfcbank-collectnow-docs.razorpay.com/webhooks/
- https://hdfcbank-collectnow-docs.razorpay.com/webhooks/validate-test/
- https://razorpay.com/route/

## 8. UPI and manual payment warning

A static UPI QR/deep link or screenshot is not sufficient proof for automatic printing. If the product displays a UPI QR, it still needs a verified payment callback/query from a provider/merchant integration that reliably maps the transaction to the correct order. Manual “I have paid” and customer-uploaded screenshots must not trigger automatic printing.

## 9. Payment state machine and ledger

Required states:

- `created`: internal payment intent created.
- `pending`: provider checkout started; status not final.
- `authorized`: provider authorized but capture/settlement rules may remain.
- `captured`: server has verified successful payment.
- `failed`, `cancelled`, `expired`.
- `unknown`: provider result ambiguous; reconciliation required.
- `partially_refunded`, `refunded`.

A browser success page can display “Verifying payment…” while the API checks the payment. It must never directly write `captured`.

### Amount verification

Before final capture state:
- internal expected amount equals provider amount;
- currency matches;
- merchant/gateway account matches the tenant/shop connection;
- provider payment references map to the expected internal payment attempt;
- provider status is final/eligible;
- no duplicate capture has already been processed.

Mismatch => `operator_review`/quarantine, no print dispatch.

## 10. Webhook implementation requirements

- Expose a dedicated public endpoint per provider/connection scope.
- Capture raw request bytes before parsing.
- Verify signature using provider-defined algorithm/secret.
- Validate timestamp/replay requirements if provider supplies them.
- Persist provider event ID with unique constraint.
- Return expected HTTP response quickly after safe receipt.
- Queue provider API validation/reconciliation when necessary.
- Use a DB transaction to update payment/order and write outbox event.
- Ignore or safely process duplicates.
- Handle out-of-order webhook events; do not assume event order.
- Maintain a dead-letter/retry process and dashboard for failures.

Never expose the webhook secret or raw sensitive payload in admin pages/logs.

## 11. Subscription billing

For SaaS:
- Subscription invoice generated for the plan and billing period.
- Owner pays through platform's configured merchant gateway.
- Verified capture marks invoice paid and subscription active/renewed.
- If payment fails, move to past-due/grace according to a transparent policy.
- At grace end, disable new uploads/orders or put the tenant into read-only mode; preserve records and allow export.
- Renewal can be manual in MVP. Do not promise recurring automatic charges until the provider supports and the merchant has enabled/approved the required mandate/recurring product.
- Plan changes create explicit proration/next-period policy and audit event.

The reference's four terms are useful research data, but do not copy their exact prices by default. Design plans according to storage/worker/agent/payment/monitoring costs.

## 12. Refund and dispute handling

- Refunds are separate ledger entries linked to original capture.
- Support full/partial refund only where provider supports it.
- Do not mark a refund successful until provider confirms it.
- If payment captured but printing failed, create a clear owner workflow: retry, refund or store credit according to policy.
- Keep print-attempt events and refund reason in the audit log.
- Never delete original transaction records after refund.

## 13. Credential and environment management

Per connection store:
- Provider name, merchant identifier, country, currency, environment.
- Encrypted API credentials and webhook secrets.
- Credential version and last rotation date.
- Connection status and last validation time.

Controls:
- Secrets write-only in UI; mask values after save.
- Only authorized owner/admin can update gateway credentials.
- Separate sandbox/live keys.
- Avoid printing credentials in logs, exceptions or diagnostics.
- Support key rotation with a short overlap window where provider semantics allow it.
- Restrict platform admin visibility to metadata; do not reveal tenant's raw secret.

## 14. Payment testing matrix

| Scenario | Expected result |
|---|---|
| Successful provider checkout + valid webhook | Payment captured, one print job created |
| Customer closes tab after paying | IPN/webhook updates status; print still dispatched |
| Success redirect but provider says pending | Remain pending; show verification state |
| Duplicate webhook | No duplicate capture/print job |
| Out-of-order payment events | Final verified state wins under transition rules |
| Wrong amount | Quarantine; no print |
| Wrong currency | Quarantine; no print |
| Wrong merchant connection | Quarantine; no print |
| Invalid webhook signature | Reject/record security event; no payment update |
| Provider timeout | Mark unknown/pending and query; do not assume failure or success |
| Refund accepted but not completed | Keep refund pending until provider confirms |
| SaaS subscription payment | Updates subscription only, never creates customer print job |
| Tenant order payment | Updates that tenant's order only, never renews SaaS subscription |

## 15. Live launch checklist

- Merchant application and KYC completed.
- Provider approves domain/product/business category.
- Production credentials obtained through provider.
- Callback/webhook/IPN registered and HTTPS/TLS valid.
- Exact currency and minimum/maximum limits confirmed.
- Successful, failed, cancelled, timeout and delayed-webhook test passed.
- Settlement account verified with merchant.
- Refund process and customer support policy documented.
- Payment page discloses merchant name, terms, privacy and refund/cancellation terms.
- Reconciliation report matches provider dashboard.
- No secret appears in client bundle, logs or public config.
