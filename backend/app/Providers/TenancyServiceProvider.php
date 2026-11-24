<?php

declare(strict_types=1);

namespace App\Providers;

use App\Domain\Tenancy\EditionContext;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Support\ServiceProvider;

class TenancyServiceProvider extends ServiceProvider
{
    /**
     * Register tenancy services.
     */
    public function register(): void
    {
        $this->app->singleton(EditionContext::class, function ($app) {
            return new EditionContext;
        });

        // TenantContext is bound per-request / lazily
        $this->app->bind(TenantContext::class, function ($app) {
            if ($app->has('current_tenant_context')) {
                return $app->make('current_tenant_context');
            }

            return null;
        });
    }

    /**
     * Bootstrap tenancy services.
     */
    public function boot(): void
    {
        //
    }
}
