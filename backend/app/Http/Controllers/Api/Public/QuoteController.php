<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Public;

use App\Domain\Pricing\DTOs\PricingRequest;
use App\Domain\Pricing\Services\DynamicDuplexPricingEngine;
use App\Domain\Pricing\Services\QuoteSnapshotGenerator;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Order;
use App\Models\Quote;
use App\Models\Shop;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QuoteController extends Controller
{
    public function __construct(
        private readonly DynamicDuplexPricingEngine $pricingEngine,
        private readonly QuoteSnapshotGenerator $quoteGenerator,
    ) {}

    private function resolveOrder(string $token): ?Order
    {
        $hash = hash('sha256', $token);

        return Order::withoutTenant()
            ->where('public_token_hash', $hash)
            ->orWhere('public_token_hash', $token)
            ->orWhere('public_reference', $token)
            ->first();
    }

    /**
     * Configure options and generate a frozen quote.
     */
    public function createQuote(Request $request, string $slug, string $token): JsonResponse
    {
        $order = $this->resolveOrder($token);

        if (! $order) {
            return ApiResponse::error([
                [
                    'code' => 'ORDER_NOT_FOUND',
                    'message' => 'The requested order was not found.',
                ],
            ], 404);
        }

        $validated = $request->validate([
            'copies' => 'nullable|integer|min:1|max:100',
            'page_range' => 'nullable|string',
            'color_mode' => 'nullable|string|in:mono,color',
            'sides_mode' => 'nullable|string|in:simplex,duplex',
            'paper_size' => 'nullable|string|in:A4,Legal',
            'file_id' => 'nullable|string',
            'duplex_model' => 'nullable|string|in:model_a,model_b',
        ]);

        $copies = (int) ($validated['copies'] ?? 1);
        $pageRange = (string) ($validated['page_range'] ?? 'all');
        $colorMode = (string) ($validated['color_mode'] ?? 'mono');
        $sidesMode = (string) ($validated['sides_mode'] ?? 'simplex');
        $paperSize = (string) ($validated['paper_size'] ?? 'A4');
        $fileId = $validated['file_id'] ?? null;
        $duplexModel = (string) ($validated['duplex_model'] ?? 'model_b');

        // Determine total pages to price
        $filesQuery = $order->files()->where('scan_status', 'clean');
        if ($fileId) {
            $filesQuery->where('id', $fileId);
        }
        $files = $filesQuery->get();

        $rawTotalPages = 0;
        foreach ($files as $file) {
            $rawTotalPages += max(1, (int) ($file->page_count ?? 1));
        }

        if ($rawTotalPages === 0) {
            // Default 1 page if files still processing
            $rawTotalPages = 1;
        }

        $effectivePages = $rawTotalPages;
        if ($pageRange !== 'all') {
            try {
                $parsed = DynamicDuplexPricingEngine::parsePageRange($pageRange, $rawTotalPages);
                $effectivePages = count($parsed);
            } catch (\Throwable $e) {
                return ApiResponse::error([
                    [
                        'code' => 'INVALID_PAGE_RANGE',
                        'message' => $e->getMessage(),
                    ],
                ], 422);
            }
        }

        $shop = Shop::withoutTenant()->find($order->shop_id);

        $pricingRequest = new PricingRequest(
            totalPages: $effectivePages,
            copies: $copies,
            colorMode: $colorMode,
            sidesMode: $sidesMode,
            paperSize: $paperSize,
            pageRange: $pageRange,
            priceProfileId: $shop?->default_price_profile_id,
            fileId: $fileId,
            duplexModel: $duplexModel,
        );

        $quoteData = $this->pricingEngine->calculate($pricingRequest);
        $quote = $this->quoteGenerator->generate($order, $quoteData, $shop?->default_price_profile_id);

        return ApiResponse::success([
            'quote' => [
                'id' => $quote->id,
                'quote_version' => $quote->quote_version,
                'currency' => $quote->currency,
                'subtotal_minor' => $quote->subtotal_minor,
                'tax_minor' => $quote->tax_minor,
                'fee_minor' => $quote->fee_minor,
                'discount_minor' => $quote->discount_minor,
                'total_minor' => $quote->total_minor,
                'calculation_hash' => $quote->calculation_hash,
                'expires_at' => $quote->expires_at?->toISOString(),
                'is_expired' => $quote->isExpired(),
                'line_items' => $quote->line_items_json,
                'breakdown' => $quoteData->toArray(),
            ],
        ], [], 201);
    }

    /**
     * Get the latest quote for an order.
     */
    public function getQuote(Request $request, string $slug, string $token): JsonResponse
    {
        $order = $this->resolveOrder($token);

        if (! $order) {
            return ApiResponse::error([
                [
                    'code' => 'ORDER_NOT_FOUND',
                    'message' => 'The requested order was not found.',
                ],
            ], 404);
        }

        $latestQuote = $order->quotes()->orderBy('quote_version', 'desc')->first();

        if (! $latestQuote) {
            return ApiResponse::error([
                [
                    'code' => 'QUOTE_NOT_FOUND',
                    'message' => 'No quote has been generated for this order yet.',
                ],
            ], 404);
        }

        return ApiResponse::success([
            'quote' => [
                'id' => $latestQuote->id,
                'quote_version' => $latestQuote->quote_version,
                'currency' => $latestQuote->currency,
                'subtotal_minor' => $latestQuote->subtotal_minor,
                'tax_minor' => $latestQuote->tax_minor,
                'fee_minor' => $latestQuote->fee_minor,
                'discount_minor' => $latestQuote->discount_minor,
                'total_minor' => $latestQuote->total_minor,
                'calculation_hash' => $latestQuote->calculation_hash,
                'expires_at' => $latestQuote->expires_at?->toISOString(),
                'is_expired' => $latestQuote->isExpired(),
                'line_items' => $latestQuote->line_items_json,
            ],
        ]);
    }
}
