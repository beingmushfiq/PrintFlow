<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Tenancy\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Role extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id',
        'name',
        'guard_name',
    ];

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'role_permissions', 'role_id', 'permission_id');
    }

    public function tenantUsers(): BelongsToMany
    {
        return $this->belongsToMany(TenantUser::class, 'tenant_user_roles', 'role_id', 'tenant_user_id');
    }
}
