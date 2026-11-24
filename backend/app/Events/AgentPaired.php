<?php

declare(strict_types=1);

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class AgentPaired implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $shopSlug,
        public string $agentId,
        public string $deviceName,
        public ?string $pairedAt = null
    ) {
        $this->pairedAt = $this->pairedAt ?? now()->toISOString();
    }

    public function broadcastOn(): array
    {
        return [
            new Channel("shop.{$this->shopSlug}.agents"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'AgentPaired';
    }

    public function broadcastWith(): array
    {
        return [
            'agentId' => $this->agentId,
            'deviceName' => $this->deviceName,
            'pairedAt' => $this->pairedAt,
        ];
    }
}
