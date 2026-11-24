<?php

declare(strict_types=1);

namespace App\Domain\Payment\Contracts;

interface PaymentGatewayDriverInterface
{
    /**
     * Initiate payment session/checkout redirect.
     *
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public function initiateCheckout(array $params): array;

    /**
     * Verify payment response callback/return URL.
     *
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public function verifyCallback(array $params): array;

    /**
     * Verify raw webhook payload signature.
     */
    public function verifyWebhook(string $rawPayload, string $signature, ?string $secret = null): bool;

    /**
     * Query gateway for transaction status.
     *
     * @return array<string, mixed>
     */
    public function queryTransaction(string $providerReference): array;

    /**
     * Process refund.
     *
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public function refund(array $params): array;
}
