<?php

declare(strict_types=1);

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrderStatusChanged implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $channelIdentifier,
        public string $status,
        public string $orderReference,
        public ?string $orderId = null
    ) {}

    public function broadcastOn(): array
    {
        return [
            new Channel("order.{$this->channelIdentifier}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'OrderStatusChanged';
    }

    public function broadcastWith(): array
    {
        return [
            'status' => $this->status,
            'orderReference' => $this->orderReference,
            'orderId' => $this->orderId,
        ];
    }
}
