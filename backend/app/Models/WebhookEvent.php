<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

class WebhookEvent extends Model
{
    use HasUlids;

    protected $fillable = [
        'provider',
        'connection_scope_id',
        'provider_event_id',
        'event_type',
        'signature_valid',
        'received_at',
        'processed_at',
        'processing_status',
        'payload_hash',
        'redacted_payload_json',
        'failure_code',
    ];

    protected $casts = [
        'signature_valid' => 'boolean',
        'received_at' => 'datetime',
        'processed_at' => 'datetime',
        'redacted_payload_json' => 'array',
    ];
}
