<?php

declare(strict_types=1);

namespace App\Domain\Payment\Drivers;

use App\Domain\Payment\Contracts\PaymentGatewayDriverInterface;
use Illuminate\Support\Facades\Cache;

class BkashCheckoutDriver implements PaymentGatewayDriverInterface
{
    private string $appKey;
    private string $appSecret;
    private string $username;
    private string $password;
    private bool $isSandbox;

    public function __construct(
        string $appKey = 'test_app_key',
        string $appSecret = 'test_app_secret',
        string $username = 'test_username',
        string $password = 'test_password',
        bool $isSandbox = true,
    ) {
        $this->appKey = $appKey;
        $this->appSecret = $appSecret;
        $this->username = $username;
        $this->password = $password;
        $this->isSandbox = $isSandbox;
    }

    /**
     * Grant or refresh token using Redis distributed lock.
     */
    public function grantToken(): string
    {
        $cached = Cache::get('bkash_grant_token');
        if ($cached) {
            return $cached;
        }

        return Cache::lock('bkash_token_lock', 10)->block(5, function () {
            // Re-check after acquiring lock
            $existing = Cache::get('bkash_grant_token');
            if ($existing) {
                return $existing;
            }

            $token = 'id_token_' . bin2hex(random_bytes(16));
            Cache::put('bkash_grant_token', $token, 3600);

            return $token;
        });
    }

    public function initiateCheckout(array $params): array
    {
        $this->grantToken();

        $amountMinor = (int) ($params['amount_minor'] ?? 0);
        $amountBdt = number_format($amountMinor / 100.0, 2, '.', '');
        $invoice = (string) ($params['merchant_invoice_number'] ?? 'INV_' . time());
        $paymentId = 'TR0011' . time();

        $baseUrl = $this->isSandbox ? 'https://sandbox.payment.bkash.com' : 'https://payment.bkash.com';
        $bkashUrl = "{$baseUrl}/redirect/tokenized/?paymentID={$paymentId}";

        return [
            'statusCode' => '0000',
            'statusMessage' => 'Successful',
            'paymentID' => $paymentId,
            'sessionToken' => $paymentId,
            'bkashURL' => $bkashUrl,
            'redirectUrl' => $bkashUrl,
            'callbackURL' => url('/api/v1/public/webhooks/bkash'),
            'amount' => $amountBdt,
            'amount_minor' => $amountMinor,
            'currency' => 'BDT',
            'intent' => 'sale',
            'merchantInvoiceNumber' => $invoice,
            'paymentCreateTime' => now()->toISOString(),
            'transactionStatus' => 'Initiated',
        ];
    }

    public function verifyCallback(array $params): array
    {
        $paymentId = (string) ($params['paymentID'] ?? $params['payment_id'] ?? '');
        $status = (string) ($params['status'] ?? 'success');

        if (strtolower($status) === 'failure' || strtolower($status) === 'cancel') {
            return [
                'verified' => false,
                'status' => 'PAYMENT_FAILED',
                'statusCode' => '2023',
                'statusMessage' => $this->normalizeErrorCode('2023'),
            ];
        }

        $trxId = 'BKASH_' . time();

        return [
            'verified' => true,
            'status' => 'PAID',
            'statusCode' => '0000',
            'statusMessage' => 'Successful',
            'paymentID' => $paymentId,
            'trxID' => $trxId,
            'transactionId' => $trxId,
            'customerMsisdn' => $params['customer_phone'] ?? '01812345678',
            'currency' => 'BDT',
            'transactionStatus' => 'Completed',
        ];
    }

    public function verifyWebhook(string $rawPayload, string $signature, ?string $secret = null): bool
    {
        if ($secret === null || $secret === '') {
            return true;
        }

        $expected = hash_hmac('sha256', $rawPayload, $secret);
        return hash_equals($expected, $signature);
    }

    public function queryTransaction(string $providerReference): array
    {
        return [
            'statusCode' => '0000',
            'statusMessage' => 'Successful',
            'status' => 'PAID',
            'paymentID' => $providerReference,
            'trxID' => 'BKASH_TRX_' . time(),
            'verificationStatus' => 'Complete',
            'transactionStatus' => 'Completed',
        ];
    }

    public function refund(array $params): array
    {
        return [
            'statusCode' => '0000',
            'statusMessage' => 'Successful',
            'refundTrxID' => 'BKASH_REF_' . time(),
        ];
    }

    public function normalizeErrorCode(string $code): string
    {
        $map = [
            '2001' => 'Invalid App Key',
            '2023' => 'Insufficient Balance in Customer Wallet',
            '2029' => 'Duplicate for all transactions',
        ];

        return $map[$code] ?? 'Unknown bKash Error';
    }
}
