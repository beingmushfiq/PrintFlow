<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PriceRule extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'price_profile_id',
        'service_code',
        'media_code',
        'color_mode',
        'sides_mode',
        'unit_basis',
        'unit_price_minor',
        'minimum_quantity',
        'maximum_quantity',
        'is_active',
        'rule_json',
    ];

    protected $casts = [
        'unit_price_minor' => 'integer',
        'minimum_quantity' => 'integer',
        'maximum_quantity' => 'integer',
        'is_active' => 'boolean',
        'rule_json' => 'array',
    ];

    public function profile(): BelongsTo
    {
        return $this->belongsTo(PriceProfile::class, 'price_profile_id');
    }
}
