<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\Pricing;

use App\Domain\Pricing\DTOs\PricingRequest;
use App\Domain\Pricing\Services\DynamicDuplexPricingEngine;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class DynamicDuplexPricingEngineTest extends TestCase
{
    private DynamicDuplexPricingEngine $engine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->engine = new DynamicDuplexPricingEngine();
    }

    public function test_simplex_pricing_accurately_in_integer_poisha(): void
    {
        $request = new PricingRequest(
            totalPages: 7,
            copies: 2,
            colorMode: 'mono',
            sidesMode: 'simplex',
            baseSimplexSideRatePoisha: 200 // ৳2.00
        );

        $result = $this->engine->calculate($request);

        $this->assertSame(14, $result->totalSheets);
        $this->assertSame(14, $result->totalSides);
        $this->assertSame(2800, $result->totalPoisha); // 14 sides * 200 Poisha = 2800 Poisha (৳28.00)
        $this->assertSame(1400, $result->costPerCopyPoisha);
    }

    public function test_dynamic_duplex_model_a_flat_sheet_fee_with_odd_page(): void
    {
        // 5-page document: 2 duplex sheets (4 sides) @ 350 Poisha + 1 odd simplex sheet (1 side) @ 200 Poisha = 900 Poisha/copy
        $request = new PricingRequest(
            totalPages: 5,
            copies: 2,
            colorMode: 'mono',
            sidesMode: 'duplex',
            duplexModel: 'model_a',
            baseSimplexSideRatePoisha: 200,
            flatDuplexSheetRatePoisha: 350
        );

        $result = $this->engine->calculate($request);

        $this->assertSame(4, $result->duplexSheets);
        $this->assertSame(2, $result->simplexSheets);
        $this->assertSame(900, $result->costPerCopyPoisha);
        $this->assertSame(1800, $result->totalPoisha);
    }

    public function test_dynamic_duplex_model_b_discounted_second_side_with_odd_page(): void
    {
        // 5-page document: 2 front @ 200 = 400; 2 back @ 20% off (160) = 320; 1 odd @ 200 = 200; total = 920 Poisha/copy
        $request = new PricingRequest(
            totalPages: 5,
            copies: 3,
            colorMode: 'mono',
            sidesMode: 'duplex',
            duplexModel: 'model_b',
            baseSimplexSideRatePoisha: 200,
            duplexDiscountPercent: 20
        );

        $result = $this->engine->calculate($request);

        $this->assertSame(920, $result->costPerCopyPoisha);
        $this->assertSame(2760, $result->totalPoisha); // 920 * 3
        $this->assertCount(3, $result->lineItems);
    }

    public function test_odd_page_in_duplex_document_is_charged_as_simplex_with_zero_discount(): void
    {
        // 3-page document: 1 front (250) + 1 back (175, 30% off 250) + 1 odd page (250) = 675 Poisha
        $request = new PricingRequest(
            totalPages: 3,
            copies: 1,
            colorMode: 'mono',
            sidesMode: 'duplex',
            duplexModel: 'model_b',
            baseSimplexSideRatePoisha: 250,
            duplexDiscountPercent: 30
        );

        $result = $this->engine->calculate($request);

        $this->assertSame(675, $result->costPerCopyPoisha);
        $oddItem = collect($result->lineItems)->first(fn ($i) => str_contains($i['description'], 'Odd Page'));
        $this->assertNotNull($oddItem);
        $this->assertSame(250, $oddItem['unitRatePoisha']);
    }

    public function test_minimum_order_floor_and_basis_point_vat_enforcement(): void
    {
        $request = new PricingRequest(
            totalPages: 1,
            copies: 1,
            colorMode: 'mono',
            sidesMode: 'simplex',
            baseSimplexSideRatePoisha: 200,
            minimumOrderFloorPoisha: 500, // Floor 500
            serviceFeePoisha: 100, // Fee 100
            vatBasisPoints: 500 // 5% VAT
        );

        $result = $this->engine->calculate($request);

        $this->assertSame(200, $result->subtotalPoisha);
        $this->assertSame(300, $result->floorAdjustmentPoisha); // 500 - 200 = 300
        $this->assertSame(100, $result->feePoisha);
        // Taxable: 500 floor + 100 fee = 600. VAT 5% = 30. Total = 630
        $this->assertSame(30, $result->taxPoisha);
        $this->assertSame(630, $result->totalPoisha);
    }

    public function test_page_range_parser_valid_and_invalid(): void
    {
        $pages = DynamicDuplexPricingEngine::parsePageRange('1-3, 5, 8-10', 10);
        $this->assertSame([1, 2, 3, 5, 8, 9, 10], $pages);

        $all = DynamicDuplexPricingEngine::parsePageRange('all', 5);
        $this->assertSame([1, 2, 3, 4, 5], $all);

        $this->expectException(InvalidArgumentException::class);
        DynamicDuplexPricingEngine::parsePageRange('5-2', 10); // Inverted
    }

    public function test_page_range_parser_out_of_bounds_throws_exception(): void
    {
        $this->expectException(InvalidArgumentException::class);
        DynamicDuplexPricingEngine::parsePageRange('1-15', 10); // Out of bounds
    }
}
