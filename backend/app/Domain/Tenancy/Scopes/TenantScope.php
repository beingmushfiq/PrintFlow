<?php

declare(strict_types=1);

namespace App\Domain\Tenancy\Scopes;

use App\Domain\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class TenantScope implements Scope
{
    /**
     * Apply the scope to a given Eloquent query builder.
     */
    public function apply(Builder $builder, Model $model): void
    {
        if (app()->bound(TenantContext::class)) {
            $context = app(TenantContext::class);
            if ($context instanceof TenantContext && ! empty($context->id())) {
                $builder->where($model->qualifyColumn('tenant_id'), $context->id());
            }
        }
    }
}
