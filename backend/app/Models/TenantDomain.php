<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

class TenantDomain extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'host',
        'type',
        'verification_status',
        'verification_token_hash',
        'verified_at',
        'tls_status',
        'is_primary',
    ];

    protected $casts = [
        'is_primary' => 'boolean',
        'verified_at' => 'datetime',
    ];
}
