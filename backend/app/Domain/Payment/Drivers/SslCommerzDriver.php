<?php

declare(strict_types=1);

namespace App\Domain\Payment\Drivers;

use App\Domain\Payment\Contracts\PaymentGatewayDriverInterface;

class SslCommerzDriver implements PaymentGatewayDriverInterface
{
    private string $storeId;
    private string $storePassword;
    private bool $isSandbox;

    public function __construct(string $storeId = 'test_store', string $storePassword = 'test_store_passwd', bool $isSandbox = true)
    {
        $this->storeId = $storeId;
        $this->storePassword = $storePassword;
        $this->isSandbox = $isSandbox;
    }

    public function initiateCheckout(array $params): array
    {
        $tranId = (string) ($params['tran_id'] ?? $params['internal_reference'] ?? 'PF_TX_' . time());
        $amountMinor = (int) ($params['amount_minor'] ?? 0);
        $amountBdt = number_format($amountMinor / 100.0, 2, '.', '');
        $currency = (string) ($params['currency'] ?? 'BDT');
        $storeId = $this->storeId;

        $sessionKey = hash('sha256', "{$tranId}:{$amountBdt}:" . time());
        $baseUrl = $this->isSandbox ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com';
        $gatewayPageUrl = "{$baseUrl}/EasyCheckOut/testcasereq.php?token={$sessionKey}";

        return [
            'status' => 'SUCCESS',
            'failedreason' => '',
            'sessionkey' => $sessionKey,
            'sessionToken' => $sessionKey,
            'redirectUrl' => $gatewayPageUrl,
            'GatewayPageURL' => $gatewayPageUrl,
            'store_id' => $storeId,
            'tran_id' => $tranId,
            'amount' => $amountBdt,
            'amount_minor' => $amountMinor,
            'currency' => $currency,
            'gw' => [
                'visa' => '1',
                'master' => '1',
                'bkash' => '1',
                'nagad' => '1',
            ],
        ];
    }

    public function verifyCallback(array $params): array
    {
        $tranId = (string) ($params['tran_id'] ?? '');
        $valId = (string) ($params['val_id'] ?? '');
        $status = (string) ($params['status'] ?? 'FAILED');
        $verifySign = (string) ($params['verify_sign'] ?? '');
        $verifyKey = (string) ($params['verify_key'] ?? '');
        $amount = (string) ($params['amount'] ?? '0.00');

        $isValidSign = $this->validateIpnSignature($params, $this->storePassword);

        if (! $isValidSign || strtoupper($status) !== 'VALID') {
            return [
                'verified' => false,
                'status' => 'FAILED',
                'transactionId' => $valId ?: $tranId,
                'tran_id' => $tranId,
                'error' => 'Invalid SSLCOMMERZ signature or transaction status: ' . $status,
            ];
        }

        return [
            'verified' => true,
            'status' => 'PAID',
            'transactionId' => $valId,
            'tran_id' => $tranId,
            'bank_tran_id' => $params['bank_tran_id'] ?? null,
            'card_type' => $params['card_type'] ?? null,
            'amount' => $amount,
        ];
    }

    public function verifyWebhook(string $rawPayload, string $signature, ?string $secret = null): bool
    {
        $payload = json_decode($rawPayload, true);
        if (! is_array($payload)) {
            parse_str($rawPayload, $payload);
        }

        if (! is_array($payload)) {
            return false;
        }

        return $this->validateIpnSignature($payload, $secret ?? $this->storePassword);
    }

    public function validateIpnSignature(array $payload, string $storePassword): bool
    {
        if (empty($payload['verify_sign']) || empty($payload['verify_key'])) {
            return false;
        }

        $verifyKeys = explode(',', $payload['verify_key']);
        $hashStringParts = [];

        foreach ($verifyKeys as $key) {
            $trimmedKey = trim($key);
            if (isset($payload[$trimmedKey])) {
                $hashStringParts[] = "{$trimmedKey}={$payload[$trimmedKey]}";
            }
        }

        $hashedStorePass = md5($storePassword);
        $signString = implode('&', $hashStringParts) . '&' . $hashedStorePass;
        $expectedSign = md5($signString);

        return hash_equals(strtolower($expectedSign), strtolower((string) $payload['verify_sign']));
    }

    public function queryTransaction(string $providerReference): array
    {
        return [
            'status' => 'PAID',
            'transactionStatus' => 'Completed',
            'statusCode' => '0000',
            'providerReference' => $providerReference,
            'gateway' => 'sslcommerz',
        ];
    }

    public function refund(array $params): array
    {
        return [
            'status' => 'SUCCESS',
            'refundref_id' => 'SSL_REF_' . time(),
        ];
    }
}
