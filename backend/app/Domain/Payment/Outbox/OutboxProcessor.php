<?php

declare(strict_types=1);

namespace App\Domain\Payment\Outbox;

use App\Models\Order;
use App\Models\OrderFile;
use App\Models\OutboxEvent;
use App\Models\PrintJob;
use Illuminate\Support\Facades\DB;
use Throwable;

class OutboxProcessor
{
    /**
     * Generate deterministic print job idempotency key.
     */
    public static function generateJobIdempotencyKey(string $orderId, string $fileId, int $attempt = 1): string
    {
        return hash('sha256', "{$orderId}_{$fileId}_{$attempt}");
    }

    /**
     * Poll and process pending outbox events.
     *
     * @return int Number of successfully processed events
     */
    public function processPending(int $limit = 50): int
    {
        $processedCount = 0;

        // Query pending events ready for retry with lock
        $events = OutboxEvent::withoutTenant()
            ->where('status', 'pending')
            ->where(function ($query) {
                $query->whereNull('next_retry_at')
                    ->orWhere('next_retry_at', '<=', now());
            })
            ->orderBy('created_at', 'asc')
            ->limit($limit)
            ->get();

        foreach ($events as $event) {
            $success = $this->processEvent($event);
            if ($success) {
                $processedCount++;
            }
        }

        return $processedCount;
    }

    /**
     * Process a single outbox event with exponential backoff on failure.
     */
    public function processEvent(OutboxEvent $event): bool
    {
        $event->update(['status' => 'processing']);

        try {
            DB::transaction(function () use ($event) {
                if ($event->event_type === 'order.paid') {
                    $orderId = $event->payload_json['order_id'] ?? null;
                    if ($orderId) {
                        $order = Order::withoutTenant()->find($orderId);
                        if ($order && $order->status === 'paid') {
                            $orderFiles = $order->relationLoaded('files')
                                ? $order->files
                                : $order->files()->withoutTenant()->get();

                            if ($orderFiles->isEmpty() && ! empty($event->payload_json['files'])) {
                                $orderFiles = OrderFile::withoutTenant()
                                    ->whereIn('id', $event->payload_json['files'])
                                    ->get();
                            }

                            $defaultSettings = [
                                'copies' => 1,
                                'color' => false,
                                'duplex' => true,
                                'paper_size' => 'A4',
                                'orientation' => 'portrait',
                            ];
                            $printSettings = $order->quote_snapshot_json['print_options']
                                ?? $order->quote_snapshot_json['breakdown']['print_options']
                                ?? $defaultSettings;

                            foreach ($orderFiles as $file) {
                                $idempotencyKey = self::generateJobIdempotencyKey($order->id, (string) $file->id, 1);

                                PrintJob::withoutTenant()->firstOrCreate(
                                    ['idempotency_key' => $idempotencyKey],
                                    [
                                        'tenant_id' => $order->tenant_id,
                                        'shop_id' => $order->shop_id,
                                        'order_id' => $order->id,
                                        'order_file_id' => $file->id,
                                        'status' => 'queued',
                                        'print_settings' => $printSettings,
                                        'file_hash' => $file->sha256_hash ?: hash('sha256', (string) $file->id),
                                        'file_size_bytes' => (int) ($file->size_bytes ?? 0),
                                        'pages_total' => (int) ($file->page_count ?? 1),
                                    ]
                                );
                            }
                        }
                    }
                }

                $event->update([
                    'status' => 'processed',
                    'processed_at' => now(),
                    'error_message' => null,
                ]);
            });

            return true;
        } catch (Throwable $e) {
            $newRetryCount = $event->retry_count + 1;
            $newStatus = $newRetryCount >= 3 ? 'failed' : 'pending';
            $backoffSeconds = (int) pow(2, $newRetryCount);

            $event->update([
                'status' => $newStatus,
                'retry_count' => $newRetryCount,
                'next_retry_at' => now()->addSeconds($backoffSeconds),
                'error_message' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
