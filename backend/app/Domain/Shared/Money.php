<?php

declare(strict_types=1);

namespace App\Domain\Shared;

use InvalidArgumentException;

final class Money
{
    private const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

    private const ENGLISH_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    /**
     * Internal integer minor unit (Poisha).
     * 1 BDT = 100 Poisha.
     */
    private readonly int $poisha;

    private readonly string $currency;

    /**
     * @param  int  $poisha  Unsigned 64-bit integer representing minor currency units.
     * @param  string  $currency  ISO 4217 currency code.
     */
    public function __construct(int $poisha, string $currency = 'BDT')
    {
        if ($poisha < 0) {
            throw new InvalidArgumentException('Money poisha cannot be negative.');
        }

        $this->poisha = $poisha;
        $this->currency = strtoupper(trim($currency));
    }

    /**
     * Instantiate from integer Poisha minor units.
     */
    public static function fromPoisha(int $poisha, string $currency = 'BDT'): self
    {
        return new self($poisha, $currency);
    }

    /**
     * Instantiate from BDT decimal (string or float) without floating-point inaccuracy.
     */
    public static function fromBdt(string|float|int $bdt, string $currency = 'BDT'): self
    {
        if (is_numeric($bdt) && (float) $bdt < 0) {
            throw new InvalidArgumentException('Money amount cannot be negative.');
        }

        // Clean string from currency symbols, whitespace, and commas
        $cleaned = trim((string) $bdt);
        $cleaned = str_replace(['৳', 'BDT', 'bdt', ',', ' '], '', $cleaned);

        if (! is_numeric($cleaned)) {
            throw new InvalidArgumentException(sprintf('Invalid monetary representation: "%s"', (string) $bdt));
        }

        if (str_contains($cleaned, '-')) {
            throw new InvalidArgumentException('Money amount cannot be negative.');
        }

        // Split whole and fractional parts for exact integer arithmetic
        $parts = explode('.', $cleaned, 2);
        $wholePart = $parts[0] !== '' ? (int) $parts[0] : 0;
        $fractionString = $parts[1] ?? '';

        if (strlen($fractionString) === 0) {
            $poisha = $wholePart * 100;
        } elseif (strlen($fractionString) === 1) {
            $poisha = ($wholePart * 100) + ((int) $fractionString * 10);
        } elseif (strlen($fractionString) === 2) {
            $poisha = ($wholePart * 100) + (int) $fractionString;
        } else {
            // More than 2 decimal digits: round half up to nearest poisha
            $twoDigits = (int) substr($fractionString, 0, 2);
            $thirdDigit = (int) $fractionString[2];
            if ($thirdDigit >= 5) {
                $twoDigits += 1;
            }
            $poisha = ($wholePart * 100) + $twoDigits;
        }

        return new self($poisha, $currency);
    }

    /**
     * Get the poisha minor units.
     */
    public function getPoisha(): int
    {
        return $this->poisha;
    }

    /**
     * Get the ISO currency code.
     */
    public function getCurrency(): string
    {
        return $this->currency;
    }

    /**
     * Returns decimal string representation, e.g. "12.50".
     */
    public function toBdtString(): string
    {
        $whole = intdiv($this->poisha, 100);
        $fraction = $this->poisha % 100;

        return sprintf('%d.%02d', $whole, $fraction);
    }

    /**
     * Format currency display based on locale.
     * E.g. Bengali numerals "৳১২.৫০" for 'bn', or English "৳ 12.50" for 'en'.
     *
     * @param  string  $locale  'bn' or 'en'
     */
    public function format(string $locale = 'bn'): string
    {
        $bdtString = $this->toBdtString();

        if (strtolower($locale) === 'bn' || str_starts_with(strtolower($locale), 'bn')) {
            $bengaliNumber = str_replace(self::ENGLISH_DIGITS, self::BANGLA_DIGITS, $bdtString);

            return '৳'.$bengaliNumber;
        }

        return '৳ '.$bdtString;
    }

