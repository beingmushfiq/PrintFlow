<?php

declare(strict_types=1);

namespace App\Domain\Pricing\Services;

use App\Domain\Pricing\DTOs\QuoteSnapshotData;
use App\Models\Order;
use App\Models\Quote;
use Illuminate\Support\Facades\DB;

class QuoteSnapshotGenerator
{
    public const TTL_SECONDS = 900; // 15 minutes

    /**
     * Freeze quote snapshot and persist Quote model for the given Order.
     */
    public function generate(Order $order, QuoteSnapshotData $data, ?string $priceProfileId = null, array $printOptions = []): Quote
    {
        return DB::transaction(function () use ($order, $data, $priceProfileId, $printOptions) {
            $latestVersion = (int) Quote::withoutTenant()
                ->where('order_id', $order->id)
                ->max('quote_version');

            $nextVersion = $latestVersion + 1;
            $expiresAt = now()->addSeconds(self::TTL_SECONDS);

            // Canonical calculation payload for deterministic SHA-256 hash
            $hashPayload = [
                'calculation_version' => $data->calculationVersion,
                'order_id' => $order->id,
                'quote_version' => $nextVersion,
                'currency' => $data->currency,
                'subtotal_minor' => $data->subtotalPoisha,
                'tax_minor' => $data->taxPoisha,
                'fee_minor' => $data->feePoisha,
                'discount_minor' => $data->discountPoisha,
                'total_minor' => $data->totalPoisha,
                'line_items' => $data->lineItems,
            ];

            $calculationHash = hash('sha256', json_encode($hashPayload, JSON_THROW_ON_ERROR));

            $quote = Quote::withoutTenant()->create([
                'tenant_id' => $order->tenant_id,
                'shop_id' => $order->shop_id,
                'order_id' => $order->id,
                'price_profile_id' => $priceProfileId,
                'quote_version' => $nextVersion,
                'currency' => $data->currency,
                'subtotal_minor' => $data->subtotalPoisha,
                'tax_minor' => $data->taxPoisha,
                'fee_minor' => $data->feePoisha,
                'discount_minor' => $data->discountPoisha,
                'total_minor' => $data->totalPoisha,
                'line_items_json' => $data->lineItems,
                'calculation_hash' => $calculationHash,
                'expires_at' => $expiresAt,
            ]);

            // Synchronize quote data on Order
            $order->update([
                'subtotal_minor' => $data->subtotalPoisha,
                'tax_minor' => $data->taxPoisha,
                'fee_minor' => $data->feePoisha,
                'discount_minor' => $data->discountPoisha,
                'total_minor' => $data->totalPoisha,
                'quote_snapshot_json' => [
                    'quote_id' => $quote->id,
                    'quote_version' => $nextVersion,
                    'calculation_hash' => $calculationHash,
                    'expires_at' => $expiresAt->toISOString(),
                    'print_options' => $printOptions,
                    'breakdown' => $data->toArray(),
                ],
            ]);

            return $quote;
        });
    }

    /**
     * Verify whether a quote calculation hash has been tampered with.
     */
    public static function verifyHash(Quote $quote): bool
    {
        $hashPayload = [
            'calculation_version' => 1,
            'order_id' => $quote->order_id,
            'quote_version' => $quote->quote_version,
            'currency' => $quote->currency,
            'subtotal_minor' => $quote->subtotal_minor,
            'tax_minor' => $quote->tax_minor,
            'fee_minor' => $quote->fee_minor,
            'discount_minor' => $quote->discount_minor,
            'total_minor' => $quote->total_minor,
            'line_items' => $quote->line_items_json,
        ];

        $expectedHash = hash('sha256', json_encode($hashPayload, JSON_THROW_ON_ERROR));

        return hash_equals($expectedHash, $quote->calculation_hash);
    }
}
