<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\PrintJob\StaleLeaseReconciler;
use Illuminate\Console\Command;

class ReconcileStaleLeasesCommand extends Command
{
    protected $signature = 'printflow:reconcile-leases';

    protected $description = 'Detect expired print job leases and move them to unknown status to prevent duplicate printing';

    public function handle(StaleLeaseReconciler $reconciler): int
    {
        $this->info('Starting stale lease reconciliation...');

        $count = $reconciler->reconcile();

        $this->info("Reconciliation complete. {$count} stale leases transitioned to 'unknown'.");

        return self::SUCCESS;
    }
}
