<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class PriceProfile extends Model
{
    use BelongsToTenant, HasUlids, SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'shop_id',
        'name',
        'currency',
        'status',
        'effective_from',
        'effective_until',
        'minimum_order_minor',
        'service_fee_minor',
        'tax_mode',
        'tax_rate_basis_points',
        'calculation_version',
        'created_by',
    ];

    protected $casts = [
        'minimum_order_minor' => 'integer',
        'service_fee_minor' => 'integer',
        'tax_rate_basis_points' => 'integer',
        'calculation_version' => 'integer',
        'effective_from' => 'datetime',
        'effective_until' => 'datetime',
    ];

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function rules(): HasMany
    {
        return $this->hasMany(PriceRule::class);
    }
}
