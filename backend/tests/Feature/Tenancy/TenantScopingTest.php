<?php

declare(strict_types=1);

namespace Tests\Feature\Tenancy;

use App\Domain\Tenancy\Edition;
use App\Domain\Tenancy\TenantContext;
use App\Models\Shop;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TenantScopingTest extends TestCase
{
    use RefreshDatabase;

    public function test_models_with_belongstotenant_are_scoped_by_tenant_context(): void
    {
        $tenantA = Tenant::create([
            'name' => 'Tenant Alpha',
            'slug' => 'alpha',
            'edition' => 'saas',
        ]);

        $tenantB = Tenant::create([
            'name' => 'Tenant Beta',
            'slug' => 'beta',
            'edition' => 'saas',
        ]);

        // Explicitly create shops for each tenant
        $shopA = Shop::withoutTenant()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'Alpha Shop',
            'slug' => 'alpha-shop',
            'public_status' => 'active',
        ]);

        $shopB = Shop::withoutTenant()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'Beta Shop',
            'slug' => 'beta-shop',
            'public_status' => 'active',
        ]);

        // Bind Tenant A context
        $contextA = new TenantContext($tenantA->id, 'alpha', Edition::SAAS);
        app()->instance(TenantContext::class, $contextA);

        $shopsScopedToA = Shop::all();
        $this->assertCount(1, $shopsScopedToA);
        $this->assertSame($shopA->id, $shopsScopedToA->first()->id);

        // Auto-assign tenant_id on model creation
        $shopA2 = Shop::create([
            'name' => 'Alpha Branch 2',
            'slug' => 'alpha-2',
            'public_status' => 'active',
        ]);
        $this->assertSame($tenantA->id, $shopA2->tenant_id);

        // Bind Tenant B context
        $contextB = new TenantContext($tenantB->id, 'beta', Edition::SAAS);
        app()->instance(TenantContext::class, $contextB);

        $shopsScopedToB = Shop::all();
        $this->assertCount(1, $shopsScopedToB);
        $this->assertSame($shopB->id, $shopsScopedToB->first()->id);

        // Without tenant scope bypasses filtering
        $allShops = Shop::withoutTenant()->get();
        $this->assertCount(3, $allShops);
    }
}
