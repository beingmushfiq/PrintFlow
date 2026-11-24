import { describe, it, expect } from 'vitest';
import { poishaToBdtString, bdtToPoisha, formatMoney } from '../lib/money';

describe('Frontend Money Utilities', () => {
  it('converts poisha to bdt string decimal', () => {
    expect(poishaToBdtString(1250)).toBe('12.50');
    expect(poishaToBdtString(5)).toBe('0.05');
    expect(poishaToBdtString(0)).toBe('0.00');
    expect(poishaToBdtString(100000)).toBe('1000.00');
  });

  it('converts bdt string/number to poisha integer', () => {
    expect(bdtToPoisha('12.50')).toBe(1250);
    expect(bdtToPoisha(12.50)).toBe(1250);
    expect(bdtToPoisha('0.05')).toBe(5);
    expect(bdtToPoisha('৳ 100.50')).toBe(10050);
  });

  it('handles sub-poisha rounding with half-up parity matching Money::fromBdt()', () => {
    // 0.005 -> 1 poisha, 0.004 -> 0 poisha
    expect(bdtToPoisha('0.005')).toBe(1);
    expect(bdtToPoisha(0.005)).toBe(1);
    expect(bdtToPoisha('0.004')).toBe(0);
    expect(bdtToPoisha(0.004)).toBe(0);

    // 12.505 -> 1251 poisha, 12.504 -> 1250 poisha
    expect(bdtToPoisha('12.505')).toBe(1251);
    expect(bdtToPoisha(12.505)).toBe(1251);
    expect(bdtToPoisha('12.504')).toBe(1250);
    expect(bdtToPoisha(12.504)).toBe(1250);

    // 99-carry to whole poisha (12.996 -> 1300 poisha)
    expect(bdtToPoisha('12.996')).toBe(1300);
    expect(bdtToPoisha(12.996)).toBe(1300);
  });

  it('formats money for English and Bengali locales', () => {
    expect(formatMoney(1250, 'en')).toBe('৳ 12.50');
    expect(formatMoney(1250, 'bn')).toBe('৳১২.৫০');
    expect(formatMoney(0, 'en')).toBe('৳ 0.00');
    expect(formatMoney(0, 'bn')).toBe('৳০.০০');
  });
});
