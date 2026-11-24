<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Public;

use App\Domain\Shared\Money;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Shop;
use Illuminate\Http\JsonResponse;

class PublicOrderController extends Controller
{
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
     * Public order status lookup with 6-stage lifecycle and redacted private data.
     */
    public function show(string $token): JsonResponse
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

        $shop = Shop::withoutTenant()->find($order->shop_id);

        $stages = ['SUBMITTED', 'UPLOADED', 'PAID', 'PRINTING', 'READY', 'COLLECTED'];

        $stageIndexMap = [
            'draft' => 0,
            'submitted' => 0,
            'uploaded' => 1,
            'paid' => 2,
            'printing' => 3,
            'ready' => 4,
            'collected' => 5,
            'completed' => 5,
        ];

        $currentStatusLower = strtolower($order->status);
        $currentStageIndex = $stageIndexMap[$currentStatusLower] ?? 0;

        $isTerminal = in_array($currentStatusLower, ['collected', 'completed', 'cancelled'], true);

        // Security requirement: object_key, customer_phone, tenant_id must NEVER be in public response
        $data = [
            'reference' => $order->public_reference,
            'status' => $order->status,
            'stages' => $stages,
            'current_stage' => $currentStageIndex,
            'shop_name' => $shop?->name ?? 'Print Shop',
            'channel' => "order.{$token}",
            'currency' => $order->currency,
            'total_minor' => $order->total_minor,
            'total_bdt' => Money::fromPoisha($order->total_minor, $order->currency)->format('bn'),
            'created_at' => $order->created_at->toISOString(),
            'paid_at' => $order->paid_at?->toISOString(),
            'completed_at' => $order->completed_at?->toISOString(),
            'is_terminal' => $isTerminal,
        ];

        if ($currentStatusLower === 'collected' || $currentStatusLower === 'completed') {
            $data['collected_at'] = ($order->completed_at ?? $order->updated_at)->toISOString();
        }

        return ApiResponse::success($data);
    }

    /**
     * Digital receipt data model.
     */
    public function receipt(string $token): JsonResponse
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

        $shop = Shop::withoutTenant()->find($order->shop_id);
        $latestQuote = $order->quotes()->orderBy('quote_version', 'desc')->first();
        $successfulPayment = Payment::withoutTenant()
            ->where('order_id', $order->id)
            ->where('status', 'captured')
            ->latest('captured_at')
            ->first();

        $transactionId = $successfulPayment?->provider_transaction_id
            ?? $successfulPayment?->internal_reference
            ?? ('SNDBX_' . strtotime((string) $order->created_at));

        $lineItems = $latestQuote?->line_items_json ?? [
            [
                'description' => 'Print Order Service',
                'quantity' => 1,
                'totalPoisha' => $order->total_minor,
            ],
        ];

        $totalPoisha = $order->total_minor ?: ($successfulPayment?->amount_minor ?? 0);
        $subtotalPoisha = $order->subtotal_minor ?: $totalPoisha;

        return ApiResponse::success([
            'shopName' => $shop?->name ?? 'PrintFlow Central Hub',
            'shopPhone' => $shop?->phone ?? '01712345678',
            'publicReference' => $order->public_reference,
            'transactionId' => $transactionId,
            'orderDate' => $order->created_at->toISOString(),
            'lineItems' => $lineItems,
            'subtotalPoisha' => $subtotalPoisha,
            'vatPoisha' => $order->tax_minor,
            'feePoisha' => $order->fee_minor,
            'totalPoisha' => $totalPoisha,
            'currency' => $order->currency,
        ]);
    }
}
