<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Public;

use App\Domain\Shared\Rules\BdPhone;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\Shop;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class StorefrontController extends Controller
{
    /**
     * Get public shop information by slug.
     */
    public function show(string $slug): JsonResponse
    {
        $shop = Shop::withoutTenant()->where('slug', $slug)->first();

        if (! $shop) {
            return ApiResponse::error([
                [
                    'code' => 'SHOP_NOT_FOUND',
                    'message' => 'The requested print shop was not found.',
                ],
            ], 404);
        }

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
                'public_status' => $shop->public_status,
                'public_settings' => $shop->public_settings_json ?? [
                    'accepted_formats' => ['pdf', 'png', 'jpg', 'jpeg'],
                    'max_file_size_mb' => 100,
                    'price_guide' => [
                        'simplex_mono' => 300, // 3.00 BDT in poisha
                        'duplex_mono' => 500,  // 5.00 BDT in poisha
                        'simplex_color' => 1000, // 10.00 BDT in poisha
                        'duplex_color' => 1800,  // 18.00 BDT in poisha
                    ],
                ],
            ],
        ]);
    }

    /**
     * Initialize a new customer order draft with mandatory 11-digit BD phone number.
     */
    public function createOrder(Request $request, string $slug): JsonResponse
    {
        $shop = Shop::withoutTenant()->where('slug', $slug)->first();

        if (! $shop) {
            return ApiResponse::error([
                [
                    'code' => 'SHOP_NOT_FOUND',
                    'message' => 'The requested print shop was not found.',
                ],
            ], 404);
        }

        if ($shop->public_status !== 'active') {
            return ApiResponse::error([
                [
                    'code' => 'SHOP_NOT_ACCEPTING_ORDERS',
                    'message' => 'This print shop is currently not accepting new orders.',
                ],
            ], 422);
        }

        $request->validate([
            'customer_phone' => ['required', new BdPhone],
            'customer_name' => 'nullable|string|max:255',
        ]);

        $normalizedPhone = BdPhone::normalize($request->customer_phone);

        $publicToken = Str::random(40);
        $publicTokenHash = hash('sha256', $publicToken);
        $publicReference = 'PF-'.strtoupper(Str::random(4)).'-'.strtoupper(Str::random(4));

        $order = Order::withoutTenant()->create([
            'tenant_id' => $shop->tenant_id,
            'shop_id' => $shop->id,
            'public_reference' => $publicReference,
            'public_token_hash' => $publicTokenHash,
            'customer_phone' => $normalizedPhone,
            'customer_name' => $request->customer_name,
            'status' => 'draft',
            'currency' => $shop->currency ?: 'BDT',
            'source' => 'qr',
            'expires_at' => now()->addHours(2),
        ]);

        OrderEvent::withoutTenant()->create([
            'tenant_id' => $shop->tenant_id,
            'shop_id' => $shop->id,
            'order_id' => $order->id,
            'event_type' => 'order.draft_created',
            'from_status' => null,
            'to_status' => 'draft',
            'actor_type' => 'customer',
            'description' => 'Customer initiated print order from storefront QR scan.',
            'payload_json' => [
                'customer_phone' => $normalizedPhone,
                'source' => 'qr',
            ],
        ]);

        return ApiResponse::success([
            'order' => [
                'id' => $order->id,
                'public_reference' => $order->public_reference,
                'public_token' => $publicToken,
                'customer_phone' => $order->customer_phone,
                'customer_name' => $order->customer_name,
                'status' => $order->status,
                'currency' => $order->currency,
                'expires_at' => $order->expires_at?->toISOString(),
            ],
        ], [], 201);
    }
}
