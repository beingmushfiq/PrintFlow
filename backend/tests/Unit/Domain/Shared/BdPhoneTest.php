<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\Shared;

use App\Domain\Shared\Rules\BdPhone;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

class BdPhoneTest extends TestCase
{
    public function test_normalizes_various_bd_phone_formats(): void
    {
        $this->assertSame('01712345678', BdPhone::normalize('01712345678'));
        $this->assertSame('01712345678', BdPhone::normalize('+8801712345678'));
        $this->assertSame('01712345678', BdPhone::normalize('8801712345678'));
        $this->assertSame('01712345678', BdPhone::normalize('+880 1712-345678'));
        $this->assertSame('01712345678', BdPhone::normalize('01712 345 678'));
        $this->assertSame('01712345678', BdPhone::normalize('(01712) 345-678'));
        $this->assertSame('01811223344', BdPhone::normalize('+8801811223344'));
        $this->assertSame('01999887766', BdPhone::normalize('01999-887766'));
        $this->assertSame('01300112233', BdPhone::normalize('+8801300112233'));

        // Native Bengali numerals
        $this->assertSame('01701234567', BdPhone::normalize('০১৭০১২৩৪৫৬৭'));
        $this->assertSame('01701234567', BdPhone::normalize('+৮৮০১৭০১২৩৪৫৬৭'));
        $this->assertSame('01701234567', BdPhone::normalize('৮৮০১৭০১২৩৪৫৬৭'));
        $this->assertSame('01701234567', BdPhone::normalize('017০১-২৩৪৫৬৭'));
    }

    public function test_validates_legitimate_bd_operators(): void
    {
        // Grameenphone (017, 013)
        $this->assertTrue(BdPhone::isValid('01712345678'));
        $this->assertTrue(BdPhone::isValid('01301234567'));
        $this->assertTrue(BdPhone::isValid('০১৭০১২৩৪৫৬৭'));
        $this->assertTrue(BdPhone::isValid('+৮৮০১৭০১২৩৪৫৬৭'));
        $this->assertTrue(BdPhone::isValid('০১৩০১২৩৪৫৬৭'));

        // Robi (018)
        $this->assertTrue(BdPhone::isValid('01812345678'));
        $this->assertTrue(BdPhone::isValid('০১৮১২৩৪৫৬৭৮'));

        // Banglalink (019, 014)
        $this->assertTrue(BdPhone::isValid('01912345678'));
        $this->assertTrue(BdPhone::isValid('01401234567'));

        // Teletalk (015)
        $this->assertTrue(BdPhone::isValid('01512345678'));

        // Airtel (016)
        $this->assertTrue(BdPhone::isValid('01612345678'));
    }

    public function test_rejects_invalid_phones(): void
    {
        // Disallowed operators (010, 011, 012)
        $this->assertFalse(BdPhone::isValid('01012345678'));
        $this->assertFalse(BdPhone::isValid('01112345678'));
        $this->assertFalse(BdPhone::isValid('01212345678'));

        // Too short / too long
        $this->assertFalse(BdPhone::isValid('0171234567')); // 10 digits
        $this->assertFalse(BdPhone::isValid('017123456789')); // 12 digits

        // Foreign numbers
        $this->assertFalse(BdPhone::isValid('+14155552671'));
        $this->assertFalse(BdPhone::isValid('+919876543210'));

        // Non-numeric garbage
        $this->assertFalse(BdPhone::isValid('not-a-phone'));
        $this->assertFalse(BdPhone::isValid(''));
        $this->assertFalse(BdPhone::isValid(null));
    }

    public function test_validator_rule_integration(): void
    {
        $v1 = Validator::make(['phone' => '01712345678'], ['phone' => [new BdPhone]]);
        $this->assertTrue($v1->passes());

        $v2 = Validator::make(['phone' => '01012345678'], ['phone' => [new BdPhone]]);
        $this->assertTrue($v2->fails());

        $v3 = Validator::make(['phone' => '০১৭০১২৩৪৫৬৭'], ['phone' => [new BdPhone]]);
        $this->assertTrue($v3->passes());
    }
}
