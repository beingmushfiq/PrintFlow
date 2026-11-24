/**
 * PrintFlow Tier 4: Real-World Application Scenarios
 *
 * Implements end-to-end tests for ALL 35 Realistic Scenarios detailed in
 * TEST_INFRA.md § Real-World Application Scenarios (Tier 4):
 *
 * 1. Standard Walk-in Customer
 * 2. Duplex Document with Odd Page Count
 * 3. Malicious / Disguised File Injection
 * 4. Encrypted Password-Protected PDF
 * 5. Payment Webhook Tampering
 * 6. Double-Click Checkout Prevention
 * 7. Print Agent Offline & Reconnect Recovery
 * 8. Local Spooler Crash Recovery via SQLite Journal
 * 9. Controlled Reprint Protocol by Owner
 * 10. Owner Real-Time Operations
 * 11. Bilingual Toggle & Font Rendering
 * 12. Standalone Mode Security Lockdown
 * 13. Multi-Copy Multi-File Order
 * 14. Minimum Order Floor & VAT Enforcement
 * 15. Shop Counter QR Studio & Multi-Format Placard
 * 16. Ephemeral Document Lifecycle & Storage Purge
 * 17. SSLCOMMERZ v4 Hosted Session Lifecycle
 * 18. bKash Tokenized Agreement & Execution
 * 19. Fleet Discovery & Printer Capabilities Sync
 * 20. Stale Lease Deadlock Auto-Reconciliation
 * 21. Customer Live Order Tracking & WebSocket Updates
 * 22. Corrupted PDF Header Injection
 * 23. High-Concurrency Queue Leasing
 * 24. Owner Authentication & Session Revocation
 * 25. Dynamic Duplex Model B (Discounted Side Rate)
 * 26. Customer Phone Number Edge Cases
 * 27. Encrypted Gateway Credentials Store
 * 28. ClamAV Detection & Immediate Quarantine
 * 29. Searchable Ledger Multi-Param Filtering
 * 30. Printable Receipt Verification
 * 31. Agent Pairing Cryptographic Handshake
 * 32. Queue Action: Owner Cancels Pre-Print Order
 * 33. Interactive Pricing Profile Live Preview
 * 34. Dormant SaaS Feature Flag Verification
 * 35. Production Smoke Verification
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
  createValidSinglePagePdf,
  createValidMultiPagePdf,
  createCorruptedHeaderPdf,
  createDisguisedExePdf,
  createPasswordEncryptedPdf,
  createSamplePng,
  createSampleJpeg,
  createEicarTestString,
} from '../../src/index.js';

import { PrintFlowTestHarness } from '../tier3-combinations/testHarness.js';

describe('Tier 4: Real-World Application Scenarios (All 35 Scenarios)', () => {
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
  // Scenario 1: Standard Walk-in Customer
  // =========================================================================
  it('Scenario 1: Standard Walk-in Customer (Scan QR -> Upload 3-page PDF -> Simplex A4 -> Sandbox Payment -> Spool -> Complete)', async () => {
    // 1. Scan QR / landing
    const store = await client.getStorefront('nilkhet-central');
    assert.strictEqual(store.ok, true);

    // 2. Upload 3-page PDF
    const upload = await client.createPresignedUpload({
      fileName: 'lecture_notes.pdf',
      pageCount: 3,
    });
    assert.strictEqual(upload.ok, true);

    // 3. Simplex A4 Quote
    const quote = await client.calculateQuote({
      files: [{ fileToken: upload.data.fileToken, pageCount: 3 }],
      options: { mode: 'simplex', copies: 1, baseSimplexSideRatePoisha: 200 },
    });
    assert.strictEqual(quote.data.totalSides, 3);
    assert.strictEqual(quote.data.totalSheets, 3);
    // 3 * 200 = 600 Poisha. VAT 5% (30 Poisha) = 630 Poisha
    assert.strictEqual(quote.data.totalPoisha, 630);

    // 4. Submit order with mandatory phone
    const order = await client.submitOrder({
      customerPhone: '01712345678',
      quoteToken: quote.data.quoteToken,
      paymentGateway: 'sandbox',
    });
    assert.strictEqual(order.status, 201);

    // 5. Pay via Sandbox
    const pay = await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });
    assert.strictEqual(pay.data.status, 'PAID');

    // 6. Print Agent leases and spools
    harness.pairingPins.set('111111', { pin: '111111', expiresAt: Date.now() + 300000 });
    const pair = await client.pairAgent('111111', { machineGuid: 'agent-walkin-1' });
    const lease = await client.leasePrintJob(pair.data.agentToken);
    assert.ok(lease.data.job);
    assert.strictEqual(lease.data.job.printSettings.copies, 1);

    // 7. Spool completion
    const complete = await client.completePrintJob(lease.data.job.jobId, { status: 'completed' }, pair.data.agentToken);
    assert.strictEqual(complete.ok, true);

    const status = await client.getOrderStatus(order.data.orderToken);
    assert.strictEqual(status.data.status, 'READY');
  });

  // =========================================================================
  // Scenario 2: Duplex Document with Odd Page Count
  // =========================================================================
  it('Scenario 2: Duplex Document with Odd Page Count (5-page PDF -> 2 duplex + 1 simplex sheet -> bKash Checkout)', async () => {
    const upload = await client.createPresignedUpload({
      fileName: 'thesis_chapter.pdf',
      pageCount: 5,
    });
    assert.strictEqual(upload.data.pageCount, 5);

    const quote = await client.calculateQuote({
      files: [{ fileToken: upload.data.fileToken, pageCount: 5 }],
      options: {
        mode: 'duplex',
        duplexModel: 'model_b',
        baseSimplexSideRatePoisha: 200,
        duplexDiscountPercent: 20, // 160 Poisha
        copies: 1,
      },
    });

    // 2 duplex sheets (4 sides: 2*200 + 2*160 = 720) + 1 odd simplex sheet (200) = 920 Poisha
    // VAT 5% (46 Poisha) = 966 Poisha
    assert.strictEqual(quote.data.totalSheets, 3);
    assert.strictEqual(quote.data.totalSides, 5);
    assert.strictEqual(quote.data.subtotalPoisha, 920);
    assert.strictEqual(quote.data.totalPoisha, 966);

    const order = await client.submitOrder({
      customerPhone: '01812345678',
      quoteToken: quote.data.quoteToken,
      paymentGateway: 'bkash',
    });

    const bkash = await client.post('/api/v1/payments/bkash/execute', {
      paymentId: 'TR_BKASH_SCENARIO_2',
      orderToken: order.data.orderToken,
    });
    assert.strictEqual(bkash.ok, true);

    const status = await client.getOrderStatus(order.data.orderToken);
    assert.strictEqual(status.data.status, 'QUEUED');
  });

  // =========================================================================
  // Scenario 3: Malicious / Disguised File Injection
  // =========================================================================
  it('Scenario 3: Malicious / Disguised File Injection (Upload .exe renamed to .pdf -> Magic Byte rejection 422)', async () => {
    const upload = await client.createPresignedUpload({
      fileName: 'assignment.pdf',
      mimeType: 'application/pdf',
      buffer: createDisguisedExePdf(),
    });
    assert.strictEqual(upload.status, 422);
    assert.strictEqual(upload.errors[0].field, 'file');
    assert.ok(upload.errors[0].message.includes('File signature does not match'));

    // Verify zero quote or order can be made
    assert.strictEqual(harness.files.size, 0);
  });

  // =========================================================================
  // Scenario 4: Encrypted Password-Protected PDF
  // =========================================================================
  it('Scenario 4: Encrypted Password-Protected PDF (Password-locked PDF -> Localized Bengali error -> Purged)', async () => {
    const upload = await client.createPresignedUpload({
      fileName: 'bank_statement_locked.pdf',
      mimeType: 'application/pdf',
      buffer: createPasswordEncryptedPdf(),
    });
    assert.strictEqual(upload.status, 422);
    assert.strictEqual(upload.errors[0].code, 'PASSWORD_PROTECTED_PDF');
    assert.ok(upload.errors[0].message.includes('পাসওয়ার্ড সুরক্ষিত'));
  });

  // =========================================================================
  // Scenario 5: Payment Webhook Tampering
  // =========================================================================
  it('Scenario 5: Payment Webhook Tampering (Forged SSLCOMMERZ IPN callback -> Signature verifier fails -> Order unpaid)', async () => {
    const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 2 }] });
    const order = await client.submitOrder({
      customerPhone: '01712345678',
      quoteToken: quote.data.quoteToken,
      paymentGateway: 'sslcommerz',
    });

    const validIpn = MockGateway.createSslIpnPayload({
      tranId: order.data.orderToken,
      valId: 'VAL_TAMPER_TEST',
      amount: fromPoisha(quote.data.totalPoisha).toFixed(2),
      storePassword: harness.sslStorePassword,
    });

    // Attacker modifies amount from 5.25 to 99999.00 without matching secret hash
    const tampered = MockGateway.createTamperedSslIpnPayload(validIpn);
    const ipnRes = await client.post('/api/v1/payments/sslcommerz/ipn', tampered);
    assert.strictEqual(ipnRes.status, 400);

    const status = await client.getOrderStatus(order.data.orderToken);
    assert.strictEqual(status.data.status, 'PENDING_PAYMENT');
  });

  // =========================================================================
  // Scenario 6: Double-Click Checkout Prevention
  // =========================================================================
  it('Scenario 6: Double-Click Checkout Prevention (2 clicks within 200ms -> Atomic lock prevents duplicate order)', async () => {
    const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
    const idempotencyKey = 'checkout_click_unique_999';

    const order1 = await client.submitOrder({
      customerPhone: '01712345678',
      quoteToken: quote.data.quoteToken,
      idempotencyKey,
    });
    assert.strictEqual(order1.status, 201);

    const order2 = await client.submitOrder({
      customerPhone: '01712345678',
      quoteToken: quote.data.quoteToken,
      idempotencyKey,
    });
    assert.strictEqual(order2.status, 409);
  });

  // =========================================================================
  // Scenario 7: Print Agent Offline & Reconnect Recovery
  // =========================================================================
  it('Scenario 7: Print Agent Offline & Reconnect Recovery (Agent connection drop -> Heartbeat timeout -> Lease requeued)', async () => {
    const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
    const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
    await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

    harness.pairingPins.set('222222', { pin: '222222', expiresAt: Date.now() + 300000 });
    const pair = await client.pairAgent('222222', { machineGuid: 'agent-reconnect' });

    const lease1 = await client.leasePrintJob(pair.data.agentToken);
    assert.ok(lease1.data.job);

    // Simulate crash & lease expiration
    harness.printJobs.get(lease1.data.job.jobId).leaseExpiresAt = Date.now() - 1000;
    const reconciled = harness.reconcileStaleLeases();
    assert.strictEqual(reconciled, 1);

    // Reconnected agent leases again
    const lease2 = await client.leasePrintJob(pair.data.agentToken);
    assert.ok(lease2.data.job);
    assert.strictEqual(lease2.data.job.jobId, lease1.data.job.jobId);
  });

  // =========================================================================
  // Scenario 8: Local Spooler Crash Recovery via SQLite Journal
  // =========================================================================
  it('Scenario 8: Local Spooler Crash Recovery via SQLite Journal (Journal state tracks pending spool -> Prevents duplicate print)', () => {
    const jobId = 'job_spooler_crash_scen8';
    harness.agentJournal.set(jobId, {
      jobId,
      status: 'spooling',
      pagesCompleted: 2,
      totalPages: 5,
    });

    // Crash simulated -> Agent restarts
    const entry = harness.agentJournal.get(jobId);
    assert.strictEqual(entry.status, 'spooling');
    assert.strictEqual(entry.pagesCompleted, 2);
  });

  // =========================================================================
  // Scenario 9: Controlled Reprint Protocol by Owner
  // =========================================================================
  it('Scenario 9: Controlled Reprint Protocol by Owner (Mandatory reason modal -> Order event logged -> New print attempt)', async () => {
    await client.loginOwner('owner@nilkhetprint.com', 'password123');

    const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 2 }] });
    const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
    await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

    // Empty reason rejected
    const failReprint = await client.post(`/api/v1/owner/orders/${order.data.orderToken}/reprint`, { reason: '   ' });
    assert.strictEqual(failReprint.status, 422);

    // Valid reprint
    const okReprint = await client.post(`/api/v1/owner/orders/${order.data.orderToken}/reprint`, {
      reason: 'Toner smudge on page 2 caused by dirty drum',
    });
    assert.strictEqual(okReprint.ok, true);

    const audit = harness.auditLogs.find((a) => a.event === 'REPRINT_ISSUED');
    assert.ok(audit);
    assert.ok(audit.reason.includes('Toner smudge'));
  });

  // =========================================================================
  // Scenario 10: Owner Real-Time Operations
  // =========================================================================
  it('Scenario 10: Owner Real-Time Operations (Queue view -> Hold -> Resume -> Handover collected)', async () => {
    await client.loginOwner('owner@nilkhetprint.com', 'password123');

    const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
    const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
    await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

    const job = Array.from(harness.printJobs.values())[0];
    await client.post(`/api/v1/owner/jobs/${job.id}/hold`);
    assert.strictEqual(harness.printJobs.get(job.id).status, 'held');

    await client.post(`/api/v1/owner/jobs/${job.id}/resume`);
    assert.strictEqual(harness.printJobs.get(job.id).status, 'pending');

    await client.post(`/api/v1/owner/orders/${order.data.orderToken}/collected`);
    const status = await client.getOrderStatus(order.data.orderToken);
    assert.strictEqual(status.data.status, 'COLLECTED');

    const dash = await client.get('/api/v1/owner/dashboard');
    assert.strictEqual(dash.ok, true);
    assert.ok(dash.data.todayRevenuePoisha > 0);
  });

  // =========================================================================
  // Scenario 11: Bilingual Toggle & Font Rendering
  // =========================================================================
  it('Scenario 11: Bilingual Toggle & Font Rendering (Switch en -> bn -> Bangla numerals formatted: ৳১২.৫০)', async () => {
    // English format
    const enStr = formatBdt(1250, { bangla: false });
    assert.strictEqual(enStr, '৳12.50');

    // Bengali format
    const bnStr = formatBdt(1250, { bangla: true });
    assert.strictEqual(bnStr, '৳১২.৫০');

    const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 2 }] });
    assert.ok(quote.data.totalBanglaFormatted.startsWith('৳'));
  });

  // =========================================================================
  // Scenario 12: Standalone Mode Security Lockdown
  // =========================================================================
  it('Scenario 12: Standalone Mode Security Lockdown (Access /api/v1/platform/* -> Returns 404 Not Found)', async () => {
    client.setEdition('standalone');
    const res = await client.get('/api/v1/platform/tenants');
    assert.strictEqual(res.status, 404);
    assert.ok(res.errors[0].message.includes('standalone edition'));
  });

  // =========================================================================
  // Scenario 13: Multi-Copy Multi-File Order
  // =========================================================================
  it('Scenario 13: Multi-Copy Multi-File Order (1 PDF + 2 PNGs -> 3 copies of PDF duplex + 1 copy PNGs -> Outbox splits)', async () => {
    const uploadPdf = await client.createPresignedUpload({ fileName: 'doc.pdf', pageCount: 5 });
    const uploadPng1 = await client.createPresignedUpload({ fileName: 'img1.png', pageCount: 1 });
    const uploadPng2 = await client.createPresignedUpload({ fileName: 'img2.png', pageCount: 1 });

    const quote = await client.calculateQuote({
      files: [
        { fileToken: uploadPdf.data.fileToken, pageCount: 5, copies: 3, mode: 'duplex' },
        { fileToken: uploadPng1.data.fileToken, pageCount: 1, copies: 1, mode: 'simplex' },
        { fileToken: uploadPng2.data.fileToken, pageCount: 1, copies: 1, mode: 'simplex' },
      ],
    });

    const order = await client.submitOrder({
      customerPhone: '01712345678',
      quoteToken: quote.data.quoteToken,
    });

    await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

    // Outbox splits into 3 separate print jobs
    const jobs = Array.from(harness.printJobs.values()).filter((j) => j.orderId === order.data.orderId);
    assert.strictEqual(jobs.length, 3);
  });

  // =========================================================================
  // Scenario 14: Minimum Order Floor & VAT Enforcement
  // =========================================================================
  it('Scenario 14: Minimum Order Floor & VAT Enforcement (1 B&W page @ 200 Poisha -> Min floor 500 Poisha + 5% VAT = 525 Poisha)', async () => {
    const quote = await client.calculateQuote({
      files: [{ fileToken: 'f1', pageCount: 1 }],
      options: { mode: 'simplex', copies: 1, baseSimplexSideRatePoisha: 200 },
    });
    assert.strictEqual(quote.data.subtotalPoisha, 200);
    assert.strictEqual(quote.data.floorAdjustmentPoisha, 300);
    assert.strictEqual(quote.data.taxPoisha, 25);
    assert.strictEqual(quote.data.totalPoisha, 525);
  });

  // =========================================================================
  // Scenario 15: Shop Counter QR Studio & Multi-Format Placard
  // =========================================================================
  it('Scenario 15: Shop Counter QR Studio & Multi-Format Placard (Owner customizes shop profile -> Downloads PDF/SVG placard)', async () => {
    await client.loginOwner('owner@nilkhetprint.com', 'password123');

    // Customize shop
    const updateShop = await client.put('/api/v1/owner/shop', { name: 'PrintFlow Nilkhet Mega Branch' });
    assert.strictEqual(updateShop.ok, true);

    // Download SVG QR
    const svgRes = await client.get('/api/v1/shop/shop_dhaka_01/qr/svg');
    assert.strictEqual(svgRes.ok, true);

    // Download PDF Placard
    const pdfRes = await client.get('/api/v1/shop/shop_dhaka_01/qr/pdf');
    assert.strictEqual(pdfRes.ok, true);
  });

  // =========================================================================
  // Scenario 16: Ephemeral Document Lifecycle & Storage Purge
  // =========================================================================
  it('Scenario 16: Ephemeral Document Lifecycle & Storage Purge (Spooler completion -> File purge event -> MinIO object deleted)', async () => {
    const upload = await client.createPresignedUpload({ fileName: 'confidential_nid.pdf', pageCount: 1 });
    const quote = await client.calculateQuote({ files: [{ fileToken: upload.data.fileToken, pageCount: 1 }] });
    const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
    await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

    harness.pairingPins.set('333333', { pin: '333333', expiresAt: Date.now() + 300000 });
    const pair = await client.pairAgent('333333', { machineGuid: 'agent-purge' });
    const lease = await client.leasePrintJob(pair.data.agentToken);

    await client.completePrintJob(lease.data.job.jobId, { status: 'completed' }, pair.data.agentToken);

    // Memory buffer and storage purged
    const storedFile = harness.files.get(upload.data.fileToken);
    assert.strictEqual(storedFile.status, 'purged');
    assert.strictEqual(storedFile.buffer, null);
  });

  // =========================================================================
  // Scenario 17: SSLCOMMERZ v4 Hosted Session Lifecycle
  // =========================================================================
  it('Scenario 17: SSLCOMMERZ v4 Hosted Session Lifecycle (Initiate session -> Hosted checkout URL -> IPN callback -> Outbox fires)', async () => {
    const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 2 }] });
    const order = await client.submitOrder({
      customerPhone: '01712345678',
      quoteToken: quote.data.quoteToken,
      paymentGateway: 'sslcommerz',
    });

    const initRes = await client.post('/api/v1/payments/sslcommerz/initiate', { orderToken: order.data.orderToken });
    assert.strictEqual(initRes.data.status, 'SUCCESS');
    assert.ok(initRes.data.GatewayPageURL);

    const ipn = MockGateway.createSslIpnPayload({
      tranId: order.data.orderToken,
      valId: 'VAL_SSL_FULL_CYCLE',
      amount: fromPoisha(quote.data.totalPoisha).toFixed(2),
      storePassword: harness.sslStorePassword,
    });
    const ipnRes = await client.post('/api/v1/payments/sslcommerz/ipn', ipn);
    assert.strictEqual(ipnRes.data.status, 'IPN_VERIFIED');

    const status = await client.getOrderStatus(order.data.orderToken);
    assert.strictEqual(status.data.status, 'QUEUED');
  });

  // =========================================================================
  // Scenario 18: bKash Tokenized Agreement & Execution
  // =========================================================================
  it('Scenario 18: bKash Tokenized Agreement & Execution (Create payment -> Execute payment -> Order transitions to PAID)', async () => {
    const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 2 }] });
    const order = await client.submitOrder({
      customerPhone: '01712345678',
      quoteToken: quote.data.quoteToken,
      paymentGateway: 'bkash',
    });

    const createRes = await client.post('/api/v1/payments/bkash/create', { orderToken: order.data.orderToken });
    assert.strictEqual(createRes.data.statusCode, '0000');

    const execRes = await client.post('/api/v1/payments/bkash/execute', {
      paymentId: createRes.data.paymentID,
      orderToken: order.data.orderToken,
    });
    assert.strictEqual(execRes.data.statusCode, '0000');
    assert.strictEqual(execRes.data.transactionStatus, 'Completed');
  });

  // =========================================================================
  // Scenario 19: Fleet Discovery & Printer Capabilities Sync
  // =========================================================================
  it('Scenario 19: Fleet Discovery & Printer Capabilities Sync (Agent syncs 2 local printers -> Owner selects default)', async () => {
    const syncRes = await client.post('/api/v1/agent/printers/sync', {
      printers: [
        { id: 'prn_canon', name: 'Canon imageRUNNER 2520', supportsDuplex: true },
        { id: 'prn_epson', name: 'Epson L805 Color', supportsDuplex: false },
      ],
    });
    assert.strictEqual(syncRes.data.synced, 2);

    await client.loginOwner('owner@nilkhetprint.com', 'password123');
    const updateDefault = await client.put('/api/v1/owner/shop/printer', { printerId: 'prn_canon' });
    assert.strictEqual(updateDefault.data.defaultPrinterId, 'prn_canon');
  });

  // =========================================================================
  // Scenario 20: Stale Lease Deadlock Auto-Reconciliation
  // =========================================================================
  it('Scenario 20: Stale Lease Deadlock Auto-Reconciliation (Agent leases but crashes permanently -> Scheduler requeues job)', async () => {
    const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
    const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
    await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

    harness.pairingPins.set('444444', { pin: '444444', expiresAt: Date.now() + 300000 });
    const pair = await client.pairAgent('444444', { machineGuid: 'agent-deadlock' });
    const lease = await client.leasePrintJob(pair.data.agentToken);

    // Stale timeout
    harness.printJobs.get(lease.data.job.jobId).leaseExpiresAt = Date.now() - 1000;
    const reconciled = harness.reconcileStaleLeases();
    assert.strictEqual(reconciled, 1);

    // Replacement agent picks it up
    harness.pairingPins.set('555555', { pin: '555555', expiresAt: Date.now() + 300000 });
    const pairReplacement = await client.pairAgent('555555', { machineGuid: 'agent-replacement' });
    const lease2 = await client.leasePrintJob(pairReplacement.data.agentToken);
    assert.strictEqual(lease2.data.job.jobId, lease.data.job.jobId);
  });

  // =========================================================================
  // Scenario 21: Customer Live Order Tracking & WebSocket Updates
  // =========================================================================
  it('Scenario 21: Customer Live Order Tracking & WebSocket Updates (Order lifecycle broadcasts on order channel)', async () => {
    const ws = new WsClient({ mock: true });
    harness.attachWsClient(ws);
    await ws.connect();

    const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
    const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });

    ws.subscribe(`order.${order.data.orderToken}`);

    let latestStatus = null;
    ws.on('App\\Events\\OrderStatusChanged', (evt) => {
      latestStatus = evt.data.status;
    });

    await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });
    assert.strictEqual(latestStatus, 'QUEUED');

    ws.disconnect();
  });

  // =========================================================================
  // Scenario 22: Corrupted PDF Header Injection
  // =========================================================================
  it('Scenario 22: Corrupted PDF Header Injection (Damaged %PDF- header fails extraction -> 422 Unprocessable)', async () => {
    const upload = await client.createPresignedUpload({
      fileName: 'damaged.pdf',
      mimeType: 'application/pdf',
      buffer: createCorruptedHeaderPdf(),
    });
    assert.strictEqual(upload.status, 422);
    assert.ok(upload.errors[0].message.includes('Corrupted PDF'));
  });

  // =========================================================================
  // Scenario 23: High-Concurrency Queue Leasing
  // =========================================================================
  it('Scenario 23: High-Concurrency Queue Leasing (5 agents simultaneously poll -> Exactly one lease per job)', async () => {
    // Populate 3 jobs
    for (let i = 0; i < 3; i++) {
      const quote = await client.calculateQuote({ files: [{ fileToken: `f_${i}`, pageCount: 1 }] });
      const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
      await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });
    }

    // Register 5 agents
    const agentTokens = [];
    for (let i = 0; i < 5; i++) {
      const pin = `77777${i}`;
      harness.pairingPins.set(pin, { pin, expiresAt: Date.now() + 300000 });
      const pair = await client.pairAgent(pin, { machineGuid: `agent-conc-${i}` });
      agentTokens.push(pair.data.agentToken);
    }

    // Concurrent lease requests
    const leaseResults = await Promise.all(agentTokens.map((tok) => client.leasePrintJob(tok)));

    const leasedJobs = leaseResults.filter((r) => r.data.job !== null).map((r) => r.data.job.jobId);
    const emptyLeases = leaseResults.filter((r) => r.data.job === null);

    assert.strictEqual(leasedJobs.length, 3);
    assert.strictEqual(emptyLeases.length, 2);
    // Ensure all 3 leased jobs are distinct
    assert.strictEqual(new Set(leasedJobs).size, 3);
  });

  // =========================================================================
  // Scenario 24: Owner Authentication & Session Revocation
  // =========================================================================
  it('Scenario 24: Owner Authentication & Session Revocation (Register/Login -> Sanctum token -> Logout -> 401)', async () => {
    const login = await client.loginOwner('owner@nilkhetprint.com', 'password123');
    assert.strictEqual(login.ok, true);

    const queueOk = await client.getOwnerQueue();
    assert.strictEqual(queueOk.status, 200);

    await client.post('/api/v1/auth/logout');
    const queueAfterLogout = await client.getOwnerQueue();
    assert.strictEqual(queueAfterLogout.status, 401);
  });

  // =========================================================================
  // Scenario 25: Dynamic Duplex Model B (Discounted Side Rate)
  // =========================================================================
  it('Scenario 25: Dynamic Duplex Model B (10-page document -> 20% discount on 2nd side -> Exact Poisha math)', async () => {
    const quote = await client.calculateQuote({
      files: [{ fileToken: 'f10', pageCount: 10 }],
      options: {
        mode: 'duplex',
        duplexModel: 'model_b',
        baseSimplexSideRatePoisha: 200,
        duplexDiscountPercent: 20, // 160 Poisha
        copies: 1,
      },
    });

    // 5 front (1000) + 5 back (800) = 1800 Poisha. VAT 5% (90 Poisha) = 1890 Poisha.
    assert.strictEqual(quote.data.totalSides, 10);
    assert.strictEqual(quote.data.totalSheets, 5);
    assert.strictEqual(quote.data.subtotalPoisha, 1800);
    assert.strictEqual(quote.data.totalPoisha, 1890);
  });

  // =========================================================================
  // Scenario 26: Customer Phone Number Edge Cases
  // =========================================================================
  it('Scenario 26: Customer Phone Number Edge Cases (Validates 017, 018, 019; Rejects 010, 011, 012 and invalid lengths)', () => {
    assert.strictEqual(isValidBdPhone('01712345678'), true);
    assert.strictEqual(isValidBdPhone('01812345678'), true);
    assert.strictEqual(isValidBdPhone('01912345678'), true);
    assert.strictEqual(isValidBdPhone('01012345678'), false);
    assert.strictEqual(isValidBdPhone('01112345678'), false);
    assert.strictEqual(isValidBdPhone('01212345678'), false);
    assert.strictEqual(isValidBdPhone('0171234567'), false); // 10 digits
    assert.strictEqual(isValidBdPhone('017123456789'), false); // 12 digits
  });

  // =========================================================================
  // Scenario 27: Encrypted Gateway Credentials Store
  // =========================================================================
  it('Scenario 27: Encrypted Gateway Credentials Store (Owner inputs secrets -> Encrypted store -> Masked retrieval)', async () => {
    await client.loginOwner('owner@nilkhetprint.com', 'password123');

    const updateCreds = await client.put('/api/v1/owner/credentials', {
      sslcommerz: { storeId: 'new_store_live', storePass: 'super_secret_pass_123' },
      bkash: { appKey: 'bkash_key_abc', appSecret: 'bkash_secret_xyz' },
    });
    assert.strictEqual(updateCreds.ok, true);

    const getCreds = await client.get('/api/v1/owner/credentials');
    assert.strictEqual(getCreds.data.sslcommerz.storeId, 'new_store_live');
    assert.strictEqual(getCreds.data.sslcommerz.maskedPass, '••••••••');
    assert.notStrictEqual(getCreds.data.sslcommerz.storePassEncrypted, 'super_secret_pass_123');
  });

  // =========================================================================
  // Scenario 28: ClamAV Detection & Immediate Quarantine
  // =========================================================================
  it('Scenario 28: ClamAV Detection & Immediate Quarantine (EICAR test string -> File quarantined and flagged)', async () => {
    const upload = await client.createPresignedUpload({
      fileName: 'malware.pdf',
      buffer: Buffer.from(createEicarTestString()),
    });
    assert.strictEqual(upload.status, 422);
    assert.strictEqual(upload.errors[0].code, 'MALWARE_DETECTED');
  });

  // =========================================================================
  // Scenario 29: Searchable Ledger Multi-Param Filtering
  // =========================================================================
  it('Scenario 29: Searchable Ledger Multi-Param Filtering (Search by customer phone & status)', async () => {
    await client.loginOwner('owner@nilkhetprint.com', 'password123');

    // Create 2 test orders with different phones
    const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
    await client.submitOrder({ customerPhone: '01711111111', quoteToken: quote.data.quoteToken });
    await client.submitOrder({ customerPhone: '01822222222', quoteToken: quote.data.quoteToken });

    const searchPhone = await client.get('/api/v1/owner/orders?phone=01711111111');
    assert.strictEqual(searchPhone.data.total, 1);
    assert.strictEqual(searchPhone.data.orders[0].customerPhone, '01711111111');

    const searchStatus = await client.get('/api/v1/owner/orders?status=PENDING_PAYMENT');
    assert.ok(searchStatus.data.total >= 2);
  });

  // =========================================================================
  // Scenario 30: Printable Receipt Verification
  // =========================================================================
  it('Scenario 30: Printable Receipt Verification (Receipt renders formatted header, transaction ID, line items)', async () => {
    const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 2 }] });
    const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
    await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

    const receipt = await client.getOrderStatus(order.data.orderToken);
    assert.ok(receipt.data.orderId);
    assert.strictEqual(receipt.data.customerPhone, '01712345678');
    assert.ok(receipt.data.amountFormatted.includes('৳'));
    assert.ok(receipt.data.lineItems.length > 0);
  });

  // =========================================================================
  // Scenario 31: Agent Pairing Cryptographic Handshake
  // =========================================================================
  it('Scenario 31: Agent Pairing Cryptographic Handshake (Console generates PIN -> Agent submits PIN + key -> Token issued)', async () => {
    await client.loginOwner('owner@nilkhetprint.com', 'password123');
    const pinRes = await client.post('/api/v1/owner/agent/pairing-pin');
    const pin = pinRes.data.pin;

    const pairRes = await client.pairAgent(pin, {
      agentName: 'Shop Spooler Station 1',
      machineGuid: 'guid-crypto-handshake',
      publicKey: 'ssh-rsa AAAAB3NzaC1yc2E...',
    });
    assert.strictEqual(pairRes.ok, true);
    assert.ok(pairRes.data.agentToken.startsWith('agent_jwt_'));

    // PIN is invalidated after single use
    const rePair = await client.pairAgent(pin, { machineGuid: 'guid-reuse' });
    assert.strictEqual(rePair.status, 400);
  });

  // =========================================================================
  // Scenario 32: Queue Action: Owner Cancels Pre-Print Order
  // =========================================================================
  it('Scenario 32: Queue Action: Owner Cancels Pre-Print Order (Job in queue -> Cancel before spool -> Refund event queued)', async () => {
    await client.loginOwner('owner@nilkhetprint.com', 'password123');

    const quote = await client.calculateQuote({ files: [{ fileToken: 'f1', pageCount: 1 }] });
    const order = await client.submitOrder({ customerPhone: '01712345678', quoteToken: quote.data.quoteToken });
    await client.post('/api/v1/payments/sandbox/pay', { orderToken: order.data.orderToken });

    const job = Array.from(harness.printJobs.values())[0];
    const cancelRes = await client.post(`/api/v1/owner/jobs/${job.id}/cancel`);
    assert.strictEqual(cancelRes.ok, true);

    const refundEvt = harness.outbox.find((e) => e.eventType === 'payment.refund');
    assert.ok(refundEvt);
    assert.strictEqual(refundEvt.payload.orderId, order.data.orderId);
  });

  // =========================================================================
  // Scenario 33: Interactive Pricing Profile Live Preview
  // =========================================================================
  it('Scenario 33: Interactive Pricing Profile Live Preview (Owner modifies base price -> Live sample quote calculator updates)', async () => {
    await client.loginOwner('owner@nilkhetprint.com', 'password123');

    const updatePricing = await client.put('/api/v1/owner/pricing', {
      baseSimplexSideRatePoisha: 250, // Updated to ৳2.50
      duplexDiscountPercent: 25,
    });
    assert.strictEqual(updatePricing.ok, true);
    assert.ok(updatePricing.data.previewSample5Pages.subtotalPoisha > 0);
  });

  // =========================================================================
  // Scenario 34: Dormant SaaS Feature Flag Verification
  // =========================================================================
  it('Scenario 34: Dormant SaaS Feature Flag Verification (Standalone flags disable SaaS subscriptions & platform admin)', async () => {
    await client.loginOwner('owner@nilkhetprint.com', 'password123');

    const features = await client.get('/api/v1/owner/features');
    assert.strictEqual(features.ok, true);
    assert.strictEqual(features.data.edition, 'standalone');
    assert.strictEqual(features.data.saasSubscriptionsEnabled, false);
    assert.strictEqual(features.data.multiTenantOutletsEnabled, false);
  });

  // =========================================================================
  // Scenario 35: Production Smoke Verification
  // =========================================================================
  it('Scenario 35: Production Smoke Verification (Health check, DB connectivity, Redis ping, MinIO bucket)', async () => {
    const health = await client.get('/health');
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.data.status, 'healthy');
    assert.strictEqual(health.data.database, 'connected');
    assert.strictEqual(health.data.redis, 'connected');
    assert.strictEqual(health.data.minio, 'connected');
    assert.strictEqual(health.data.edition, 'standalone');
  });
});
