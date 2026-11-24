<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Domain\Tenancy\EditionContext;
use App\Domain\Tenancy\TenantContext;
use App\Models\Shop;
use App\Models\Tenant;
use App\Models\TenantDomain;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;

class ResolveTenant
{
    public function __construct(
        private readonly EditionContext $editionContext
    ) {}

    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Guard against calls before database migrations have run
        try {
            if (! Schema::hasTable('tenants')) {
                return $next($request);
            }
        } catch (\Throwable) {
            return $next($request);
        }
        $tenant = null;

        // Check if storefront request has a specific shop slug
        $shopSlug = $request->route('slug') ?? $request->input('shop_slug');
        if ($shopSlug) {
            $shop = Shop::withoutTenant()->where('slug', $shopSlug)->first();
            if ($shop) {
                $tenant = Tenant::find($shop->tenant_id);
            }
        }

        if (! $tenant) {
            if ($this->editionContext->isStandalone()) {
                // Standalone mode: resolve or create default standalone tenant
                $tenant = Tenant::where('edition', 'standalone')->first();

                if (! $tenant) {
                    $tenant = Tenant::create([
                        'name' => 'PrintFlow Store',
                        'slug' => 'printflow',
                        'edition' => 'standalone',
                        'status' => 'active',
                        'default_currency' => 'BDT',
                        'default_locale' => 'bn',
                        'timezone' => 'Asia/Dhaka',
                    ]);

                    TenantDomain::create([
                        'tenant_id' => $tenant->id,
                        'host' => $request->getHost() ?: 'localhost',
                        'type' => 'standalone_host',
                        'verification_status' => 'verified',
                        'tls_status' => 'active',
                        'is_primary' => true,
                    ]);

                    Shop::create([
                        'tenant_id' => $tenant->id,
                        'name' => 'PrintFlow Main Shop',
                        'slug' => 'printflow-main',
                        'address' => 'Dhaka, Bangladesh',
                        'phone' => '01700000000',
                        'locale' => 'bn',
                        'currency' => 'BDT',
                        'timezone' => 'Asia/Dhaka',
                        'public_status' => 'active',
                    ]);
                }
            } else {
                // SaaS mode: resolve by host
                $domain = TenantDomain::where('host', $request->getHost())->first();
                if ($domain) {
                    $tenant = Tenant::find($domain->tenant_id);
                }
            }
        }

        if ($tenant) {
            $tenantContext = TenantContext::fromTenant($tenant);
            app()->instance(TenantContext::class, $tenantContext);
            app()->instance('current_tenant_context', $tenantContext);
        }

        return $next($request);
    }
}