    /**
     * Add another Money instance.
     */
    public function add(self $other): self
    {
        $this->assertSameCurrency($other);

        return new self($this->poisha + $other->getPoisha(), $this->currency);
    }

    /**
     * Subtract another Money instance.
     */
    public function subtract(self $other): self
    {
        $this->assertSameCurrency($other);

        if ($this->poisha < $other->getPoisha()) {
            throw new InvalidArgumentException('Money subtraction would result in negative poisha.');
        }

        return new self($this->poisha - $other->getPoisha(), $this->currency);
    }

    /**
     * Multiply money by a factor.
     */
    public function multiply(int|float $multiplier, RoundingMode $roundingMode = RoundingMode::HALF_UP): self
    {
        if ($multiplier < 0) {
            throw new InvalidArgumentException('Multiplier cannot be negative.');
        }

        if ($this->poisha === 0 || $multiplier == 0) {
            return new self(0, $this->currency);
        }

        $rawResult = $this->poisha * $multiplier;

        $roundedPoisha = match ($roundingMode) {
            RoundingMode::HALF_UP => (int) round($rawResult, 0, PHP_ROUND_HALF_UP),
            RoundingMode::HALF_DOWN => (int) round($rawResult, 0, PHP_ROUND_HALF_DOWN),
            RoundingMode::HALF_EVEN => (int) round($rawResult, 0, PHP_ROUND_HALF_EVEN),
            RoundingMode::UP => (int) ceil($rawResult),
            RoundingMode::DOWN => (int) floor($rawResult),
        };

        return new self($roundedPoisha, $this->currency);
    }

    /**
     * Integer allocation with remainder handling preventing lost poisha.
     *
     * @param  array<int|string, int|float>  $ratios
     * @return array<int|string, self>
     */
    public function allocate(array $ratios): array
    {
        if (empty($ratios)) {
            throw new InvalidArgumentException('Cannot allocate to empty ratios.');
        }

        $totalRatio = 0.0;
        foreach ($ratios as $ratio) {
            if ($ratio < 0) {
                throw new InvalidArgumentException('Allocation ratio cannot be negative.');
            }
            $totalRatio += (float) $ratio;
        }

        if ($totalRatio <= 0.0) {
            throw new InvalidArgumentException('Total ratio must be greater than zero.');
        }

        $results = [];
        $remainder = $this->poisha;
        $fractions = [];

        foreach ($ratios as $key => $ratio) {
            $share = ($this->poisha * (float) $ratio) / $totalRatio;
            $intShare = (int) floor($share);
            $results[$key] = $intShare;
            $remainder -= $intShare;
            $fractions[$key] = $share - $intShare;
        }

        // Distribute remainder poisha one by one to buckets with highest fractional remainder
        arsort($fractions);
        foreach (array_keys($fractions) as $key) {
            if ($remainder <= 0) {
                break;
            }
            $results[$key] += 1;
            $remainder -= 1;
        }

        $moneyResults = [];
        foreach ($results as $key => $allocatedPoisha) {
            $moneyResults[$key] = new self($allocatedPoisha, $this->currency);
        }

        return $moneyResults;
    }

    /**
     * Check equality with another Money instance.
     */
    public function equals(self $other): bool
    {
        return $this->poisha === $other->getPoisha() && $this->currency === $other->getCurrency();
    }

    /**
     * Check if amount is zero.
     */
    public function isZero(): bool
    {
        return $this->poisha === 0;
    }

    /**
     * Check if greater than another Money instance.
     */
    public function greaterThan(self $other): bool
    {
        $this->assertSameCurrency($other);

        return $this->poisha > $other->getPoisha();
    }

    /**
     * Check if less than another Money instance.
     */
    public function lessThan(self $other): bool
    {
        $this->assertSameCurrency($other);

        return $this->poisha < $other->getPoisha();
    }

    private function assertSameCurrency(self $other): void
    {
        if ($this->currency !== $other->getCurrency()) {
            throw new InvalidArgumentException(
                sprintf('Currency mismatch: "%s" vs "%s".', $this->currency, $other->getCurrency())
            );
        }
    }
}
