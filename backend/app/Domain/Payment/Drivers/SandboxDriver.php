<?php

declare(strict_types=1);

namespace App\Domain\Payment\Drivers;

use App\Domain\Payment\Contracts\PaymentGatewayDriverInterface;

class SandboxDriver implements PaymentGatewayDriverInterface
{
    public function initiateCheckout(array $params): array
    {
        $orderToken = (string) ($params['order_token'] ?? $params['orderToken'] ?? 'order_tok');
        $amountPoisha = (int) ($params['amount_minor'] ?? $params['amountPoisha'] ?? 0);
        $outcome = (string) ($params['outcome'] ?? 'success');

        $tranId = 'SNDBX_' . time() . '_' . substr(hash('sha256', $orderToken), 0, 8);
        $idempotencyKey = hash('sha256', "{$orderToken}:{$amountPoisha}");

        if ($outcome === 'timeout') {
            return [
                'status' => 'PENDING_TIMEOUT',
                'transactionId' => $tranId,
                'gateway' => 'sandbox',
                'sessionToken' => 'sndbx_sess_' . $tranId,
                'redirectUrl' => "/order/{$orderToken}?gateway=sandbox&outcome=timeout",
                'idempotencyKey' => $idempotencyKey,
                'error' => 'Payment gateway timeout waiting for customer authorization',
            ];
        }

        if ($outcome === 'failed') {
            return [
                'status' => 'PAYMENT_FAILED',
                'transactionId' => $tranId,
                'gateway' => 'sandbox',
                'sessionToken' => 'sndbx_sess_' . $tranId,
                'redirectUrl' => "/order/{$orderToken}?gateway=sandbox&outcome=failed",
                'idempotencyKey' => $idempotencyKey,
                'error' => 'Card declined or insufficient balance in sandbox wallet',
            ];
        }

        return [
            'status' => 'PAID',
            'transactionId' => $tranId,
            'gateway' => 'sandbox',
            'sessionToken' => 'sndbx_sess_' . $tranId,
            'redirectUrl' => "/order/{$orderToken}?gateway=sandbox&outcome=success",
            'amountPoisha' => $amountPoisha,
            'paidAt' => now()->toISOString(),
            'idempotencyKey' => $idempotencyKey,
        ];
    }

    public function verifyCallback(array $params): array
    {
        $outcome = (string) ($params['outcome'] ?? 'success');
        $orderToken = (string) ($params['order_token'] ?? 'tok');
        $amountPoisha = (int) ($params['amount_minor'] ?? 0);
        $tranId = (string) ($params['transaction_id'] ?? 'SNDBX_' . time());

        if ($outcome === 'failed') {
            return [
                'verified' => false,
                'status' => 'PAYMENT_FAILED',
                'transactionId' => $tranId,
                'error' => 'Card declined or insufficient balance in sandbox wallet',
            ];
        }

        if ($outcome === 'timeout') {
            return [
                'verified' => false,
                'status' => 'PENDING_TIMEOUT',
                'transactionId' => $tranId,
                'error' => 'Payment gateway timeout waiting for customer authorization',
            ];
        }

        return [
            'verified' => true,
            'status' => 'PAID',
            'transactionId' => $tranId,
            'gateway' => 'sandbox',
            'amount_minor' => $amountPoisha,
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
            'status' => 'PAID',
            'transactionStatus' => 'Completed',
            'providerReference' => $providerReference,
            'gateway' => 'sandbox',
        ];
    }

    public function refund(array $params): array
    {
        return [
            'status' => 'refunded',
            'refundId' => 'SNDBX_REF_' . time(),
        ];
    }
}
