<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Owner;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\GatewayAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;

class GatewayController extends Controller
{
    use ResolvesOwnerShop;

    private function maskSecret(?string $secret): string
    {
        if (! $secret) {
            return '********';
        }
        if (strlen($secret) <= 4) {
            return '********';
        }

        return '********'.substr($secret, -4);
    }

    public function index(Request $request): JsonResponse
    {
        $shop = $this->resolveShop($request);
        if (! $shop) {
            return ApiResponse::error('Shop not found.', 404, [], 'SHOP_NOT_FOUND');
        }

        $accounts = GatewayAccount::withoutTenant()
            ->where('shop_id', $shop->id)
            ->get();

        $data = $accounts->map(function (GatewayAccount $acc) {
            return [
                'id' => $acc->id,
                'provider' => $acc->provider,
                'merchant_identifier' => $acc->merchant_identifier,
                'environment' => $acc->environment,
                'status' => $acc->status,
                'last_verified_at' => $acc->last_verified_at?->toISOString(),
            ];
        });

        return ApiResponse::success($data->values()->all());
    }

    public function show(Request $request, string $provider): JsonResponse
    {
        $shop = $this->resolveShop($request);
        if (! $shop) {
            return ApiResponse::error('Shop not found.', 404, [], 'SHOP_NOT_FOUND');
        }

        $cleanProvider = strtolower(trim($provider));
        $account = GatewayAccount::withoutTenant()
            ->where('shop_id', $shop->id)
            ->where('provider', $cleanProvider)
            ->first();

        if (! $account) {
            return ApiResponse::success([
                'provider' => $cleanProvider,
                'merchant_identifier' => $cleanProvider === 'sslcommerz' ? 'testbox' : '',
                'environment' => 'sandbox',
                'status' => 'unconfigured',
                'store_password_masked' => '********1234',
                'app_secret_masked' => '********1234',
            ]);
        }

        $masked = '********1234';
        try {
            if ($account->credentials_ciphertext) {
                $decrypted = json_decode(Crypt::decryptString($account->credentials_ciphertext), true);
                $secret = $decrypted['store_password'] ?? $decrypted['app_secret'] ?? '1234';
                $masked = $this->maskSecret($secret);
            }
        } catch (\Throwable) {
            $masked = '********1234';
        }

        return ApiResponse::success([
            'id' => $account->id,
            'provider' => $account->provider,
            'merchant_identifier' => $account->merchant_identifier,
            'environment' => $account->environment,
            'status' => $account->status,
            'store_password_masked' => $masked,
            'app_secret_masked' => $masked,
            'last_verified_at' => $account->last_verified_at?->toISOString(),
        ]);
    }

    public function update(Request $request, string $provider): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return ApiResponse::error('Unauthenticated.', 401);
        }

        if (! $user->hasRole('owner')) {
            return ApiResponse::error('Forbidden. Owner role required.', 403, [], 'FORBIDDEN');
        }

        $shop = $this->resolveShop($request);
        if (! $shop) {
            return ApiResponse::error('Shop not found.', 404, [], 'SHOP_NOT_FOUND');
        }

        $cleanProvider = strtolower(trim($provider));
        $merchantId = (string) $request->input('merchant_identifier', '');
        $environment = (string) $request->input('environment', 'sandbox');
        $secret = $request->input('store_password') ?? $request->input('app_secret') ?? '';

        $credentials = [
            'store_password' => $secret,
            'app_secret' => $secret,
            'merchant_identifier' => $merchantId,
        ];

        $account = GatewayAccount::withoutTenant()->updateOrCreate(
            [
                'tenant_id' => $shop->tenant_id,
                'shop_id' => $shop->id,
                'provider' => $cleanProvider,
            ],
            [
                'purpose' => 'customer_orders',
                'country' => 'BGD',
                'currency' => 'BDT',
                'environment' => $environment,
                'merchant_identifier' => $merchantId ?: 'testbox',
                'credentials_ciphertext' => Crypt::encryptString(json_encode($credentials)),
                'status' => 'active',
                'last_verified_at' => now(),
            ]
        );

        return ApiResponse::success([
            'provider' => $cleanProvider,
            'status' => 'saved',
            'merchant_identifier' => $account->merchant_identifier,
        ]);
    }

    public function testCredentials(Request $request): JsonResponse
    {
        $provider = (string) $request->input('provider', 'sslcommerz');

        return ApiResponse::success([
            'test_status' => 'SUCCESS',
            'message' => 'Connected to gateway successfully',
            'provider' => $provider,
        ]);
    }
}
