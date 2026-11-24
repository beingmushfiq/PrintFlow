/**
 * PrintFlow End-to-End Test Harness & Service Simulator
 *
 * Implements full-fidelity mock server dispatching for:
 * - Opaque-box REST API matching PrintFlow specifications
 * - Strict Standard Envelope { data, meta, errors }
 * - Mandatory Bangladeshi 11-digit phone intake validation
 * - Magic byte inspection & Poppler page extraction simulation
 * - Dynamic Duplex (Model A & B) integer Poisha pricing engine
 * - Immutable quote snapshots with SHA-256 calculation hash
 * - Payment Gateway adapters (SSLCOMMERZ v4, bKash Tokenized, Sandbox)
 * - Atomic Transactional Outbox processor
 * - Print Agent lease protocol with atomic locking and 300s TTL
 * - Ephemeral document lifecycle and storage shredding
 * - Standalone edition lockdown (404 on SaaS platform routes)
 * - Owner operational console and real-time Reverb WebSocket broadcasts
 */

import {
  isValidBdPhone,
  normalizeBdPhone,
  toPoisha,
  fromPoisha,
  formatBdt,
  toBanglaDigits,
  calculateDynamicDuplex,
  calculateTaxAndTotal,
  sha256,
  md5,
  hmacSha256,
  generateCorrelationId,
  generateAgentPairingCode,
  MockGateway,
  createValidSinglePagePdf,
  createValidMultiPagePdf,
  createCorruptedHeaderPdf,
  createDisguisedExePdf,
  createPasswordEncryptedPdf,
  createEicarTestString,
} from '../../src/index.js';

export class PrintFlowTestHarness {
  constructor(options = {}) {
    this.edition = options.edition || 'standalone';
    this.defaultTenantId = options.tenantId || 'tenant_standalone_default';
    this.sslStorePassword = options.sslStorePassword || 'test_store_passwd';
    this.bkashAppSecret = options.bkashAppSecret || 'test_bkash_secret';

    this.reset();
  }

  /**
   * Resets all in-memory database stores and state.
   */
  reset() {
    this.tenants = new Map([
      [
        this.defaultTenantId,
        {
          id: this.defaultTenantId,
          slug: 'printflow-dhaka',
          name: 'PrintFlow Dhaka Primary Tenant',
          edition: this.edition,
          createdAt: new Date().toISOString(),
        },
      ],
    ]);

    this.shops = new Map([
      [
        'shop_dhaka_01',
        {
          id: 'shop_dhaka_01',
          tenantId: this.defaultTenantId,
          slug: 'nilkhet-central',
          name: 'PrintFlow Nilkhet Central',
          address: 'Shop 14, Nilkhet Super Market, Dhaka 1205',
          contactPhone: '01712345678',
          defaultPrinterId: 'printer_canon_ir2520',
          isActive: true,
          businessHours: '09:00 - 22:00',
        },
      ],
    ]);

    this.priceProfiles = new Map([
      [
        'profile_default',
        {
          id: 'profile_default',
          shopId: 'shop_dhaka_01',
          name: 'Standard Academic Nilkhet Rate',
          baseSimplexSideRatePoisha: 200, // ৳2.00
          duplexModel: 'model_b', // Model B: Discounted side rate
          duplexSecondSideRatePoisha: 160, // ৳1.60 (20% discount on 2nd side)
          duplexDiscountPercent: 20,
          flatDuplexSheetRatePoisha: 360, // Model A: ৳3.60 per sheet
          minimumOrderFloorPoisha: 500, // ৳5.00 min floor
          vatBasisPoints: 500, // 5% VAT (500 bps)
          serviceFeePoisha: 0,
        },
      ],
    ]);

    this.users = new Map([
      [
        'owner@nilkhetprint.com',
        {
          id: 'usr_owner_01',
          email: 'owner@nilkhetprint.com',
          passwordHash: 'sha256_mock_hash_password123',
          name: 'Rafiqul Islam',
          role: 'owner',
          token: null,
        },
      ],
    ]);

    this.files = new Map();
    this.quotes = new Map();
    this.orders = new Map();
    this.outbox = [];
    this.printJobs = new Map();
    this.agents = new Map();
    this.printers = new Map([
      [
        'printer_canon_ir2520',
        {
          id: 'printer_canon_ir2520',
          name: 'Canon imageRUNNER 2520',
          supportsDuplex: true,
          supportsColor: false,
          status: 'online',
          trays: ['A4', 'Legal'],
        },
      ],
      [
        'printer_epson_l805',
        {
          id: 'printer_epson_l805',
          name: 'Epson L805 Color Photo',
          supportsDuplex: false,
          supportsColor: true,
          status: 'online',
          trays: ['A4', '4x6'],
        },
      ],
    ]);

    this.pairingPins = new Map();
    this.orderTimelines = new Map();
    this.auditLogs = [];
    this.agentJournal = new Map();
    this.gatewayCredentials = {
      sslcommerz: { storeId: 'nilkhet_ssl_live', storePassEncrypted: 'enc_sec_123', maskedPass: '••••••••' },
      bkash: { appKey: 'bkash_app_key_99', appSecretEncrypted: 'enc_sec_456', maskedSecret: '••••••••' },
    };

    // Subscribed WebSocket clients
    this.wsSubscribers = new Set();
  }

  // --- WebSocket Broadcast Helper ---
  attachWsClient(wsClient) {
    this.wsSubscribers.add(wsClient);
    wsClient.on('disconnect', () => {
      this.wsSubscribers.delete(wsClient);
    });
  }

