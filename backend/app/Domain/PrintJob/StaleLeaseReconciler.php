<?php

declare(strict_types=1);

namespace App\Domain\PrintJob;

use App\Models\PrintJob;
use Illuminate\Support\Facades\Log;

class StaleLeaseReconciler
{
    /**
     * Reconcile print jobs whose lease has expired.
     *
     * CRITICAL ARCHITECTURAL MANDATE:
     * Stale leases MUST be moved to 'unknown' status, NEVER automatically re-queued
     * to 'queued'. This prevents accidental physical double-printing when network drops
     * after the spooler accepted a job.
     */
    public function reconcile(): int
    {
        $expiredJobs = PrintJob::where('status', 'leased')
            ->whereNotNull('lease_expires_at')
            ->where('lease_expires_at', '<', now())
            ->get();

        $count = 0;

        foreach ($expiredJobs as $job) {
            Log::warning("Print job {$job->id} lease expired at {$job->lease_expires_at}. Transitioning to 'unknown' state to prevent duplicate print.");

            $job->update([
                'status' => 'unknown',
            ]);

            $attempt = $job->attempts()->latest('attempt_number')->first();
            if ($attempt && in_array($attempt->status, ['leased', 'started'], true)) {
                $attempt->update([
                    'status' => 'expired',
                    'error_code' => 'LEASE_EXPIRED',
                    'error_details' => 'Agent lease expired before completion acknowledgement. Status set to unknown.',
                    'error_message' => 'Agent lease expired before completion acknowledgement. Status set to unknown.',
                    'ended_at' => now(),
                    'completed_at' => now(),
                ]);
            }

            $count++;
        }

        return $count;
    }
}
