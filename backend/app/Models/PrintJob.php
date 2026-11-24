<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PrintJob extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'shop_id',
        'order_id',
        'order_file_id',
        'printer_id',
        'print_agent_id',
        'status',
        'lease_token',
        'leased_at',
        'lease_expires_at',
        'print_settings',
        'file_url',
        'file_hash',
        'file_size_bytes',
        'spooler_job_id',
        'pages_total',
        'pages_printed',
        'completed_at',
        'failed_at',
        'error_message',
        'idempotency_key',
    ];

    protected $casts = [
        'print_settings' => 'array',
        'leased_at' => 'datetime',
        'lease_expires_at' => 'datetime',
        'completed_at' => 'datetime',
        'failed_at' => 'datetime',
        'file_size_bytes' => 'integer',
        'pages_total' => 'integer',
        'pages_printed' => 'integer',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function orderFile(): BelongsTo
    {
        return $this->belongsTo(OrderFile::class);
    }

    public function printer(): BelongsTo
    {
        return $this->belongsTo(Printer::class);
    }

    public function printAgent(): BelongsTo
    {
        return $this->belongsTo(PrintAgent::class);
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(PrintJobAttempt::class);
    }

    public function scopeQueued(Builder $query): Builder
    {
        return $query->where('status', 'queued');
    }

    public function scopeLeased(Builder $query): Builder
    {
        return $query->where('status', 'leased');
    }

    public function scopePrinting(Builder $query): Builder
    {
        return $query->where('status', 'printing');
    }

    public function scopeCompleted(Builder $query): Builder
    {
        return $query->where('status', 'completed');
    }

    public function scopeFailed(Builder $query): Builder
    {
        return $query->where('status', 'failed');
    }

    public function scopeUnknown(Builder $query): Builder
    {
        return $query->where('status', 'unknown');
    }

    public function scopeExpiredLease(Builder $query): Builder
    {
        return $query->where('status', 'leased')
            ->whereNotNull('lease_expires_at')
            ->where('lease_expires_at', '<', now());
    }
}
