<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PrintAgent extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'shop_id',
        'device_name',
        'device_uuid',
        'machine_guid',
        'public_key_hash',
        'agent_token_hash',
        'agent_token',
        'status',
        'last_seen_at',
        'pairing_code',
        'pairing_code_expires_at',
        'pairing_expires_at',
        'metadata',
    ];

    protected $hidden = [
        'agent_token',
        'agent_token_hash',
    ];

    protected $casts = [
        'last_seen_at' => 'datetime',
        'pairing_code_expires_at' => 'datetime',
        'pairing_expires_at' => 'datetime',
        'metadata' => 'array',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function printers(): HasMany
    {
        return $this->hasMany(Printer::class);
    }

    public function printJobs(): HasMany
    {
        return $this->hasMany(PrintJob::class);
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(PrintJobAttempt::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereIn('status', ['active', 'online']);
    }

    public function scopePaired(Builder $query): Builder
    {
        return $query->where('status', 'paired');
    }

    public function scopeOnline(Builder $query): Builder
    {
        return $query->whereIn('status', ['online', 'active']);
    }

    public function scopeOffline(Builder $query): Builder
    {
        return $query->where('status', 'offline');
    }

    public function scopeBusy(Builder $query): Builder
    {
        return $query->where('status', 'busy');
    }

    public function scopeRevoked(Builder $query): Builder
    {
        return $query->where('status', 'revoked');
    }
}
