/**
 * Calendar-date helpers for ISO dates (YYYY-MM-DD). Ranges are inclusive.
 * Everything works in UTC so time zones and daylight saving can't shift a day.
 */
import type { DateRange, IsoDate } from './types';

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

const toMs = (d: IsoDate) => Date.parse(`${d}T00:00:00Z`);
const fromMs = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d: IsoDate, n: number): IsoDate => fromMs(toMs(d) + n * DAY_MS);
export const daysBetween = (a: IsoDate, b: IsoDate) => Math.round((toMs(b) - toMs(a)) / DAY_MS);

export const yearRange = (year: number): DateRange => ({ start: `${year}-01-01`, end: `${year}-12-31` });

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function intersectRange(a: DateRange, b: DateRange): DateRange | null {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  return start <= end ? { start, end } : null;
}

export const containsDate = (r: DateRange, d: IsoDate) => r.start <= d && d <= r.end;

/** Parts of `range` not covered by any of `cuts`. */
export function subtractRanges(range: DateRange, cuts: DateRange[]): DateRange[] {
  let pieces: DateRange[] = [range];
  for (const cut of cuts) {
    const next: DateRange[] = [];
    for (const p of pieces) {
      if (!rangesOverlap(p, cut)) {
        next.push(p);
        continue;
      }
      if (p.start < cut.start) next.push({ start: p.start, end: addDays(cut.start, -1) });
      if (cut.end < p.end) next.push({ start: addDays(cut.end, 1), end: p.end });
    }
    pieces = next;
  }
  return pieces;
}

/** "28 Apr 2027" */
export function formatDate(d: IsoDate): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m! - 1]} ${y}`;
}

/** "28 Apr – 2 Jul 2027", or with both years when they differ. */
export function formatRange(r: DateRange): string {
  const [ys, ms, ds] = r.start.split('-').map(Number);
  const [ye, me, de] = r.end.split('-').map(Number);
  if (r.start === r.end) return formatDate(r.start);
  if (ys === ye) return `${ds} ${MONTHS[ms! - 1]} – ${de} ${MONTHS[me! - 1]} ${ye}`;
  return `${formatDate(r.start)} – ${formatDate(r.end)}`;
}
