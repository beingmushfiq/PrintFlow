/**
 * PrintFlow Cryptographic & Verification Utilities
 *
 * Implements:
 * - SHA-256 for immutable quote snapshots & file fingerprinting
 * - HMAC-SHA256 for raw-byte webhook signature validation
 * - Correlation ID generation for distributed tracing (X-Correlation-ID)
 * - SSLCOMMERZ signature helpers
 * - 6-digit agent pairing code generator
 */

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

/**
 * Computes SHA-256 hash of a buffer or string.
 * @param {string|Buffer|Uint8Array} data
 * @param {'hex'|'base64'} [encoding='hex']
 * @returns {string}
 */
export function sha256(data, encoding = 'hex') {
  return createHash('sha256').update(data).digest(encoding);
}

/**
 * Computes MD5 hash (used by legacy gateways or checksums).
 * @param {string|Buffer|Uint8Array} data
 * @param {'hex'|'base64'} [encoding='hex']
 * @returns {string}
 */
export function md5(data, encoding = 'hex') {
  return createHash('md5').update(data).digest(encoding);
}

/**
 * Computes HMAC-SHA256 of data using secret key.
 * @param {string|Buffer} secret
 * @param {string|Buffer|Uint8Array} data
 * @param {'hex'|'base64'} [encoding='hex']
 * @returns {string}
 */
export function hmacSha256(secret, data, encoding = 'hex') {
  return createHmac('sha256', secret).update(data).digest(encoding);
}

/**
 * Generates a unique correlation ID for request tracing.
 * Uses standard UUID v4.
 * @returns {string}
 */
export function generateCorrelationId() {
  return randomUUID();
}

/**
 * Verifies raw-byte webhook signature against expected HMAC or hash.
 * Constant-time comparison to prevent timing attacks.
 *
 * @param {string|Buffer} rawPayload
 * @param {string} receivedSignature
 * @param {string} secretKey
 * @param {'sha256'|'md5'} [algorithm='sha256']
 * @returns {boolean}
 */
export function verifyRawSignature(rawPayload, receivedSignature, secretKey, algorithm = 'sha256') {
  if (!rawPayload || !receivedSignature || !secretKey) {
    return false;
  }

  const expectedSignature = algorithm === 'sha256'
    ? hmacSha256(secretKey, rawPayload, 'hex')
    : createHmac('md5', secretKey).update(rawPayload).digest('hex');

  const bufA = Buffer.from(receivedSignature.toLowerCase(), 'hex');
  const bufB = Buffer.from(expectedSignature.toLowerCase(), 'hex');

  if (bufA.length !== bufB.length) {
    return false;
  }

  // Constant-time compare
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

/**
 * Generates a 6-digit numeric agent pairing code (000000 - 999999).
 * @returns {string}
 */
export function generateAgentPairingCode() {
  const bytes = randomBytes(4);
  const num = bytes.readUInt32BE(0) % 1000000;
  return String(num).padStart(6, '0');
}
