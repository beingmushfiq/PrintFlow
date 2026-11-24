<?php

declare(strict_types=1);

namespace App\Domain\Payment\Outbox;

use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\OutboxEvent;
use App\Models\Payment;
use Illuminate\Support\Facades\DB;

class PaymentCaptureService
{
    /**
     * Atomically capture payment, mark order paid, and create outbox event.
     */
    public function capture(Payment $payment, Order $order, array $details = []): array
    {
        return DB::transaction(function () use ($payment, $order, $details) {
            $lockedPayment = Payment::withoutTenant()
                ->where('id', $payment->id)
                ->where('status', '!=', 'captured')
                ->lockForUpdate()
                ->first();

            if (! $lockedPayment) {
                return [
                    'payment' => $payment->fresh(),
                    'order' => $order->fresh(),
                    'outbox' => null,
                ];
            }

            $fromStatus = $order->status;

            $lockedPayment->update([
                'status' => 'captured',
                'captured_at' => now(),
                'verified_at' => now(),
                'provider_transaction_id' => $details['transaction_id'] ?? $details['trxID'] ?? $lockedPayment->provider_transaction_id,
                'raw_result_redacted_json' => $details,
            ]);

            $orderUpdates = [
                'status' => 'paid',
                'paid_at' => now(),
            ];
            if ($order->total_minor === 0 && $lockedPayment->amount_minor > 0) {
                $orderUpdates['total_minor'] = $lockedPayment->amount_minor;
                if ($order->subtotal_minor === 0) {
                    $orderUpdates['subtotal_minor'] = $lockedPayment->amount_minor;
                }
            }
            $order->update($orderUpdates);

            // Timeline audit event
            OrderEvent::withoutTenant()->create([
                'tenant_id' => $order->tenant_id,
                'shop_id' => $order->shop_id,
                'order_id' => $order->id,
                'event_type' => 'order.paid',
                'from_status' => $fromStatus,
                'to_status' => 'paid',
                'actor_type' => 'customer',
                'description' => "Payment captured successfully via {$lockedPayment->provider}.",
                'payload_json' => [
                    'payment_id' => $lockedPayment->id,
                    'amount_minor' => $lockedPayment->amount_minor,
                    'provider_transaction_id' => $lockedPayment->provider_transaction_id,
                ],
            ]);

            // Transactional Outbox record
            $outbox = OutboxEvent::withoutTenant()->create([
                'tenant_id' => $order->tenant_id,
                'event_type' => 'order.paid',
                'payload_json' => [
                    'order_id' => $order->id,
                    'payment_id' => $lockedPayment->id,
                    'amount_minor' => $lockedPayment->amount_minor,
                    'totalPoisha' => $lockedPayment->amount_minor,
                    'files' => $order->files()->pluck('id')->toArray(),
                ],
                'status' => 'pending',
                'retry_count' => 0,
                'next_retry_at' => now(),
            ]);

            return [
                'payment' => $lockedPayment->fresh(),
                'order' => $order->fresh(),
                'outbox' => $outbox,
            ];
        });
    }
}
