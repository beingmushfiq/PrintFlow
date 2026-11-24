<?php

declare(strict_types=1);

namespace App\Domain\Pricing\Services;

use App\Domain\Pricing\Contracts\PricingCalculatorInterface;
use App\Domain\Pricing\DTOs\PricingRequest;
use App\Domain\Pricing\DTOs\QuoteSnapshotData;
use App\Domain\Shared\Money;
use App\Models\PriceProfile;
use App\Models\PriceRule;
use InvalidArgumentException;

class DynamicDuplexPricingEngine implements PricingCalculatorInterface
{
    /**
     * Parse page range string (e.g. 'all', '1-3, 5, 8-10') and return 1-based page list.
     *
     * @return array<int>
     */
    public static function parsePageRange(string $rangeStr, int $totalPages): array
    {
        $rangeStr = trim($rangeStr);

        if ($rangeStr === '' || $rangeStr === 'all') {
            return range(1, max(1, $totalPages));
        }

        $pages = [];
        $parts = explode(',', $rangeStr);

        foreach ($parts as $part) {
            $part = trim($part);
            if ($part === '') {
                continue;
            }

            if (str_contains($part, '-')) {
                $bounds = explode('-', $part);
                if (count($bounds) !== 2) {
                    throw new InvalidArgumentException("Invalid page range chunk: '{$part}'");
                }
                $start = (int) trim($bounds[0]);
                $end = (int) trim($bounds[1]);

                if ($start < 1 || $end > $totalPages || $start > $end) {
                    throw new InvalidArgumentException("Invalid or inverted page range: '{$part}' (document has {$totalPages} pages)");
                }

                for ($i = $start; $i <= $end; $i++) {
                    $pages[$i] = true;
                }
            } else {
                if (! is_numeric($part)) {
                    throw new InvalidArgumentException("Invalid page number: '{$part}'");
                }
                $page = (int) $part;
                if ($page < 1 || $page > $totalPages) {
                    throw new InvalidArgumentException("Page number out of bounds: '{$part}' (document has {$totalPages} pages)");
                }
                $pages[$page] = true;
            }
        }

        $result = array_keys($pages);
        sort($result);

        return $result;
    }

