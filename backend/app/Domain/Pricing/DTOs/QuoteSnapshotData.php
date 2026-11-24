<?php

declare(strict_types=1);

namespace App\Domain\Pricing\DTOs;

final class QuoteSnapshotData
{
    /**
     * @param int $subtotalPoisha
     * @param int $taxPoisha
     * @param int $feePoisha
     * @param int $discountPoisha
     * @param int $floorAdjustmentPoisha
     * @param int $totalPoisha
     * @param int $costPerCopyPoisha
     * @param int $totalSheets
     * @param int $totalSides
     * @param int $duplexSheets
     * @param int $simplexSheets
     * @param array<int, array<string, mixed>> $lineItems
     * @param string $currency
     * @param int $calculationVersion
     * @param string|null $calculationHash
     * @param string|null $expiresAt
     */
    public function __construct(
        public readonly int $subtotalPoisha,
        public readonly int $taxPoisha,
        public readonly int $feePoisha,
        public readonly int $discountPoisha,
        public readonly int $floorAdjustmentPoisha,
        public readonly int $totalPoisha,
        public readonly int $costPerCopyPoisha,
        public readonly int $totalSheets,
        public readonly int $totalSides,
        public readonly int $duplexSheets,
        public readonly int $simplexSheets,
        public readonly array $lineItems,
        public readonly string $currency = 'BDT',
        public readonly int $calculationVersion = 1,
        public readonly ?string $calculationHash = null,
        public readonly ?string $expiresAt = null,
    ) {}

    public function withHashAndExpiry(string $hash, string $expiresAt): self
    {
        return new self(
            subtotalPoisha: $this->subtotalPoisha,
            taxPoisha: $this->taxPoisha,
            feePoisha: $this->feePoisha,
            discountPoisha: $this->discountPoisha,
            floorAdjustmentPoisha: $this->floorAdjustmentPoisha,
            totalPoisha: $this->totalPoisha,
            costPerCopyPoisha: $this->costPerCopyPoisha,
            totalSheets: $this->totalSheets,
            totalSides: $this->totalSides,
            duplexSheets: $this->duplexSheets,
            simplexSheets: $this->simplexSheets,
            lineItems: $this->lineItems,
            currency: $this->currency,
            calculationVersion: $this->calculationVersion,
            calculationHash: $hash,
            expiresAt: $expiresAt,
        );
    }

    public function toArray(): array
    {
        return [
            'subtotal_minor' => $this->subtotalPoisha,
            'tax_minor' => $this->taxPoisha,
            'fee_minor' => $this->feePoisha,
            'discount_minor' => $this->discountPoisha,
            'floor_adjustment_minor' => $this->floorAdjustmentPoisha,
            'total_minor' => $this->totalPoisha,
            'cost_per_copy_minor' => $this->costPerCopyPoisha,
            'total_sheets' => $this->totalSheets,
            'total_sides' => $this->totalSides,
            'duplex_sheets' => $this->duplexSheets,
            'simplex_sheets' => $this->simplexSheets,
            'currency' => $this->currency,
            'calculation_version' => $this->calculationVersion,
            'calculation_hash' => $this->calculationHash,
            'expires_at' => $this->expiresAt,
            'line_items' => $this->lineItems,
        ];
    }
}
