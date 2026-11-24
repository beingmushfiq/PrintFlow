<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Owner;

use App\Events\OrderStatusChanged;
use App\Events\QueueUpdated;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Order;
use App\Models\OrderEvent;
use App\Models\OrderFile;
use App\Models\Payment;
use App\Models\PrintJob;
use App\Models\PrintJobAttempt;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class OrderManagementController extends Controller
{
    use ResolvesOwnerShop;

    private function maskPhone(?string $phone): string
    {
        if (! $phone || strlen($phone) < 11) {
            return '***';
        }

        return substr($phone, 0, 3).'****'.substr($phone, 7);
    }

    private function maskTransactionId(?string $txId): string
    {
        if (! $txId) {
            return '****';
        }
        if (strlen($txId) < 8) {
            return '****';
        }

        return substr($txId, 0, 4).'****'.substr($txId, -4);
    }

    private function resolveOrder(string $id): ?Order
    {
        return Order::withoutTenant()
            ->where('id', $id)
            ->orWhere('public_reference', $id)
            ->orWhere('public_token_hash', $id)
            ->first();
    }

    /**
     * Searchable Orders Ledger (Feature 58)
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user || ! $user->hasPermissionTo('orders.view')) {
            return ApiResponse::error('Forbidden. orders.view permission required.', 403, [], 'FORBIDDEN');
        }

        $shop = $this->resolveShop($request);
        if (! $shop) {
            return ApiResponse::error('Shop not found.', 404, [], 'SHOP_NOT_FOUND');
        }

        $query = Order::withoutTenant()
            ->with(['files', 'printJobs.printer'])
            ->where('shop_id', $shop->id);

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($q) use ($search) {
                $q->where('customer_phone', 'like', "%{$search}%")
                  ->orWhere('public_reference', 'like', "%{$search}%")
                  ->orWhere('customer_name', 'like', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $status = (string) $request->input('status');
            if (strtoupper($status) === 'COLLECTED') {
                $query->whereIn('status', ['collected', 'COLLECTED']);
            } else {
                $query->where('status', $status);
            }
        }

        if ($request->filled('date_from')) {
            $query->where('created_at', '>=', $request->input('date_from'));
        }

        if ($request->filled('date_to')) {
            $query->where('created_at', '<=', $request->input('date_to'));
        }

        if ($request->filled('printer_id')) {
            $printerId = $request->input('printer_id');
            $query->whereHas('printJobs', function ($q) use ($printerId) {
                $q->where('printer_id', $printerId);
            });
        }

        $perPage = max(1, min(100, (int) $request->input('per_page', 15)));
        $paginator = $query->orderBy('created_at', 'desc')->paginate($perPage);

        $items = collect($paginator->items())->map(function (Order $order) {
            return [
                'id' => $order->id,
                'reference' => $order->public_reference,
                'public_reference' => $order->public_reference,
                'customer_phone' => $order->customer_phone,
                'customer_phone_masked' => $this->maskPhone($order->customer_phone),
                'customer_name' => $order->customer_name,
                'status' => $order->status,
                'currency' => $order->currency,
                'total_poisha' => $order->total_minor,
                'total_minor' => $order->total_minor,
                'files_count' => $order->files->count(),
                'created_at' => $order->created_at?->toISOString(),
                'completed_at' => $order->completed_at?->toISOString(),
            ];
        });

        return ApiResponse::success($items->all(), [
            'current_page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'total_pages' => $paginator->lastPage(),
        ]);
    }

    /**
     * Granular Order Detail & Timeline (Feature 59)
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        if (! $user || ! $user->hasPermissionTo('orders.view')) {
            return ApiResponse::error('Forbidden. orders.view permission required.', 403, [], 'FORBIDDEN');
        }

        $order = $this->resolveOrder($id);
        if (! $order) {
            return ApiResponse::error('Order not found.', 404, [], 'ORDER_NOT_FOUND');
        }

        $files = OrderFile::withoutTenant()->where('order_id', $order->id)->get();
        $events = OrderEvent::withoutTenant()->where('order_id', $order->id)->orderBy('created_at', 'asc')->get();
        $printJobs = PrintJob::withoutTenant()->with(['printer', 'attempts'])->where('order_id', $order->id)->get();
        $payment = Payment::withoutTenant()->where('order_id', $order->id)->latest()->first();

        $quote = $order->latestQuote()->first();
        $quoteData = [
            'subtotal_minor' => $order->subtotal_minor,
            'tax_minor' => $order->tax_minor,
            'fee_minor' => $order->fee_minor,
            'discount_minor' => $order->discount_minor,
            'total_minor' => $order->total_minor,
            'line_items' => $order->quote_snapshot_json['line_items'] ?? ($quote?->line_items_json ?? []),
        ];

        $paymentData = $payment ? [
            'provider' => $payment->provider,
            'status' => $payment->status,
            'transaction_id' => $this->maskTransactionId($payment->gateway_transaction_id ?? $payment->id),
            'amount_minor' => $payment->amount_minor,
            'created_at' => $payment->created_at?->toISOString(),
        ] : null;

        $filesData = $files->map(function (OrderFile $f) {
            $options = is_array($f->processing_json) ? $f->processing_json : [];

            return [
                'id' => $f->id,
                'file_name' => $f->original_name,
                'file_size_bytes' => $f->size_bytes,
                'mime_type' => $f->mime_type_detected ?? 'application/pdf',
                'page_count' => $f->page_count ?? 1,
                'copies' => (int) ($options['copies'] ?? 1),
                'color_mode' => $options['color_mode'] ?? 'mono',
                'sides_mode' => $options['sides_mode'] ?? 'simplex',
                'paper_size' => $options['paper_size'] ?? 'A4',
            ];
        });

        $eventsData = $events->map(function (OrderEvent $e) {
            return [
                'id' => $e->id,
                'event_type' => $e->event_type,
                'from_status' => $e->from_status,
                'to_status' => $e->to_status,
                'actor' => $e->actor_type ?? 'system',
                'actor_type' => $e->actor_type ?? 'system',
                'actor_id' => $e->actor_id,
                'description' => $e->description,
                'occurred_at' => $e->created_at?->toISOString(),
                'created_at' => $e->created_at?->toISOString(),
                'payload' => $e->payload_json,
            ];
        });

        $jobsData = $printJobs->map(function (PrintJob $j) {
            return [
                'id' => $j->id,
                'status' => $j->status,
                'printer' => $j->printer?->name ?? 'Default Queue',
                'pages_total' => $j->pages_total,
                'pages_printed' => $j->pages_printed,
                'error_message' => $j->error_message,
                'attempts' => $j->attempts->map(fn (PrintJobAttempt $a) => [
                    'attempt_number' => $a->attempt_number,
                    'status' => $a->status,
                    'error_code' => $a->error_code,
                    'error_details' => $a->error_details,
                    'safe_message' => $a->error_details ?? 'Print attempt failed',
                    'created_at' => $a->created_at?->toISOString(),
                ]),
            ];
        });

        return ApiResponse::success([
            'id' => $order->id,
            'reference' => $order->public_reference,
            'public_reference' => $order->public_reference,
            'customer_phone' => $order->customer_phone,
            'customer_name' => $order->customer_name,
            'status' => $order->status,
            'total_minor' => $order->total_minor,
            'total_poisha' => $order->total_minor,
            'currency' => $order->currency,
            'quote' => $quoteData,
            'payment' => $paymentData,
            'files' => $filesData->values()->all(),
            'events' => $eventsData->values()->all(),
            'print_jobs' => $jobsData->values()->all(),
            'created_at' => $order->created_at?->toISOString(),
            'paid_at' => $order->paid_at?->toISOString(),
            'completed_at' => $order->completed_at?->toISOString(),
            'cancelled_at' => $order->cancelled_at?->toISOString(),
        ]);
    }

    /**
     * Cancel Order (Feature 56)
     */
    public function cancel(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return ApiResponse::error('Unauthenticated.', 401);
        }

        if (! $user->hasPermissionTo('orders.cancel')) {
            return ApiResponse::error('Forbidden. orders.cancel permission required.', 403, [], 'FORBIDDEN');
        }

        $order = $this->resolveOrder($id);
        if (! $order) {
            // Also allow job id for cancel
            $job = PrintJob::withoutTenant()->where('id', $id)->first();
            if ($job && $job->order_id) {
                $order = Order::withoutTenant()->find($job->order_id);
            }
        }

        if (! $order) {
            return ApiResponse::error('Order not found.', 404, [], 'ORDER_NOT_FOUND');
        }

        // Check if cancellable
        $activeSpoolerJobs = PrintJob::withoutTenant()
            ->where('order_id', $order->id)
            ->whereIn('status', ['printing', 'submitted_to_spooler', 'completed'])
            ->exists();

        if ($activeSpoolerJobs || in_array($order->status, ['completed', 'collected', 'COLLECTED'])) {
            return ApiResponse::error('Cannot cancel job already submitted to physical spooler or completed.', 422, [], 'CANNOT_CANCEL');
        }

        $fromStatus = $order->status;
        $order->update([
            'status' => 'cancelled',
            'cancelled_at' => now(),
        ]);

        PrintJob::withoutTenant()
            ->where('order_id', $order->id)
            ->whereIn('status', ['queued', 'leased', 'held'])
            ->update([
                'status' => 'cancelled',
            ]);

        $reason = $request->input('reason', 'Cancelled by shop staff');
        OrderEvent::create([
            'tenant_id' => $order->tenant_id,
            'shop_id' => $order->shop_id,
            'order_id' => $order->id,
            'event_type' => 'order.cancelled',
            'from_status' => $fromStatus,
            'to_status' => 'cancelled',
            'actor_type' => 'staff',
            'actor_id' => $user->id,
            'description' => "Order cancelled: {$reason}",
            'payload_json' => ['reason' => $reason],
            'created_at' => now(),
        ]);

        $shop = $this->resolveShop($request);
        if ($shop) {
            $queueDepth = PrintJob::withoutTenant()
                ->where('shop_id', $shop->id)
                ->whereIn('status', ['queued', 'leased', 'printing'])
                ->count();
            event(new QueueUpdated($shop->slug, 'order_cancelled', $order->id, $queueDepth));
        }

        event(new OrderStatusChanged($order->public_reference, 'cancelled', $order->public_reference, $order->id));

        return ApiResponse::success([
            'order_id' => $order->id,
            'status' => 'cancelled',
            'refund_status' => 'pending',
        ]);
    }

    /**
     * Handover / Mark Collected (Feature 57)
     */
    public function handover(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return ApiResponse::error('Unauthenticated.', 401);
        }

        $order = $this->resolveOrder($id);
        if (! $order) {
            return ApiResponse::error('Order not found.', 404, [], 'ORDER_NOT_FOUND');
        }

        // Idempotent check
        if (strtoupper($order->status) === 'COLLECTED') {
            return ApiResponse::success([
                'order_id' => $order->id,
                'status' => 'COLLECTED',
                'collected_at' => $order->completed_at?->toISOString() ?? now()->toISOString(),
                'handed_over_by' => $user->id,
            ]);
        }

        $eligibleStatuses = ['ready', 'printed', 'completed', 'paid', 'READY', 'PRINTED', 'printer_confirmed'];
        if (! in_array($order->status, $eligibleStatuses, true)) {
            return ApiResponse::error('Order is not yet printed or ready for collection.', 422, [], 'NOT_READY_FOR_COLLECTION');
        }

        $fromStatus = $order->status;
        $order->update([
            'status' => 'COLLECTED',
            'completed_at' => now(),
        ]);

        OrderEvent::create([
            'tenant_id' => $order->tenant_id,
            'shop_id' => $order->shop_id,
            'order_id' => $order->id,
            'event_type' => 'order.collected',
            'from_status' => $fromStatus,
            'to_status' => 'COLLECTED',
            'actor_type' => 'staff',
            'actor_id' => $user->id,
            'description' => 'Document collected by customer',
            'created_at' => now(),
        ]);

        event(new OrderStatusChanged($order->public_reference, 'COLLECTED', $order->public_reference, $order->id));

        return ApiResponse::success([
            'order_id' => $order->id,
            'status' => 'COLLECTED',
            'collected_at' => now()->toISOString(),
            'handed_over_by' => $user->id,
        ]);
    }

    /**
     * Controlled Reprint Protocol (Feature 60)
     */
    public function reprint(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return ApiResponse::error('Unauthenticated.', 401);
        }

        if (! $user->hasPermissionTo('orders.retry_print')) {
            return ApiResponse::error('Forbidden. orders.retry_print required.', 403, [], 'FORBIDDEN');
        }

        $reason = $request->input('reason');
        if (! is_string($reason) || trim($reason) === '') {
            return ApiResponse::error([
                'reason' => 'The reprint reason is mandatory.',
            ], 422, [], 'VALIDATION_ERROR');
        }

        $order = $this->resolveOrder($id);
        if (! $order) {
            return ApiResponse::error('Order not found.', 404, [], 'ORDER_NOT_FOUND');
        }

        $file = OrderFile::withoutTenant()->where('order_id', $order->id)->first();
        if (! $file) {
            return ApiResponse::error('No files found for this order.', 422, [], 'NO_FILES');
        }

        $attemptCount = PrintJob::withoutTenant()->where('order_id', $order->id)->count() + 1;
        $printSettings = is_array($file->processing_json) ? $file->processing_json : [];

        $newJob = PrintJob::create([
            'tenant_id' => $order->tenant_id,
            'shop_id' => $order->shop_id,
            'order_id' => $order->id,
            'order_file_id' => $file->id,
            'status' => 'queued',
            'print_settings' => $printSettings,
            'file_url' => $file->object_key,
            'file_hash' => $file->sha256_hash ?? hash('sha256', (string) $file->id),
            'file_size_bytes' => $file->size_bytes ?? 0,
            'pages_total' => $file->page_count ?? 1,
            'idempotency_key' => hash('sha256', $order->id.'_'.$file->id.'_reprint_'.$attemptCount.'_'.Str::random(8)),
        ]);

        PrintJobAttempt::create([
            'tenant_id' => $order->tenant_id,
            'print_job_id' => $newJob->id,
            'attempt_number' => $attemptCount,
            'status' => 'started',
            'started_at' => now(),
            'created_at' => now(),
        ]);

        OrderEvent::create([
            'tenant_id' => $order->tenant_id,
            'shop_id' => $order->shop_id,
            'order_id' => $order->id,
            'event_type' => 'order.reprint_requested',
            'from_status' => $order->status,
            'to_status' => $order->status,
            'actor_type' => 'owner',
            'actor_id' => $user->id,
            'description' => "Reprint requested: {$reason}",
            'payload_json' => [
                'reason' => $reason,
                'reprint_job_id' => $newJob->id,
                'attempt' => $attemptCount,
            ],
            'created_at' => now(),
        ]);

        $shop = $this->resolveShop($request);
        if ($shop) {
            $queueDepth = PrintJob::withoutTenant()
                ->where('shop_id', $shop->id)
                ->whereIn('status', ['queued', 'leased', 'printing'])
                ->count();
            event(new QueueUpdated($shop->slug, 'job_enqueued', $newJob->id, $queueDepth));
        }

        return ApiResponse::success([
            'reprint_job_id' => $newJob->id,
            'attempt' => $attemptCount,
            'status' => 'queued',
        ]);
    }
}