    public function calculate(PricingRequest $request): QuoteSnapshotData
    {
        if ($request->copies < 1 || $request->copies > 100) {
            throw new InvalidArgumentException('Copies must be an integer between 1 and 100.');
        }

        if ($request->totalPages < 1) {
            throw new InvalidArgumentException('Total pages must be at least 1.');
        }

        // Resolve Profile if needed
        $profile = null;
        if ($request->priceProfileId) {
            $profile = PriceProfile::find($request->priceProfileId);
        }

        // Base rate resolution
        $baseRate = $request->baseSimplexSideRatePoisha;
        $duplexDiscountPercent = $request->duplexDiscountPercent ?? 0;
        $flatDuplexSheetRate = $request->flatDuplexSheetRatePoisha;
        $minimumFloor = $request->minimumOrderFloorPoisha ?? ($profile?->minimum_order_minor ?? 0);
        $serviceFee = $request->serviceFeePoisha ?? ($profile?->service_fee_minor ?? 0);
        $vatBasisPoints = $request->vatBasisPoints ?? ($profile?->tax_rate_basis_points ?? 0);
        $currency = $profile?->currency ?? 'BDT';
        $calculationVersion = $profile?->calculation_version ?? 1;

        if ($baseRate === null && $profile) {
            // Find active price rule
            $mediaCode = strtolower($request->paperSize) === 'legal' ? 'paper_legal' : 'paper_a4';
            $rule = PriceRule::where('price_profile_id', $profile->id)
                ->where('media_code', $mediaCode)
                ->where('color_mode', $request->colorMode)
                ->where('is_active', true)
                ->first();

            if ($rule) {
                $baseRate = $rule->unit_price_minor;
                if (isset($rule->rule_json['duplex_discount_percent']) && $request->duplexDiscountPercent === null) {
                    $duplexDiscountPercent = (int) $rule->rule_json['duplex_discount_percent'];
                }
                if (isset($rule->rule_json['flat_duplex_sheet_rate_minor']) && $request->flatDuplexSheetRatePoisha === null) {
                    $flatDuplexSheetRate = (int) $rule->rule_json['flat_duplex_sheet_rate_minor'];
                }
            }
        }

        // Default fallback if not found
        if ($baseRate === null) {
            $baseRate = $request->colorMode === 'color' ? 1000 : 200; // 10 BDT or 2 BDT
        }

        $totalPages = $request->totalPages;
        $copies = $request->copies;
        $mode = $request->sidesMode;
        $duplexModel = $request->duplexModel;

        $lineItems = [];
        $costPerCopyPoisha = 0;
        $totalSheets = 0;
        $totalSides = $totalPages * $copies;
        $duplexSheets = 0;
        $simplexSheets = 0;

        if ($mode === 'simplex') {
            $sheetsPerCopy = $totalPages;
            $totalSheets = $sheetsPerCopy * $copies;
            $simplexSheets = $totalSheets;
            $costPerCopyPoisha = $baseRate * $totalPages;
            $subtotalPoisha = $costPerCopyPoisha * $copies;

            $formattedRate = Money::fromPoisha($baseRate, $currency)->toBdtString();
            $lineItems[] = [
                'type' => 'simplex_page',
                'description' => "Simplex Print ({$totalPages} pages @ ৳{$formattedRate}/side)",
                'quantity' => $totalPages * $copies,
                'unitRatePoisha' => $baseRate,
                'totalPoisha' => $subtotalPoisha,
            ];
        } else {
            // Duplex Mode: odd page split
            $duplexSheetsPerCopy = intdiv($totalPages, 2);
            $oddPageCount = $totalPages % 2;
            $simplexSheetsPerCopy = $oddPageCount;
            $totalSheets = ($duplexSheetsPerCopy + $simplexSheetsPerCopy) * $copies;
            $duplexSheets = $duplexSheetsPerCopy * $copies;
            $simplexSheets = $simplexSheetsPerCopy * $copies;

            if ($duplexModel === 'model_a') {
                $sheetRate = $flatDuplexSheetRate !== null
                    ? $flatDuplexSheetRate
                    : (int) round($baseRate * 1.8);

                $duplexCost = $duplexSheetsPerCopy * $sheetRate;
                $oddCost = $simplexSheetsPerCopy * $baseRate;
                $costPerCopyPoisha = $duplexCost + $oddCost;

                if ($duplexSheetsPerCopy > 0) {
                    $formattedRate = Money::fromPoisha($sheetRate, $currency)->toBdtString();
                    $lineItems[] = [
                        'type' => 'duplex_sheet',
                        'description' => "Duplex Sheets ({$duplexSheetsPerCopy} sheets @ ৳{$formattedRate}/sheet)",
                        'quantity' => $duplexSheetsPerCopy * $copies,
                        'unitRatePoisha' => $sheetRate,
                        'totalPoisha' => $duplexCost * $copies,
                    ];
                }

                if ($simplexSheetsPerCopy > 0) {
                    $formattedRate = Money::fromPoisha($baseRate, $currency)->toBdtString();
                    $lineItems[] = [
                        'type' => 'odd_page_simplex',
                        'description' => "Odd Page Simplex Sheet (1 sheet @ ৳{$formattedRate}/side)",
                        'quantity' => $simplexSheetsPerCopy * $copies,
                        'unitRatePoisha' => $baseRate,
                        'totalPoisha' => $oddCost * $copies,
                    ];
                }
            } else {
                // Model B: Discounted second side
                $discountFactor = (100 - $duplexDiscountPercent) / 100.0;
                $secondSideRate = (int) round($baseRate * $discountFactor);

                $frontSideCost = $duplexSheetsPerCopy * $baseRate;
                $backSideCost = $duplexSheetsPerCopy * $secondSideRate;
                $oddSideCost = $simplexSheetsPerCopy * $baseRate;
                $costPerCopyPoisha = $frontSideCost + $backSideCost + $oddSideCost;

                if ($duplexSheetsPerCopy > 0) {
                    $formattedFront = Money::fromPoisha($baseRate, $currency)->toBdtString();
                    $formattedBack = Money::fromPoisha($secondSideRate, $currency)->toBdtString();

                    $lineItems[] = [
                        'type' => 'duplex_front_side',
                        'description' => "Duplex Front Sides ({$duplexSheetsPerCopy} sides @ ৳{$formattedFront}/side)",
                        'quantity' => $duplexSheetsPerCopy * $copies,
                        'unitRatePoisha' => $baseRate,
                        'totalPoisha' => $frontSideCost * $copies,
                    ];

                    $backDesc = $duplexDiscountPercent > 0
                        ? "Duplex Back Sides ({$duplexDiscountPercent}% off @ ৳{$formattedBack}/side)"
                        : "Duplex Back Sides ({$duplexSheetsPerCopy} sides @ ৳{$formattedBack}/side)";

                    $lineItems[] = [
                        'type' => 'duplex_back_side',
                        'description' => $backDesc,
                        'quantity' => $duplexSheetsPerCopy * $copies,
                        'unitRatePoisha' => $secondSideRate,
                        'totalPoisha' => $backSideCost * $copies,
                    ];
                }

                if ($simplexSheetsPerCopy > 0) {
                    $formattedOdd = Money::fromPoisha($baseRate, $currency)->toBdtString();
                    $lineItems[] = [
                        'type' => 'odd_page_simplex',
                        'description' => "Odd Page Simplex Side (1 side @ ৳{$formattedOdd}/side)",
                        'quantity' => $simplexSheetsPerCopy * $copies,
                        'unitRatePoisha' => $baseRate,
                        'totalPoisha' => $oddSideCost * $copies,
                    ];
                }
            }

            $subtotalPoisha = $costPerCopyPoisha * $copies;
        }

        // Minimum order floor adjustment
        $floorAdjustmentPoisha = 0;
        $effectiveSubtotal = $subtotalPoisha;
        if ($effectiveSubtotal < $minimumFloor) {
            $floorAdjustmentPoisha = $minimumFloor - $effectiveSubtotal;
            $effectiveSubtotal = $minimumFloor;
        }

        // Basis-point VAT applied to effectiveSubtotal + serviceFee
        $taxableAmount = $effectiveSubtotal + $serviceFee;
        $vatPoisha = (int) round(($taxableAmount * $vatBasisPoints) / 10000);
        $totalPoisha = $taxableAmount + $vatPoisha;

        // Discount calculation: difference from pure simplex
        $fullSimplexEquivalent = $baseRate * $totalPages * $copies;
        $discountPoisha = max(0, $fullSimplexEquivalent - $subtotalPoisha);

        return new QuoteSnapshotData(
            subtotalPoisha: $subtotalPoisha,
            taxPoisha: $vatPoisha,
            feePoisha: $serviceFee,
            discountPoisha: $discountPoisha,
            floorAdjustmentPoisha: $floorAdjustmentPoisha,
            totalPoisha: $totalPoisha,
            costPerCopyPoisha: $costPerCopyPoisha,
            totalSheets: $totalSheets,
            totalSides: $totalSides,
            duplexSheets: $duplexSheets,
            simplexSheets: $simplexSheets,
            lineItems: $lineItems,
            currency: $currency,
            calculationVersion: $calculationVersion,
        );
    }
}
