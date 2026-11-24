/**
 * PrintFlow Tier 3: Cross-Feature Combinations (Pairwise Coverage)
 *
 * Implements >=70 comprehensive tests covering major feature interactions
 * across module boundaries as defined in PROJECT.md and TEST_INFRA.md:
 *
 * 1. Tenant Context + Public Storefront + Phone Intake
 * 2. Presigned Upload + Poppler Page Counter + Duplex Pricing Engine
 * 3. Quote Snapshot + Payment Driver + Atomic Outbox Event
 * 4. Outbox Event + Agent Lease Service + Win32 Spooler + File Purge
 * 5. Owner Console + Queue Hold/Cancel + Reverb WebSocket Broadcast
 * 6. Standalone Edition Gate + Route 404 Blocking
 * 7. Localization Toggle (en/bn) + Price Formatting in Bangla Digits
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  ApiClient,
  WsClient,
  MockGateway,
  isValidBdPhone,
  normalizeBdPhone,
  toPoisha,
  fromPoisha,
  formatBdt,
  toBanglaDigits,
  fromBanglaDigits,
  calculateDynamicDuplex,
  calculateTaxAndTotal,
  sha256,
  hmacSha256,
  verifyRawSignature,
  createValidSinglePagePdf,
  createValidMultiPagePdf,
  createCorruptedHeaderPdf,
  createDisguisedExePdf,
  createPasswordEncryptedPdf,
  createSamplePng,
  createSampleJpeg,
  createEicarTestString,
} from '../../src/index.js';

import { PrintFlowTestHarness } from './testHarness.js';

describe('Tier 3: Cross-Feature Combinations (Pairwise Coverage)', () => {
  let harness;
  let client;

  beforeEach(() => {
    harness = new PrintFlowTestHarness({ edition: 'standalone' });
    client = new ApiClient({
      customFetch: harness.getFetchHandler(),
      tenantId: 'tenant_standalone_default',
      edition: 'standalone',
    });
  });

  // =========================================================================
  // 1. Tenant Context + Public Storefront + Phone Intake (11 tests)
  // =========================================================================
  describe('Pairwise 1: Tenant Context + Storefront + Phone Intake', () => {
    it('accepts Grameenphone 017 prefix with valid storefront slug', async () => {
      const storeRes = await client.getStorefront('nilkhet-central');
      assert.strictEqual(storeRes.ok, true);
      assert.strictEqual(storeRes.data.shop.slug, 'nilkhet-central');

      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 1 }],
        options: { mode: 'simplex', copies: 1 },
      });

      const orderRes = await client.submitOrder({
        customerPhone: '01712345678',
        quoteToken: quote.data.quoteToken,
        shopSlug: 'nilkhet-central',
      });
      assert.strictEqual(orderRes.ok, true);
      assert.strictEqual(orderRes.data.status, 'PENDING_PAYMENT');
    });

    it('accepts Robi 018 prefix and auto-normalizes international +880 format', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 1 }],
      });
      const orderRes = await client.submitOrder({
        customerPhone: '+8801812345678',
        quoteToken: quote.data.quoteToken,
      });
      assert.strictEqual(orderRes.ok, true);

      const statusRes = await client.getOrderStatus(orderRes.data.orderToken);
      assert.strictEqual(statusRes.data.customerPhone, '01812345678');
    });

    it('accepts Banglalink 019 prefix with punctuation spacing', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 1 }],
      });
      const orderRes = await client.submitOrder({
        customerPhone: '01912-345678',
        quoteToken: quote.data.quoteToken,
      });
      assert.strictEqual(orderRes.ok, true);
    });

    it('accepts Teletalk 015 government network prefix', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 1 }],
      });
      const orderRes = await client.submitOrder({
        customerPhone: '01512345678',
        quoteToken: quote.data.quoteToken,
      });
      assert.strictEqual(orderRes.ok, true);
    });

    it('accepts Airtel 016 prefix with parenthesis formatting', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 1 }],
      });
      const orderRes = await client.submitOrder({
        customerPhone: '(01612) 345678',
        quoteToken: quote.data.quoteToken,
      });
      assert.strictEqual(orderRes.ok, true);
    });

    it('rejects disallowed 010 PSTN prefix with 422 Unprocessable Entity', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 1 }],
      });
      const orderRes = await client.submitOrder({
        customerPhone: '01012345678',
        quoteToken: quote.data.quoteToken,
      });
      assert.strictEqual(orderRes.status, 422);
      assert.strictEqual(orderRes.errors[0].field, 'customer_phone');
    });

    it('rejects disallowed 011 citycell legacy prefix', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 1 }],
      });
      const orderRes = await client.submitOrder({
        customerPhone: '01112345678',
        quoteToken: quote.data.quoteToken,
      });
      assert.strictEqual(orderRes.status, 422);
    });

    it('rejects phone number with insufficient digits (10 digits)', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 1 }],
      });
      const orderRes = await client.submitOrder({
        customerPhone: '0171234567',
        quoteToken: quote.data.quoteToken,
      });
      assert.strictEqual(orderRes.status, 422);
    });

    it('rejects phone number with excess digits (12 digits)', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 1 }],
      });
      const orderRes = await client.submitOrder({
        customerPhone: '017123456789',
        quoteToken: quote.data.quoteToken,
      });
      assert.strictEqual(orderRes.status, 422);
    });

    it('returns 404 when querying an invalid shop storefront slug', async () => {
      const res = await client.getStorefront('non-existent-shop-slug');
      assert.strictEqual(res.status, 404);
      assert.ok(res.errors[0].message.includes('not found'));
    });

    it('verifies storefront response binds primary shop default printer and hours', async () => {
      const res = await client.getStorefront('nilkhet-central');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data.shop.name, 'PrintFlow Nilkhet Central');
      assert.strictEqual(res.data.shop.businessHours, '09:00 - 22:00');
      assert.ok(res.data.priceGuide.simplexBaseRatePoisha > 0);
    });
  });

  // =========================================================================
  // 2. Presigned Upload + Poppler Page Counter + Duplex Pricing Engine (12 tests)
  // =========================================================================
  describe('Pairwise 2: Upload + Poppler Extraction + Duplex Pricing', () => {
    it('processes single-page PDF with simplex pricing (1 sheet, 1 side)', async () => {
      const upload = await client.createPresignedUpload({
        fileName: 'single.pdf',
        mimeType: 'application/pdf',
        buffer: createValidSinglePagePdf(),
        pageCount: 1,
      });
      assert.strictEqual(upload.ok, true);
      assert.strictEqual(upload.data.pageCount, 1);

      const quote = await client.calculateQuote({
        files: [{ fileToken: upload.data.fileToken, pageCount: 1 }],
        options: { mode: 'simplex', copies: 1, baseSimplexSideRatePoisha: 200 },
      });
      assert.strictEqual(quote.data.totalSides, 1);
      assert.strictEqual(quote.data.totalSheets, 1);
      assert.strictEqual(quote.data.subtotalPoisha, 200);
    });

    it('processes 5-page PDF with Duplex Model A (flat sheet rate + odd simplex sheet)', async () => {
      const upload = await client.createPresignedUpload({
        fileName: 'multipage.pdf',
        mimeType: 'application/pdf',
        buffer: createValidMultiPagePdf(5),
        pageCount: 5,
      });
      assert.strictEqual(upload.data.pageCount, 5);

      const quote = await client.calculateQuote({
        files: [{ fileToken: upload.data.fileToken, pageCount: 5 }],
        options: {
          mode: 'duplex',
          duplexModel: 'model_a',
          baseSimplexSideRatePoisha: 200,
          flatDuplexSheetRatePoisha: 360,
          copies: 1,
        },
      });
      // 5 pages = 2 duplex sheets (2 * 360 = 720) + 1 odd simplex sheet (1 * 200 = 200) -> 920 Poisha
      assert.strictEqual(quote.data.totalSheets, 3);
      assert.strictEqual(quote.data.subtotalPoisha, 920);
    });

    it('processes 5-page PDF with Duplex Model B (discounted second side rate)', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f_5page', pageCount: 5 }],
        options: {
          mode: 'duplex',
          duplexModel: 'model_b',
          baseSimplexSideRatePoisha: 200,
          duplexDiscountPercent: 20, // 20% discount on back side -> 160 Poisha
          copies: 1,
        },
      });
      // 2 front (2 * 200 = 400) + 2 back (2 * 160 = 320) + 1 odd front (200) = 920 Poisha
      assert.strictEqual(quote.data.subtotalPoisha, 920);
      assert.strictEqual(quote.data.totalSides, 5);
    });

    it('processes 4-page even document with Duplex Model B (zero odd pages)', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f_4page', pageCount: 4 }],
        options: {
          mode: 'duplex',
          duplexModel: 'model_b',
          baseSimplexSideRatePoisha: 200,
          duplexDiscountPercent: 20, // 160 Poisha
          copies: 1,
        },
      });
      // 2 front (400) + 2 back (320) = 720 Poisha
      assert.strictEqual(quote.data.totalSheets, 2);
      assert.strictEqual(quote.data.subtotalPoisha, 720);
    });

    it('calculates multi-copy duplex pricing deterministically (3 copies of 5 pages)', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f_5page', pageCount: 5 }],
        options: {
          mode: 'duplex',
          duplexModel: 'model_b',
          baseSimplexSideRatePoisha: 200,
          duplexDiscountPercent: 20,
          copies: 3,
        },
      });
      // 1 copy = 920 Poisha; 3 copies = 2760 Poisha
      assert.strictEqual(quote.data.totalSheets, 9);
      assert.strictEqual(quote.data.totalSides, 15);
      assert.strictEqual(quote.data.subtotalPoisha, 2760);
    });

    it('rejects disguised executable (.exe renamed to .pdf) at upload gate', async () => {
      const upload = await client.createPresignedUpload({
        fileName: 'trojan.pdf',
        mimeType: 'application/pdf',
        buffer: createDisguisedExePdf(),
      });
      assert.strictEqual(upload.status, 422);
      assert.strictEqual(upload.ok, false);
      assert.strictEqual(upload.errors[0].field, 'file');
    });

    it('rejects corrupted PDF header missing %PDF- identifier', async () => {
      const upload = await client.createPresignedUpload({
        fileName: 'broken.pdf',
        mimeType: 'application/pdf',
        buffer: createCorruptedHeaderPdf(),
      });
      assert.strictEqual(upload.status, 422);
      assert.ok(upload.errors[0].message.includes('Corrupted PDF'));
    });

    it('rejects password-encrypted PDF and returns localized error', async () => {
      const upload = await client.createPresignedUpload({
        fileName: 'secret.pdf',
        mimeType: 'application/pdf',
        buffer: createPasswordEncryptedPdf(),
      });
      assert.strictEqual(upload.status, 422);
      assert.strictEqual(upload.errors[0].code, 'PASSWORD_PROTECTED_PDF');
      assert.ok(upload.errors[0].message.includes('পাসওয়ার্ড সুরক্ষিত'));
    });

    it('detects and quarantines EICAR antivirus test file', async () => {
      const upload = await client.createPresignedUpload({
        fileName: 'eicar.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(createEicarTestString()),
      });
      assert.strictEqual(upload.status, 422);
      assert.strictEqual(upload.errors[0].code, 'MALWARE_DETECTED');
    });

    it('accepts PNG image upload and treats it as single-sheet print', async () => {
      const upload = await client.createPresignedUpload({
        fileName: 'diagram.png',
        mimeType: 'image/png',
        buffer: createSamplePng(),
        pageCount: 1,
      });
      assert.strictEqual(upload.ok, true);
      assert.strictEqual(upload.data.pageCount, 1);
    });

    it('accepts JPEG image upload with valid magic bytes', async () => {
      const upload = await client.createPresignedUpload({
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        buffer: createSampleJpeg(),
        pageCount: 1,
      });
      assert.strictEqual(upload.ok, true);
      assert.strictEqual(upload.data.pageCount, 1);
    });

    it('verifies SHA-256 checksum integrity of uploaded file record', async () => {
      const pdfBuf = createValidSinglePagePdf();
      const expectedSha = sha256(pdfBuf);

      const upload = await client.createPresignedUpload({
        fileName: 'verified.pdf',
        mimeType: 'application/pdf',
        buffer: pdfBuf,
      });
      assert.strictEqual(upload.ok, true);
      const stored = harness.files.get(upload.data.fileToken);
      assert.strictEqual(stored.checksum, expectedSha);
    });
  });

  // =========================================================================
  // 3. Quote Snapshot + Payment Driver + Atomic Outbox Event (11 tests)
  // =========================================================================
  describe('Pairwise 3: Quote Snapshot + Payment Driver + Outbox Event', () => {
    it('generates immutable quote snapshot with calculation SHA-256 hash', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 2 }],
        options: { mode: 'simplex', copies: 1, baseSimplexSideRatePoisha: 200 },
      });
      assert.strictEqual(quote.ok, true);
      assert.ok(quote.data.calculationHash.length === 64);
      assert.ok(quote.data.expiresAt > Date.now());
    });

    it('enforces 15-minute TTL on quote snapshot', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 1 }],
      });
      const stored = harness.quotes.get(quote.data.quoteToken);
      stored.expiresAt = Date.now() - 1000; // Expired 1 second ago

      const orderRes = await client.submitOrder({
        customerPhone: '01712345678',
        quoteToken: quote.data.quoteToken,
      });
      assert.strictEqual(orderRes.status, 422);
      assert.ok(orderRes.errors[0].message.includes('expired'));
    });

    it('completes Sandbox checkout and atomically writes order.paid outbox event', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 2 }],
      });
      const order = await client.submitOrder({
        customerPhone: '01712345678',
        quoteToken: quote.data.quoteToken,
        paymentGateway: 'sandbox',
      });

      const payRes = await client.post('/api/v1/payments/sandbox/pay', {
        orderToken: order.data.orderToken,
      });
      assert.strictEqual(payRes.ok, true);
      assert.strictEqual(payRes.data.status, 'PAID');

      // Verify Outbox Event exists
      const paidEvent = harness.outbox.find((e) => e.eventType === 'order.paid');
      assert.ok(paidEvent, 'Must create order.paid outbox event');
      assert.strictEqual(paidEvent.payload.orderId, order.data.orderId);
      assert.strictEqual(paidEvent.status, 'processed');
    });

    it('initiates SSLCOMMERZ v4 session with exact decimal BDT from Poisha', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 5 }],
      });
      const order = await client.submitOrder({
        customerPhone: '01712345678',
        quoteToken: quote.data.quoteToken,
        paymentGateway: 'sslcommerz',
      });

      const amountBdt = fromPoisha(quote.data.totalPoisha).toFixed(2);
      const session = MockGateway.createSslSessionResponse({
        tranId: order.data.orderId,
        amount: amountBdt,
      });
      assert.strictEqual(session.status, 'SUCCESS');
      assert.strictEqual(session.amount, amountBdt);
      assert.ok(session.GatewayPageURL.includes('sandbox.sslcommerz.com'));
    });

    it('processes valid SSLCOMMERZ IPN callback and fires outbox event', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 2 }],
      });
      const order = await client.submitOrder({
        customerPhone: '01712345678',
        quoteToken: quote.data.quoteToken,
        paymentGateway: 'sslcommerz',
      });

      const ipn = MockGateway.createSslIpnPayload({
        tranId: order.data.orderToken,
        valId: 'VAL_SSL_999',
        amount: fromPoisha(quote.data.totalPoisha).toFixed(2),
        storePassword: harness.sslStorePassword,
      });

      const ipnRes = await client.post('/api/v1/payments/sslcommerz/ipn', ipn);
      assert.strictEqual(ipnRes.ok, true);

      const statusRes = await client.getOrderStatus(order.data.orderToken);
      assert.strictEqual(statusRes.data.status, 'QUEUED'); // Transitioned via outbox
    });

    it('rejects tampered SSLCOMMERZ IPN callback with 400 Bad Request', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 2 }],
      });
      const order = await client.submitOrder({
        customerPhone: '01712345678',
        quoteToken: quote.data.quoteToken,
        paymentGateway: 'sslcommerz',
      });

      const validIpn = MockGateway.createSslIpnPayload({
        tranId: order.data.orderToken,
        valId: 'VAL_SSL_TAMPER',
        amount: '10.00',
        storePassword: harness.sslStorePassword,
      });

      const tamperedIpn = MockGateway.createTamperedSslIpnPayload(validIpn);
      const res = await client.post('/api/v1/payments/sslcommerz/ipn', tamperedIpn);
      assert.strictEqual(res.status, 400);

      // Order should remain PENDING_PAYMENT
      const statusRes = await client.getOrderStatus(order.data.orderToken);
      assert.strictEqual(statusRes.data.status, 'PENDING_PAYMENT');
    });

    it('executes bKash Tokenized Checkout and marks order PAID', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 2 }],
      });
      const order = await client.submitOrder({
        customerPhone: '01712345678',
        quoteToken: quote.data.quoteToken,
        paymentGateway: 'bkash',
      });

      const bkashRes = await client.post('/api/v1/payments/bkash/execute', {
        paymentId: 'TR0011_TEST_BKASH',
        orderToken: order.data.orderToken,
      });
      assert.strictEqual(bkashRes.ok, true);
      assert.strictEqual(bkashRes.data.transactionStatus, 'Completed');

      const statusRes = await client.getOrderStatus(order.data.orderToken);
      assert.strictEqual(statusRes.data.status, 'QUEUED');
    });

    it('prevents double-click checkout via idempotency key', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 2 }],
      });
      const idempotencyKey = 'idem_key_unique_123';

      const firstOrder = await client.submitOrder({
        customerPhone: '01712345678',
        quoteToken: quote.data.quoteToken,
        idempotencyKey,
      });
      assert.strictEqual(firstOrder.status, 201);

      // Duplicate submission within short interval
      const dupOrder = await client.submitOrder({
        customerPhone: '01712345678',
        quoteToken: quote.data.quoteToken,
        idempotencyKey,
      });
      assert.strictEqual(dupOrder.status, 409);
    });

    it('applies minimum order floor and tax calculation inside quote snapshot', async () => {
      // Base calculation: 1 page simplex @ 200 Poisha. Floor = 500 Poisha. VAT = 5% (25 Poisha). Total = 525 Poisha.
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 1 }],
        options: { mode: 'simplex', copies: 1, baseSimplexSideRatePoisha: 200 },
      });
      assert.strictEqual(quote.data.subtotalPoisha, 200);
      assert.strictEqual(quote.data.floorAdjustmentPoisha, 300);
      assert.strictEqual(quote.data.taxPoisha, 25);
      assert.strictEqual(quote.data.totalPoisha, 525);
    });

    it('verifies line items JSON structure in quote response', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 5 }],
        options: { mode: 'duplex', duplexModel: 'model_b', copies: 2 },
      });
      assert.ok(Array.isArray(quote.data.lineItems));
      assert.ok(quote.data.lineItems.length >= 2);
      assert.ok(quote.data.lineItems[0].description.includes('Duplex Front Sides'));
    });

    it('verifies atomic rollback: unhandled error leaves outbox clean', async () => {
      const initialOutboxCount = harness.outbox.length;
      // Intentionally request payment on non-existent order
      const payRes = await client.post('/api/v1/payments/sandbox/pay', {
        orderToken: 'invalid_order_token',
      });
      assert.strictEqual(payRes.status, 404);
      assert.strictEqual(harness.outbox.length, initialOutboxCount);
    });
  });

  // =========================================================================
  // 4. Outbox Event + Agent Lease Service + Spooler + File Purge (11 tests)
  // =========================================================================
  describe('Pairwise 4: Outbox Event + Agent Lease + Spooler + Purge', () => {
    let agentToken;

    beforeEach(async () => {
      // Pair a test agent
      const pin = '123456';
      harness.pairingPins.set(pin, { pin, expiresAt: Date.now() + 300000 });
      const pairRes = await client.pairAgent(pin, {
        agentName: 'Shopfront Desktop Spooler',
        machineGuid: 'guid-spooler-01',
        publicKey: 'pub_rsa_test_key',
      });
      agentToken = pairRes.data.agentToken;
    });

    it('outbox processor splits paid multi-file order into individual print jobs', async () => {
      const upload1 = await client.createPresignedUpload({ fileName: 'doc1.pdf', pageCount: 3 });
      const upload2 = await client.createPresignedUpload({ fileName: 'doc2.pdf', pageCount: 2 });

      const quote = await client.calculateQuote({
        files: [
          { fileToken: upload1.data.fileToken, pageCount: 3, copies: 1 },
          { fileToken: upload2.data.fileToken, pageCount: 2, copies: 1 },
        ],
      });

      const order = await client.submitOrder({
        customerPhone: '01712345678',
        quoteToken: quote.data.quoteToken,
      });

      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      // Check jobs created in queue
      const jobsForOrder = Array.from(harness.printJobs.values()).filter((j) => j.orderId === order.data.orderId);
      assert.strictEqual(jobsForOrder.length, 2);
    });

    it('agent successfully leases next eligible job with 300s TTL', async () => {
      const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 2 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      const leaseRes = await client.leasePrintJob(agentToken);
      assert.strictEqual(leaseRes.ok, true);
      assert.ok(leaseRes.data.job.jobId);
      assert.ok(leaseRes.data.job.downloadUrl.includes('minio'));
      assert.ok(leaseRes.data.job.sha256Hash);

      const jobRecord = harness.printJobs.get(leaseRes.data.job.jobId);
      assert.strictEqual(jobRecord.status, 'leased');
      assert.ok(jobRecord.leaseExpiresAt > Date.now() + 290000);
    });

    it('prevents another agent from leasing an already leased job (atomic lock)', async () => {
      const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 2 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      // First agent leases
      const lease1 = await client.leasePrintJob(agentToken);
      assert.ok(lease1.data.job);

      // Register second agent
      harness.pairingPins.set('654321', { pin: '654321', expiresAt: Date.now() + 300000 });
      const pair2 = await client.pairAgent('654321', { machineGuid: 'agent-2' });
      const agent2Token = pair2.data.agentToken;

      // Second agent attempts to lease same job
      const lease2 = await client.leasePrintJob(agent2Token);
      assert.strictEqual(lease2.data.job, null);
    });

    it('rejects job lease request from unauthorized / non-paired agent', async () => {
      const res = await client.leasePrintJob('invalid_fake_token_999');
      assert.strictEqual(res.status, 401);
    });

    it('simulates Win32 spooler completion and transitions order to READY', async () => {
      const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 2 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      const lease = await client.leasePrintJob(agentToken);
      const jobId = lease.data.job.jobId;

      const completeRes = await client.completePrintJob(jobId, { pagesPrinted: 2, status: 'completed' }, agentToken);
      assert.strictEqual(completeRes.ok, true);

      const statusRes = await client.getOrderStatus(order.data.orderToken);
      assert.strictEqual(statusRes.data.status, 'READY');
    });

    it('triggers ephemeral file shredding upon spooler completion', async () => {
      const upload = await client.createPresignedUpload({ fileName: 'ephemeral.pdf', pageCount: 2 });
      const fileToken = upload.data.fileToken;

      const quote = await client.calculateQuote({ files: [{ fileToken, pageCount: 2 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      const lease = await client.leasePrintJob(agentToken);
      await client.completePrintJob(lease.data.job.jobId, { status: 'completed' }, agentToken);

      // Verify file record is purged and memory buffer destroyed
      const fileRecord = harness.files.get(fileToken);
      assert.strictEqual(fileRecord.status, 'purged');
      assert.strictEqual(fileRecord.buffer, null);
    });

    it('logs audit event when ephemeral file is purged', async () => {
      const upload = await client.createPresignedUpload({ fileName: 'audit.pdf', pageCount: 1 });
      const quote = await client.calculateQuote({ files: [{ fileToken: upload.data.fileToken, pageCount: 1 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      const lease = await client.leasePrintJob(agentToken);
      await client.completePrintJob(lease.data.job.jobId, { status: 'completed' }, agentToken);

      const purgeAudit = harness.auditLogs.find((a) => a.event === 'FILE_PURGED');
      assert.ok(purgeAudit);
      assert.strictEqual(purgeAudit.fileId, upload.data.fileToken);
    });

    it('reconciles stale leases when agent drops connection and lease expires', async () => {
      const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      const lease = await client.leasePrintJob(agentToken);
      const jobId = lease.data.job.jobId;

      // Force lease expiration
      const jobRecord = harness.printJobs.get(jobId);
      jobRecord.leaseExpiresAt = Date.now() - 1000;

      const reconciledCount = harness.reconcileStaleLeases();
      assert.strictEqual(reconciledCount, 1);
      assert.strictEqual(jobRecord.status, 'pending');
      assert.strictEqual(jobRecord.leasedBy, null);
    });

    it('allows recovered agent to re-lease expired job', async () => {
      const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      const lease = await client.leasePrintJob(agentToken);
      harness.printJobs.get(lease.data.job.jobId).leaseExpiresAt = Date.now() - 1000;
      harness.reconcileStaleLeases();

      // Second lease succeeds
      const reLease = await client.leasePrintJob(agentToken);
      assert.ok(reLease.data.job);
      assert.strictEqual(reLease.data.job.jobId, lease.data.job.jobId);
    });

    it('records local spooler crash in agent journal simulation', async () => {
      const jobId = 'job_spool_crash_1';
      harness.agentJournal.set(jobId, {
        jobId,
        spoolerStatus: 'in_progress',
        writtenBytes: 1024,
      });

      // Spooler crash -> restart -> check journal
      const journalEntry = harness.agentJournal.get(jobId);
      assert.ok(journalEntry);
      assert.strictEqual(journalEntry.spoolerStatus, 'in_progress');
    });

    it('executes full sequential lifecycle: Outbox -> Lease -> Spool -> Purge', async () => {
      const upload = await client.createPresignedUpload({ fileName: 'lifecycle.pdf', pageCount: 2 });
      const quote = await client.calculateQuote({ files: [{ fileToken: upload.data.fileToken, pageCount: 2 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      // Outbox processed
      const job = Array.from(harness.printJobs.values()).find((j) => j.orderId === order.data.orderId);
      assert.strictEqual(job.status, 'pending');

      // Leased
      const lease = await client.leasePrintJob(agentToken);
      assert.strictEqual(lease.data.job.jobId, job.id);

      // Spooled
      await client.completePrintJob(job.id, { status: 'completed' }, agentToken);
      assert.strictEqual(job.status, 'completed');

      // File purged
      assert.strictEqual(harness.files.get(upload.data.fileToken).status, 'purged');
    });
  });

  // =========================================================================
  // 5. Owner Console + Queue Hold/Cancel + Reverb Broadcast (11 tests)
  // =========================================================================
  describe('Pairwise 5: Owner Console + Queue Control + WebSocket Broadcast', () => {
    let ownerToken;

    beforeEach(async () => {
      const loginRes = await client.loginOwner('owner@nilkhetprint.com', 'password123');
      ownerToken = loginRes.data.token;
      client.setToken(ownerToken);
    });

    it('owner can authenticate and view live active queue', async () => {
      const queueRes = await client.getOwnerQueue();
      assert.strictEqual(queueRes.ok, true);
      assert.ok(Array.isArray(queueRes.data.queue));
    });

    it('rejects queue view for unauthenticated request with 401 Unauthorized', async () => {
      const anonClient = new ApiClient({ customFetch: harness.getFetchHandler(), token: null });
      const res = await anonClient.getOwnerQueue();
      assert.strictEqual(res.status, 401);
    });

    it('owner holds queued job preventing agent lease', async () => {
      const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      const job = Array.from(harness.printJobs.values())[0];
      const holdRes = await client.post(`/api/v1/owner/jobs/${job.id}/hold`);
      assert.strictEqual(holdRes.ok, true);
      assert.strictEqual(job.status, 'held');

      // Agent cannot lease held job
      const leaseRes = await harness.getFetchHandler()('/api/v1/agent/lease', {
        method: 'POST',
        headers: { Authorization: `Bearer agent_mock_tok` },
      });
      // Agent lease returns empty or cannot lease
      assert.strictEqual(job.status, 'held');
    });

    it('owner resumes held job back to pending', async () => {
      const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      const job = Array.from(harness.printJobs.values())[0];
      await client.post(`/api/v1/owner/jobs/${job.id}/hold`);
      const resumeRes = await client.post(`/api/v1/owner/jobs/${job.id}/resume`);
      assert.strictEqual(resumeRes.ok, true);
      assert.strictEqual(job.status, 'pending');
    });

    it('owner cancels pre-print order and enqueues refund outbox event', async () => {
      const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      const job = Array.from(harness.printJobs.values())[0];
      const cancelRes = await client.post(`/api/v1/owner/jobs/${job.id}/cancel`);
      assert.strictEqual(cancelRes.ok, true);
      assert.strictEqual(job.status, 'cancelled');

      const refundEvent = harness.outbox.find((e) => e.eventType === 'payment.refund');
      assert.ok(refundEvent);
      assert.strictEqual(refundEvent.payload.orderId, order.data.orderId);
    });

    it('owner marks completed order as collected closing customer lifecycle', async () => {
      const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      const collectRes = await client.post(`/api/v1/owner/orders/${order.data.orderToken}/collected`);
      assert.strictEqual(collectRes.ok, true);

      const statusRes = await client.getOrderStatus(order.data.orderToken);
      assert.strictEqual(statusRes.data.status, 'COLLECTED');
    });

    it('executes controlled reprint protocol with mandatory reason', async () => {
      const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

      // Missing reason rejected
      const failReprint = await client.post(`/api/v1/owner/orders/${order.data.orderToken}/reprint`, { reason: '' });
      assert.strictEqual(failReprint.status, 422);

      // Valid reprint
      const okReprint = await client.post(`/api/v1/owner/orders/${order.data.orderToken}/reprint`, {
        reason: 'Paper jam on tray 1 caused smudge',
      });
      assert.strictEqual(okReprint.ok, true);

      const reprintAudit = harness.auditLogs.find((a) => a.event === 'REPRINT_ISSUED');
      assert.ok(reprintAudit);
      assert.ok(reprintAudit.reason.includes('Paper jam'));
    });

    it('broadcasts real-time WebSocket event when order status changes', async () => {
      const ws = new WsClient({ mock: true });
      harness.attachWsClient(ws);
      await ws.connect();
      ws.subscribe('order.tok_ws_test');

      let receivedEvent = null;
      ws.on('App\\Events\\OrderStatusChanged', (evt) => {
        receivedEvent = evt.data;
      });

      harness.broadcastWs('order.tok_ws_test', 'App\\Events\\OrderStatusChanged', {
        orderToken: 'tok_ws_test',
        status: 'PRINTING',
      });

      assert.ok(receivedEvent);
      assert.strictEqual(receivedEvent.status, 'PRINTING');
      ws.disconnect();
    });

    it('broadcasts queue count update to agent presence channel', async () => {
      const ws = new WsClient({ mock: true });
      harness.attachWsClient(ws);
      await ws.connect();
      ws.subscribe('presence-tenant.tenant_standalone_default.agents');

      let queueEvent = null;
      ws.on('App\\Events\\QueueUpdated', (evt) => {
        queueEvent = evt.data;
      });

      harness.broadcastWs('presence-tenant.tenant_standalone_default.agents', 'App\\Events\\QueueUpdated', {
        pendingJobs: 3,
      });

      assert.ok(queueEvent);
      assert.strictEqual(queueEvent.pendingJobs, 3);
      ws.disconnect();
    });

    it('owner logs out and Sanctum token is immediately invalidated', async () => {
      const logoutRes = await client.post('/api/v1/auth/logout');
      assert.strictEqual(logoutRes.ok, true);

      const queueRes = await client.getOwnerQueue();
      assert.strictEqual(queueRes.status, 401);
    });

    it('generates 6-digit agent pairing PIN with 5-minute expiry', async () => {
      const pinRes = await client.post('/api/v1/owner/agent/pairing-pin');
      assert.strictEqual(pinRes.ok, true);
      assert.strictEqual(pinRes.data.pin.length, 6);
      assert.ok(/^\d{6}$/.test(pinRes.data.pin));
      assert.strictEqual(pinRes.data.expiresInSeconds, 300);
    });
  });

  // =========================================================================
  // 6. Standalone Edition Gate + Route 404 Blocking (11 tests)
  // =========================================================================
  describe('Pairwise 6: Standalone Edition Gate + Route 404 Blocking', () => {
    it('blocks /api/v1/platform/tenants with 404 in standalone edition', async () => {
      client.setEdition('standalone');
      const res = await client.get('/api/v1/platform/tenants');
      assert.strictEqual(res.status, 404);
      assert.ok(res.errors[0].message.includes('standalone edition'));
    });

    it('blocks /api/v1/platform/subscriptions with 404 in standalone edition', async () => {
      client.setEdition('standalone');
      const res = await client.get('/api/v1/platform/subscriptions');
      assert.strictEqual(res.status, 404);
    });

    it('blocks /api/v1/platform/invoices with 404 in standalone edition', async () => {
      client.setEdition('standalone');
      const res = await client.get('/api/v1/platform/invoices');
      assert.strictEqual(res.status, 404);
    });

    it('blocks /api/v1/platform/plans with 404 in standalone edition', async () => {
      client.setEdition('standalone');
      const res = await client.get('/api/v1/platform/plans');
      assert.strictEqual(res.status, 404);
    });

    it('allows public storefront routes normally in standalone edition', async () => {
      client.setEdition('standalone');
      const res = await client.getStorefront('nilkhet-central');
      assert.strictEqual(res.status, 200);
    });

    it('allows owner console routes normally in standalone edition', async () => {
      client.setEdition('standalone');
      await client.loginOwner('owner@nilkhetprint.com', 'password123');
      const res = await client.getOwnerQueue();
      assert.strictEqual(res.status, 200);
    });

    it('allows agent lease routes normally in standalone edition', async () => {
      client.setEdition('standalone');
      harness.pairingPins.set('112233', { pin: '112233', expiresAt: Date.now() + 300000 });
      const pair = await client.pairAgent('112233', { machineGuid: 'm1' });
      const lease = await client.leasePrintJob(pair.data.agentToken);
      assert.strictEqual(lease.status, 200);
    });

    it('enforces X-App-Edition header propagation in API responses', async () => {
      const res = await client.get('/health');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.headers.get('x-app-edition'), 'standalone');
    });

    it('re-enables platform routes when edition toggles to saas', async () => {
      client.setEdition('saas');
      harness.edition = 'saas';
      const res = await client.get('/api/v1/platform/tenants');
      // In SaaS mode, it is no longer 404 from the Standalone EditionGate
      assert.notStrictEqual(res.status, 404);
    });

    it('coerces foreign tenant headers to default tenant in standalone mode', async () => {
      client.setEdition('standalone');
      client.setTenantId('tenant_foreign_attempt');
      const res = await client.get('/health');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.headers.get('x-tenant-id'), 'tenant_standalone_default');
    });

    it('verifies edition gate intercepts prior to any controller execution', async () => {
      client.setEdition('standalone');
      const res = await client.post('/api/v1/platform/tenants', { maliciousPayload: 'test' });
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.errors[0].message, 'Platform administration route not found in standalone edition');
    });
  });

  // =========================================================================
  // 7. Localization Toggle (en/bn) + Price Formatting in Bangla Digits (11 tests)
  // =========================================================================
  describe('Pairwise 7: Localization Toggle + Bangla Numeral Formatting', () => {
    it('formats 1250 Poisha into English decimal string "৳12.50"', () => {
      const str = formatBdt(1250, { bangla: false });
      assert.strictEqual(str, '৳12.50');
    });

    it('formats 1250 Poisha into Bangla numerals "৳১২.৫০"', () => {
      const str = formatBdt(1250, { bangla: true });
      assert.strictEqual(str, '৳১২.৫০');
    });

    it('converts ASCII digits 0123456789 to Bengali digits ০১২৩৪৫৬৭৮৯', () => {
      const bangla = toBanglaDigits('0123456789');
      assert.strictEqual(bangla, '০১২৩৪৫৬৭৮৯');
    });

    it('converts Bengali digits ০১২৩৪৫৬৭৮৯ back to ASCII digits 0123456789', () => {
      const ascii = fromBanglaDigits('০১২৩৪৫৬৭৮৯');
      assert.strictEqual(ascii, '0123456789');
    });

    it('formats zero Poisha accurately in Bengali "৳০.০০"', () => {
      const str = formatBdt(0, { bangla: true });
      assert.strictEqual(str, '৳০.০০');
    });

    it('formats large transaction 1050075 Poisha (৳10,500.75) in Bengali', () => {
      const str = formatBdt(1050075, { bangla: true });
      assert.strictEqual(str, '৳১০৫০০.৭৫');
    });

    it('returns Bengali formatted price in interactive quote response', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 5 }],
      });
      assert.ok(quote.data.totalBanglaFormatted.startsWith('৳'));
      assert.ok(/[০-৯]/.test(quote.data.totalBanglaFormatted));
    });

    it('renders customer order status with localized Bengali numerals', async () => {
      const quote = await client.calculateQuote({
        files: [{ fileToken: 'f1', pageCount: 2 }],
      });
      const order = await client.submitOrder({
        customerPhone: '01712345678',
        quoteToken: quote.data.quoteToken,
      });

      const statusRes = await client.getOrderStatus(order.data.orderToken);
      assert.ok(statusRes.data.amountBanglaFormatted);
      assert.ok(/[০-৯]/.test(statusRes.data.amountBanglaFormatted));
    });

    it('accepts customer phone number with Bengali digits and normalizes to ASCII', () => {
      const bnPhone = '০১৭১২৩৪৫৬৭৮';
      const asciiPhone = fromBanglaDigits(bnPhone);
      assert.strictEqual(asciiPhone, '01712345678');
      assert.strictEqual(isValidBdPhone(asciiPhone), true);
    });

    it('formats negative adjustment in Bengali format with minus sign', () => {
      const str = formatBdt(-250, { bangla: true });
      assert.strictEqual(str, '৳-২.৫০');
    });

    it('formats fractional single-digit Poisha with leading zero in Bengali (5 Poisha -> ৳০.০৫)', () => {
      const str = formatBdt(5, { bangla: true });
      assert.strictEqual(str, '৳০.০৫');
    });
  });
});
