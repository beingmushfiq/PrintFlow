<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Plan extends Model
{
    use HasUlids;

    protected $fillable = [
        'name',
        'code',
        'currency',
        'amount_minor',
        'billing_interval',
        'billing_interval_count',
        'trial_days',
        'is_active',
        'features_json',
        'limits_json',
    ];

    protected $casts = [
        'amount_minor' => 'integer',
        'billing_interval_count' => 'integer',
        'trial_days' => 'integer',
        'is_active' => 'boolean',
        'features_json' => 'array',
        'limits_json' => 'array',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }
}
