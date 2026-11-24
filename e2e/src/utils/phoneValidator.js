/**
 * PrintFlow Bangladeshi Mobile Phone Validator & Normalizer
 *
 * Implements Locked Architectural Decision #3:
 * Mandatory 11-digit Bangladeshi mobile number validated against /^01[3-9]\d{8}$/
 */

export const BD_PHONE_REGEX = /^01[3-9]\d{8}$/;

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const ENGLISH_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function toEnglishDigits(str) {
  let res = String(str);
  for (let i = 0; i < 10; i++) {
    res = res.replaceAll(BANGLA_DIGITS[i], ENGLISH_DIGITS[i]);
  }
  return res;
}

/**
 * Valid operator prefixes in Bangladesh
 */
export const OPERATOR_PREFIXES = {
  GP: ['013', '017'],       // Grameenphone
  ROBI: ['016', '018'],     // Robi & Airtel
  BL: ['014', '019'],       // Banglalink
  TELETALK: ['015'],        // Teletalk
};

/**
 * Validates whether a given phone number is a strictly valid 11-digit BD mobile number.
 * Supports both English ASCII digits and native Bengali numerals.
 * @param {string|number} phone
 * @returns {boolean}
 */
export function isValidBdPhone(phone) {
  if (typeof phone !== 'string' && typeof phone !== 'number') {
    return false;
  }
  const cleanPhone = toEnglishDigits(String(phone).trim());
  return BD_PHONE_REGEX.test(cleanPhone);
}

/**
 * Normalizes input string by removing country code (+88, 88), spaces, dashes,
 * and punctuation, returning an 11-digit string if valid or null if invalid.
 * Supports both English ASCII digits and native Bengali numerals.
 * @param {string|number} phone
 * @returns {string|null}
 */
export function normalizeBdPhone(phone) {
  if (!phone) return null;
  const transliterated = toEnglishDigits(String(phone));
  let cleaned = transliterated.replace(/[\s\-\(\)\.]+/g, '').trim();

  // Strip leading international code (+880 or 880)
  if (cleaned.startsWith('+880')) {
    cleaned = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('880')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('+88')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('88') && cleaned.length === 13) {
    cleaned = cleaned.slice(2);
  }

  if (isValidBdPhone(cleaned)) {
    return cleaned;
  }
  return null;
}

/**
 * Detects the mobile network operator for an 11-digit BD phone number.
 * @param {string|number} phone
 * @returns {string} Operator name ('Grameenphone', 'Robi/Airtel', 'Banglalink', 'Teletalk', or 'Unknown')
 */
export function getBdPhoneOperator(phone) {
  const normalized = normalizeBdPhone(phone);
  if (!normalized) return 'Unknown';

  const prefix = normalized.slice(0, 3);
  if (OPERATOR_PREFIXES.GP.includes(prefix)) return 'Grameenphone';
  if (OPERATOR_PREFIXES.ROBI.includes(prefix)) return 'Robi/Airtel';
  if (OPERATOR_PREFIXES.BL.includes(prefix)) return 'Banglalink';
  if (OPERATOR_PREFIXES.TELETALK.includes(prefix)) return 'Teletalk';

  return 'Unknown';
}
