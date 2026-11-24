<?php

declare(strict_types=1);

namespace App\Domain\Tenancy;

class FeatureGate
{
    public function __construct(
        private readonly EntitlementService $entitlementService
    ) {}

    public function allows(string $feature): bool
    {
        return $this->entitlementService->hasFeature($feature);
    }

    public function denies(string $feature): bool
    {
        return ! $this->allows($feature);
    }

    public static function check(string $feature): bool
    {
        return app(EntitlementService::class)->hasFeature($feature);
    }
}
