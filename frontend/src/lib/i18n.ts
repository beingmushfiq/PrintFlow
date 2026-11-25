import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import bn from '../locales/bn.json';

export const defaultNS = 'common';
export const resources = {
  en,
  bn,
} as const;

export const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
export const ENGLISH_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Converts English digits to Bengali digits.
 */
export function toBengaliNumerals(input: number | string): string {
  const str = String(input);
  return str.replace(/[0-9]/g, (digit) => BANGLA_DIGITS[parseInt(digit, 10)]);
}

/**
 * Converts Bengali digits to English digits.
 */
export function toEnglishNumerals(input: string): string {
  let result = input;
  for (let i = 0; i < 10; i++) {
    result = result.replaceAll(BANGLA_DIGITS[i], ENGLISH_DIGITS[i]);
  }
  return result;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS,
    ns: ['common', 'auth', 'storefront', 'quote', 'payment', 'order_status', 'status', 'owner', 'landing', 'errors'],
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'printflow_locale',
    },
  });

export default i18n;
