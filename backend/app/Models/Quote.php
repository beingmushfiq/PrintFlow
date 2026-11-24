<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Quote extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'shop_id',
        'order_id',
        'price_profile_id',
        'quote_version',
        'currency',
        'subtotal_minor',
        'tax_minor',
        'fee_minor',
        'discount_minor',
        'total_minor',
        'line_items_json',
        'calculation_hash',
        'expires_at',
        'accepted_at',
    ];

    protected $casts = [
        'quote_version' => 'integer',
        'subtotal_minor' => 'integer',
        'tax_minor' => 'integer',
        'fee_minor' => 'integer',
        'discount_minor' => 'integer',
        'total_minor' => 'integer',
        'line_items_json' => 'array',
        'expires_at' => 'datetime',
        'accepted_at' => 'datetime',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function priceProfile(): BelongsTo
    {
        return $this->belongsTo(PriceProfile::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }
}
