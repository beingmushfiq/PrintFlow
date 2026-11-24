<?php

declare(strict_types=1);

namespace App\Domain\Tenancy\Traits;

use App\Domain\Tenancy\Scopes\TenantScope;
use App\Domain\Tenancy\TenantContext;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

trait BelongsToTenant
{
    /**
     * Boot the trait to add the global tenant scope and auto-assign tenant_id.
     */
    public static function bootBelongsToTenant(): void
    {
        static::addGlobalScope(new TenantScope);

        static::creating(function ($model) {
            if (empty($model->tenant_id) && app()->bound(TenantContext::class)) {
                $context = app(TenantContext::class);
                if ($context instanceof TenantContext && ! empty($context->id())) {
                    $model->tenant_id = $context->id();
                }
            }
        });
    }

    /**
     * Relationship to the owning Tenant.
     */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }

    /**
     * Scope a query to ignore the tenant scope.
     */
    public function scopeWithoutTenant(Builder $query): Builder
    {
        return $query->withoutGlobalScope(TenantScope::class);
    }
}
