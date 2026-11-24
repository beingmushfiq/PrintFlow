<?php

declare(strict_types=1);

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class QueueUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $shopSlug,
        public string $action,
        public ?string $jobId = null,
        public int $queueDepth = 0
    ) {}

    public function broadcastOn(): array
    {
        return [
            new Channel("shop.{$this->shopSlug}.queue"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'QueueUpdated';
    }

    public function broadcastWith(): array
    {
        return [
            'action' => $this->action,
            'jobId' => $this->jobId,
            'queueDepth' => $this->queueDepth,
        ];
    }
}
