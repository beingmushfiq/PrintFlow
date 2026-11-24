<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GatewayAccount extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'shop_id',
        'purpose',
        'provider',
        'country',
        'currency',
        'environment',
        'merchant_identifier',
        'credentials_ciphertext',
        'webhook_secret_ciphertext',
        'status',
        'last_verified_at',
        'last_error_code',
    ];

    protected $casts = [
        'last_verified_at' => 'datetime',
    ];

    protected $hidden = [
        'credentials_ciphertext',
        'webhook_secret_ciphertext',
    ];

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
