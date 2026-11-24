<?php

declare(strict_types=1);

namespace App\Domain\Payment\Factories;

use App\Domain\Payment\Contracts\PaymentGatewayDriverInterface;
use App\Domain\Payment\Drivers\BkashCheckoutDriver;
use App\Domain\Payment\Drivers\SandboxDriver;
use App\Domain\Payment\Drivers\SslCommerzDriver;
use App\Models\GatewayAccount;
use InvalidArgumentException;

class PaymentGatewayFactory
{
    /**
     * Resolve payment gateway driver by provider name and optional gateway account.
     */
    public static function make(string $provider, ?GatewayAccount $account = null): PaymentGatewayDriverInterface
    {
        $provider = strtolower(trim($provider));

        return match ($provider) {
            'sslcommerz' => new SslCommerzDriver(
                storeId: $account?->merchant_identifier ?? 'test_store',
                storePassword: 'test_store_passwd',
                isSandbox: ($account?->environment ?? 'sandbox') === 'sandbox'
            ),
            'bkash' => new BkashCheckoutDriver(
                appKey: $account?->merchant_identifier ?? 'test_app_key',
                appSecret: 'test_app_secret',
                username: 'test_username',
                password: 'test_password',
                isSandbox: ($account?->environment ?? 'sandbox') === 'sandbox'
            ),
            'sandbox' => new SandboxDriver(),
            default => throw new InvalidArgumentException("Unsupported payment gateway provider: {$provider}"),
        };
    }
}
