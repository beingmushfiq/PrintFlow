<?php

declare(strict_types=1);

namespace App\Domain\Tenancy;

class EntitlementService
{
    public function __construct(
        private readonly EditionContext $editionContext
    ) {}

    /**
     * Determine whether a feature is entitled for the current tenant/edition.
     */
    public function hasFeature(string $feature): bool
    {
        if ($this->editionContext->isStandalone()) {
            // Standalone mode: all core print shop operations are 100% entitled out-of-the-box
            $saasOnlyFeatures = [
                'multi_outlet',
                'allow_multi_outlet',
                'custom_domains',
                'allow_custom_domains',
                'platform_admin',
                'saas_billing',
                'tenant_switcher',
            ];

            if (in_array($feature, $saasOnlyFeatures, true)) {
                return false;
            }

            return true;
        }

        // SaaS mode: features depend on active plan / subscription
        return true;
    }

    /**
     * Alias for feature entitlement check.
     */
    public function checkEntitlement(string $feature): bool
    {
        return $this->hasFeature($feature);
    }

    /**
     * Check if a system module is active for the current edition.
     */
    public function isModuleActive(string $moduleName): bool
    {
        if ($this->editionContext->isStandalone()) {
            if (str_starts_with($moduleName, 'saas_') || in_array($moduleName, ['subscription_billing', 'platform_admin'], true)) {
                return false;
            }
            return true;
        }

        return true;
    }

    /**
     * Get resource limits and quotas for the current edition.
     */
    public function getPlanLimits(): array
    {
        if ($this->editionContext->isStandalone()) {
            return [
                'max_print_jobs' => -1, // Unlimited
                'max_printers' => -1,   // Unlimited
                'max_shops' => 1,       // Single-tenant single shop baseline
                'unlimited_prints' => true,
            ];
        }

        return [
            'max_print_jobs' => 10000,
            'max_printers' => 5,
            'max_shops' => 3,
            'unlimited_prints' => false,
        ];
    }

    /**
     * Return feature flags by edition.
     */
    public function getFeatureFlags(): array
    {
        $isSaas = $this->editionContext->isSaas();

        return [
            'allow_multi_outlet' => $isSaas,
            'allow_custom_domains' => $isSaas,
            'direct_pos_printing' => true,
        ];
    }
}
