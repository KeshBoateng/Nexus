import { describe, expect, it } from 'vitest';
import { MoneyError, formatMoney, minorDigits, parseMoney, sumMinor, toDecimalString } from './money';

describe('minorDigits', () => {
  it('knows common currencies', () => {
    expect(minorDigits('GHS')).toBe(2);
    expect(minorDigits('USD')).toBe(2);
    expect(minorDigits('JPY')).toBe(0);
    expect(minorDigits('KWD')).toBe(3);
  });
  it('rejects malformed codes', () => {
    expect(() => minorDigits('ghs')).toThrow(MoneyError);
  });
});

describe('parseMoney', () => {
  it.each([
    ['0', 0],
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['1,234.56', 123456],
    ['  7.  ', 700],
    ['-3.10', -310],
    ['-0', 0],
  ])('parses %j as %i pesewas', (input, expected) => {
    expect(parseMoney(input, 'GHS')).toBe(expected);
  });

  it('avoids float error on classic cases', () => {
    // 0.1 + 0.2 style inputs stay exact
    expect(parseMoney('0.10') + parseMoney('0.20')).toBe(parseMoney('0.30'));
    expect(parseMoney('1.15')).toBe(115);
    expect(parseMoney('4.35')).toBe(435);
  });

  it('rejects excess precision instead of rounding', () => {
    expect(() => parseMoney('1.005', 'GHS')).toThrow(/decimal places/);
    expect(() => parseMoney('1.5', 'JPY')).toThrow(/decimal places/);
  });

  it.each(['', 'abc', '1.2.3', '1e5', '١٢', '--1', '+-1'])('rejects %j', (input) => {
    expect(() => parseMoney(input)).toThrow(MoneyError);
  });

  it('rejects amounts beyond the safe-integer range', () => {
    expect(() => parseMoney('999999999999999999')).toThrow(/safe integer/);
  });
});

describe('toDecimalString / formatMoney', () => {
  it('renders exact decimals', () => {
    expect(toDecimalString(5, 'GHS')).toBe('0.05');
    expect(toDecimalString(-123456, 'GHS')).toBe('-1234.56');
    expect(toDecimalString(1500, 'JPY')).toBe('1500');
    expect(toDecimalString(1, 'KWD')).toBe('0.001');
  });

  it('formats with the currency and grouping', () => {
    const out = formatMoney(123456, 'GHS');
    expect(out).toContain('1,234.56');
    expect(out).toMatch(/GH|₵/);
  });

  it('round-trips parse → format for large values without drift', () => {
    expect(formatMoney(parseMoney('90071992547409.91'), 'GHS')).toContain('90,071,992,547,409.91');
  });
});

describe('sumMinor', () => {
  it('sums exactly', () => {
    expect(sumMinor([10, 20, -5])).toBe(25);
  });
  it('rejects non-integers', () => {
    expect(() => sumMinor([1.5])).toThrow(MoneyError);
  });
  it('rejects overflow', () => {
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(MoneyError);
  });
});
