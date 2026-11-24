import { toEnglishNumerals } from './i18n';

export const BD_PHONE_REGEX = /^01[3-9]\d{8}$/;

/**
 * Clean and normalize any input string into canonical 11-digit Bangladeshi mobile format: 01XXXXXXXXX.
 * Supports both ASCII English digits (0-9) and native Bengali numerals (০-৯).
 */
export function normalizeBdPhone(input: string): string {
  if (!input) return '';

  // Transliterate Bengali numerals (০-৯) to English ASCII digits (0-9)
  const transliterated = toEnglishNumerals(input.trim());

  // Remove all non-digits except initial plus
  let cleaned = transliterated.replace(/[^\d+]/g, '');

  // Strip +880 or 880 prefix
  if (cleaned.startsWith('+880')) {
    cleaned = cleaned.substring(4);
  } else if (cleaned.startsWith('880')) {
    cleaned = cleaned.substring(3);
  }

  // Strip any remaining + signs
  cleaned = cleaned.replace(/^\+/, '');

  // If 10 digits starting with 1[3-9], prepend leading 0
  if (cleaned.length === 10 && /^[3-9]/.test(cleaned.substring(1))) {
    cleaned = '0' + cleaned;
  }

  return cleaned;
}

/**
 * Validate whether a phone number matches standard 11-digit BD mobile pattern.
 */
export function isValidBdPhone(phone: string): boolean {
  const normalized = normalizeBdPhone(phone);
  return BD_PHONE_REGEX.test(normalized);
}

/**
 * Format an 11-digit BD phone for display: 01712-345678.
 */
export function formatBdPhoneDisplay(phone: string): string {
  const normalized = normalizeBdPhone(phone);
  if (normalized.length === 11) {
    return `${normalized.slice(0, 5)}-${normalized.slice(5)}`;
  }
  return phone;
}
