import { describe, it, expect } from 'vitest';
import i18n, { toBengaliNumerals, toEnglishNumerals } from '../lib/i18n';
import en from '../locales/en.json';
import bn from '../locales/bn.json';

describe('Dual-Language Localization Framework', () => {
  const requiredNamespaces = [
    'common',
    'auth',
    'storefront',
    'quote',
    'payment',
    'order_status',
    'status',
    'owner',
    'landing',
    'errors',
  ] as const;

  it('contains all required namespaces in English locale', () => {
    requiredNamespaces.forEach((ns) => {
      expect(en).toHaveProperty(ns);
      expect(Object.keys(en[ns]).length).toBeGreaterThan(0);
    });
  });

  it('contains all required namespaces in Bengali locale', () => {
    requiredNamespaces.forEach((ns) => {
      expect(bn).toHaveProperty(ns);
      expect(Object.keys(bn[ns]).length).toBeGreaterThan(0);
    });
  });

  it('has matching top-level keys across en and bn namespaces', () => {
    requiredNamespaces.forEach((ns) => {
      const enKeys = Object.keys(en[ns]).sort();
      const bnKeys = Object.keys(bn[ns]).sort();
      expect(bnKeys).toEqual(enKeys);
    });
  });

  it('converts English numerals to Bengali accurately', () => {
    expect(toBengaliNumerals('1234567890')).toBe('১২৩৪৫৬৭৮৯০');
    expect(toBengaliNumerals('12.50')).toBe('১২.৫০');
    expect(toBengaliNumerals(42)).toBe('৪২');
  });

  it('converts Bengali numerals to English accurately', () => {
    expect(toEnglishNumerals('১২৩৪৫৬৭৮৯০')).toBe('1234567890');
    expect(toEnglishNumerals('১২.৫০')).toBe('12.50');
  });

  it('initializes i18n with active resources and changes language', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('common:continue')).toBe('Continue');

    await i18n.changeLanguage('bn');
    expect(i18n.t('common:continue')).toBe('চালিয়ে যান');
  });
});
