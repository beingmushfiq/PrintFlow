<?php

declare(strict_types=1);

namespace App\Domain\Pricing\Contracts;

use App\Domain\Pricing\DTOs\PricingRequest;
use App\Domain\Pricing\DTOs\QuoteSnapshotData;

interface PricingCalculatorInterface
{
    public function calculate(PricingRequest $request): QuoteSnapshotData;
}