  broadcastWs(channel, event, data) {
    for (const ws of this.wsSubscribers) {
      if (ws.channels && ws.channels.has(channel)) {
        ws.simulateServerEvent(event, channel, data);
      }
    }
  }

  // --- Outbox Processor ---
  processOutbox() {
    const pendingEvents = this.outbox.filter((evt) => evt.status === 'pending');
    for (const event of pendingEvents) {
      if (event.eventType === 'order.paid') {
        const order = this.orders.get(event.payload.orderId) || this.orders.get(event.payload.orderToken);
        if (order) {
          order.status = 'QUEUED';
          this.logOrderTimeline(order.token, 'QUEUED', 'Outbox processor enqueued print jobs');

          // Split files into individual print jobs
          const quote = this.quotes.get(order.quoteToken);
          const files = quote && quote.files && quote.files.length > 0
            ? quote.files
            : [{ fileToken: 'file_default', copies: 1 }];

          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const fileRecord = this.files.get(f.fileToken);
            const jobId = `job_${order.id}_${i + 1}`;
            const idempotencyKey = sha256(`${order.id}_${f.fileToken || i}_1`);

            this.printJobs.set(jobId, {
              id: jobId,
              orderId: order.id,
              orderToken: order.token,
              fileId: f.fileToken || `file_${i + 1}`,
              fileName: fileRecord ? fileRecord.fileName : 'document.pdf',
              totalPages: fileRecord ? fileRecord.pageCount : (f.pageCount || 1),
              copies: f.copies || order.options?.copies || 1,
              mode: order.options?.mode || 'duplex',
              color: order.options?.color || 'mono',
              paperSize: order.options?.paperSize || 'A4',
              priority: 1, // Standard walk-in priority
              status: 'pending',
              idempotencyKey,
              leasedBy: null,
              leasedAt: null,
              leaseExpiresAt: null,
              spoolerJobId: null,
              attempts: 0,
              createdAt: Date.now(),
            });
          }

          this.broadcastWs(`order.${order.token}`, 'App\\Events\\OrderStatusChanged', {
            orderToken: order.token,
            status: 'QUEUED',
          });
          this.broadcastWs(`presence-tenant.${this.defaultTenantId}.agents`, 'App\\Events\\QueueUpdated', {
            pendingJobs: Array.from(this.printJobs.values()).filter((j) => j.status === 'pending').length,
          });
        }
      } else if (event.eventType === 'file.purge') {
        const fileId = event.payload.fileId;
        const file = this.files.get(fileId);
        if (file) {
          file.status = 'purged';
          file.buffer = null; // Memory/storage wiped
          this.auditLogs.push({
            event: 'FILE_PURGED',
            fileId,
            purgedAt: new Date().toISOString(),
          });
        }
      }
      event.status = 'processed';
    }
  }

  // --- Stale Lease Reconciler ---
  reconcileStaleLeases() {
    const now = Date.now();
    let reconciledCount = 0;
    for (const job of this.printJobs.values()) {
      if (job.status === 'leased' && job.leaseExpiresAt && job.leaseExpiresAt < now) {
        job.status = 'pending';
        job.leasedBy = null;
        job.leasedAt = null;
        job.leaseExpiresAt = null;
        job.attempts = (job.attempts || 0) + 1;
        reconciledCount++;
      }
    }
    return reconciledCount;
  }

  logOrderTimeline(orderToken, status, description, actor = 'System') {
    const events = this.orderTimelines.get(orderToken) || [];
    events.push({
      status,
      description,
      actor,
      timestamp: new Date().toISOString(),
    });
    this.orderTimelines.set(orderToken, events);
  }

  // --- Standard Response Formatter ---
  createEnvelope(data, status = 200, errors = null, correlationId = generateCorrelationId()) {
    const body = {
      data,
      meta: {
        correlation_id: correlationId,
        server_time: new Date().toISOString(),
        edition: this.edition,
        tenant_id: this.defaultTenantId,
      },
      errors,
    };

    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Tenant-ID': this.defaultTenantId,
        'X-App-Edition': this.edition,
      },
    });
  }

  /**
   * Main fetch dispatcher to plug into ApiClient({ customFetch })
   */
  getFetchHandler() {
    return async (url, options = {}) => {
      const parsedUrl = new URL(url, 'http://localhost:8000');
      const pathname = parsedUrl.pathname;
      const method = (options.method || 'GET').toUpperCase();
      const headers = new Headers(options.headers || {});
      const correlationId = headers.get('X-Correlation-ID') || generateCorrelationId();
      const edition = headers.get('X-App-Edition') || this.edition;
      const authHeader = headers.get('Authorization') || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

      let body = {};
      if (options.body) {
        try {
          body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        } catch (e) {
          body = options.body;
        }
      }

      // --- 1. Standalone Edition Gate (Feature 66, 67, Scenario 12) ---
      // If standalone edition is active, block /api/v1/platform/* routes with 404 Not Found
      if (edition === 'standalone' && pathname.startsWith('/api/v1/platform/')) {
        return this.createEnvelope(
          null,
          404,
          [{ message: 'Platform administration route not found in standalone edition' }],
          correlationId
        );
      }

      // SaaS platform routes if not blocked by standalone gate
      if (pathname.startsWith('/api/v1/platform/')) {
        return this.createEnvelope(
          { tenants: Array.from(this.tenants.values()), edition },
          200,
          null,
          correlationId
        );
      }

      // --- 2. System Health & Production Smoke (Scenario 35) ---
      if (pathname === '/health' || pathname === '/api/health') {
        return this.createEnvelope(
          {
            status: 'healthy',
            database: 'connected',
            redis: 'connected',
            minio: 'connected',
            edition,
          },
          200,
          null,
          correlationId
        );
      }

      // --- 3. QR Code Placard & Studio Assets (Feature 18, Scenario 15) ---
      if (method === 'GET' && pathname.includes('/qr/')) {
        const shop = this.shops.get('shop_dhaka_01');
        const canonicalUrl = `https://printflow.local/s/${shop.slug}`;
        if (pathname.endsWith('/pdf')) {
          const pdfMockBuffer = Buffer.from(`%PDF-1.4 Placard for ${shop.name} QR=${canonicalUrl} %%EOF`);
          return new Response(pdfMockBuffer, {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="placard-${shop.slug}.pdf"`,
            },
          });
        }
        if (pathname.endsWith('/svg')) {
          const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><text>${canonicalUrl}</text></svg>`;
          return new Response(svgContent, {
            status: 200,
            headers: { 'Content-Type': 'image/svg+xml' },
          });
        }
        return this.createEnvelope({ qrUrl: canonicalUrl }, 200, null, correlationId);
      }

      // --- 4. Public Storefront (Feature 19) ---
      if (method === 'GET' && pathname.startsWith('/api/v1/storefront/')) {
        const slug = decodeURIComponent(pathname.replace('/api/v1/storefront/', ''));
        const shop = Array.from(this.shops.values()).find((s) => s.slug === slug);
        if (!shop) {
          return this.createEnvelope(null, 404, [{ message: 'Shop storefront not found' }], correlationId);
        }

        const profile = this.priceProfiles.get('profile_default');
        return this.createEnvelope(
          {
            shop: {
              id: shop.id,
              name: shop.name,
              slug: shop.slug,
              address: shop.address,
              contactPhone: shop.contactPhone,
              businessHours: shop.businessHours,
            },
            priceGuide: {
              simplexBaseRatePoisha: profile.baseSimplexSideRatePoisha,
              duplexModel: profile.duplexModel,
              duplexSecondSideRatePoisha: profile.duplexSecondSideRatePoisha,
              minimumFloorPoisha: profile.minimumOrderFloorPoisha,
              vatPercent: profile.vatBasisPoints / 100,
            },
            qrPlacardUrl: `/api/v1/shop/${shop.id}/qr/pdf`,
          },
          200,
          null,
          correlationId
        );
      }

      // --- 5. Presigned File Upload & Validation (Features 22, 24, 25, 26, 27) ---
      if (method === 'POST' && pathname === '/api/v1/storefront/upload-url') {
        const { fileName, mimeType, fileSize, buffer: inputBuffer } = body;

        let buffer = inputBuffer;
        if (!buffer) {
          if (fileName && fileName.includes('fake') && fileName.endsWith('.pdf')) {
            buffer = createDisguisedExePdf();
          } else if (fileName && fileName.includes('corrupt')) {
            buffer = createCorruptedHeaderPdf();
          } else if (fileName && fileName.includes('encrypted')) {
            buffer = createPasswordEncryptedPdf();
          } else if (fileName && fileName.includes('eicar')) {
            buffer = Buffer.from(createEicarTestString());
          } else if (mimeType && mimeType.includes('png')) {
            buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
          } else {
            buffer = createValidSinglePagePdf();
          }
        }

        const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);

        // A. ClamAV Antivirus Check (Scenario 28) - Runs first on raw input
        const fileStr = buf.toString('utf8', 0, Math.min(buf.length, 4096));
        if (fileStr.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) {
          const fileToken = `file_infected_${Date.now()}`;
          this.files.set(fileToken, {
            id: fileToken,
            fileName: fileName || 'eicar.txt',
            status: 'quarantined',
            isMalicious: true,
          });
          return this.createEnvelope(
            null,
            422,
            [
              {
                field: 'file',
                message: 'Malware detected by ClamAV: file quarantined',
                code: 'MALWARE_DETECTED',
              },
            ],
            correlationId
          );
        }

        // B. Magic Byte Check: Disguised Executable (Scenario 3)
        if (buf.length >= 2 && buf[0] === 0x4D && buf[1] === 0x5A) {
          return this.createEnvelope(
            null,
            422,
            [{ field: 'file', message: 'File signature does not match allowed MIME types (PDF, PNG, JPEG)' }],
            correlationId
          );
        }

        // C. Corrupted PDF Header Check (Scenario 22)
        if (mimeType === 'application/pdf' || (fileName && fileName.toLowerCase().endsWith('.pdf'))) {
          if (buf.length < 5 || buf.subarray(0, 5).toString('ascii') !== '%PDF-') {
            return this.createEnvelope(
              null,
              422,
              [{ field: 'file', message: 'Corrupted PDF file header' }],
              correlationId
            );
          }
        }

        // D. Password Protected PDF Check (Scenario 4)
        if (fileStr.includes('/Encrypt')) {
          return this.createEnvelope(
            null,
            422,
            [
              {
                field: 'file',
                message: 'পাসওয়ার্ড সুরক্ষিত পিডিএফ ফাইল গ্রহণ করা হয় না (Password-protected PDF files are not accepted)',
                code: 'PASSWORD_PROTECTED_PDF',
              },
            ],
            correlationId
          );
        }

        // E. Poppler Page Count Extraction (Feature 26)
        let pageCount = body.pageCount || 1;
        if (!body.pageCount) {
          if (fileStr.includes('/Count 5') || (buf.length > 1000 && buf.length < 5000)) {
            pageCount = 5;
          } else if (fileStr.includes('/Count 10')) {
            pageCount = 10;
          }
        }

        const fileToken = `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        this.files.set(fileToken, {
          id: fileToken,
          fileName: fileName || 'document.pdf',
          mimeType: mimeType || 'application/pdf',
          fileSize: fileSize || buf.length,
          pageCount,
          buffer: buf,
          checksum: sha256(buf),
          status: 'ready',
        });

        return this.createEnvelope(
          {
            fileToken,
            uploadUrl: `https://minio.printflow.local/bucket/${fileToken}?X-Amz-Signature=test`,
            fileName: fileName || 'document.pdf',
            pageCount,
            fileSize: fileSize || buf.length,
          },
          201,
          null,
          correlationId
        );
      }

      // --- 6. Interactive Quote Calculation (Features 30, 31, 32) ---
      if (method === 'POST' && pathname === '/api/v1/storefront/quote') {
        const { files = [], options: printOpts = {} } = body;
        const profile = this.priceProfiles.get('profile_default');

        const mode = printOpts.mode || 'duplex';
        const copies = printOpts.copies || 1;
        const duplexModel = printOpts.duplexModel || profile.duplexModel;
        const baseRate = printOpts.baseSimplexSideRatePoisha !== undefined
          ? printOpts.baseSimplexSideRatePoisha
          : profile.baseSimplexSideRatePoisha;
        const duplexDiscountPercent = printOpts.duplexDiscountPercent !== undefined
          ? printOpts.duplexDiscountPercent
          : profile.duplexDiscountPercent;
        const flatDuplexSheetRate = printOpts.flatDuplexSheetRatePoisha !== undefined
          ? printOpts.flatDuplexSheetRatePoisha
          : profile.flatDuplexSheetRatePoisha;

        let totalSubtotalPoisha = 0;
        let totalSheets = 0;
        let totalSides = 0;
        const itemizedLines = [];

        for (const fileItem of files) {
          const fileRecord = this.files.get(fileItem.fileToken) || { pageCount: fileItem.pageCount || 1 };
          const fileCopies = fileItem.copies || copies;

          const duplexCalc = calculateDynamicDuplex({
            totalPages: fileRecord.pageCount,
            mode: fileItem.mode || mode,
            duplexModel,
            baseSimplexSideRatePoisha: baseRate,
            duplexDiscountPercent,
            flatDuplexSheetRatePoisha: flatDuplexSheetRate,
            copies: fileCopies,
          });

          totalSubtotalPoisha += duplexCalc.subtotalPoisha;
          totalSheets += duplexCalc.totalSheets;
          totalSides += duplexCalc.totalSides;
          itemizedLines.push(...duplexCalc.lineItems);
        }

        const taxCalc = calculateTaxAndTotal({
          subtotalPoisha: totalSubtotalPoisha,
          vatBasisPoints: profile.vatBasisPoints,
          minimumOrderFloorPoisha: profile.minimumOrderFloorPoisha,
          serviceFeePoisha: profile.serviceFeePoisha,
        });

        const quoteToken = `qt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const calculationHash = sha256(JSON.stringify({
          files,
          totalPoisha: taxCalc.totalPoisha,
          subtotalPoisha: taxCalc.subtotalPoisha,
          taxPoisha: taxCalc.vatPoisha,
        }));

        const quoteData = {
          quoteToken,
          calculationHash,
          mode,
          duplexModel,
          totalSheets,
          totalSides,
          subtotalPoisha: taxCalc.subtotalPoisha,
          floorAdjustmentPoisha: taxCalc.floorAdjustmentPoisha,
          taxPoisha: taxCalc.vatPoisha,
          serviceFeePoisha: taxCalc.serviceFeePoisha,
          totalPoisha: taxCalc.totalPoisha,
          totalBdt: fromPoisha(taxCalc.totalPoisha),
          totalFormatted: formatBdt(taxCalc.totalPoisha),
          totalBanglaFormatted: formatBdt(taxCalc.totalPoisha, { bangla: true }),
          lineItems: itemizedLines,
          files,
          expiresAt: Date.now() + 15 * 60 * 1000, // 15m TTL
        };

        this.quotes.set(quoteToken, quoteData);

        return this.createEnvelope(quoteData, 200, null, correlationId);
      }

      // --- 7. Customer Order Submission (Features 20, 39, 40) ---
      if (method === 'POST' && pathname === '/api/v1/storefront/orders') {
        const { customerPhone, quoteToken, paymentGateway = 'sandbox', idempotencyKey } = body;

        // A. BD Phone Validation (Decision #3)
        const normalizedPhone = normalizeBdPhone(customerPhone);
        if (!normalizedPhone || !isValidBdPhone(normalizedPhone)) {
          return this.createEnvelope(
            null,
            422,
            [{ field: 'customer_phone', message: 'The customer phone format is invalid.' }],
            correlationId
          );
        }

        // B. Quote Validation
        const quote = this.quotes.get(quoteToken);
        if (!quote) {
          return this.createEnvelope(null, 422, [{ field: 'quote_token', message: 'Quote snapshot not found' }], correlationId);
        }

        if (quote.expiresAt < Date.now()) {
          return this.createEnvelope(null, 422, [{ field: 'quote_token', message: 'Quote snapshot has expired' }], correlationId);
        }

        // C. Double-Click / Idempotency Guard (Scenario 6)
        if (idempotencyKey) {
          const existingOrder = Array.from(this.orders.values()).find((o) => o.idempotencyKey === idempotencyKey);
          if (existingOrder) {
            return this.createEnvelope(
              existingOrder,
              409,
              [{ message: 'Duplicate transaction detected; checkout already submitted.' }],
              correlationId
            );
          }
        }

        const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const orderToken = `tok_${Math.random().toString(36).slice(2, 12)}`;

        const newOrder = {
          id: orderId,
          token: orderToken,
          tenantId: this.defaultTenantId,
          shopId: 'shop_dhaka_01',
          customerPhone: normalizedPhone,
          quoteToken,
          amountPoisha: quote.totalPoisha,
          status: 'PENDING_PAYMENT',
          paymentGateway,
          idempotencyKey: idempotencyKey || null,
          options: { mode: quote.mode },
          createdAt: Date.now(),
        };

        this.orders.set(orderId, newOrder);
        this.orders.set(orderToken, newOrder);
        this.logOrderTimeline(orderToken, 'PENDING_PAYMENT', 'Order created, awaiting payment');

        let checkoutUrl = `/checkout/${orderToken}`;
        if (paymentGateway === 'sslcommerz') {
          checkoutUrl = `https://sandbox.sslcommerz.com/EasyCheckOut/testcasereq.php?token=${orderToken}`;
        } else if (paymentGateway === 'bkash') {
          checkoutUrl = `https://sandbox.payment.bkash.com/redirect/${orderToken}`;
        }

        return this.createEnvelope(
          {
            orderId,
            orderToken,
            status: 'PENDING_PAYMENT',
            amountPoisha: quote.totalPoisha,
            checkoutUrl,
          },
          201,
          null,
          correlationId
        );
      }

      // --- 8. Order Status & Timeline (Feature 42, Scenario 21) ---
      if (method === 'GET' && pathname.startsWith('/api/v1/orders/')) {
        const orderToken = decodeURIComponent(pathname.replace('/api/v1/orders/', ''));
        const order = this.orders.get(orderToken);
        if (!order) {
          return this.createEnvelope(null, 404, [{ message: 'Order not found' }], correlationId);
        }

        const quote = this.quotes.get(order.quoteToken);
        const timeline = this.orderTimelines.get(order.token) || [];

        return this.createEnvelope(
          {
            orderId: order.id,
            orderToken: order.token,
            customerPhone: order.customerPhone,
            status: order.status,
            amountPoisha: order.amountPoisha,
            amountBdt: fromPoisha(order.amountPoisha),
            amountFormatted: formatBdt(order.amountPoisha),
            amountBanglaFormatted: formatBdt(order.amountPoisha, { bangla: true }),
            lineItems: quote ? quote.lineItems : [],
            timeline,
          },
          200,
          null,
          correlationId
        );
      }

      // --- 9. Payment Gateway Callbacks & Execution (Features 36, 37, 38, 40, 41) ---
      // Sandbox Pay
      if (method === 'POST' && pathname === '/api/v1/payments/sandbox/pay') {
        const { orderToken } = body;
        const order = this.orders.get(orderToken);
        if (!order) {
          return this.createEnvelope(null, 404, [{ message: 'Order not found' }], correlationId);
        }

        order.status = 'PAID';
        order.transactionId = `SNDBX_${Date.now()}`;
        this.logOrderTimeline(order.token, 'PAID', 'Sandbox payment successfully verified');

        // Atomic Transactional Outbox Event
        this.outbox.push({
          id: `evt_${Date.now()}`,
          eventType: 'order.paid',
          payload: { orderId: order.id, orderToken: order.token, amountPoisha: order.amountPoisha },
          status: 'pending',
          createdAt: Date.now(),
        });

        // Trigger processing
        this.processOutbox();

        return this.createEnvelope(
          { status: 'PAID', transactionId: order.transactionId, orderToken: order.token },
          200,
          null,
          correlationId
        );
      }

      // SSLCOMMERZ Session Initiate (Feature 36, Scenario 17)
      if (method === 'POST' && pathname === '/api/v1/payments/sslcommerz/initiate') {
        const { orderToken } = body;
        const order = this.orders.get(orderToken);
        if (!order) {
          return this.createEnvelope(null, 404, [{ message: 'Order not found' }], correlationId);
        }

        const session = MockGateway.createSslSessionResponse({
          tranId: order.token,
          amount: fromPoisha(order.amountPoisha).toFixed(2),
        });
        return this.createEnvelope(session, 200, null, correlationId);
      }

      // SSLCOMMERZ IPN Listener (Feature 36, 41, Scenario 5, 17)
      if (method === 'POST' && pathname === '/api/v1/payments/sslcommerz/ipn') {
        const ipnPayload = body;
        const isValidSignature = MockGateway.validateSslIpn(ipnPayload, this.sslStorePassword);

        if (!isValidSignature) {
          return this.createEnvelope(
            null,
            400,
            [{ message: 'SSLCOMMERZ raw-byte signature verification failed: invalid hash' }],
            correlationId
          );
        }

        const tranId = ipnPayload.tran_id;
        const order = this.orders.get(tranId);

        if (order) {
          order.status = 'PAID';
          order.transactionId = ipnPayload.bank_tran_id || `SSL_${Date.now()}`;
          this.logOrderTimeline(order.token, 'PAID', `SSLCOMMERZ IPN verified (${ipnPayload.card_type})`);

          this.outbox.push({
            id: `evt_${Date.now()}`,
            eventType: 'order.paid',
            payload: { orderId: order.id, orderToken: order.token, amountPoisha: order.amountPoisha },
            status: 'pending',
            createdAt: Date.now(),
          });

          this.processOutbox();
        }

        return this.createEnvelope({ status: 'IPN_VERIFIED' }, 200, null, correlationId);
      }

      // bKash Create Payment (Feature 37, Scenario 18)
      if (method === 'POST' && pathname === '/api/v1/payments/bkash/create') {
        const { orderToken } = body;
        const order = this.orders.get(orderToken);
        if (!order) {
          return this.createEnvelope(null, 404, [{ message: 'Order not found' }], correlationId);
        }
        const createRes = MockGateway.createBkashCreatePaymentResponse({
          amount: fromPoisha(order.amountPoisha).toFixed(2),
          merchantInvoiceNumber: order.id,
        });
        return this.createEnvelope(createRes, 200, null, correlationId);
      }

      // bKash Execute Payment (Feature 37, Scenario 18)
      if (method === 'POST' && pathname === '/api/v1/payments/bkash/execute') {
        const { paymentId, orderToken } = body;
        const order = this.orders.get(orderToken);
        if (!order) {
          return this.createEnvelope(null, 404, [{ message: 'Order not found' }], correlationId);
        }

        const execRes = MockGateway.createBkashExecutePaymentResponse({
          paymentId,
          amount: String(fromPoisha(order.amountPoisha)),
        });

        order.status = 'PAID';
        order.transactionId = execRes.trxID;
        this.logOrderTimeline(order.token, 'PAID', 'bKash Tokenized payment executed successfully');

        this.outbox.push({
          id: `evt_${Date.now()}`,
          eventType: 'order.paid',
          payload: { orderId: order.id, orderToken: order.token, amountPoisha: order.amountPoisha },
          status: 'pending',
          createdAt: Date.now(),
        });

        this.processOutbox();

        return this.createEnvelope(execRes, 200, null, correlationId);
      }

      // --- 10. Print Agent Pairing & Lease API (Features 45, 47, 51, 53) ---
      // Agent Pairing
      if (method === 'POST' && pathname === '/api/v1/agent/pair') {
        const { pairing_pin, agentName, machineGuid, publicKey } = body;
        const pinRecord = this.pairingPins.get(pairing_pin);

        if (!pinRecord || pinRecord.expiresAt < Date.now()) {
          return this.createEnvelope(null, 400, [{ message: 'Invalid or expired pairing PIN' }], correlationId);
        }

        const agentToken = `agent_jwt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const agentId = `agent_${Date.now()}`;

        this.agents.set(agentToken, {
          id: agentId,
          name: agentName || 'Desktop Agent',
          machineGuid,
          publicKey,
          token: agentToken,
          pairedAt: Date.now(),
          status: 'online',
        });

        this.pairingPins.delete(pairing_pin);

        return this.createEnvelope(
          {
            agentToken,
            agentId,
            tenantId: this.defaultTenantId,
          },
          200,
          null,
          correlationId
        );
      }

      // Agent Lease Job (Feature 47, Scenario 23)
      if (method === 'POST' && pathname === '/api/v1/agent/lease') {
        if (!bearerToken || !this.agents.has(bearerToken)) {
          return this.createEnvelope(null, 401, [{ message: 'Unauthorized agent' }], correlationId);
        }

        // Atomic search for next pending job
        const pendingJob = Array.from(this.printJobs.values()).find((j) => j.status === 'pending');
        if (!pendingJob) {
          return this.createEnvelope({ job: null }, 200, null, correlationId);
        }

        // Atomic lock
        pendingJob.status = 'leased';
        pendingJob.leasedBy = bearerToken;
        pendingJob.leasedAt = Date.now();
        pendingJob.leaseExpiresAt = Date.now() + 300 * 1000; // 300s TTL

        const order = this.orders.get(pendingJob.orderToken);
        if (order) {
          order.status = 'PRINTING';
          this.logOrderTimeline(order.token, 'PRINTING', `Job leased by print agent ${pendingJob.leasedBy.slice(0, 10)}`);
          this.broadcastWs(`order.${order.token}`, 'App\\Events\\OrderStatusChanged', {
            orderToken: order.token,
            status: 'PRINTING',
          });
        }

        return this.createEnvelope(
          {
            job: {
              jobId: pendingJob.id,
              orderId: pendingJob.orderId,
              downloadUrl: `https://minio.printflow.local/documents/${pendingJob.fileId}.pdf`,
              sha256Hash: sha256(pendingJob.fileName),
              printSettings: {
                copies: pendingJob.copies,
                mode: pendingJob.mode,
                color: pendingJob.color,
                paperSize: pendingJob.paperSize,
              },
            },
          },
          200,
          null,
          correlationId
        );
      }

      // Complete Print Job & Ephemeral Shredding (Feature 51, Scenario 16)
      if (method === 'POST' && pathname.includes('/complete')) {
        if (!bearerToken || !this.agents.has(bearerToken)) {
          return this.createEnvelope(null, 401, [{ message: 'Unauthorized agent' }], correlationId);
        }

        const pathParts = pathname.split('/');
        const jobId = pathParts[5] || pathParts[4];
        const job = this.printJobs.get(jobId);
        if (!job) {
          return this.createEnvelope(null, 404, [{ message: 'Print job not found' }], correlationId);
        }

        job.status = 'completed';
        const order = this.orders.get(job.orderToken);
        if (order) {
          order.status = 'READY';
          this.logOrderTimeline(order.token, 'READY', 'Spooling completed, document ready for pickup');
          this.broadcastWs(`order.${order.token}`, 'App\\Events\\OrderStatusChanged', {
            orderToken: order.token,
            status: 'READY',
          });

          // Trigger File Purge Event
          this.outbox.push({
            id: `evt_purge_${Date.now()}`,
            eventType: 'file.purge',
            payload: { fileId: job.fileId },
            status: 'pending',
          });
          this.processOutbox();
        }

        return this.createEnvelope({ status: 'completed', jobId }, 200, null, correlationId);
      }

      // Fleet discovery sync (Feature 53, Scenario 19)
      if (method === 'POST' && pathname === '/api/v1/agent/printers/sync') {
        const { printers = [] } = body;
        for (const p of printers) {
          this.printers.set(p.id, p);
        }
        return this.createEnvelope({ synced: printers.length }, 200, null, correlationId);
      }

      // --- 11. Owner Console & Operational Actions (Features 15, 54, 55, 56, 57, 58, 60, 61, 63, 64) ---
      // Owner Login (Feature 15, Scenario 24)
      if (method === 'POST' && pathname === '/api/v1/auth/login') {
        const { email, password } = body;
        const user = this.users.get(email);
        if (!user || password !== 'password123') {
          return this.createEnvelope(null, 401, [{ message: 'Invalid credentials' }], correlationId);
        }

        const token = `sanctum_token_${Date.now()}`;
        user.token = token;

        return this.createEnvelope(
          {
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
          },
          200,
          null,
          correlationId
        );
      }

      // Owner Logout
      if (method === 'POST' && pathname === '/api/v1/auth/logout') {
        const user = Array.from(this.users.values()).find((u) => u.token === bearerToken);
        if (user) {
          user.token = null;
        }
        return this.createEnvelope({ loggedOut: true }, 200, null, correlationId);
      }

      // Guard all other /api/v1/owner/* routes
      if (pathname.startsWith('/api/v1/owner/')) {
        const user = Array.from(this.users.values()).find((u) => u.token === bearerToken);
        if (!user) {
          return this.createEnvelope(null, 401, [{ message: 'Unauthenticated owner request' }], correlationId);
        }

        // Dashboard Stats (Feature 54, Scenario 10)
        if (method === 'GET' && pathname === '/api/v1/owner/dashboard') {
          const uniqueOrders = Array.from(new Set(this.orders.values()));
          const totalRevenuePoisha = uniqueOrders
            .filter((o) => o.status !== 'CANCELLED' && o.status !== 'PENDING_PAYMENT')
            .reduce((sum, o) => sum + (o.amountPoisha || 0), 0);

          return this.createEnvelope(
            {
              todayOrdersCount: uniqueOrders.length,
              todayRevenuePoisha: totalRevenuePoisha,
              todayRevenueFormatted: formatBdt(totalRevenuePoisha),
              activeAgentsCount: Array.from(this.agents.values()).filter((a) => a.status === 'online').length,
              pendingJobsCount: Array.from(this.printJobs.values()).filter((j) => j.status === 'pending').length,
            },
            200,
            null,
            correlationId
          );
        }

        // Shop Profile (Feature 17, Scenario 15)
        if (pathname === '/api/v1/owner/shop') {
          const shop = this.shops.get('shop_dhaka_01');
          if (method === 'GET') {
            return this.createEnvelope(shop, 200, null, correlationId);
          }
          if (method === 'PUT') {
            Object.assign(shop, body);
            return this.createEnvelope(shop, 200, null, correlationId);
          }
        }

        // Set Default Printer (Feature 62, Scenario 19)
        if (method === 'PUT' && pathname === '/api/v1/owner/shop/printer') {
          const { printerId } = body;
          const shop = this.shops.get('shop_dhaka_01');
          shop.defaultPrinterId = printerId;
          return this.createEnvelope({ defaultPrinterId: printerId }, 200, null, correlationId);
        }

        // Discovered Printers List (Feature 62, Scenario 19)
        if (method === 'GET' && pathname === '/api/v1/owner/printers') {
          return this.createEnvelope({ printers: Array.from(this.printers.values()) }, 200, null, correlationId);
        }

        // Interactive Pricing Profile Setup & Live Preview (Feature 63, Scenario 33)
        if (pathname === '/api/v1/owner/pricing') {
          const profile = this.priceProfiles.get('profile_default');
          if (method === 'GET') {
            return this.createEnvelope(profile, 200, null, correlationId);
          }
          if (method === 'PUT') {
            Object.assign(profile, body);
            // Compute live sample preview (5-page sample document)
            const sampleCalc = calculateDynamicDuplex({
              totalPages: 5,
              mode: 'duplex',
              duplexModel: profile.duplexModel,
              baseSimplexSideRatePoisha: profile.baseSimplexSideRatePoisha,
              duplexDiscountPercent: profile.duplexDiscountPercent,
              flatDuplexSheetRatePoisha: profile.flatDuplexSheetRatePoisha,
              copies: 1,
            });
            return this.createEnvelope(
              {
                profile,
                previewSample5Pages: {
                  subtotalPoisha: sampleCalc.subtotalPoisha,
                  formatted: formatBdt(sampleCalc.subtotalPoisha),
                },
              },
              200,
              null,
              correlationId
            );
          }
        }

        // Dormant Feature Flags (Scenario 34)
        if (method === 'GET' && pathname === '/api/v1/owner/features') {
          return this.createEnvelope(
            {
              edition: this.edition,
              saasSubscriptionsEnabled: this.edition === 'saas',
              multiTenantOutletsEnabled: this.edition === 'saas',
              platformAdminAvailable: this.edition === 'saas',
            },
            200,
            null,
            correlationId
          );
        }

        // Live Queue (Feature 55)
        if (method === 'GET' && pathname === '/api/v1/owner/queue') {
          const jobs = Array.from(this.printJobs.values());
          return this.createEnvelope({ queue: jobs }, 200, null, correlationId);
        }

        // Generate Pairing PIN (Feature 61, Scenario 31)
        if (method === 'POST' && pathname === '/api/v1/owner/agent/pairing-pin') {
          const pin = generateAgentPairingCode();
          this.pairingPins.set(pin, {
            pin,
            generatedBy: user.id,
            expiresAt: Date.now() + 5 * 60 * 1000,
          });
          return this.createEnvelope({ pin, expiresInSeconds: 300 }, 200, null, correlationId);
        }

        // Hold / Resume Queue Job (Feature 56, Scenario 10)
        if (method === 'POST' && pathname.includes('/hold')) {
          const pathParts = pathname.split('/');
          const jobId = pathParts[5] || pathParts[4];
          const job = this.printJobs.get(jobId);
          if (job) job.status = 'held';
          return this.createEnvelope({ status: 'held', jobId }, 200, null, correlationId);
        }

        if (method === 'POST' && pathname.includes('/resume')) {
          const pathParts = pathname.split('/');
          const jobId = pathParts[5] || pathParts[4];
          const job = this.printJobs.get(jobId);
          if (job) job.status = 'pending';
          return this.createEnvelope({ status: 'pending', jobId }, 200, null, correlationId);
        }

        // Cancel Pre-Print Order (Feature 56, Scenario 32)
        if (method === 'POST' && pathname.includes('/cancel')) {
          const pathParts = pathname.split('/');
          const jobId = pathParts[5] || pathParts[4];
          const job = this.printJobs.get(jobId);
          if (job) {
            job.status = 'cancelled';
            const order = this.orders.get(job.orderToken);
            if (order) {
              order.status = 'CANCELLED';
              this.logOrderTimeline(order.token, 'CANCELLED', 'Order cancelled by owner prior to spool');
              this.outbox.push({
                id: `evt_refund_${Date.now()}`,
                eventType: 'payment.refund',
                payload: { orderId: order.id, amountPoisha: order.amountPoisha },
                status: 'pending',
              });
            }
          }
          return this.createEnvelope({ status: 'cancelled', jobId }, 200, null, correlationId);
        }

        // Handover Collected (Feature 57, Scenario 10)
        if (method === 'POST' && pathname.includes('/collected')) {
          const pathParts = pathname.split('/');
          const orderId = pathParts[5] || pathParts[4];
          const order = this.orders.get(orderId);
          if (order) {
            order.status = 'COLLECTED';
            this.logOrderTimeline(order.token, 'COLLECTED', 'Document collected by customer');
          }
          return this.createEnvelope({ status: 'COLLECTED', orderId }, 200, null, correlationId);
        }

        // Controlled Reprint Protocol (Feature 60, Scenario 9)
        if (method === 'POST' && pathname.includes('/reprint')) {
          const { reason } = body;
          if (!reason || !reason.trim()) {
            return this.createEnvelope(null, 422, [{ field: 'reason', message: 'Mandatory reprint reason required' }], correlationId);
          }

          const pathParts = pathname.split('/');
          const orderId = pathParts[5] || pathParts[4];
          const order = this.orders.get(orderId);
          if (order) {
            order.reprintCount = (order.reprintCount || 0) + 1;
            this.auditLogs.push({
              event: 'REPRINT_ISSUED',
              orderId: order.id,
              reason,
              timestamp: new Date().toISOString(),
            });
            this.logOrderTimeline(order.token, 'REPRINT_REQUESTED', `Reprint authorized: ${reason}`);

            // Re-enqueue job
            const newJobId = `job_reprint_${Date.now()}`;
            this.printJobs.set(newJobId, {
              id: newJobId,
              orderId: order.id,
              orderToken: order.token,
              status: 'pending',
              attempts: 1,
              isReprint: true,
            });
          }
          return this.createEnvelope({ status: 'REPRINT_ENQUEUED', orderId }, 200, null, correlationId);
        }

        // Searchable Ledger (Feature 58, Scenario 29)
        if (method === 'GET' && pathname === '/api/v1/owner/orders') {
          const phoneQuery = parsedUrl.searchParams.get('phone');
          const statusQuery = parsedUrl.searchParams.get('status');
          const uniqueOrders = Array.from(new Set(this.orders.values()));
          let results = uniqueOrders;

          if (phoneQuery) {
            results = results.filter((o) => o.customerPhone.includes(phoneQuery));
          }
          if (statusQuery) {
            results = results.filter((o) => o.status === statusQuery);
          }

          return this.createEnvelope({ orders: results, total: results.length }, 200, null, correlationId);
        }

        // Gateway Credentials Store (Feature 64, Scenario 27)
        if (pathname === '/api/v1/owner/credentials') {
          if (method === 'GET') {
            return this.createEnvelope(this.gatewayCredentials, 200, null, correlationId);
          }
          if (method === 'PUT') {
            if (body.sslcommerz) {
              this.gatewayCredentials.sslcommerz.storeId = body.sslcommerz.storeId;
              this.gatewayCredentials.sslcommerz.storePassEncrypted = sha256(body.sslcommerz.storePass);
            }
            if (body.bkash) {
              this.gatewayCredentials.bkash.appKey = body.bkash.appKey;
              this.gatewayCredentials.bkash.appSecretEncrypted = sha256(body.bkash.appSecret);
            }
            return this.createEnvelope({ updated: true }, 200, null, correlationId);
          }
        }
      }

      // Default fallback 404
      return this.createEnvelope(null, 404, [{ message: `Endpoint not found: ${method} ${pathname}` }], correlationId);
    };
  }
}
