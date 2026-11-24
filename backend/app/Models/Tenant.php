<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Tenant extends Model
{
    use HasUlids, SoftDeletes;

    protected $fillable = [
        'name',
        'slug',
        'edition',
        'status',
        'default_currency',
        'default_locale',
        'timezone',
        'settings_json',
    ];

    protected $casts = [
        'settings_json' => 'array',
    ];

    public function domains(): HasMany
    {
        return $this->hasMany(TenantDomain::class);
    }

    public function shops(): HasMany
    {
        return $this->hasMany(Shop::class);
    }

    public function tenantUsers(): HasMany
    {
        return $this->hasMany(TenantUser::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }
}
