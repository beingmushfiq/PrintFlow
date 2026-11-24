<?php

declare(strict_types=1);

namespace App\Domain\Pricing\DTOs;

final class PricingRequest
{
    /**
     * @param int $totalPages Number of pages in the selected range
     * @param int $copies Number of copies (1-100)
     * @param string $colorMode 'mono' or 'color'
     * @param string $sidesMode 'simplex' or 'duplex'
     * @param string $paperSize 'A4' or 'Legal'
     * @param string $pageRange 'all' or comma/hyphen range e.g. '1-3, 5, 8-10'
     * @param string|null $priceProfileId
     * @param string|null $fileId
     * @param string $duplexModel 'model_a' or 'model_b'
     * @param int|null $baseSimplexSideRatePoisha
     * @param int|null $duplexDiscountPercent
     * @param int|null $flatDuplexSheetRatePoisha
     * @param int|null $minimumOrderFloorPoisha
     * @param int|null $serviceFeePoisha
     * @param int|null $vatBasisPoints
     */
    public function __construct(
        public readonly int $totalPages,
        public readonly int $copies = 1,
        public readonly string $colorMode = 'mono',
        public readonly string $sidesMode = 'simplex',
        public readonly string $paperSize = 'A4',
        public readonly string $pageRange = 'all',
        public readonly ?string $priceProfileId = null,
        public readonly ?string $fileId = null,
        public readonly string $duplexModel = 'model_b',
        public readonly ?int $baseSimplexSideRatePoisha = null,
        public readonly ?int $duplexDiscountPercent = null,
        public readonly ?int $flatDuplexSheetRatePoisha = null,
        public readonly ?int $minimumOrderFloorPoisha = null,
        public readonly ?int $serviceFeePoisha = null,
        public readonly ?int $vatBasisPoints = null,
    ) {}
}
