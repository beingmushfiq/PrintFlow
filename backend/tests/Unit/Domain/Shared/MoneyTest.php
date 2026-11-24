<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\Shared;

use App\Domain\Shared\Money;
use App\Domain\Shared\RoundingMode;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class MoneyTest extends TestCase
{
    public function test_can_instantiate_from_poisha(): void
    {
        $money = Money::fromPoisha(1250);

        $this->assertSame(1250, $money->getPoisha());
        $this->assertSame('BDT', $money->getCurrency());
        $this->assertSame('12.50', $money->toBdtString());
    }

    public function test_cannot_instantiate_negative_poisha(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Money poisha cannot be negative.');

        Money::fromPoisha(-1);
    }

    public function test_can_instantiate_from_bdt_string_and_float_accurately(): void
    {
        $m1 = Money::fromBdt('12.50');
        $this->assertSame(1250, $m1->getPoisha());

        $m2 = Money::fromBdt(12.50);
        $this->assertSame(1250, $m2->getPoisha());

        $m3 = Money::fromBdt('0.05');
        $this->assertSame(5, $m3->getPoisha());

        $m4 = Money::fromBdt('100');
        $this->assertSame(10000, $m4->getPoisha());

        $m5 = Money::fromBdt('৳ 250.75');
        $this->assertSame(25075, $m5->getPoisha());

        $m6 = Money::fromBdt('12.506'); // Round half up: 12.51 -> 1251
        $this->assertSame(1251, $m6->getPoisha());
    }

    public function test_cannot_instantiate_from_negative_bdt(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Money::fromBdt('-10.00');
    }

    public function test_formats_correctly_in_bangla_and_english(): void
    {
        $money = Money::fromBdt('12.50');

        $this->assertSame('৳১২.৫০', $money->format('bn'));
        $this->assertSame('৳ 12.50', $money->format('en'));

        $zero = Money::fromPoisha(0);
        $this->assertSame('৳০.০০', $zero->format('bn'));
        $this->assertSame('৳ 0.00', $zero->format('en'));

        $large = Money::fromPoisha(987654321); // 9876543.21 BDT
        $this->assertSame('৳৯৮৭৬৫৪৩.২১', $large->format('bn'));
        $this->assertSame('৳ 9876543.21', $large->format('en'));
    }

    public function test_addition_and_subtraction(): void
    {
        $a = Money::fromPoisha(1000);
        $b = Money::fromPoisha(550);

        $sum = $a->add($b);
        $this->assertSame(1550, $sum->getPoisha());

        $diff = $a->subtract($b);
        $this->assertSame(450, $diff->getPoisha());
    }

    public function test_subtraction_underflow_throws_exception(): void
    {
        $a = Money::fromPoisha(500);
        $b = Money::fromPoisha(600);

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Money subtraction would result in negative poisha.');

        $a->subtract($b);
    }

    public function test_currency_mismatch_throws_exception(): void
    {
        $bdt = Money::fromPoisha(100, 'BDT');
        $usd = Money::fromPoisha(100, 'USD');

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Currency mismatch');

        $bdt->add($usd);
    }

    public function test_multiplication_with_rounding_modes(): void
    {
        $money = Money::fromPoisha(105); // 1.05 BDT

        // 105 * 1.5 = 157.5
        $halfUp = $money->multiply(1.5, RoundingMode::HALF_UP);
        $this->assertSame(158, $halfUp->getPoisha());

        $halfDown = $money->multiply(1.5, RoundingMode::HALF_DOWN);
        $this->assertSame(157, $halfDown->getPoisha());

        $up = $money->multiply(1.5, RoundingMode::UP);
        $this->assertSame(158, $up->getPoisha());

        $down = $money->multiply(1.5, RoundingMode::DOWN);
        $this->assertSame(157, $down->getPoisha());

        $zeroMult = $money->multiply(0);
        $this->assertSame(0, $zeroMult->getPoisha());
    }

    public function test_allocation_with_remainder_preserves_every_poisha(): void
    {
        // 100 poisha split into 3 equal shares: 34, 33, 33 = 100 poisha
        $money = Money::fromPoisha(100);
        $allocated = $money->allocate([1, 1, 1]);

        $this->assertCount(3, $allocated);
        $this->assertSame(34, $allocated[0]->getPoisha());
        $this->assertSame(33, $allocated[1]->getPoisha());
        $this->assertSame(33, $allocated[2]->getPoisha());

        $totalAllocated = $allocated[0]->getPoisha() + $allocated[1]->getPoisha() + $allocated[2]->getPoisha();
        $this->assertSame(100, $totalAllocated);
    }

    public function test_allocation_with_asymmetric_ratios(): void
    {
        $money = Money::fromBdt('70.00'); // 7000 poisha
        $allocated = $money->allocate(['owner' => 70, 'platform' => 30]);

        $this->assertSame(4900, $allocated['owner']->getPoisha());
        $this->assertSame(2100, $allocated['platform']->getPoisha());
        $this->assertSame(7000, $allocated['owner']->getPoisha() + $allocated['platform']->getPoisha());
    }

    public function test_comparisons_and_state(): void
    {
        $zero = Money::fromPoisha(0);
        $ten = Money::fromPoisha(1000);
        $anotherTen = Money::fromPoisha(1000);
        $twenty = Money::fromPoisha(2000);

        $this->assertTrue($zero->isZero());
        $this->assertFalse($ten->isZero());

        $this->assertTrue($ten->equals($anotherTen));
        $this->assertFalse($ten->equals($twenty));

        $this->assertTrue($twenty->greaterThan($ten));
        $this->assertFalse($ten->greaterThan($twenty));

        $this->assertTrue($ten->lessThan($twenty));
        $this->assertFalse($twenty->lessThan($ten));
    }

    public function test_boundary_large_values(): void
    {
        // 100 Million BDT = 10 Billion Poisha (safe in 64-bit integer)
        $largeAmount = 10_000_000_000;
        $money = Money::fromPoisha($largeAmount);

        $this->assertSame(10_000_000_000, $money->getPoisha());
        $this->assertSame('100000000.00', $money->toBdtString());
        $this->assertSame('৳ 100000000.00', $money->format('en'));
    }
}
