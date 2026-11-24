/**
 * PrintFlow Base Harness Verification & Smoke Test
 *
 * Verifies that the entire test runner infrastructure, mock libraries,
 * clients, fixtures, and domain math engines execute with 100% fidelity.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  isValidBdPhone,
  normalizeBdPhone,
  getBdPhoneOperator,
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
  generateCorrelationId,
  generateAgentPairingCode,
  ApiClient,
  WsClient,
  MockGateway,
  FIXTURE_PATHS,
  createValidSinglePagePdf,
  createValidMultiPagePdf,
  createCorruptedHeaderPdf,
  createDisguisedExePdf,
  createSamplePng,
  createSampleJpeg,
  createPasswordEncryptedPdf,
  createEicarTestString,
} from '../src/index.js';

describe('PrintFlow E2E Base Harness Verification', () => {

  // --- 1. Node Runtime & Environment ---
  describe('Runtime Environment Capabilities', () => {
    it('executes in Node.js >= 20 with standard modern capabilities', () => {
      const nodeVersion = process.versions.node;
      const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
      assert.ok(majorVersion >= 20, `Expected Node >= 20, got v${nodeVersion}`);
      assert.strictEqual(typeof globalThis.fetch, 'function', 'Native fetch must be available');
      assert.strictEqual(typeof globalThis.WebSocket, 'function', 'Native WebSocket must be available');
    });
  });

  // --- 2. BD Mobile Phone Validator (Decision #3) ---
  describe('BD Mobile Phone Validator & Normalizer', () => {
    it('accepts valid 11-digit Bangladeshi mobile numbers for all operators', () => {
      const validNumbers = [
        '01712345678', // Grameenphone
        '01312345678', // Grameenphone
        '01812345678', // Robi
        '01612345678', // Airtel
        '01912345678', // Banglalink
        '01412345678', // Banglalink
        '01512345678', // Teletalk
      ];

      for (const phone of validNumbers) {
        assert.ok(isValidBdPhone(phone), `Expected ${phone} to be valid`);
      }
    });

    it('rejects invalid prefixes, non-numeric strings, and improper lengths', () => {
      const invalidNumbers = [
        '01012345678', // Disallowed prefix 010
        '01112345678', // Disallowed prefix 011
        '01212345678', // Disallowed prefix 012
        '0171234567',  // 10 digits (too short)
        '017123456789', // 12 digits (too long)
        '017abcdefgh', // Non-numeric
        '',            // Empty string
        null,          // Null
        undefined,     // Undefined
      ];

      for (const phone of invalidNumbers) {
        assert.strictEqual(isValidBdPhone(phone), false, `Expected ${phone} to be invalid`);
      }
    });

    it('normalizes international country codes and punctuation into standard 11 digits', () => {
      assert.strictEqual(normalizeBdPhone('+8801712345678'), '01712345678');
      assert.strictEqual(normalizeBdPhone('8801712345678'), '01712345678');
      assert.strictEqual(normalizeBdPhone('01712-345678'), '01712345678');
      assert.strictEqual(normalizeBdPhone('(01712) 345 678'), '01712345678');
      assert.strictEqual(normalizeBdPhone('০১৭০১২৩৪৫৬৭'), '01701234567');
      assert.strictEqual(normalizeBdPhone('+৮৮০১৭০১২৩৪৫৬৭'), '01701234567');
      assert.strictEqual(normalizeBdPhone('017০১-২৩৪৫৬৭'), '01701234567');
      assert.ok(isValidBdPhone('০১৭০১২৩৪৫৬৭'));
      assert.strictEqual(normalizeBdPhone('+8801012345678'), null, 'Invalid prefix after normalization must return null');
    });

    it('accurately identifies operator names', () => {
      assert.strictEqual(getBdPhoneOperator('01711223344'), 'Grameenphone');
      assert.strictEqual(getBdPhoneOperator('01311223344'), 'Grameenphone');
      assert.strictEqual(getBdPhoneOperator('01811223344'), 'Robi/Airtel');
      assert.strictEqual(getBdPhoneOperator('01611223344'), 'Robi/Airtel');
      assert.strictEqual(getBdPhoneOperator('01911223344'), 'Banglalink');
      assert.strictEqual(getBdPhoneOperator('01411223344'), 'Banglalink');
      assert.strictEqual(getBdPhoneOperator('01511223344'), 'Teletalk');
      assert.strictEqual(getBdPhoneOperator('01211223344'), 'Unknown');
    });
  });

  // --- 3. Poisha Currency & Duplex Pricing Math Engine (Decisions #1 & #2) ---
  describe('Poisha Currency & Dynamic Duplex Pricing Engine', () => {
    it('converts BDT to integer Poisha with zero floating-point rounding errors', () => {
      assert.strictEqual(toPoisha('12.50'), 1250);
      assert.strictEqual(toPoisha(12.5), 1250);
      assert.strictEqual(toPoisha('0.05'), 5);
      assert.strictEqual(toPoisha('100'), 10000);
      assert.strictEqual(fromPoisha(1250), 12.50);
      assert.strictEqual(fromPoisha(5), 0.05);
    });

    it('formats Poisha to BDT string with standard and Bangla numerals', () => {
      assert.strictEqual(formatBdt(1250), '৳12.50');
      assert.strictEqual(formatBdt(1250, { bangla: true }), '৳১২.৫০');
      assert.strictEqual(toBanglaDigits('1234567890'), '১২৩৪৫৬৭৮৯০');
      assert.strictEqual(fromBanglaDigits('১২৩৪৫৬৭৮৯০'), '1234567890');
    });

    it('calculates simplex pricing accurately', () => {
      const result = calculateDynamicDuplex({
        totalPages: 5,
        mode: 'simplex',
        baseSimplexSideRatePoisha: 200, // ৳2.00
        copies: 2,
      });

      assert.strictEqual(result.mode, 'simplex');
      assert.strictEqual(result.totalSheets, 10);
      assert.strictEqual(result.totalSides, 10);
      assert.strictEqual(result.totalPoisha, 2000); // 10 sides * 200 Poisha = 2000 Poisha (৳20.00)
    });

    it('calculates Dynamic Duplex Model A (flat sheet fee) with odd-page distribution', () => {
      // 5-page document printed duplex:
      // 2 duplex sheets (4 sides) @ 350 Poisha/sheet = 700 Poisha
      // 1 simplex sheet (1 odd side) @ 200 Poisha/sheet = 200 Poisha
      // Cost per copy = 900 Poisha
      const result = calculateDynamicDuplex({
        totalPages: 5,
        mode: 'duplex',
        duplexModel: 'model_a',
        baseSimplexSideRatePoisha: 200,
        flatDuplexSheetRatePoisha: 350,
        copies: 3,
      });

      assert.strictEqual(result.duplexSheets, 6); // 2 per copy * 3 copies
      assert.strictEqual(result.simplexSheets, 3); // 1 per copy * 3 copies
      assert.strictEqual(result.totalSheets, 9);
      assert.strictEqual(result.costPerCopyPoisha, 900);
      assert.strictEqual(result.totalPoisha, 2700);
    });

    it('calculates Dynamic Duplex Model B (discounted second side rate) with odd-page distribution', () => {
      // 5-page document printed duplex:
      // 2 front sides @ 200 Poisha = 400 Poisha
      // 2 back sides @ 20% discount (160 Poisha) = 320 Poisha
      // 1 odd page front side @ 200 Poisha = 200 Poisha
      // Total per copy = 400 + 320 + 200 = 920 Poisha
      const result = calculateDynamicDuplex({
        totalPages: 5,
        mode: 'duplex',
        duplexModel: 'model_b',
        baseSimplexSideRatePoisha: 200,
        duplexDiscountPercent: 20,
        copies: 1,
      });

      assert.strictEqual(result.costPerCopyPoisha, 920);
      assert.strictEqual(result.totalPoisha, 920);
      assert.strictEqual(result.lineItems.length, 3);
    });

    it('enforces minimum order floor and basis-point VAT calculations', () => {
      // Subtotal: 300 Poisha. Floor: 500 Poisha. VAT: 500 bp (5.00%).
      // Effective subtotal becomes 500 Poisha (floor adjustment 200 Poisha).
      // VAT: 5% of 500 = 25 Poisha.
      // Total: 525 Poisha.
      const result = calculateTaxAndTotal({
        subtotalPoisha: 300,
        minimumOrderFloorPoisha: 500,
        vatBasisPoints: 500,
      });

      assert.strictEqual(result.floorAdjustmentPoisha, 200);
      assert.strictEqual(result.vatPoisha, 25);
      assert.strictEqual(result.totalPoisha, 525);
    });
  });

  // --- 4. Cryptographic Utilities ---
  describe('Cryptographic Utilities', () => {
    it('computes deterministic SHA-256 and HMAC-SHA256 digests', () => {
      const data = 'PrintFlow Immutable Quote v1';
      const hash = sha256(data);
      assert.strictEqual(hash.length, 64);
      assert.strictEqual(hash, sha256(data), 'Hash must be deterministic');

      const secret = 'super-secret-key';
      const hmac = hmacSha256(secret, data);
      assert.strictEqual(hmac.length, 64);
      assert.notStrictEqual(hmac, hash);
    });

    it('verifies raw-byte webhook signatures and detects forged payloads', () => {
      const secret = 'webhook-signing-secret';
      const body = '{"event":"order.paid","amount":1250}';
      const validSig = hmacSha256(secret, body);

      assert.ok(verifyRawSignature(body, validSig, secret));
      assert.strictEqual(verifyRawSignature(body, 'bad-signature-hex', secret), false);
      assert.strictEqual(verifyRawSignature(body + 'tampered', validSig, secret), false);
    });

    it('generates standard UUID correlation IDs and 6-digit agent pairing PINs', () => {
      const cid = generateCorrelationId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(cid), `Expected valid UUID v4, got ${cid}`);

      const pin = generateAgentPairingCode();
      assert.ok(/^\d{6}$/.test(pin), `Expected 6-digit pairing PIN, got ${pin}`);
    });
  });

  // --- 5. Fixtures & Magic Byte File Inspection ---
  describe('Test Fixtures & Magic Byte Verification', () => {
    it('generates syntactically valid single-page PDF with %PDF-1.4 header', () => {
      const pdfBuffer = createValidSinglePagePdf();
      assert.ok(pdfBuffer.length > 300);
      assert.strictEqual(pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');
      assert.ok(pdfBuffer.toString('utf8').includes('%%EOF'));
    });

    it('generates syntactically valid 5-page PDF for duplex odd-page testing', () => {
      const multiPdfBuffer = createValidMultiPagePdf(5);
      const str = multiPdfBuffer.toString('utf8');
      assert.strictEqual(multiPdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');
      assert.ok(str.includes('/Count 5'), 'PDF must declare 5 pages in Pages dictionary');
      assert.ok(str.includes('%%EOF'));
    });

    it('generates corrupted header PDF and disguised fake EXE', () => {
      const corrupted = createCorruptedHeaderPdf();
      assert.notStrictEqual(corrupted.subarray(0, 5).toString('ascii'), '%PDF-');

      const disguisedExe = createDisguisedExePdf();
      // 'MZ' magic bytes for DOS/PE executable (Scenario 3)
      assert.strictEqual(disguisedExe[0], 0x4D); // 'M'
      assert.strictEqual(disguisedExe[1], 0x5A); // 'Z'
    });

    it('generates valid PNG and JPEG image buffers', () => {
      const png = createSamplePng();
      // PNG magic header: 89 50 4E 47 0D 0A 1A 0A
      assert.deepStrictEqual(Array.from(png.subarray(0, 8)), [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

      const jpg = createSampleJpeg();
      // JPEG SOI: FF D8 FF
      assert.strictEqual(jpg[0], 0xFF);
      assert.strictEqual(jpg[1], 0xD8);
      assert.strictEqual(jpg[2], 0xFF);
    });

    it('generates password-encrypted PDF containing /Encrypt dictionary', () => {
      const encPdf = createPasswordEncryptedPdf();
      const str = encPdf.toString('utf8');
      assert.strictEqual(encPdf.subarray(0, 5).toString('ascii'), '%PDF-');
      assert.ok(str.includes('/Encrypt'), 'Must contain /Encrypt dictionary');
      assert.ok(str.includes('/Standard'), 'Must use standard security handler');
    });

    it('verifies standard EICAR antivirus test string', () => {
      const eicar = createEicarTestString();
      assert.ok(eicar.startsWith('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR'));
    });

    it('verifies all fixture files exist on disk in fixtures directory', () => {
      for (const [key, path] of Object.entries(FIXTURE_PATHS)) {
        assert.ok(existsSync(path), `Fixture file missing on disk: ${key} (${path})`);
        const content = readFileSync(path);
        assert.ok(content.length > 0, `Fixture file is empty: ${path}`);
      }
    });
  });

  // --- 6. API Client Envelope & Headers ---
  describe('API Client Envelope & Scoping Headers', () => {
    it('injects standard correlation ID, tenant ID, and edition headers', () => {
      const client = new ApiClient({
        tenantId: 'shop_dhaka_01',
        edition: 'standalone',
        token: 'sanctum_test_token_123',
      });

      const headers = client.buildHeaders();
      assert.strictEqual(headers.get('Accept'), 'application/json');
      assert.strictEqual(headers.get('X-Tenant-ID'), 'shop_dhaka_01');
      assert.strictEqual(headers.get('X-App-Edition'), 'standalone');
      assert.strictEqual(headers.get('Authorization'), 'Bearer sanctum_test_token_123');
      assert.ok(headers.get('X-Correlation-ID'), 'Must include X-Correlation-ID');
    });

    it('parses standard PrintFlow { data, meta, errors } response envelope', async () => {
      const mockFetch = async () => {
        const body = JSON.stringify({
          data: { id: 'order_123', status: 'PAID' },
          meta: { correlation_id: 'corr-999', server_time: '2026-11-24T12:00:00Z' },
          errors: null,
        });

        return new Response(body, {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-correlation-id': 'corr-999',
          },
        });
      };

      const client = new ApiClient({ customFetch: mockFetch });
      const res = await client.get('/api/v1/orders/token123');

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.id, 'order_123');
      assert.strictEqual(res.meta.correlation_id, 'corr-999');
      assert.strictEqual(res.errors, null);
      assert.strictEqual(res.correlationId, 'corr-999');
    });

    it('extracts errors on 422 unprocessable entity envelope', async () => {
      const mockFetch = async () => {
        const body = JSON.stringify({
          data: null,
          meta: { correlation_id: 'corr-err-1' },
          errors: [
            { field: 'customer_phone', message: 'The customer phone format is invalid.' },
          ],
        });

        return new Response(body, {
          status: 422,
          headers: { 'content-type': 'application/json' },
        });
      };

      const client = new ApiClient({ customFetch: mockFetch });
      const res = await client.post('/api/v1/storefront/orders', { customerPhone: '010123' });

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 422);
      assert.strictEqual(res.errors.length, 1);
      assert.strictEqual(res.errors[0].field, 'customer_phone');
    });
  });

  // --- 7. WebSocket Client Mock ---
  describe('WebSocket Client Protocol & Events', () => {
    it('connects, subscribes to presence channels, and handles event wait loop in mock mode', async () => {
      const ws = new WsClient({ mock: true });

      const socketId = await ws.connect();
      assert.ok(socketId.startsWith('mock-socket-'));
      assert.strictEqual(ws.connected, true);

      ws.subscribe('presence-tenant.default.agents');
      assert.ok(ws.channels.has('presence-tenant.default.agents'));

      // Test waitForEvent helper with simulated incoming event
      const waitPromise = ws.waitForEvent('App\\Events\\OrderStatusChanged', 2000);
      ws.simulateServerEvent('App\\Events\\OrderStatusChanged', 'order.test_token', {
        status: 'PRINTING',
        orderToken: 'test_token',
      });

      const eventPayload = await waitPromise;
      assert.strictEqual(eventPayload.channel, 'order.test_token');
      assert.strictEqual(eventPayload.data.status, 'PRINTING');

      ws.disconnect();
      assert.strictEqual(ws.connected, false);
    });
  });

  // --- 8. Mock Payment Gateway Helper ---
  describe('Payment Gateway Mock Library', () => {
    it('generates valid SSLCOMMERZ v4 session response and IPN with correct verify_sign hash', () => {
      const tranId = 'PF_TX_123456';
      const amount = '50.00';
      const storePassword = 'secret_store_password';

      const sessionRes = MockGateway.createSslSessionResponse({ tranId, amount });
      assert.strictEqual(sessionRes.status, 'SUCCESS');
      assert.strictEqual(sessionRes.tran_id, tranId);
      assert.ok(sessionRes.GatewayPageURL.includes('sandbox.sslcommerz.com'));

      const ipnPayload = MockGateway.createSslIpnPayload({
        tranId,
        valId: 'VAL_998877',
        amount,
        storePassword,
      });

      assert.strictEqual(ipnPayload.status, 'VALID');
      assert.strictEqual(ipnPayload.tran_id, tranId);
      assert.ok(ipnPayload.verify_sign, 'Must contain computed verify_sign');
      assert.ok(ipnPayload.verify_key.includes('tran_id'));

      assert.strictEqual(MockGateway.validateSslIpn(ipnPayload, storePassword), true, 'Valid IPN payload signature must verify');

      // Tampered payload has mismatched amount, so signature verification must fail
      const tampered = MockGateway.createTamperedSslIpnPayload(ipnPayload);
      assert.strictEqual(tampered.amount, '99999.00');
      assert.strictEqual(MockGateway.validateSslIpn(tampered, storePassword), false, 'Tampered IPN payload must fail verification');
    });

    it('generates bKash Tokenized Checkout create, execute, and query payloads', () => {
      const createRes = MockGateway.createBkashCreatePaymentResponse({
        amount: '25.00',
        merchantInvoiceNumber: 'INV_1001',
      });
      assert.strictEqual(createRes.statusCode, '0000');
      assert.ok(createRes.paymentID.startsWith('TR0011'));
      assert.ok(createRes.bkashURL.includes('sandbox.payment.bkash.com'));

      const execRes = MockGateway.createBkashExecutePaymentResponse({
        paymentId: createRes.paymentID,
        amount: '25.00',
      });
      assert.strictEqual(execRes.statusCode, '0000');
      assert.strictEqual(execRes.transactionStatus, 'Completed');
      assert.ok(execRes.trxID.startsWith('BKASH_'));

      const errRes = MockGateway.createBkashErrorResponse('2023');
      assert.strictEqual(errRes.statusCode, '2023');
      assert.strictEqual(errRes.statusMessage, 'Insufficient Balance in Customer Wallet');
    });

    it('simulates sandbox payment gateway flow with idempotency hash', () => {
      const payment = MockGateway.simulateSandboxPayment({
        orderToken: 'ord_token_abc',
        amountPoisha: 1250,
        outcome: 'success',
      });

      assert.strictEqual(payment.status, 'PAID');
      assert.strictEqual(payment.amountPoisha, 1250);
      assert.ok(payment.transactionId.startsWith('SNDBX_'));
      assert.strictEqual(payment.idempotencyKey.length, 64);
    });
  });

});
