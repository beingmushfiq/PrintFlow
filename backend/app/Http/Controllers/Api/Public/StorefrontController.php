<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Public;

use App\Domain\Shared\Rules\BdPhone;
use App\Domain\Shop\Services\QrCodeGenerator;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\PriceProfile;
use App\Models\PriceRule;
use App\Models\Shop;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class StorefrontController extends Controller
{
    /**
     * List active public shops for storefront selection.
     */
    public function index(): JsonResponse
    {
        $shops = Shop::withoutTenant()
            ->where('public_status', 'active')
            ->orderBy('created_at')
            ->get(['id', 'name', 'slug', 'address', 'public_status']);

        return ApiResponse::success([
            'shops' => $shops,
        ]);
    }

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

        $publicSettings = $shop->public_settings_json ?? [
            'accepted_formats' => ['pdf', 'png', 'jpg', 'jpeg'],
            'max_file_size_mb' => 100,
        ];

        $priceGuide = $publicSettings['price_guide'] ?? [
            'simplex_mono' => 300,
            'duplex_mono' => 500,
            'simplex_color' => 1000,
            'duplex_color' => 1800,
        ];

        $profile = PriceProfile::withoutTenant()
            ->where('shop_id', $shop->id)
            ->where('status', 'active')
            ->first()
            ?? PriceProfile::withoutTenant()
                ->where('shop_id', $shop->id)
                ->latest()
                ->first();

        if ($profile) {
            $rules = PriceRule::withoutTenant()
                ->where('price_profile_id', $profile->id)
                ->where('is_active', true)
                ->get();

            $monoSimplex = $rules->first(fn ($r) => $r->color_mode === 'mono' && ($r->sides_mode === 'simplex' || $r->sides_mode === null));
            $monoDuplex = $rules->first(fn ($r) => $r->color_mode === 'mono' && $r->sides_mode === 'duplex');
            $colorSimplex = $rules->first(fn ($r) => $r->color_mode === 'color' && ($r->sides_mode === 'simplex' || $r->sides_mode === null));
            $colorDuplex = $rules->first(fn ($r) => $r->color_mode === 'color' && $r->sides_mode === 'duplex');

            if ($monoSimplex) {
                $baseMono = (int) $monoSimplex->unit_price_minor;
                $priceGuide['simplex_mono'] = $baseMono;
                if ($monoDuplex) {
                    $priceGuide['duplex_mono'] = (int) $monoDuplex->unit_price_minor;
                } else {
                    $ruleData = is_array($monoSimplex->rule_json) ? $monoSimplex->rule_json : [];
                    if (($ruleData['duplex_model'] ?? 'model_b') === 'model_a' && isset($ruleData['flat_duplex_sheet_rate_minor'])) {
                        $priceGuide['duplex_mono'] = (int) $ruleData['flat_duplex_sheet_rate_minor'];
                    } else {
                        $discount = (int) ($ruleData['duplex_discount_percent'] ?? 20);
                        $priceGuide['duplex_mono'] = (int) round($baseMono * 2 * (100 - $discount) / 100);
                    }
                }
            }

            if ($colorSimplex) {
                $baseColor = (int) $colorSimplex->unit_price_minor;
                $priceGuide['simplex_color'] = $baseColor;
                if ($colorDuplex) {
                    $priceGuide['duplex_color'] = (int) $colorDuplex->unit_price_minor;
                } else {
                    $ruleData = is_array($colorSimplex->rule_json) ? $colorSimplex->rule_json : [];
                    $discount = (int) ($ruleData['duplex_discount_percent'] ?? 10);
                    $priceGuide['duplex_color'] = (int) round($baseColor * 2 * (100 - $discount) / 100);
                }
            }
        }

        $publicSettings['price_guide'] = $priceGuide;

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
                'public_settings' => $publicSettings,
            ],
        ]);
    }

    /**
     * Generate shop counter QR code in PNG, SVG, or styled A4/A5 PDF placard.
     */
    public function qrCode(Request $request, string $slug, QrCodeGenerator $generator): Response|JsonResponse
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

        $frontendUrl = rtrim(config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/');
        $storefrontUrl = "{$frontendUrl}/s/{$shop->slug}";

        $format = strtolower($request->query('format', 'png'));

        if ($format === 'svg') {
            $svg = $generator->generateSvg($storefrontUrl);

            return response($svg, 200, [
                'Content-Type' => 'image/svg+xml',
                'Content-Disposition' => 'inline; filename="'.$shop->slug.'-qr.svg"',
            ]);
        }

        if ($format === 'pdf') {
            $paperSize = $request->query('paper', 'a4');
            $pdf = $generator->generatePlacardPdf($storefrontUrl, $shop->name, $paperSize);

            return response($pdf, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="'.$shop->slug.'-placard.pdf"',
            ]);
        }

        // Default: PNG 300 DPI
        $png = $generator->generatePng($storefrontUrl, 14);

        return response($png, 200, [
            'Content-Type' => 'image/png',
            'Content-Disposition' => 'inline; filename="'.$shop->slug.'-qr.png"',
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
