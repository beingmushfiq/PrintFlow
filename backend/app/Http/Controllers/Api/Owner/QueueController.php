<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Owner;

use App\Events\QueueUpdated;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\OrderEvent;
use App\Models\PrintJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QueueController extends Controller
{
    use ResolvesOwnerShop;

    private function maskPhone(?string $phone): string
    {
        if (! $phone || strlen($phone) < 11) {
            return '***';
        }

        return substr($phone, 0, 3).'****'.substr($phone, 7);
    }

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

        $jobs = PrintJob::withoutTenant()
            ->with(['order', 'orderFile', 'printer'])
            ->where('shop_id', $shop->id)
            ->whereIn('status', ['queued', 'leased', 'printing', 'held'])
            ->orderByRaw("CASE WHEN status = 'printing' THEN 1 WHEN status = 'leased' THEN 2 WHEN status = 'queued' THEN 3 ELSE 4 END")
            ->orderBy('created_at', 'asc')
            ->get();

        $data = $jobs->map(function (PrintJob $job) {
            $settings = is_array($job->print_settings) ? $job->print_settings : [];
            $phone = $job->order?->customer_phone;

            $sidesMode = $settings['sides_mode'] ?? (! empty($settings['duplex']) ? 'duplex' : 'simplex');
            $colorMode = $settings['color_mode'] ?? (! empty($settings['color']) ? 'color' : 'mono');

            return [
                'id' => $job->id,
                'job_id' => $job->id,
                'order_id' => $job->order_id,
                'order_reference' => $job->order?->public_reference ?? 'N/A',
                'customer_phone' => $phone,
                'customer_phone_masked' => $this->maskPhone($phone),
                'pages' => $job->pages_total,
                'copies' => (int) ($settings['copies'] ?? 1),
                'sides_mode' => $sidesMode,
                'color_mode' => $colorMode,
                'paper_size' => $settings['paper_size'] ?? 'A4',
                'priority' => $job->status === 'printing' ? 'printing' : 'normal',
                'status' => $job->status,
                'printer_name' => $job->printer?->name ?? 'Default Queue',
                'file_name' => $job->orderFile?->original_name ?? 'Document',
                'created_at' => $job->created_at?->toISOString(),
            ];
        });

        return ApiResponse::success($data->values()->all(), [
            'total' => $data->count(),
        ]);
    }

    public function hold(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return ApiResponse::error('Unauthenticated.', 401);
        }

        $job = PrintJob::withoutTenant()->where('id', $id)->orWhere('order_id', $id)->first();
        if (! $job) {
            return ApiResponse::error('Print job not found.', 404, [], 'JOB_NOT_FOUND');
        }

        if ($job->status === 'held') {
            return ApiResponse::success([
                'job_id' => $job->id,
                'status' => 'held',
                'held_at' => $job->updated_at?->toISOString() ?? now()->toISOString(),
            ]);
        }

        $fromStatus = $job->status;
        $job->update([
            'status' => 'held',
        ]);

        if ($job->order_id) {
            OrderEvent::create([
                'tenant_id' => $job->tenant_id,
                'shop_id' => $job->shop_id,
                'order_id' => $job->order_id,
                'event_type' => 'job.held',
                'from_status' => $fromStatus,
                'to_status' => 'held',
                'actor_type' => 'owner',
                'actor_id' => $user->id,
                'description' => "Job {$job->id} paused by owner",
                'created_at' => now(),
            ]);
        }

        $shop = $this->resolveShop($request);
        if ($shop) {
            $queueDepth = PrintJob::withoutTenant()
                ->where('shop_id', $shop->id)
                ->whereIn('status', ['queued', 'leased', 'printing'])
                ->count();
            event(new QueueUpdated($shop->slug, 'job_held', $job->id, $queueDepth));
        }

        return ApiResponse::success([
            'job_id' => $job->id,
            'status' => 'held',
            'held_at' => now()->toISOString(),
        ]);
    }

    public function resume(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return ApiResponse::error('Unauthenticated.', 401);
        }

        $job = PrintJob::withoutTenant()->where('id', $id)->orWhere('order_id', $id)->first();
        if (! $job) {
            return ApiResponse::error('Print job not found.', 404, [], 'JOB_NOT_FOUND');
        }

        $fromStatus = $job->status;
        $job->update([
            'status' => 'queued',
        ]);

        if ($job->order_id) {
            OrderEvent::create([
                'tenant_id' => $job->tenant_id,
                'shop_id' => $job->shop_id,
                'order_id' => $job->order_id,
                'event_type' => 'job.resumed',
                'from_status' => $fromStatus,
                'to_status' => 'queued',
                'actor_type' => 'owner',
                'actor_id' => $user->id,
                'description' => "Job {$job->id} resumed to queue by owner",
                'created_at' => now(),
            ]);
        }

        $shop = $this->resolveShop($request);
        if ($shop) {
            $queueDepth = PrintJob::withoutTenant()
                ->where('shop_id', $shop->id)
                ->whereIn('status', ['queued', 'leased', 'printing'])
                ->count();
            event(new QueueUpdated($shop->slug, 'job_resumed', $job->id, $queueDepth));
        }

        return ApiResponse::success([
            'job_id' => $job->id,
            'status' => 'queued',
        ]);
    }
}
