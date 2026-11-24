<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasUlids, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'password',
        'is_platform_admin',
        'status',
        'last_login_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'is_platform_admin' => 'boolean',
            'password' => 'hashed',
        ];
    }

    public function tenantUsers(): HasMany
    {
        return $this->hasMany(TenantUser::class);
    }

    public function tenants(): BelongsToMany
    {
        return $this->belongsToMany(Tenant::class, 'tenant_users')
            ->withPivot(['id', 'status', 'invited_by', 'joined_at'])
            ->withTimestamps();
    }

    public function shopAssignments(): HasMany
    {
        return $this->hasMany(ShopUserAssignment::class);
    }

    public function hasRole(string $roleName, ?string $tenantId = null): bool
    {
        if ($this->is_platform_admin) {
            return true;
        }

        $assignment = $this->shopAssignments()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->where('role', $roleName)
            ->first();

        if ($assignment) {
            return true;
        }

        return $this->tenantUsers()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->whereHas('roles', fn ($q) => $q->where('name', $roleName))
            ->exists();
    }

    public function hasPermissionTo(string $permissionName, ?string $tenantId = null): bool
    {
        if ($this->is_platform_admin) {
            return true;
        }

        if ($this->hasRole('owner', $tenantId) || $this->hasRole('admin', $tenantId)) {
            return true;
        }

        return $this->tenantUsers()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->whereHas('roles.permissions', fn ($q) => $q->where('name', $permissionName))
            ->exists();
    }
}
