<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Agent;

use App\Domain\FileDeletion\FilePurgeService;
use App\Domain\Payment\Outbox\OutboxProcessor;
use App\Domain\PrintJob\PrintJobLeaseService;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\PrintAgent;
use App\Models\PrintJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class AgentJobController extends Controller
{
    public function next(Request $request, PrintJobLeaseService $leaseService, OutboxProcessor $outboxProcessor): JsonResponse
    {
        try {
            $outboxProcessor->processPending(20);
        } catch (\Throwable $e) {
            report($e);
        }

        /** @var PrintAgent $agent */
        $agent = $request->attributes->get('agent') ?? app(PrintAgent::class);

        $leased = $leaseService->leaseNextJob($agent, $request->input('printer_id'));

        return ApiResponse::success($leased);
    }

    public function ack(Request $request, string $id, PrintJobLeaseService $leaseService): JsonResponse
    {
        $validated = $request->validate([
            'lease_token' => ['required', 'string'],
            'spooler_job_id' => ['nullable', 'integer'],
            'status' => ['nullable', 'string', 'in:printing,completed,failed'],
        ]);

        /** @var PrintJob $job */
        $job = PrintJob::findOrFail($id);

        $status = $validated['status'] ?? 'completed';
        $spoolerJobId = isset($validated['spooler_job_id']) ? (int) $validated['spooler_job_id'] : null;

        $updatedJob = $leaseService->acknowledgeJob(
            $job,
            $validated['lease_token'],
            $spoolerJobId,
            $status
        );

        return ApiResponse::success([
            'job_id' => $updatedJob->id,
            'status' => $updatedJob->status,
            'spooler_job_id' => $spoolerJobId,
        ]);
    }

    public function fail(Request $request, string $id, PrintJobLeaseService $leaseService): JsonResponse
    {
        $validated = $request->validate([
            'lease_token' => ['required', 'string'],
            'error_code' => ['required', 'string', 'max:64'],
            'error_message' => ['nullable', 'string', 'max:1000'],
            'retryable' => ['nullable', 'boolean'],
        ]);

        /** @var PrintJob $job */
        $job = PrintJob::findOrFail($id);

        $updatedJob = $leaseService->failJob(
            $job,
            $validated['lease_token'],
            $validated['error_code'],
            $validated['error_message'] ?? null,
            (bool) ($validated['retryable'] ?? false)
        );

        return ApiResponse::success([
            'job_id' => $updatedJob->id,
            'status' => $updatedJob->status,
        ]);
    }

    public function shredAck(Request $request, string $id, FilePurgeService $purgeService): JsonResponse
    {
        /** @var PrintJob $job */
        $job = PrintJob::findOrFail($id);

        $event = $purgeService->recordLocalShred($job->order_file_id, $job->tenant_id, [
            'job_id' => $job->id,
            'agent_id' => $job->print_agent_id,
            'file_hash' => $job->file_hash,
            'reported_at' => now()->toIso8601String(),
        ]);

        return ApiResponse::success([
            'event_id' => $event->id,
            'deletion_status' => $event->deletion_status,
        ]);
    }

    public function download(Request $request, string $id): Response
    {
        if (! $request->hasValidSignature()) {
            abort(403, 'Invalid or expired signature.');
        }

        /** @var PrintJob $job */
        $job = PrintJob::withoutTenant()->findOrFail($id);
        $orderFile = $job->orderFile()->withoutTenant()->first();

        if (! $orderFile) {
            abort(404, 'File not found');
        }

        $disk = $orderFile->storage_disk ?: config('filesystems.default', 'local');

        if (! Storage::disk($disk)->exists($orderFile->object_key)) {
            $fallbackPaths = [
                $orderFile->object_key,
                storage_path('app/' . ltrim($orderFile->object_key, '/\\')),
                storage_path('app/private/' . ltrim($orderFile->object_key, '/\\')),
            ];

            foreach ($fallbackPaths as $candidatePath) {
                if (is_string($candidatePath) && file_exists($candidatePath)) {
                    return response()->file($candidatePath, [
                        'Content-Type' => $orderFile->mime_type_detected ?? 'application/pdf',
                        'X-File-SHA256' => $job->file_hash,
                    ]);
                }
            }

            abort(404, 'Physical storage object missing');
        }

        return Storage::disk($disk)->response(
            $orderFile->object_key,
            $orderFile->original_name,
            [
                'X-File-SHA256' => $job->file_hash,
            ]
        );
    }
}
