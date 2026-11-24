<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

class OutboxEvent extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'event_type',
        'payload_json',
        'status',
        'retry_count',
        'next_retry_at',
        'processed_at',
        'error_message',
    ];

    protected $casts = [
        'payload_json' => 'array',
        'retry_count' => 'integer',
        'next_retry_at' => 'datetime',
        'processed_at' => 'datetime',
    ];
}
