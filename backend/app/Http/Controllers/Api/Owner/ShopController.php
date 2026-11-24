<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Owner;

use App\Domain\Shared\Rules\BdPhone;
use App\Domain\Shop\Services\QrCodeGenerator;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Shop;
use App\Models\ShopUserAssignment;
use App\Models\Tenant;
use App\Models\TenantUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ShopController extends Controller
{
    public function __construct(
        private readonly QrCodeGenerator $qrCodeGenerator
    ) {}

    /**
     * Resolve the primary shop for the authenticated user/tenant.
     */
    private function resolveShop(Request $request): ?Shop
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $assignment = ShopUserAssignment::withoutTenant()->where('user_id', $user->id)->first();
        if ($assignment) {
            return Shop::withoutTenant()->find($assignment->shop_id);
        }

        $tenantUser = TenantUser::withoutTenant()->where('user_id', $user->id)->first();
        if ($tenantUser) {
            return Shop::withoutTenant()->where('tenant_id', $tenantUser->tenant_id)->first();
        }

        $standaloneTenant = Tenant::where('edition', 'standalone')->first();
        if ($standaloneTenant) {
            return Shop::withoutTenant()->where('tenant_id', $standaloneTenant->id)->first();
        }

        return null;
    }

    /**
     * Get current shop details.
     */
    public function show(Request $request): JsonResponse
    {
        $shop = $this->resolveShop($request);

        if (! $shop) {
            return ApiResponse::error([
                [
                    'code' => 'SHOP_NOT_FOUND',
                    'message' => 'No shop found for this account.',
                ],
            ], 404);
        }

        $frontendUrl = rtrim(config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/');
        $storefrontUrl = "{$frontendUrl}/s/{$shop->slug}";

        return ApiResponse::success([
            'shop' => [
                'id' => $shop->id,
                'name' => $shop->name,
                'slug' => $shop->slug,
                'address' => $shop->address,
                'phone' => $shop->phone,
                'email' => $shop->email,
                'locale' => $shop->locale,
                'currency' => $shop->currency,
                'timezone' => $shop->timezone,
                'public_status' => $shop->public_status,
                'public_settings' => $shop->public_settings_json ?? [],
                'storefront_url' => $storefrontUrl,
                'created_at' => $shop->created_at?->toISOString(),
                'updated_at' => $shop->updated_at?->toISOString(),
            ],
        ]);
    }

    /**
     * Update current shop settings.
     */
    public function update(Request $request): JsonResponse
    {
        $shop = $this->resolveShop($request);

        if (! $shop) {
            return ApiResponse::error([
                [
                    'code' => 'SHOP_NOT_FOUND',
                    'message' => 'No shop found for this account.',
                ],
            ], 404);
        }

        $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'address' => 'nullable|string|max:500',
            'phone' => ['nullable', new BdPhone],
            'email' => 'nullable|email|max:255',
            'public_status' => 'sometimes|required|in:active,paused,closed',
            'locale' => 'sometimes|in:bn,en',
            'currency' => 'sometimes|string|max:3',
            'timezone' => 'sometimes|string|max:64',
            'public_settings' => 'nullable|array',
        ]);

        $updateData = [];

        if ($request->has('name')) {
            $updateData['name'] = $request->name;
        }
        if ($request->has('address')) {
            $updateData['address'] = $request->address;
        }
        if ($request->has('phone')) {
            $updateData['phone'] = $request->phone ? BdPhone::normalize($request->phone) : null;
        }
        if ($request->has('email')) {
            $updateData['email'] = $request->email ? strtolower(trim($request->email)) : null;
        }
        if ($request->has('public_status')) {
            $updateData['public_status'] = $request->public_status;
        }
        if ($request->has('locale')) {
            $updateData['locale'] = $request->locale;
        }
        if ($request->has('currency')) {
            $updateData['currency'] = strtoupper($request->currency);
        }
        if ($request->has('timezone')) {
            $updateData['timezone'] = $request->timezone;
        }
        if ($request->has('public_settings')) {
            $updateData['public_settings_json'] = $request->public_settings;
        }

        $shop->update($updateData);

        return ApiResponse::success([
            'message' => 'Shop updated successfully.',
            'shop' => [
                'id' => $shop->id,
                'name' => $shop->name,
                'slug' => $shop->slug,
                'address' => $shop->address,
                'phone' => $shop->phone,
                'email' => $shop->email,
                'locale' => $shop->locale,
                'currency' => $shop->currency,
                'timezone' => $shop->timezone,
                'public_status' => $shop->public_status,
                'public_settings' => $shop->public_settings_json ?? [],
            ],
        ]);
    }

    /**
     * Generate shop counter QR code in PNG, SVG, or styled A4/A5 PDF placard.
     */
    public function qrCode(Request $request): Response|JsonResponse
    {
        $shop = $this->resolveShop($request);

        if (! $shop) {
            return ApiResponse::error([
                [
                    'code' => 'SHOP_NOT_FOUND',
                    'message' => 'No shop found for this account.',
                ],
            ], 404);
        }

        $frontendUrl = rtrim(config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/');
        $storefrontUrl = "{$frontendUrl}/s/{$shop->slug}";

        $format = strtolower($request->query('format', 'png'));

        if ($format === 'svg') {
            $svg = $this->qrCodeGenerator->generateSvg($storefrontUrl);

            return response($svg, 200, [
                'Content-Type' => 'image/svg+xml',
                'Content-Disposition' => 'inline; filename="'.$shop->slug.'-qr.svg"',
            ]);
        }

        if ($format === 'pdf') {
            $paperSize = $request->query('paper', 'a4');
            $pdf = $this->qrCodeGenerator->generatePlacardPdf($storefrontUrl, $shop->name, $paperSize);

            return response($pdf, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="'.$shop->slug.'-placard.pdf"',
            ]);
        }

        // Default: PNG 300 DPI
        $png = $this->qrCodeGenerator->generatePng($storefrontUrl, 14);

        return response($png, 200, [
            'Content-Type' => 'image/png',
            'Content-Disposition' => 'inline; filename="'.$shop->slug.'-qr.png"',
        ]);
    }
}
