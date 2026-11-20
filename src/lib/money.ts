/**
 * Money is always an integer count of the currency's minor unit (pesewas for GHS).
 * No floating-point arithmetic touches an amount anywhere in this module.
 */

export const DEFAULT_CURRENCY = 'GHS';

const CURRENCY_RE = /^[A-Z]{3}$/;

export class MoneyError extends Error {}

function assertCurrency(currency: string): void {
  if (!CURRENCY_RE.test(currency)) throw new MoneyError(`Invalid currency code: ${currency}`);
}

function assertMinor(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor)) throw new MoneyError(`Amount must be a safe integer: ${amountMinor}`);
}

/** Number of minor-unit digits for a currency (GHS 2, JPY 0, KWD 3), per ICU. */
export function minorDigits(currency: string): number {
  assertCurrency(currency);
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/**
 * Parse user input like "1,234.5" into minor units (123450 for GHS).
 * Rejects more decimals than the currency allows rather than rounding silently.
 */
export function parseMoney(input: string, currency: string = DEFAULT_CURRENCY): number {
  const digits = minorDigits(currency);
  const cleaned = input.trim().replace(/,/g, '');
  const match = /^(-)?(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) throw new MoneyError(`Not a valid amount: "${input}"`);
  const [, sign, whole, frac = ''] = match;
  if (frac.length > digits) throw new MoneyError(`Too many decimal places for ${currency} (max ${digits})`);
  const minor = Number(`${whole}${frac.padEnd(digits, '0')}`);
  assertMinor(minor);
  return sign && minor !== 0 ? -minor : minor;
}

/** Exact decimal string for an amount, e.g. 123450 GHS → "1234.50". */
export function toDecimalString(amountMinor: number, currency: string = DEFAULT_CURRENCY): string {
  assertMinor(amountMinor);
  const digits = minorDigits(currency);
  const negative = amountMinor < 0;
  const abs = String(Math.abs(amountMinor)).padStart(digits + 1, '0');
  const whole = digits ? abs.slice(0, -digits) : abs;
  const frac = digits ? abs.slice(-digits) : '';
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** Locale-formatted display string. Intl receives an exact decimal string, not a float. */
export function formatMoney(amountMinor: number, currency: string = DEFAULT_CURRENCY, locale = 'en-GH'): string {
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
  // Intl.NumberFormat accepts decimal strings exactly (ES2023); the cast satisfies older lib typings.
  return formatter.format(toDecimalString(amountMinor, currency) as unknown as number);
}

/** Sum amounts in one currency, refusing to overflow the safe-integer range. */
export function sumMinor(amounts: readonly number[]): number {
  let total = 0;
  for (const a of amounts) {
    assertMinor(a);
    total += a;
    assertMinor(total);
  }
  return total;
}
