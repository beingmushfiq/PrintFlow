import { describe, it, expect } from 'vitest';
import { normalizeBdPhone, isValidBdPhone, formatBdPhoneDisplay } from '../lib/phone';

describe('BD Phone Utility', () => {
  it('normalizes various input formats into 11 digits', () => {
    expect(normalizeBdPhone('01712345678')).toBe('01712345678');
    expect(normalizeBdPhone('+8801712345678')).toBe('01712345678');
    expect(normalizeBdPhone('8801712345678')).toBe('01712345678');
    expect(normalizeBdPhone('+880 1712-345678')).toBe('01712345678');
    expect(normalizeBdPhone('01811-223344')).toBe('01811223344');
    expect(normalizeBdPhone('(01912) 345 678')).toBe('01912345678');
    expect(normalizeBdPhone('1712345678')).toBe('01712345678'); // prepends 0
  });

  it('validates legitimate Bangladeshi mobile operators', () => {
    // 013, 014, 015, 016, 017, 018, 019
    expect(isValidBdPhone('01712345678')).toBe(true);
    expect(isValidBdPhone('01812345678')).toBe(true);
    expect(isValidBdPhone('01912345678')).toBe(true);
    expect(isValidBdPhone('01301234567')).toBe(true);
    expect(isValidBdPhone('01401234567')).toBe(true);
    expect(isValidBdPhone('01512345678')).toBe(true);
    expect(isValidBdPhone('01612345678')).toBe(true);
  });

  it('rejects invalid or non-BD numbers', () => {
    expect(isValidBdPhone('01012345678')).toBe(false); // invalid operator 010
    expect(isValidBdPhone('01112345678')).toBe(false); // invalid operator 011
    expect(isValidBdPhone('01212345678')).toBe(false); // invalid operator 012
    expect(isValidBdPhone('017123456')).toBe(false);   // too short
    expect(isValidBdPhone('017123456789')).toBe(false); // too long
    expect(isValidBdPhone('not-a-number')).toBe(false);
    expect(isValidBdPhone('')).toBe(false);
  });

  it('formats 11-digit phone for human readable display', () => {
    expect(formatBdPhoneDisplay('01712345678')).toBe('01712-345678');
    expect(formatBdPhoneDisplay('01899887766')).toBe('01899-887766');
  });

  it('supports native Bengali numerals in phone intake and validation', () => {
    // Pure Bengali numerals
    expect(normalizeBdPhone('০১৭০১২৩৪৫৬৭')).toBe('01701234567');
    expect(isValidBdPhone('০১৭০১২৩৪৫৬৭')).toBe(true);

    // Bengali numerals with country code prefix
    expect(normalizeBdPhone('+৮৮০১৭০১২৩৪৫৬৭')).toBe('01701234567');
    expect(isValidBdPhone('+৮৮০১৭০১২৩৪৫৬৭')).toBe(true);
    expect(normalizeBdPhone('৮৮০১৭০১২৩৪৫৬৭')).toBe('01701234567');
    expect(isValidBdPhone('৮৮০১৭০১২৩৪৫৬৭')).toBe(true);

    // Mixed Bengali and ASCII digits with punctuation
    expect(normalizeBdPhone('017০১-২৩৪৫৬৭')).toBe('01701234567');
    expect(isValidBdPhone('017০১-২৩৪৫৬৭')).toBe(true);

    // All operators in Bengali numerals
    expect(isValidBdPhone('০১৩০১-২৩৪৫৬৭')).toBe(true);
    expect(isValidBdPhone('০১৪০১-২৩৪৫৬৭')).toBe(true);
    expect(isValidBdPhone('০১৫০১-২৩৪৫৬৭')).toBe(true);
    expect(isValidBdPhone('০১৬০১-২৩৪৫৬৭')).toBe(true);
    expect(isValidBdPhone('০১৮০১-২৩৪৫৬৭')).toBe(true);
    expect(isValidBdPhone('০১৯০১-২৩৪৫৬৭')).toBe(true);

    // Invalid operator with Bengali numerals
    expect(isValidBdPhone('০১০১২৩৪৫৬৭৮')).toBe(false);
  });
});
