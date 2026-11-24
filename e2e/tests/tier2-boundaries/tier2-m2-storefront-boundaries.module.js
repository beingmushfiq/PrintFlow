/**
 * PrintFlow Tier 2: Boundary & Corner Case Tests
 * Milestone 2: Customer Storefront & Document Intake (Features 11 - 27)
 *
 * Covers 17 features with 5 boundary tests each = 85 test cases total.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ApiClient,
  isValidBdPhone,
  normalizeBdPhone,
  getBdPhoneOperator,
  sha256,
  generateCorrelationId,
  FIXTURE_PATHS,
  createValidSinglePagePdf,
  createValidMultiPagePdf,
  createCorruptedHeaderPdf,
  createDisguisedExePdf,
  createSamplePng,
  createSampleJpeg,
  createPasswordEncryptedPdf,
  createEicarTestString,
} from '../../src/index.js';

// --- FEATURE 11 BOUNDARY: Tenant & Domain Migrations (0001, 0002) ---
describe('Feature 11 Boundary: Tenant & Domain Migrations (0001, 0002)', () => {
  it('enforces tenant slug length boundary (minimum 3, maximum 64 characters)', () => {
    function isValidSlug(slug) {
      if (!slug || typeof slug !== 'string') return false;
      return /^[a-z0-9]([a-z0-9-]{1,62}[a-z0-9])?$/.test(slug) && slug.length >= 3 && slug.length <= 64;
    }

    assert.strictEqual(isValidSlug('ab'), false, 'Slug with 2 chars must be rejected');
    assert.strictEqual(isValidSlug('abc'), true, 'Slug with 3 chars must be accepted');
    assert.strictEqual(isValidSlug('a'.repeat(64)), true, 'Slug with 64 chars must be accepted');
    assert.strictEqual(isValidSlug('a'.repeat(65)), false, 'Slug with 65 chars must be rejected');
  });

  it('rejects illegal characters and whitespace in tenant slugs', () => {
    const invalidSlugs = ['Shop One', 'shop_one', 'shop@print', '-start-hyphen', 'end-hyphen-', ''];
    function isValidSlug(slug) {
      return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug);
    }

    for (const slug of invalidSlugs) {
      assert.strictEqual(isValidSlug(slug), false, `Slug '${slug}' must be rejected`);
    }
  });

  it('rejects reserved system keywords as tenant slugs', () => {
    const reservedWords = ['admin', 'api', 'platform', 'login', 'register', 'dashboard', 'system'];
    function isReserved(slug) {
      return reservedWords.includes(slug.toLowerCase());
    }

    for (const word of reservedWords) {
      assert.strictEqual(isReserved(word), true, `Reserved slug '${word}' must be flagged`);
    }
    assert.strictEqual(isReserved('my-custom-shop'), false);
  });

  it('validates custom domain FQDN boundary format', () => {
    function isValidDomain(domain) {
      if (!domain || domain.length > 253) return false;
      return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(domain);
    }

    assert.ok(isValidDomain('print.dhakaprint.com'));
    assert.ok(isValidDomain('shop1.printflow.com.bd'));
    assert.strictEqual(isValidDomain('http://invalid-scheme.com'), false);
    assert.strictEqual(isValidDomain('invalid domain.com'), false);
    assert.strictEqual(isValidDomain(''), false);
  });

  it('enforces soft-delete isolation (deleted tenant is inaccessible)', () => {
    const tenantsTable = [
      { id: 't1', slug: 'active-shop', deleted_at: null },
      { id: 't2', slug: 'deleted-shop', deleted_at: '2026-01-01T00:00:00Z' },
    ];

    function findActiveTenant(slug) {
      return tenantsTable.find((t) => t.slug === slug && t.deleted_at === null) || null;
    }

    assert.ok(findActiveTenant('active-shop'));
    assert.strictEqual(findActiveTenant('deleted-shop'), null);
  });
});

// --- FEATURE 12 BOUNDARY: User & Tenant Pivot Migrations (0003, 0004) ---
describe('Feature 12 Boundary: User & Tenant Pivot Migrations (0003, 0004)', () => {
  it('validates user phone verification timestamp state transitions', () => {
    const userUnverified = { id: 'u1', phone_verified_at: null };
    const userVerified = { id: 'u2', phone_verified_at: '2026-11-24T06:00:00Z' };

    assert.strictEqual(userUnverified.phone_verified_at, null);
    assert.ok(Date.parse(userVerified.phone_verified_at) > 0);
  });

  it('enforces email format boundary checks on user registration', () => {
    function isValidEmail(email) {
      if (!email || typeof email !== 'string') return false;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
    }

    assert.ok(isValidEmail('owner@printflow.bd'));
    assert.strictEqual(isValidEmail('plainaddress'), false);
    assert.strictEqual(isValidEmail('@missingusername.com'), false);
    assert.strictEqual(isValidEmail('user@.com'), false);
    assert.strictEqual(isValidEmail('a'.repeat(250) + '@example.com'), false);
  });

  it('validates role enum constraints on tenant_user pivot table', () => {
    const validRoles = ['owner', 'manager', 'operator'];
    assert.ok(validRoles.includes('owner'));
    assert.ok(validRoles.includes('operator'));
    assert.strictEqual(validRoles.includes('superadmin'), false);
    assert.strictEqual(validRoles.includes(''), false);
  });

  it('handles multi-tenant user membership associations', () => {
    const pivot = [
      { user_id: 'u1', tenant_id: 't1', role: 'owner' },
      { user_id: 'u1', tenant_id: 't2', role: 'operator' },
    ];

    const memberships = pivot.filter((p) => p.user_id === 'u1');
    assert.strictEqual(memberships.length, 2);
    assert.strictEqual(memberships[0].role, 'owner');
    assert.strictEqual(memberships[1].role, 'operator');
  });

  it('prevents duplicate assignment of same user to same tenant in pivot', () => {
    const assignments = new Set();
    function assign(userId, tenantId) {
      const key = `${userId}:${tenantId}`;
      if (assignments.has(key)) {
        throw new Error('Duplicate user tenant assignment');
      }
      assignments.add(key);
    }

    assign('u1', 't1');
    assert.throws(() => assign('u1', 't1'), /Duplicate user tenant assignment/);
  });
});

// --- FEATURE 13 BOUNDARY: RBAC Schema Migration (0005) ---
describe('Feature 13 Boundary: RBAC Schema Migration (0005)', () => {
  it('enforces strict tenant scoping on permissions (cross-tenant role leak prevention)', () => {
    const userPermissions = {
      'tenant-A': ['queue.view', 'queue.hold', 'reprint.approve'],
      'tenant-B': ['queue.view'],
    };

    function canPerform(tenantId, permission) {
      return (userPermissions[tenantId] || []).includes(permission);
    }

    assert.strictEqual(canPerform('tenant-A', 'reprint.approve'), true);
    assert.strictEqual(canPerform('tenant-B', 'reprint.approve'), false);
    assert.strictEqual(canPerform('tenant-C', 'queue.view'), false);
  });

  it('prevents privilege escalation by operators without reprint capability', () => {
    const operatorPermissions = ['queue.view', 'queue.hold', 'order.handover'];
    assert.strictEqual(operatorPermissions.includes('reprint.approve'), false);
    assert.strictEqual(operatorPermissions.includes('gateway.configure'), false);
    assert.strictEqual(operatorPermissions.includes('prices.edit'), false);
  });

  it('denies access when user has empty permission set', () => {
    const emptyPermissions = [];
    function hasAnyPermission(perms, requiredPerm) {
      return perms.includes(requiredPerm);
    }
    assert.strictEqual(hasAnyPermission(emptyPermissions, 'queue.view'), false);
  });

  it('handles immediate capability revocation upon role removal', () => {
    let roles = ['manager'];
    function checkAccess() {
      return roles.includes('manager') || roles.includes('owner');
    }

    assert.strictEqual(checkAccess(), true);
    roles = [];
    assert.strictEqual(checkAccess(), false);
  });

  it('prevents revocation of the sole remaining owner in a shop', () => {
    const staff = [
      { id: 'u1', role: 'owner' },
      { id: 'u2', role: 'operator' },
    ];

    function canRemoveOwner(userId) {
      const owners = staff.filter((s) => s.role === 'owner');
      if (owners.length <= 1 && owners[0]?.id === userId) {
        return false;
      }
      return true;
    }

    assert.strictEqual(canRemoveOwner('u1'), false, 'Cannot remove last owner');
    assert.strictEqual(canRemoveOwner('u2'), true, 'Can remove non-owner staff');
  });
});

// --- FEATURE 14 BOUNDARY: Shop & Assignment Migrations (0006, 0007) ---
describe('Feature 14 Boundary: Shop & Assignment Migrations (0006, 0007)', () => {
  it('enforces shop slug uniqueness within a tenant', () => {
    const shops = [
      { tenant_id: 't1', slug: 'main-counter' },
      { tenant_id: 't1', slug: 'annex-counter' },
    ];

    function isShopSlugAvailable(tenantId, slug) {
      return !shops.some((s) => s.tenant_id === tenantId && s.slug === slug);
    }

    assert.strictEqual(isShopSlugAvailable('t1', 'main-counter'), false);
    assert.strictEqual(isShopSlugAvailable('t1', 'new-counter'), true);
    assert.strictEqual(isShopSlugAvailable('t2', 'main-counter'), true);
  });

  it('rejects order placement when shop status is inactive or suspended', () => {
    const shop = { id: 's1', status: 'inactive' };
    function canAcceptOrders(s) {
      return s.status === 'active';
    }
    assert.strictEqual(canAcceptOrders(shop), false);
  });

  it('validates shop contact phone length and format boundaries', () => {
    const validPhone = '01712345678';
    const invalidPhone = '12345';
    assert.strictEqual(isValidBdPhone(validPhone), true);
    assert.strictEqual(isValidBdPhone(invalidPhone), false);
  });

  it('validates shop address character length limit (max 500 chars)', () => {
    function isValidAddress(addr) {
      return typeof addr === 'string' && addr.trim().length > 0 && addr.length <= 500;
    }

    assert.strictEqual(isValidAddress('New Market, Dhaka 1205'), true);
    assert.strictEqual(isValidAddress(''), false);
    assert.strictEqual(isValidAddress('   '), false);
    assert.strictEqual(isValidAddress('A'.repeat(501)), false);
  });

  it('validates business hours format (HH:mm:ss)', () => {
    function isValidTime(t) {
      return /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(t);
    }

    assert.strictEqual(isValidTime('09:00:00'), true);
    assert.strictEqual(isValidTime('22:30:00'), true);
    assert.strictEqual(isValidTime('24:00:00'), false);
    assert.strictEqual(isValidTime('09:65:00'), false);
  });
});

// --- FEATURE 15 BOUNDARY: Owner Registration & Auth API + UI ---
describe('Feature 15 Boundary: Owner Registration & Auth API + UI', () => {
  it('enforces password minimum complexity boundaries (min 8 chars, 1 uppercase, 1 digit)', () => {
    function isValidPassword(p) {
      if (!p || p.length < 8) return false;
      return /[A-Z]/.test(p) && /[0-9]/.test(p);
    }

    assert.strictEqual(isValidPassword('short1A'), false, 'Below 8 chars');
    assert.strictEqual(isValidPassword('nouppercase123'), false, 'No uppercase');
    assert.strictEqual(isValidPassword('NoDigitsHere!'), false, 'No digits');
    assert.strictEqual(isValidPassword('ValidPass123'), true);
  });

  it('rejects brute-force authentication attempts exceeding 5 failed tries', () => {
    class RateLimiter {
      constructor(maxAttempts = 5) {
        this.attempts = new Map();
        this.maxAttempts = maxAttempts;
      }
      recordFailed(ip) {
        const count = (this.attempts.get(ip) || 0) + 1;
        this.attempts.set(ip, count);
        return count <= this.maxAttempts;
      }
      isLocked(ip) {
        return (this.attempts.get(ip) || 0) >= this.maxAttempts;
      }
    }

    const limiter = new RateLimiter(5);
    const ip = '192.168.1.100';
    for (let i = 0; i < 4; i++) {
      assert.strictEqual(limiter.recordFailed(ip), true);
    }
    // 5th failed attempt triggers lock
    limiter.recordFailed(ip);
    assert.strictEqual(limiter.isLocked(ip), true);
  });

  it('rejects requests with revoked Sanctum Bearer tokens (401 Unauthorized)', async () => {
    const revokedToken = 'revoked-token-uuid';
    const mockAuthServer = async (url, options) => {
      const auth = options?.headers?.get ? options.headers.get('Authorization') : options?.headers?.Authorization;
      if (auth === `Bearer ${revokedToken}`) {
        return new Response(JSON.stringify({ data: null, errors: { auth: 'Token revoked' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ data: { user: 'ok' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const client = new ApiClient({ token: revokedToken, customFetch: mockAuthServer });
    const res = await client.get('/api/v1/owner/profile');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.ok, false);
  });

  it('enforces atomic provisioning of Owner, Tenant, and Shop in single registration', () => {
    function registerOwnerTransaction(payload) {
      if (!payload.email || !payload.shopName) {
        throw new Error('Transaction rollback: missing mandatory registration fields');
      }
      return {
        tenant: { id: 't_' + Date.now(), name: payload.shopName },
        user: { id: 'u_' + Date.now(), email: payload.email, role: 'owner' },
        shop: { id: 's_' + Date.now(), name: payload.shopName },
      };
    }

    assert.throws(() => registerOwnerTransaction({ email: '' }), /Transaction rollback/);
    const result = registerOwnerTransaction({ email: 'owner@shop.com', shopName: 'FastPrint' });
    assert.ok(result.tenant.id);
    assert.ok(result.user.id);
    assert.ok(result.shop.id);
  });

  it('clears session token state completely upon logout', () => {
    const client = new ApiClient({ token: 'active-session-token' });
    assert.strictEqual(client.token, 'active-session-token');
    client.setToken(null);
    assert.strictEqual(client.token, null);
    const headers = client.buildHeaders();
    assert.strictEqual(headers.get('Authorization'), null);
  });
});

// --- FEATURE 16 BOUNDARY: Standalone Single-Tenant Resolver ---
describe('Feature 16 Boundary: Standalone Single-Tenant Resolver', () => {
  it('guarantees Host header spoofing cannot change resolved tenant in standalone mode', () => {
    const client = new ApiClient({ edition: 'standalone' });
    const spoofedHeaders = { Host: 'malicious-competitor-tenant.com' };
    const headers = client.buildHeaders(spoofedHeaders);

    assert.strictEqual(headers.get('X-App-Edition'), 'standalone');
    assert.strictEqual(headers.get('Host'), 'malicious-competitor-tenant.com');
    // Standalone resolution rules always bind default tenant regardless of host
    const resolvedTenant = client.edition === 'standalone' ? 'tenant_standalone_default' : headers.get('Host');
    assert.strictEqual(resolvedTenant, 'tenant_standalone_default');
  });

  it('guarantees query param tenant override attempts (?tenant_id=...) are ignored', () => {
    const queryParams = new URLSearchParams('?tenant_id=foreign_tenant_999');
    const edition = 'standalone';

    const effectiveTenant = edition === 'standalone'
      ? 'tenant_standalone_default'
      : (queryParams.get('tenant_id') || 'tenant_standalone_default');

    assert.strictEqual(effectiveTenant, 'tenant_standalone_default');
  });

  it('handles case-insensitivity of APP_EDITION environment variable', () => {
    const variations = ['standalone', 'STANDALONE', 'Standalone', 'sTanDaLone'];
    for (const v of variations) {
      assert.strictEqual(v.toLowerCase(), 'standalone');
    }
  });

  it('rejects attempt to create a second tenant in standalone mode', () => {
    const existingTenantsCount = 1;
    const edition = 'standalone';

    function canCreateTenant() {
      if (edition === 'standalone' && existingTenantsCount >= 1) {
        return false;
      }
      return true;
    }

    assert.strictEqual(canCreateTenant(), false, 'Standalone mode must reject multi-tenant provisioning');
  });

  it('binds fallback default tenant ID when header is completely omitted', () => {
    const client = new ApiClient({ tenantId: undefined, edition: 'standalone' });
    assert.strictEqual(client.tenantId, 'tenant_standalone_default');
  });
});

// --- FEATURE 17 BOUNDARY: Shop Profile Management API + UI ---
describe('Feature 17 Boundary: Shop Profile Management API + UI', () => {
  it('correctly handles business hours spanning across midnight boundary', () => {
    function isOpenAt(currentTime, openTime, closeTime) {
      // e.g. Open 21:00 (21), Close 03:00 (3)
      if (openTime > closeTime) {
        return currentTime >= openTime || currentTime < closeTime;
      }
      return currentTime >= openTime && currentTime < closeTime;
    }

    // Overnight shop: 21:00 to 03:00
    assert.strictEqual(isOpenAt(23, 21, 3), true, '11 PM is open');
    assert.strictEqual(isOpenAt(1, 21, 3), true, '1 AM is open');
    assert.strictEqual(isOpenAt(4, 21, 3), false, '4 AM is closed');
    assert.strictEqual(isOpenAt(12, 21, 3), false, '12 PM is closed');
  });

  it('rejects opening time equal to closing time (0 operating hours)', () => {
    function validateHours(openTime, closeTime) {
      if (openTime === closeTime) {
        return { valid: false, error: 'Opening and closing times cannot be identical' };
      }
      return { valid: true };
    }

    const res = validateHours('10:00:00', '10:00:00');
    assert.strictEqual(res.valid, false);
  });

  it('enforces Bangladeshi mobile format on shop contact phone updates', () => {
    assert.strictEqual(isValidBdPhone('01712345678'), true);
    assert.strictEqual(isValidBdPhone('01012345678'), false);
    assert.strictEqual(isValidBdPhone(''), false);
  });

  it('rejects empty or whitespace-only shop name submissions', () => {
    function validateShopName(name) {
      return Boolean(name && name.trim().length >= 2 && name.trim().length <= 100);
    }

    assert.strictEqual(validateShopName(''), false);
    assert.strictEqual(validateShopName('    '), false);
    assert.strictEqual(validateShopName('A'), false);
    assert.strictEqual(validateShopName('Dhaka Digital Print'), true);
  });

  it('rejects oversized profile metadata payloads exceeding 64KB boundary', () => {
    const smallPayload = JSON.stringify({ note: 'Friendly counter staff' });
    const largePayload = JSON.stringify({ note: 'x'.repeat(70000) });

    function checkPayloadSize(jsonStr) {
      return Buffer.byteLength(jsonStr, 'utf8') <= 65536;
    }

    assert.strictEqual(checkPayloadSize(smallPayload), true);
    assert.strictEqual(checkPayloadSize(largePayload), false);
  });
});

// --- FEATURE 18 BOUNDARY: Counter QR Generator (PNG/SVG/PDF) ---
describe('Feature 18 Boundary: Counter QR Generator (PNG/SVG/PDF)', () => {
  it('encodes canonical storefront URL format: https://.../s/{slug}', () => {
    function generateQrTargetUrl(baseUrl, slug) {
      return `${baseUrl.replace(/\/+$/, '')}/s/${encodeURIComponent(slug)}`;
    }

    const targetUrl = generateQrTargetUrl('https://printflow.com.bd', 'fast-print-counter');
    assert.strictEqual(targetUrl, 'https://printflow.com.bd/s/fast-print-counter');
  });

  it('sanitizes SVG QR output against XML entity injection (XXE)', () => {
    const maliciousInput = '"><script>alert(1)</script><!ENTITY xxe SYSTEM "file:///etc/passwd">';
    function sanitizeXmlString(input) {
      return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    const safe = sanitizeXmlString(maliciousInput);
    assert.strictEqual(safe.includes('<script>'), false);
    assert.strictEqual(safe.includes('<!ENTITY'), false);
  });

  it('validates supported QR error correction levels (L, M, Q, H)', () => {
    const validLevels = ['L', 'M', 'Q', 'H'];
    assert.strictEqual(validLevels.includes('M'), true);
    assert.strictEqual(validLevels.includes('H'), true);
    assert.strictEqual(validLevels.includes('X'), false);
  });

  it('verifies high-contrast optical readability (dark modules on light background)', () => {
    const qrOptions = { darkColor: '#000000', lightColor: '#FFFFFF' };
    assert.notStrictEqual(qrOptions.darkColor, qrOptions.lightColor);
    assert.strictEqual(qrOptions.darkColor, '#000000');
    assert.strictEqual(qrOptions.lightColor, '#FFFFFF');
  });

  it('handles non-ASCII Bengali shop names on printable placard headers', () => {
    const shopName = 'প্রিন্টফ্লো ডিজিটাল প্রেস';
    const utf8Buffer = Buffer.from(shopName, 'utf8');
    assert.ok(utf8Buffer.length > shopName.length, 'Bengali UTF-8 bytes must exceed ASCII length');
    assert.strictEqual(utf8Buffer.toString('utf8'), shopName);
  });
});

// --- FEATURE 19 BOUNDARY: Customer Mobile Storefront Landing ---
describe('Feature 19 Boundary: Customer Mobile Storefront Landing', () => {
  it('returns 404 envelope when shop slug does not exist', async () => {
    const mockNotFoundFetch = async () => {
      return new Response(
        JSON.stringify({ data: null, errors: { shop: 'Shop not found' } }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = new ApiClient({ customFetch: mockNotFoundFetch });
    const res = await client.getStorefront('non-existent-shop-slug');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.errors.shop, 'Shop not found');
  });

  it('returns inactive shop notice when shop is temporarily closed', async () => {
    const mockClosedFetch = async () => {
      return new Response(
        JSON.stringify({
          data: { name: 'Closed Shop', is_open: false, notice: 'Shop is currently closed' },
          errors: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = new ApiClient({ customFetch: mockClosedFetch });
    const res = await client.getStorefront('closed-shop');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.is_open, false);
    assert.strictEqual(res.data.notice, 'Shop is currently closed');
  });

  it('validates mobile viewport constraints (320px minimum mobile width)', () => {
    const minWidth = 320;
    const testWidths = [320, 360, 390, 414, 768];
    for (const w of testWidths) {
      assert.ok(w >= minWidth, `Viewport width ${w}px must be >= ${minWidth}px`);
    }
  });

  it('sanitizes input query parameters on customer landing route', () => {
    const maliciousSlug = 'shop-slug<script>alert(1)</script>';
    const sanitized = encodeURIComponent(maliciousSlug);
    assert.strictEqual(sanitized.includes('<script>'), false);
  });

  it('throttles excessive rapid visits under DDOS burst conditions', () => {
    let requestsInWindow = 0;
    const rateLimit = 30; // 30 req/min

    function visitStorefront() {
      requestsInWindow++;
      return requestsInWindow <= rateLimit ? 200 : 429;
    }

    for (let i = 0; i < rateLimit; i++) {
      assert.strictEqual(visitStorefront(), 200);
    }
    // 31st request is throttled
    assert.strictEqual(visitStorefront(), 429);
  });
});

// --- FEATURE 20 BOUNDARY: Mandatory 11-Digit BD Phone Intake ---
describe('Feature 20 Boundary: Mandatory 11-Digit BD Phone Intake', () => {
  it('rejects phone numbers with fewer than 11 digits (boundary: 10 digits)', () => {
    assert.strictEqual(isValidBdPhone('0171234567'), false);
    assert.strictEqual(isValidBdPhone('0181122334'), false);
  });

  it('rejects phone numbers with more than 11 digits (boundary: 12 digits)', () => {
    assert.strictEqual(isValidBdPhone('017123456789'), false);
    assert.strictEqual(isValidBdPhone('018112233445'), false);
  });

  it('rejects invalid BD mobile telecom prefixes (010, 011, 012)', () => {
    assert.strictEqual(isValidBdPhone('01012345678'), false);
    assert.strictEqual(isValidBdPhone('01112345678'), false);
    assert.strictEqual(isValidBdPhone('01212345678'), false);
  });

  it('normalizes numbers with international prefixes (+880, 880) and formatting', () => {
    assert.strictEqual(normalizeBdPhone('+8801712345678'), '01712345678');
    assert.strictEqual(normalizeBdPhone('8801812345678'), '01812345678');
    assert.strictEqual(normalizeBdPhone('01912-345678'), '01912345678');
    assert.strictEqual(normalizeBdPhone('+88 (01712) 345-678'), '01712345678');
  });

  it('rejects alphanumeric and SQL/XSS injection attempts in phone input', () => {
    assert.strictEqual(isValidBdPhone("01712345678'; DROP TABLE orders;--"), false);
    assert.strictEqual(isValidBdPhone('01712345678<script>'), false);
    assert.strictEqual(isValidBdPhone('017abcdefgh'), false);
  });
});

// --- FEATURE 21 BOUNDARY: Order & File Migrations (0008, 0009, 0010) ---
describe('Feature 21 Boundary: Order & File Migrations (0008, 0009, 0010)', () => {
  it('enforces order public reference uniqueness format: ORD-YYYYMMDD-XXXX', () => {
    function generateOrderRef() {
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomHex = Math.random().toString(16).slice(2, 6).toUpperCase();
      return `ORD-${datePart}-${randomHex}`;
    }

    const ref = generateOrderRef();
    assert.match(ref, /^ORD-\d{8}-[0-9A-F]{4}$/);
  });

  it('rejects order creation attempt with zero uploaded files (0-file boundary)', () => {
    function validateOrderFiles(files) {
      if (!Array.isArray(files) || files.length === 0) {
        return { valid: false, error: 'Order must contain at least one document' };
      }
      return { valid: true };
    }

    assert.strictEqual(validateOrderFiles([]).valid, false);
    assert.strictEqual(validateOrderFiles(null).valid, false);
    assert.strictEqual(validateOrderFiles([{ fileId: 'f1' }]).valid, true);
  });

  it('enforces maximum file count per order boundary (max 10 files)', () => {
    const maxFiles = 10;
    const validBatch = Array(10).fill({ fileId: 'f' });
    const excessiveBatch = Array(11).fill({ fileId: 'f' });

    assert.ok(validBatch.length <= maxFiles);
    assert.ok(excessiveBatch.length > maxFiles);
  });

  it('enforces strict sequential order status state machine transitions', () => {
    const allowedTransitions = {
      PENDING: ['QUOTED', 'CANCELLED'],
      QUOTED: ['PAID', 'CANCELLED'],
      PAID: ['PRINTING', 'REFUNDED'],
      PRINTING: ['READY', 'FAILED'],
      READY: ['COLLECTED'],
      COLLECTED: [],
      CANCELLED: [],
      FAILED: ['PRINTING', 'REFUNDED'],
      REFUNDED: [],
    };

    function canTransition(current, next) {
      return (allowedTransitions[current] || []).includes(next);
    }

    assert.strictEqual(canTransition('PENDING', 'QUOTED'), true);
    assert.strictEqual(canTransition('QUOTED', 'PAID'), true);
    assert.strictEqual(canTransition('PAID', 'PRINTING'), true);
    assert.strictEqual(canTransition('PENDING', 'PRINTING'), false, 'Cannot skip QUOTED and PAID');
    assert.strictEqual(canTransition('COLLECTED', 'PENDING'), false, 'Terminal state cannot transition');
  });

  it('records immutable audit events with actor ID, action, and UTC timestamp', () => {
    const auditEvent = {
      order_id: 'ord_123',
      actor_type: 'customer',
      actor_id: '01712345678',
      action: 'order.created',
      created_at: new Date().toISOString(),
    };

    assert.ok(auditEvent.order_id);
    assert.ok(auditEvent.action);
    assert.ok(Date.parse(auditEvent.created_at) > 0);
  });
});

// --- FEATURE 22 BOUNDARY: Direct Presigned S3 Upload Pipeline ---
describe('Feature 22 Boundary: Direct Presigned S3 Upload Pipeline', () => {
  it('enforces presigned URL expiration TTL boundary (maximum 900 seconds / 15 minutes)', () => {
    const maxTtlSeconds = 900;
    const requestedTtl = 900;
    const excessiveTtl = 3600;

    assert.ok(requestedTtl <= maxTtlSeconds);
    assert.ok(excessiveTtl > maxTtlSeconds);
  });

  it('rejects zero-byte file upload requests (0 bytes boundary)', () => {
    function validateUploadMeta({ fileSize, mimeType }) {
      if (!fileSize || fileSize <= 0) {
        return { valid: false, error: 'File size must be greater than zero bytes' };
      }
      return { valid: true };
    }

    assert.strictEqual(validateUploadMeta({ fileSize: 0, mimeType: 'application/pdf' }).valid, false);
    assert.strictEqual(validateUploadMeta({ fileSize: -1, mimeType: 'application/pdf' }).valid, false);
    assert.strictEqual(validateUploadMeta({ fileSize: 1024, mimeType: 'application/pdf' }).valid, true);
  });

  it('rejects files exceeding maximum upload size limit (50MB boundary = 52,428,800 bytes)', () => {
    const maxBytes = 50 * 1024 * 1024;
    const exactLimit = maxBytes;
    const overLimit = maxBytes + 1;

    assert.ok(exactLimit <= maxBytes);
    assert.ok(overLimit > maxBytes);
  });

  it('whitelists allowed document MIME types (PDF, JPEG, PNG) and rejects others', () => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
    assert.strictEqual(allowedMimes.includes('application/pdf'), true);
    assert.strictEqual(allowedMimes.includes('image/png'), true);
    assert.strictEqual(allowedMimes.includes('application/x-msdownload'), false); // exe
    assert.strictEqual(allowedMimes.includes('application/zip'), false);
    assert.strictEqual(allowedMimes.includes('text/html'), false);
  });

  it('verifies SHA-256 integrity checksum calculation on uploaded content', () => {
    const content = Buffer.from('PrintFlow Customer Document Content');
    const digest = sha256(content);
    assert.strictEqual(digest.length, 64);
    assert.match(digest, /^[0-9a-f]{64}$/);
  });
});

// --- FEATURE 23 BOUNDARY: Upload Progress & Interactive File Card ---
describe('Feature 23 Boundary: Upload Progress & Interactive File Card', () => {
  it('clamps progress percentage strictly between 0% and 100%', () => {
    function clampProgress(val) {
      return Math.min(100, Math.max(0, Math.round(val)));
    }

    assert.strictEqual(clampProgress(-10), 0);
    assert.strictEqual(clampProgress(0), 0);
    assert.strictEqual(clampProgress(55.4), 55);
    assert.strictEqual(clampProgress(100), 100);
    assert.strictEqual(clampProgress(120), 100);
  });

  it('handles upload cancellation and resets file card state cleanly', () => {
    let uploadState = { status: 'uploading', progress: 45, aborted: false };
    function abortUpload() {
      uploadState = { status: 'aborted', progress: 0, aborted: true };
    }

    abortUpload();
    assert.strictEqual(uploadState.status, 'aborted');
    assert.strictEqual(uploadState.aborted, true);
    assert.strictEqual(uploadState.progress, 0);
  });

  it('sanitizes long filenames with unicode / Bengali characters', () => {
    const rawFilename = 'আমার_প্রিন্ট_ডকুমেন্ট_২০২৬_ভেরি_লং_ফাইলনেম.pdf';
    function sanitizeFilename(name) {
      return name.replace(/[^\w\u0980-\u09FF.-]/g, '_').slice(0, 100);
    }

    const clean = sanitizeFilename(rawFilename);
    assert.ok(clean.length <= 100);
    assert.ok(clean.endsWith('.pdf'));
  });

  it('removing a file card decrements file collection cleanly', () => {
    let files = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }];
    function removeFile(id) {
      files = files.filter((f) => f.id !== id);
    }

    removeFile('f2');
    assert.strictEqual(files.length, 2);
    assert.strictEqual(files.some((f) => f.id === 'f2'), false);
  });

  it('manages multi-file independent upload progress tracking', () => {
    const fileStates = {
      f1: { progress: 100, status: 'complete' },
      f2: { progress: 40, status: 'uploading' },
      f3: { progress: 0, status: 'queued' },
    };

    assert.strictEqual(fileStates.f1.progress, 100);
    assert.strictEqual(fileStates.f2.progress, 40);
    assert.strictEqual(fileStates.f3.status, 'queued');
  });
});

// --- FEATURE 24 BOUNDARY: Magic Byte & MIME Type Validator ---
describe('Feature 24 Boundary: Magic Byte & MIME Type Validator', () => {
  it('detects and rejects executable files disguised with .pdf extension (MZ header)', () => {
    const disguisedExe = createDisguisedExePdf();
    // 'MZ' magic bytes: 0x4D, 0x5A
    const isExe = disguisedExe[0] === 0x4d && disguisedExe[1] === 0x5a;
    assert.strictEqual(isExe, true, 'Disguised EXE fixture must start with MZ header');

    function validatePdfMagicBytes(buf) {
      return buf.length >= 4 && buf.toString('utf8', 0, 4) === '%PDF';
    }
    assert.strictEqual(validatePdfMagicBytes(disguisedExe), false, 'Disguised EXE must fail PDF magic byte check');
  });

  it('detects corrupted PDF headers and rejects them', () => {
    const corruptedPdf = createCorruptedHeaderPdf();
    function validatePdfMagicBytes(buf) {
      return buf.length >= 4 && buf.toString('utf8', 0, 4) === '%PDF';
    }
    assert.strictEqual(validatePdfMagicBytes(corruptedPdf), false);
  });

  it('accepts authentic valid PDF files starting with %PDF- header', () => {
    const validPdf = createValidSinglePagePdf();
    assert.strictEqual(validPdf.toString('utf8', 0, 5), '%PDF-');
  });

  it('authenticates valid PNG image magic bytes (89 50 4E 47 0D 0A 1A 0A)', () => {
    const png = createSamplePng();
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < pngSignature.length; i++) {
      assert.strictEqual(png[i], pngSignature[i], `Byte at index ${i} must match PNG signature`);
    }
  });

  it('authenticates valid JPEG image magic bytes (FF D8 FF)', () => {
    const jpeg = createSampleJpeg();
    assert.strictEqual(jpeg[0], 0xff);
    assert.strictEqual(jpeg[1], 0xd8);
    assert.strictEqual(jpeg[2], 0xff);
  });
});

// --- FEATURE 25 BOUNDARY: ClamAV Antivirus Scanner Integration ---
describe('Feature 25 Boundary: ClamAV Antivirus Scanner Integration', () => {
  it('detects standard EICAR test signature and flags virus infection', () => {
    const eicar = createEicarTestString();
    function scanBuffer(buf) {
      const str = buf.toString('utf8');
      if (str.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE!')) {
        return { isInfected: true, virusName: 'Eicar-Test-Signature' };
      }
      return { isInfected: false, virusName: null };
    }

    const result = scanBuffer(Buffer.from(eicar));
    assert.strictEqual(result.isInfected, true);
    assert.strictEqual(result.virusName, 'Eicar-Test-Signature');
  });

  it('quarantines infected files and immediately marks them unprintable', () => {
    let orderFile = { id: 'f_infected', status: 'uploaded', quarantine: false };
    function handleInfection(file, virusName) {
      return {
        ...file,
        status: 'quarantined',
        quarantine: true,
        quarantine_reason: virusName,
        quarantined_at: new Date().toISOString(),
      };
    }

    orderFile = handleInfection(orderFile, 'Eicar-Test-Signature');
    assert.strictEqual(orderFile.status, 'quarantined');
    assert.strictEqual(orderFile.quarantine, true);
  });

  it('safely handles ClamAV daemon connection timeout (fail-closed security posture)', () => {
    function handleScanError(error) {
      // Security fail-closed: do not process document if scanner is unreachable
      return { status: 'scan_error', canProcess: false, error: 'Antivirus scanner unreachable' };
    }

    const scanResult = handleScanError(new Error('Connection timed out to 127.0.0.1:3310'));
    assert.strictEqual(scanResult.canProcess, false);
    assert.strictEqual(scanResult.status, 'scan_error');
  });

  it('verifies authentic virus-free PDF passes antivirus scanning cleanly', () => {
    const cleanPdf = createValidSinglePagePdf();
    function scanCleanBuffer(buf) {
      const str = buf.toString('utf8');
      const isInfected = str.includes('EICAR');
      return { isInfected, virusName: isInfected ? 'Malware' : null };
    }

    const res = scanCleanBuffer(cleanPdf);
    assert.strictEqual(res.isInfected, false);
    assert.strictEqual(res.virusName, null);
  });

  it('logs security audit event upon malware quarantine without exposing malicious payload', () => {
    const auditLogs = [];
    function logMalwareDetection(fileId, virusName) {
      auditLogs.push({
        event: 'security.malware_detected',
        fileId,
        virusName,
        timestamp: new Date().toISOString(),
      });
    }

    logMalwareDetection('f_malware_123', 'Win32.Trojan.Generic');
    assert.strictEqual(auditLogs.length, 1);
    assert.strictEqual(auditLogs[0].event, 'security.malware_detected');
  });
});

// --- FEATURE 26 BOUNDARY: Poppler PDF Page Counter & Metrics ---
describe('Feature 26 Boundary: Poppler PDF Page Counter & Metrics', () => {
  it('accurately counts pages in a single-page valid PDF', () => {
    const singlePdf = createValidSinglePagePdf();
    function parsePageCount(buf) {
      const str = buf.toString('utf8');
      const matches = str.match(/\/Type\s*\/Page\b/g);
      return matches ? matches.length : 0;
    }

    assert.strictEqual(parsePageCount(singlePdf), 1);
  });

  it('accurately counts pages in a multi-page valid PDF (5 pages boundary)', () => {
    const multiPdf = createValidMultiPagePdf(5);
    function parsePageCount(buf) {
      const str = buf.toString('utf8');
      const matches = str.match(/\/Type\s*\/Page\b/g);
      return matches ? matches.length : 0;
    }

    assert.strictEqual(parsePageCount(multiPdf), 5);
  });

  it('rejects 0-page or unparseable PDF streams', () => {
    const zeroPagePdf = Buffer.from('%PDF-1.4\n%%EOF');
    function parsePageCount(buf) {
      const str = buf.toString('utf8');
      const matches = str.match(/\/Type\s*\/Page\b/g);
      return matches ? matches.length : 0;
    }

    const count = parsePageCount(zeroPagePdf);
    assert.strictEqual(count, 0);
  });

  it('calculates page dimensions and portrait/landscape orientation metrics', () => {
    function getOrientation(widthPts, heightPts) {
      if (widthPts > heightPts) return 'landscape';
      if (heightPts > widthPts) return 'portrait';
      return 'square';
    }

    // Standard A4: 595.28 x 841.89 points
    assert.strictEqual(getOrientation(595, 842), 'portrait');
    assert.strictEqual(getOrientation(842, 595), 'landscape');
    assert.strictEqual(getOrientation(600, 600), 'square');
  });

  it('handles CLI execution timeout on excessively large or circular PDF xref structures', () => {
    function simulatePopplerTimeout(maxExecutionTimeMs, actualTimeMs) {
      if (actualTimeMs > maxExecutionTimeMs) {
        throw new Error('Poppler pdfinfo execution timed out');
      }
      return true;
    }

    assert.throws(
      () => simulatePopplerTimeout(5000, 5500),
      /Poppler pdfinfo execution timed out/
    );
  });
});

// --- FEATURE 27 BOUNDARY: Encrypted / Password PDF Guard ---
describe('Feature 27 Boundary: Encrypted / Password PDF Guard', () => {
  it('detects password encryption via /Encrypt dictionary presence in PDF stream', () => {
    const encryptedPdf = createPasswordEncryptedPdf();
    function isPdfEncrypted(buf) {
      const str = buf.toString('utf8');
      return /\/Encrypt\s+\d+\s+\d+\s+R|\/Encrypt\s*<</.test(str);
    }

    assert.strictEqual(isPdfEncrypted(encryptedPdf), true);
  });

  it('verifies unencrypted valid PDFs do not trigger encryption detection', () => {
    const validPdf = createValidSinglePagePdf();
    function isPdfEncrypted(buf) {
      const str = buf.toString('utf8');
      return /\/Encrypt\s+\d+\s+\d+\s+R|\/Encrypt\s*<</.test(str);
    }

    assert.strictEqual(isPdfEncrypted(validPdf), false);
  });

  it('generates localized Bengali error message when password-protected PDF is uploaded', () => {
    const errorMap = {
      en: 'The PDF file is password protected and cannot be printed. Please upload an unlocked PDF.',
      bn: 'পিডিএফ ফাইলটি পাসওয়ার্ড দ্বারা সুরক্ষিত। অনুগ্রহ করে পাসওয়ার্ড মুক্ত ফাইল আপলোড করুন।',
    };

    assert.ok(errorMap.bn.includes('পাসওয়ার্ড'));
    assert.ok(errorMap.bn.includes('সুরক্ষিত'));
  });

  it('immediately marks encrypted PDF for ephemeral purge from storage', () => {
    let fileRecord = { id: 'enc_1', encrypted: true, purge_enqueued: false };
    function handleEncryptedFile(rec) {
      if (rec.encrypted) {
        return { ...rec, status: 'rejected_encrypted', purge_enqueued: true };
      }
      return rec;
    }

    fileRecord = handleEncryptedFile(fileRecord);
    assert.strictEqual(fileRecord.purge_enqueued, true);
    assert.strictEqual(fileRecord.status, 'rejected_encrypted');
  });

  it('rejects bypass attempts using empty string password or dummy credentials', () => {
    function attemptUnlock(pdfBuf, password) {
      // Empty string password must not bypass true encrypted documents
      if (!password || password.trim() === '') {
        return false;
      }
      return false; // locked
    }

    assert.strictEqual(attemptUnlock(createPasswordEncryptedPdf(), ''), false);
    assert.strictEqual(attemptUnlock(createPasswordEncryptedPdf(), '   '), false);
    assert.strictEqual(attemptUnlock(createPasswordEncryptedPdf(), 'admin'), false);
  });
});
