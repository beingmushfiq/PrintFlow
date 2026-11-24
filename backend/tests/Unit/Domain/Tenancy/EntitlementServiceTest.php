<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\Tenancy;

use App\Domain\Tenancy\EditionContext;
use App\Domain\Tenancy\EntitlementService;
use App\Domain\Tenancy\FeatureGate;
use Tests\TestCase;

class EntitlementServiceTest extends TestCase
{
    public function test_standalone_edition_grants_100_percent_entitlement_to_core_features(): void
    {
        $standaloneContext = new EditionContext('standalone');
        $entitlement = new EntitlementService($standaloneContext);

        $this->assertTrue($entitlement->hasFeature('unlimited_print_jobs'));
        $this->assertTrue($entitlement->hasFeature('printer_fleet_management'));
        $this->assertTrue($entitlement->hasFeature('custom_pricing_rules'));
        $this->assertTrue($entitlement->hasFeature('direct_pos_printing'));

        // FeatureGate helper checks
        $gate = new FeatureGate($entitlement);
        $this->assertTrue($gate->allows('unlimited_print_jobs'));
        $this->assertFalse($gate->denies('unlimited_print_jobs'));
    }

    public function test_standalone_edition_disables_saas_multi_tenant_features(): void
    {
        $standaloneContext = new EditionContext('standalone');
        $entitlement = new EntitlementService($standaloneContext);

        $this->assertFalse($entitlement->hasFeature('multi_outlet'));
        $this->assertFalse($entitlement->hasFeature('custom_domains'));
        $this->assertFalse($entitlement->hasFeature('platform_admin'));

        $flags = $entitlement->getFeatureFlags();
        $this->assertFalse($flags['allow_multi_outlet']);
        $this->assertFalse($flags['allow_custom_domains']);
        $this->assertTrue($flags['direct_pos_printing']);
    }

    public function test_standalone_edition_dormant_module_checks(): void
    {
        $standaloneContext = new EditionContext('standalone');
        $entitlement = new EntitlementService($standaloneContext);

        $this->assertFalse($entitlement->isModuleActive('saas_billing_engine'));
        $this->assertFalse($entitlement->isModuleActive('subscription_billing'));
        $this->assertTrue($entitlement->isModuleActive('core_print_spooler'));
        $this->assertTrue($entitlement->isModuleActive('print_agent'));
    }

    public function test_standalone_edition_plan_limits_are_unlimited(): void
    {
        $standaloneContext = new EditionContext('standalone');
        $entitlement = new EntitlementService($standaloneContext);

        $limits = $entitlement->getPlanLimits();
        $this->assertSame(-1, $limits['max_print_jobs']);
        $this->assertSame(-1, $limits['max_printers']);
        $this->assertSame(1, $limits['max_shops']);
        $this->assertTrue($limits['unlimited_prints']);
    }
}
