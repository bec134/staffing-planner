/**
 * Entitlement FTE is entered exactly as the department supplies it (up to
 * three decimals, e.g. 2.316). To keep sums exact it is stored as whole
 * thousandths of an FTE ("milli-FTE"): 1.0 FTE = 1000.
 *
 * Staff and role FTE still come from whole days (see dayPattern.ts);
 * `milliFteFromDays` converts those so the two can be compared.
 */
import { countDays, type DayPattern } from './dayPattern';

export type MilliFte = number;

export const MILLI_PER_FTE = 1000;
const MILLI_PER_FORTNIGHT_DAY = MILLI_PER_FTE / 10;

export type FteParseResult = { ok: true; value: MilliFte } | { ok: false; error: string };

/** Parse user input such as "2.316", "0.5" or "" (blank = 0). */
export function parseFte(input: string): FteParseResult {
  const text = input.trim();
  if (text === '') return { ok: true, value: 0 };
  const match = /^(\d+)(?:\.(\d{0,3}))?$/.exec(text) ?? /^()\.(\d{1,3})$/.exec(text);
  if (!match) {
    if (/^\d*\.\d{4,}$/.test(text)) return { ok: false, error: 'Use at most 3 decimal places' };
    return { ok: false, error: 'Enter a number such as 1.0 or 2.316' };
  }
  const whole = Number(match[1] || '0');
  const frac = Number((match[2] ?? '').padEnd(3, '0'));
  return { ok: true, value: whole * MILLI_PER_FTE + frac };
}

/** Format milli-FTE with 1–3 decimals, e.g. 2316 → "2.316", 1000 → "1.0", -16 → "-0.016". */
export function formatFte(value: MilliFte): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(Math.round(value));
  const whole = Math.floor(abs / MILLI_PER_FTE);
  const frac = String(abs % MILLI_PER_FTE).padStart(3, '0').replace(/0+$/, '');
  return `${sign}${whole}.${frac || '0'}`;
}

export function milliFteFromDays(fortnightDays: number): MilliFte {
  return Math.round(fortnightDays) * MILLI_PER_FORTNIGHT_DAY;
}

export function milliFteOf(pattern: DayPattern): MilliFte {
  return milliFteFromDays(countDays(pattern));
}
