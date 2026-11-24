<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'shop_id',
        'public_reference',
        'public_token_hash',
        'customer_name',
        'customer_phone',
        'customer_email',
        'status',
        'currency',
        'subtotal_minor',
        'tax_minor',
        'fee_minor',
        'discount_minor',
        'total_minor',
        'quote_snapshot_json',
        'source',
        'expires_at',
        'paid_at',
        'completed_at',
        'cancelled_at',
    ];

    protected $casts = [
        'quote_snapshot_json' => 'array',
        'subtotal_minor' => 'integer',
        'tax_minor' => 'integer',
        'fee_minor' => 'integer',
        'discount_minor' => 'integer',
        'total_minor' => 'integer',
        'expires_at' => 'datetime',
        'paid_at' => 'datetime',
        'completed_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function files(): HasMany
    {
        return $this->hasMany(OrderFile::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(OrderEvent::class);
    }

    public function quotes(): HasMany
    {
        return $this->hasMany(Quote::class);
    }

    public function latestQuote(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(Quote::class)->latestOfMany('quote_version');
    }

    public function printJobs(): HasMany
    {
        return $this->hasMany(PrintJob::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
