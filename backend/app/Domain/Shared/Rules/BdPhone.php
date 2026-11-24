<?php

declare(strict_types=1);

namespace App\Domain\Shared\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class BdPhone implements ValidationRule
{
    /**
     * Normalize a Bangladeshi phone number into standard 11-digit format: 01XXXXXXXXX.
     */
    public static function normalize(?string $phone): string
    {
        if ($phone === null) {
            return '';
        }

        // Transliterate native Bengali numerals (০-৯) to English ASCII digits (0-9)
        $bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        $en = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        $transliterated = str_replace($bn, $en, trim($phone));

        // Remove all non-digit characters except leading plus
        $clean = preg_replace('/[^\d+]/', '', $transliterated);

        // Strip +880 or 880 prefix
        if (str_starts_with($clean, '+880')) {
            $clean = substr($clean, 4);
        } elseif (str_starts_with($clean, '880')) {
            $clean = substr($clean, 3);
        }

        // Strip any remaining + signs
        $clean = ltrim($clean, '+');

        // If 10 digits starting with 1[3-9], prepend 0
        if (strlen($clean) === 10 && preg_match('/^[3-9]/', substr($clean, 1))) {
            $clean = '0'.$clean;
        }

        return $clean;
    }

    /**
     * Check if a phone string matches BD mobile regex /^01[3-9]\d{8}$/.
     */
    public static function isValid(?string $phone): bool
    {
        $normalized = self::normalize($phone);

        return (bool) preg_match('/^01[3-9]\d{8}$/', $normalized);
    }

    /**
     * Run the validation rule.
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $normalized = self::normalize(is_string($value) ? $value : '');

        if (! preg_match('/^01[3-9]\d{8}$/', $normalized)) {
            $fail("The {$attribute} must be a valid 11-digit Bangladeshi mobile number (e.g., 01712345678).");
        }
    }
}
