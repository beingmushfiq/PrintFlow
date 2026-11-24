<?php

declare(strict_types=1);

namespace App\Domain\FileDeletion\Jobs;

use App\Domain\FileDeletion\FilePurgeService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class DeleteOrderFileRemotely implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public string $orderFileId,
        public ?string $tenantId = null,
        public string $triggerReason = 'order_completed'
    ) {
        $this->onQueue('documents');
    }

    public function handle(FilePurgeService $purgeService): void
    {
        $purgeService->purgeRemoteFile($this->orderFileId, $this->triggerReason);
    }
}
