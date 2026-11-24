/**
 * PrintFlow Payment Gateway Mock & Verification Library
 *
 * Implements:
 * - SSLCOMMERZ v4 Session API & IPN callback generator with MD5/SHA256 signature calculation
 * - Tampered SSLCOMMERZ callback generator for Scenario 5 (Webhook Tampering)
 * - bKash Tokenized Checkout simulation (Create, Execute, Query, Error codes)
 * - Sandbox driver payment flows and idempotency key guard verification
 */

import { md5, sha256 } from '../utils/cryptoUtils.js';

export class MockGateway {
  /**
   * --- SSLCOMMERZ v4 Helpers ---
   */

  /**
   * Generates mock response for SSLCOMMERZ v4 Session Initialization API.
   * @param {object} params
   * @param {string} params.tranId
   * @param {string} params.amount
   * @param {string} [params.storeId='test_store']
   * @returns {object}
   */
  static createSslSessionResponse({ tranId, amount, storeId = 'test_store' }) {
    const sessionKey = sha256(`${tranId}:${amount}:${Date.now()}`);
    return {
      status: 'SUCCESS',
      failedreason: '',
      sessionkey: sessionKey,
      gw: {
        visa: '1',
        master: '1',
        bkash: '1',
        nagad: '1',
      },
      GatewayPageURL: `https://sandbox.sslcommerz.com/EasyCheckOut/testcasereq.php?token=${sessionKey}`,
      store_id: storeId,
      tran_id: tranId,
      amount,
      currency: 'BDT',
    };
  }

  /**
   * Generates a valid SSLCOMMERZ v4 IPN POST callback payload with correct verify_sign hash.
   *
   * @param {object} params
   * @param {string} params.tranId Order transaction ID
   * @param {string} params.valId Validation ID
   * @param {string} params.amount Decimal string (e.g., '25.00')
   * @param {string} [params.storePassword='test_store_passwd'] Store secret for hashing
   * @param {string} [params.cardType='BKASH-BKash']
   * @param {string} [params.status='VALID']
   * @returns {object}
   */
  static createSslIpnPayload({
    tranId,
    valId,
    amount,
    storePassword = 'test_store_passwd',
    cardType = 'BKASH-BKash',
    status = 'VALID',
  }) {
    const bankTranId = `BANK_${Date.now()}`;
    const tranDate = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const payload = {
      tran_id: tranId,
      val_id: valId,
      amount,
      card_type: cardType,
      store_amount: amount,
      card_no: '01712345678',
      bank_tran_id: bankTranId,
      status,
      tran_date: tranDate,
      currency: 'BDT',
      card_issuer: 'bKash Mobile Banking',
      card_brand: 'MOBILEBANKING',
      card_sub_brand: 'Classic',
      currency_type: 'BDT',
      currency_amount: amount,
      currency_rate: '1.0000',
      base_fair: '0.00',
      value_a: '',
      value_b: '',
      value_c: '',
      value_d: '',
      subscription_id: '',
      risk_level: '0',
      risk_title: 'Safe',
    };

    // Calculate verify_sign according to SSLCOMMERZ v4 specification:
    // Keys to hash are listed in verify_key in alphabetical order, values joined by '&' + md5(storePassword)
    const verifyKeys = [
      'amount',
      'bank_tran_id',
      'base_fair',
      'card_brand',
      'card_issuer',
      'card_no',
      'card_sub_brand',
      'card_type',
      'currency',
      'currency_amount',
      'currency_rate',
      'currency_type',
      'risk_level',
      'risk_title',
      'status',
      'store_amount',
      'tran_date',
      'tran_id',
      'val_id',
    ].sort();

    const hashStringParts = [];
    for (const key of verifyKeys) {
      if (payload[key] !== undefined) {
        hashStringParts.push(`${key}=${payload[key]}`);
      }
    }

    const hashedStorePass = md5(storePassword);
    const signString = `${hashStringParts.join('&')}&${hashedStorePass}`;
    const verifySign = md5(signString);

    payload.verify_key = verifyKeys.join(',');
    payload.verify_sign = verifySign;

    return payload;
  }

  /**
   * Validates whether an incoming SSLCOMMERZ IPN payload has a valid signature.
   * @param {object} payload
   * @param {string} storePassword
   * @returns {boolean}
   */
  static validateSslIpn(payload, storePassword) {
    if (!payload || !payload.verify_sign || !payload.verify_key) {
      return false;
    }

    const verifyKeys = payload.verify_key.split(',');
    const hashStringParts = [];
    for (const key of verifyKeys) {
      if (payload[key] !== undefined) {
        hashStringParts.push(`${key}=${payload[key]}`);
      }
    }

    const hashedStorePass = md5(storePassword);
    const signString = `${hashStringParts.join('&')}&${hashedStorePass}`;
    const expectedSign = md5(signString);

    return payload.verify_sign.toLowerCase() === expectedSign.toLowerCase();
  }

