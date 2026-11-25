<?php

declare(strict_types=1);

namespace App\Domain\PrintJob;

use App\Domain\FileDeletion\Jobs\DeleteOrderFileRemotely;
use App\Models\PrintAgent;
use App\Models\PrintJob;
use App\Models\PrintJobAttempt;
use DomainException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

class PrintJobLeaseService
{
    /**
     * Lease the next available queued print job for the given agent using atomic SELECT ... FOR UPDATE SKIP LOCKED.
     */
    public function leaseNextJob(PrintAgent $agent, ?string $printerId = null): ?array
    {
        return DB::transaction(function () use ($agent, $printerId) {
            $query = PrintJob::withoutTenant()
                ->where('tenant_id', $agent->tenant_id)
                ->where('shop_id', $agent->shop_id)
                ->where('status', 'queued')
                ->orderBy('created_at', 'asc');

            if (DB::connection()->getDriverName() !== 'sqlite') {
                $query->lock('for update skip locked');
            }

            if ($printerId) {
                $query->where(function ($q) use ($printerId) {
                    $q->whereNull('printer_id')->orWhere('printer_id', $printerId);
                });
            }

            /** @var PrintJob|null $job */
            $job = $query->first();

            if (! $job) {
                return null;
            }

            $leaseToken = 'plt_' . Str::random(56);
            $expiresAt = now()->addSeconds(300); // 300s lease TTL

            $job->update([
                'status' => 'leased',
                'print_agent_id' => $agent->id,
                'printer_id' => $printerId ?? $job->printer_id,
                'lease_token' => $leaseToken,
                'leased_at' => now(),
                'lease_expires_at' => $expiresAt,
            ]);

            $order = $job->order()->withoutTenant()->first();
            if ($order && strtolower((string) $order->status) === 'paid') {
                $order->update(['status' => 'printing']);
            }

            $attemptNumber = ((int) $job->attempts()->max('attempt_number')) + 1;
            PrintJobAttempt::create([
                'tenant_id' => $job->tenant_id,
                'print_job_id' => $job->id,
                'print_agent_id' => $agent->id,
                'attempt_number' => $attemptNumber,
                'status' => 'leased',
                'started_at' => now(),
            ]);

            $downloadUrl = $job->file_url;
            if (empty($downloadUrl)) {
                $downloadUrl = URL::temporarySignedRoute(
                    'agent.job.download',
                    now()->addMinutes(15),
                    ['id' => $job->id]
                );
            }

            return [
                'job_id' => $job->id,
                'order_id' => $job->order_id,
                'order_file_id' => $job->order_file_id,
                'lease_token' => $leaseToken,
                'lease_expires_at' => $expiresAt->toIso8601String(),
                'download_url' => $downloadUrl,
                'file_hash' => $job->file_hash,
                'pages_total' => $job->pages_total,
                'print_settings' => $job->print_settings ?? [
                    'copies' => 1,
                    'color' => false,
                    'duplex' => true,
                    'paper_size' => 'A4',
                    'orientation' => 'portrait',
                ],
            ];
        });
    }

    /**
     * Acknowledge spooling or status update of a leased print job.
     */
    public function acknowledgeJob(PrintJob $job, string $leaseToken, ?int $spoolerJobId = null, string $status = 'completed'): PrintJob
    {
        if (! in_array($job->status, ['leased', 'printing'], true)) {
            throw new DomainException("Print job is not leased or printing (current status: {$job->status}).");
        }

        if (! hash_equals($job->lease_token ?? '', $leaseToken)) {
            throw new DomainException("Invalid lease token for print job {$job->id}.");
        }

        $latestAttempt = $job->attempts()->latest('attempt_number')->first();

        if ($status === 'printing') {
            $job->update([
                'status' => 'printing',
            ]);

            if ($latestAttempt) {
                $latestAttempt->update([
                    'status' => 'leased',
                    'spooler_job_id' => $spoolerJobId ?? $latestAttempt->spooler_job_id,
                ]);
            }

            $order = $job->order()->withoutTenant()->first();
            if ($order && strtolower((string) $order->status) === 'paid') {
                $order->update(['status' => 'printing']);
            }

            return $job;
        }

        if ($status === 'failed') {
            return $this->failJob($job, $leaseToken, 'SPOOLER_ACK_FAILED', 'Agent reported job failure during ack');
        }

        // Default: completed
        $job->update([
            'status' => 'completed',
            'pages_printed' => $job->pages_total,
            'spooler_job_id' => $spoolerJobId ? (string) $spoolerJobId : $job->spooler_job_id,
            'completed_at' => now(),
        ]);

        if ($latestAttempt) {
            $latestAttempt->update([
                'status' => 'completed',
                'spooler_job_id' => $spoolerJobId,
                'ended_at' => now(),
                'completed_at' => now(),
            ]);
        }

        // Check if parent order is fully printed
        $order = $job->order()->withoutTenant()->first();
        if ($order && ! $order->printJobs()->withoutTenant()->where('status', '!=', 'completed')->exists()) {
            $order->update([
                'status' => 'complete',
                'completed_at' => now(),
            ]);
        }

        // Dispatch asynchronous remote file deletion without blocking job ack if queue fails
        try {
            DeleteOrderFileRemotely::dispatch($job->order_file_id, $job->tenant_id, 'order_completed');
        } catch (\Throwable $e) {
            report($e);
        }

        return $job;
    }

    /**
     * Mark a leased print job as failed or re-queue if retryable.
     */
    public function failJob(
        PrintJob $job,
        string $leaseToken,
        string $errorCode,
        ?string $errorMessage = null,
        bool $retryable = false
    ): PrintJob {
        if (! hash_equals($job->lease_token ?? '', $leaseToken)) {
            throw new DomainException("Invalid lease token for print job {$job->id}.");
        }

        $latestAttempt = $job->attempts()->latest('attempt_number')->first();
        if ($latestAttempt) {
            $latestAttempt->update([
                'status' => 'failed',
                'error_code' => $errorCode,
                'error_details' => $errorMessage,
                'error_message' => $errorMessage,
                'ended_at' => now(),
                'completed_at' => now(),
            ]);
        }

        $attemptsCount = $job->attempts()->count();
        if ($retryable && $attemptsCount < 3) {
            $job->update([
                'status' => 'queued',
                'lease_token' => null,
                'leased_at' => null,
                'lease_expires_at' => null,
            ]);
        } else {
            $job->update([
                'status' => 'failed',
                'failed_at' => now(),
                'error_message' => $errorMessage,
            ]);
        }

        return $job;
    }
}
