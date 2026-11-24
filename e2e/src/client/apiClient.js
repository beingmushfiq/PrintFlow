/**
 * PrintFlow Opaque-Box API Client
 *
 * Implements:
 * - Uniform JSON envelope handling: { data, meta, errors }
 * - Automatic X-Correlation-ID header injection
 * - Tenant context scoping (X-Tenant-ID, X-App-Edition)
 * - Sanctum Bearer token authentication
 * - File upload & presigned URL helper workflows
 */

import { generateCorrelationId } from '../utils/cryptoUtils.js';

export class ApiClient {
  /**
   * @param {object} [config]
   * @param {string} [config.baseUrl] Base URL for the PrintFlow API
   * @param {string} [config.tenantId] Active tenant ID
   * @param {string} [config.edition='standalone'] App edition ('standalone' | 'saas')
   * @param {string} [config.token] Sanctum Bearer token
   * @param {function} [config.customFetch] Optional custom fetch implementation (useful for tests/mocks)
   */
  constructor(config = {}) {
    this.baseUrl = (config.baseUrl || process.env.API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');
    this.tenantId = config.tenantId || process.env.TEST_TENANT_ID || 'tenant_standalone_default';
    this.edition = config.edition || process.env.APP_EDITION || 'standalone';
    this.token = config.token || null;
    this.customFetch = config.customFetch || globalThis.fetch;
  }

  /**
   * Sets the Sanctum authentication token.
   * @param {string|null} token
   */
  setToken(token) {
    this.token = token;
    return this;
  }

  /**
   * Sets the active tenant ID.
   * @param {string} tenantId
   */
  setTenantId(tenantId) {
    this.tenantId = tenantId;
    return this;
  }

  /**
   * Sets the edition context.
   * @param {'standalone'|'saas'} edition
   */
  setEdition(edition) {
    this.edition = edition;
    return this;
  }

  /**
   * Builds standard PrintFlow headers.
   * @param {object} [customHeaders]
   * @returns {Headers}
   */
  buildHeaders(customHeaders = {}) {
    const headers = new Headers();

    // Default headers
    headers.set('Accept', 'application/json');
    headers.set('X-Correlation-ID', generateCorrelationId());

    if (this.tenantId) {
      headers.set('X-Tenant-ID', this.tenantId);
    }

    if (this.edition) {
      headers.set('X-App-Edition', this.edition);
    }

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    // Merge custom overrides
    for (const [key, value] of Object.entries(customHeaders)) {
      if (value === null || value === undefined) {
        headers.delete(key);
      } else {
        headers.set(key, String(value));
      }
    }

    return headers;
  }

  /**
   * Parses and validates PrintFlow standard envelope { data, meta, errors }.
   * @param {Response} response
   * @returns {Promise<object>}
   */
  async parseEnvelope(response) {
    const contentType = response.headers.get('content-type') || '';
    const correlationId = response.headers.get('x-correlation-id') || null;

    let body = null;
    if (contentType.includes('application/json')) {
      try {
        body = await response.json();
      } catch (err) {
        body = { error: 'Invalid JSON response from server', rawText: await response.text().catch(() => '') };
      }
    } else {
      const text = await response.text();
      body = { rawText: text };
    }

    // Standard envelope extraction
    const hasEnvelope = body && typeof body === 'object' && ('data' in body || 'errors' in body);
    const data = hasEnvelope ? body.data : body;
    const meta = hasEnvelope ? (body.meta || {}) : {};
    const errors = hasEnvelope ? (body.errors || null) : (!response.ok ? body : null);

    return {
      status: response.status,
      ok: response.ok,
      data,
      meta,
      errors,
      correlationId: correlationId || meta.correlation_id || null,
      rawBody: body,
      headers: response.headers,
    };
  }

  /**
   * Performs an HTTP request.
   * @param {string} path Path or full URL
   * @param {object} [options]
   * @returns {Promise<object>} Standard envelope result
   */
  async request(path, options = {}) {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = this.buildHeaders(options.headers);

    let body = options.body;
    if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Buffer) && !(body instanceof Uint8Array)) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }

    const fetchFn = this.customFetch;
    const response = await fetchFn(url, {
      ...options,
      headers,
      body,
    });

    return this.parseEnvelope(response);
  }

  // --- Convenience HTTP Verbs ---

  async get(path, options = {}) {
    return this.request(path, { ...options, method: 'GET' });
  }

  async post(path, body = {}, options = {}) {
    return this.request(path, { ...options, method: 'POST', body });
  }

  async put(path, body = {}, options = {}) {
    return this.request(path, { ...options, method: 'PUT', body });
  }

  async delete(path, options = {}) {
    return this.request(path, { ...options, method: 'DELETE' });
  }

  // --- Specialized PrintFlow Domain APIs ---

  /**
   * Retrieves public storefront data by shop slug.
   * @param {string} slug
   */
  async getStorefront(slug) {
    return this.get(`/api/v1/storefront/${encodeURIComponent(slug)}`);
  }

  /**
   * Requests a presigned S3/MinIO upload URL for customer file.
   * @param {object} fileMeta { fileName, mimeType, fileSize, checksum }
   */
  async createPresignedUpload(fileMeta) {
    return this.post('/api/v1/storefront/upload-url', fileMeta);
  }

  /**
   * Calculates an itemized quote for print options.
   * @param {object} quoteParams { shopSlug, files: [...], options: { mode, copies, paperSize, color } }
   */
  async calculateQuote(quoteParams) {
    return this.post('/api/v1/storefront/quote', quoteParams);
  }

  /**
   * Submits a customer order with mandatory phone number and quote token.
   * @param {object} orderData { customerPhone, quoteToken, paymentGateway, shopSlug }
   */
  async submitOrder(orderData) {
    return this.post('/api/v1/storefront/orders', orderData);
  }

  /**
   * Retrieves live public order status by order token.
   * @param {string} orderToken
   */
  async getOrderStatus(orderToken) {
    return this.get(`/api/v1/orders/${encodeURIComponent(orderToken)}`);
  }

  /**
   * Authenticates shop owner / operator via Sanctum.
   * @param {string} email
   * @param {string} password
   */
  async loginOwner(email, password) {
    const res = await this.post('/api/v1/auth/login', { email, password });
    if (res.ok && res.data?.token) {
      this.setToken(res.data.token);
    }
    return res;
  }

  /**
   * Retrieves owner operational queue.
   */
  async getOwnerQueue() {
    return this.get('/api/v1/owner/queue');
  }

  /**
   * Initiates cryptographic pairing handshake for print agent.
   * @param {string} pairingPin 6-digit PIN
   * @param {object} agentDetails { agentName, machineGuid, publicKey }
   */
  async pairAgent(pairingPin, agentDetails) {
    return this.post('/api/v1/agent/pair', {
      pairing_pin: pairingPin,
      ...agentDetails,
    });
  }

  /**
   * Leases next pending print job via atomic SELECT FOR UPDATE SKIP LOCKED.
   * @param {string} agentToken
   */
  async leasePrintJob(agentToken) {
    return this.post('/api/v1/agent/lease', {}, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
  }

  /**
   * Reports print job completion and triggers ephemeral file purge.
   * @param {string} jobId
   * @param {object} attemptData { pagesPrinted, status: 'completed'|'failed', errorDetails }
   * @param {string} agentToken
   */
  async completePrintJob(jobId, attemptData, agentToken) {
    return this.post(`/api/v1/agent/jobs/${encodeURIComponent(jobId)}/complete`, attemptData, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
  }
}