  /**
   * Generates a tampered SSLCOMMERZ IPN payload for Scenario 5 testing.
   * Has forged parameters without matching signature.
   *
   * @param {object} basePayload A valid IPN payload or params
   * @returns {object}
   */
  static createTamperedSslIpnPayload(basePayload) {
    const original = basePayload.verify_sign
      ? basePayload
      : MockGateway.createSslIpnPayload(basePayload);
    const payload = { ...original };
    // Tamper with the amount while keeping the old signature
    payload.amount = '99999.00';
    payload.store_amount = '99999.00';
    return payload;
  }

  /**
   * Generates mock order validation API response for SSLCOMMERZ.
   * @param {object} params
   * @returns {object}
   */
  static createSslOrderValidationResponse({ tranId, valId, amount, status = 'VALID' }) {
    return {
      status,
      tran_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
      tran_id: tranId,
      val_id: valId,
      amount,
      store_amount: amount,
      bank_tran_id: `BANK_${Date.now()}`,
      card_type: 'BKASH-BKash',
      card_no: '01712345678',
      currency: 'BDT',
      currency_type: 'BDT',
      currency_amount: amount,
      currency_rate: '1.0000',
      base_fair: '0.00',
      APIConnect: 'DONE',
    };
  }

  /**
   * --- bKash Tokenized Checkout Helpers ---
   */

  /**
   * Generates mock response for bKash createPayment API.
   * @param {object} params
   * @param {string} params.amount Decimal amount in BDT string
   * @param {string} [params.merchantInvoiceNumber]
   * @returns {object}
   */
  static createBkashCreatePaymentResponse({ amount, merchantInvoiceNumber }) {
    const paymentId = `TR0011${Date.now()}`;
    return {
      statusCode: '0000',
      statusMessage: 'Successful',
      paymentID: paymentId,
      bkashURL: `https://sandbox.payment.bkash.com/redirect/tokenized/?paymentID=${paymentId}`,
      callbackURL: 'http://localhost:8000/api/v1/payments/bkash/callback',
      amount,
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: merchantInvoiceNumber || `INV_${Date.now()}`,
      paymentCreateTime: new Date().toISOString(),
      transactionStatus: 'Initiated',
    };
  }

  /**
   * Generates mock response for bKash executePayment API.
   * @param {object} params
   * @param {string} params.paymentId
   * @param {string} params.amount
   * @returns {object}
   */
  static createBkashExecutePaymentResponse({ paymentId, amount }) {
    const trxId = `BKASH_${Date.now()}`;
    return {
      statusCode: '0000',
      statusMessage: 'Successful',
      paymentID: paymentId,
      trxID: trxId,
      customerMsisdn: '01812345678',
      amount,
      currency: 'BDT',
      intent: 'sale',
      paymentExecuteTime: new Date().toISOString(),
      transactionStatus: 'Completed',
    };
  }

  /**
   * Generates mock response for bKash queryPayment API.
   * @param {object} params
   * @param {string} params.paymentId
   * @param {string} params.amount
   * @param {string} [params.trxId]
   * @returns {object}
   */
  static createBkashQueryPaymentResponse({ paymentId, amount, trxId }) {
    return {
      statusCode: '0000',
      statusMessage: 'Successful',
      paymentID: paymentId,
      trxID: trxId || `BKASH_${Date.now()}`,
      amount,
      currency: 'BDT',
      intent: 'sale',
      verificationStatus: 'Complete',
      transactionStatus: 'Completed',
    };
  }

  /**
   * Generates bKash error responses by standard error codes.
   * @param {'2001'|'2023'|'2029'} code
   * @returns {object}
   */
  static createBkashErrorResponse(code) {
    const errorMap = {
      '2001': 'Invalid App Key',
      '2023': 'Insufficient Balance in Customer Wallet',
      '2029': 'Duplicate for all transactions',
    };
    return {
      statusCode: code,
      statusMessage: errorMap[code] || 'Unknown bKash Error',
    };
  }

  /**
   * --- Sandbox Payment Driver Helpers ---
   */

  /**
   * Generates simulated sandbox transaction result.
   * @param {object} params
   * @param {string} params.orderToken
   * @param {number} params.amountPoisha
   * @param {'success'|'failed'|'timeout'} [params.outcome='success']
   * @returns {object}
   */
  static simulateSandboxPayment({ orderToken, amountPoisha, outcome = 'success' }) {
    const tranId = `SNDBX_${Date.now()}_${orderToken.slice(0, 8)}`;
    if (outcome === 'success') {
      return {
        status: 'PAID',
        transactionId: tranId,
        gateway: 'sandbox',
        amountPoisha,
        paidAt: new Date().toISOString(),
        idempotencyKey: sha256(`${orderToken}:${amountPoisha}`),
      };
    } else if (outcome === 'timeout') {
      return {
        status: 'PENDING_TIMEOUT',
        transactionId: tranId,
        gateway: 'sandbox',
        error: 'Payment gateway timeout waiting for customer authorization',
      };
    } else {
      return {
        status: 'PAYMENT_FAILED',
        transactionId: tranId,
        gateway: 'sandbox',
        error: 'Card declined or insufficient balance in sandbox wallet',
      };
    }
  }
}
