<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Shop extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'name',
        'slug',
        'address',
        'phone',
        'email',
        'logo_object_key',
        'locale',
        'currency',
        'timezone',
        'public_status',
        'public_settings_json',
        'default_price_profile_id',
    ];

    protected $casts = [
        'public_settings_json' => 'array',
    ];

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(ShopUserAssignment::class);
    }

    public function printAgents(): HasMany
    {
        return $this->hasMany(PrintAgent::class);
    }

    public function printers(): HasMany
    {
        return $this->hasMany(Printer::class);
    }

    public function printJobs(): HasMany
    {
        return $this->hasMany(PrintJob::class);
    }
}
