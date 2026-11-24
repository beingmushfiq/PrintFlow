import { toBengaliNumerals } from './i18n';

/**
 * Convert integer minor units (Poisha) to standard decimal BDT string (e.g. 1250 -> "12.50").
 */
export function poishaToBdtString(poisha: number): string {
  const whole = Math.floor(poisha / 100);
  const fraction = Math.abs(poisha % 100);
  return `${whole}.${fraction.toString().padStart(2, '0')}`;
}

/**
 * Convert BDT decimal string or number to integer Poisha minor units.
 * Applies half-up rounding on sub-poisha decimals for exact parity with
 * backend Money::fromBdt() and Math.round(bdt * 100).
 */
export function bdtToPoisha(bdt: string | number): number {
  if (typeof bdt === 'number') {
    return Math.round(bdt * 100);
  }

  const cleaned = bdt.replace(/[৳,\s]/g, '').trim();
  if (!cleaned) return 0;

  const isNegative = cleaned.startsWith('-');
  const unsigned = isNegative ? cleaned.slice(1) : cleaned;

  const [whole = '0', fraction = ''] = unsigned.split('.');
  const wholePart = parseInt(whole, 10) || 0;

  let fractionPart = 0;
  if (fraction.length === 0) {
    fractionPart = 0;
  } else if (fraction.length === 1) {
    fractionPart = parseInt(fraction, 10) * 10;
  } else if (fraction.length === 2) {
    fractionPart = parseInt(fraction, 10);
  } else {
    // Sub-poisha rounding: round half-up based on the 3rd decimal digit
    const twoDigits = parseInt(fraction.slice(0, 2), 10);
    const thirdDigit = parseInt(fraction[2], 10);
    fractionPart = thirdDigit >= 5 ? twoDigits + 1 : twoDigits;
  }

  const total = wholePart * 100 + fractionPart;
  return isNegative ? -total : total;
}

/**
 * Format money in BDT with Bengali or English numerals.
 */
export function formatMoney(poisha: number, locale: 'bn' | 'en' = 'bn'): string {
  const bdtString = poishaToBdtString(poisha);

  if (locale === 'bn') {
    return `৳${toBengaliNumerals(bdtString)}`;
  }

  return `৳ ${bdtString}`;
}
