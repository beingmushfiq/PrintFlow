<?php

declare(strict_types=1);

namespace Tests\Feature\Tenancy;

use App\Domain\Tenancy\Edition;
use App\Domain\Tenancy\EditionContext;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\SubscriptionInvoice;
use App\Models\Tenant;
use App\Models\UsageEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EditionGateTest extends TestCase
{
    use RefreshDatabase;

    public function test_platform_routes_return_404_in_standalone_mode(): void
    {
        // Enforce standalone edition context
        config(['app.edition' => 'standalone']);
        app()->instance(EditionContext::class, new EditionContext('standalone'));

        $response = $this->getJson('/api/v1/platform/plans');

        $response->assertStatus(404);
        $response->assertJsonStructure([
            'data',
            'meta' => ['correlation_id'],
            'errors' => [
                ['message'],
            ],
        ]);
        $this->assertNull($response->json('data'));
        $this->assertSame('Resource not found.', $response->json('errors.0.message'));
    }

    public function test_header_spoofing_cannot_bypass_standalone_lockdown(): void
    {
        config(['app.edition' => 'standalone']);
        app()->instance(EditionContext::class, new EditionContext('standalone'));

        // Attempting to pass saas in headers should be ignored
        $response = $this->withHeaders([
            'X-PrintFlow-Edition' => 'saas',
        ])->getJson('/api/v1/platform/subscriptions');

        $response->assertStatus(404);
        $this->assertSame('Resource not found.', $response->json('errors.0.message'));
    }

    public function test_platform_routes_are_accessible_when_edition_is_saas(): void
    {
        config(['app.edition' => 'saas']);
        app()->instance(EditionContext::class, new EditionContext('saas'));

        Plan::create([
            'name' => 'Pro Shop Plan',
            'code' => 'pro-monthly',
            'currency' => 'BDT',
            'amount_minor' => 200000,
            'billing_interval' => 'month',
            'billing_interval_count' => 1,
            'trial_days' => 14,
            'is_active' => true,
        ]);

        $response = $this->getJson('/api/v1/platform/plans');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'data' => [
                '*' => ['id', 'name', 'code', 'currency', 'amount_minor'],
            ],
            'meta' => ['correlation_id'],
            'errors',
        ]);
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('pro-monthly', $response->json('data.0.code'));
        $this->assertSame(200000, $response->json('data.0.amount_minor'));
    }

    public function test_saas_models_maintain_correct_schema_and_tenant_relations(): void
    {
        $tenant = Tenant::create([
            'name' => 'Subscription Test Tenant',
            'slug' => 'sub-tenant',
            'edition' => 'saas',
        ]);

        $plan = Plan::create([
            'name' => 'Starter Monthly',
            'code' => 'starter-monthly',
            'currency' => 'BDT',
            'amount_minor' => 100000,
            'billing_interval' => 'month',
            'is_active' => true,
        ]);

        $subscription = Subscription::create([
            'tenant_id' => $tenant->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'starts_at' => now(),
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
            'cancel_at_period_end' => false,
        ]);

        $invoice = SubscriptionInvoice::create([
            'tenant_id' => $tenant->id,
            'subscription_id' => $subscription->id,
            'invoice_number' => 'INV-2026-TEST',
            'currency' => 'BDT',
            'subtotal_minor' => 100000,
            'tax_minor' => 5000,
            'total_minor' => 105000,
            'status' => 'paid',
            'paid_at' => now(),
        ]);

        $usage = UsageEvent::create([
            'tenant_id' => $tenant->id,
            'event_type' => 'page_printed',
            'quantity' => 25,
            'unit' => 'pages',
            'source_id' => 'ord_test_001',
            'occurred_at' => now(),
        ]);

        $this->assertSame(105000, $invoice->total_minor);
        $this->assertSame('active', $subscription->status);
        $this->assertSame($plan->id, $subscription->plan->id);
        $this->assertSame($subscription->id, $invoice->subscription->id);
        $this->assertSame('page_printed', $usage->event_type);
        $this->assertSame(25, $usage->quantity);
    }
}
