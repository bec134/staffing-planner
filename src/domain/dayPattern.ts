/**
 * Work/role day patterns (see PLAN.md "FTE rule").
 *
 * Everything is stored as 10 fortnight days: indices 0–4 are Week A Mon–Fri,
 * 5–9 are Week B Mon–Fri. A weekly pattern is simply Week A repeated in
 * Week B. FTE is always derived from days (1 fortnight day = 0.1 FTE), never
 * entered separately. Whole days only.
 */

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export const FORTNIGHT_DAYS = 10;

export type PatternMode = 'weekly' | 'fortnightly';

/** Ten booleans, one per fortnight day. */
export type FortnightDays = readonly boolean[];

export interface DayPattern {
  mode: PatternMode;
  days: FortnightDays;
}

function assertWeek(week: readonly boolean[]): void {
  if (week.length !== WEEKDAYS.length) {
    throw new Error(`A week must have ${WEEKDAYS.length} days, got ${week.length}`);
  }
}

/** Weekly pattern: the same weekdays every week. */
export function weeklyPattern(week: readonly boolean[]): DayPattern {
  assertWeek(week);
  return { mode: 'weekly', days: [...week, ...week] };
}

/** Fortnightly pattern: Week A and Week B may differ. */
export function fortnightlyPattern(weekA: readonly boolean[], weekB: readonly boolean[]): DayPattern {
  assertWeek(weekA);
  assertWeek(weekB);
  return { mode: 'fortnightly', days: [...weekA, ...weekB] };
}

/** Weekly pattern from weekday names, e.g. weekdays('Mon', 'Tue'). */
export function weekdays(...names: (typeof WEEKDAYS)[number][]): DayPattern {
  return weeklyPattern(WEEKDAYS.map((d) => names.includes(d)));
}

export const FULL_TIME: DayPattern = weeklyPattern([true, true, true, true, true]);
export const NO_DAYS: DayPattern = weeklyPattern([false, false, false, false, false]);

/** Checks shape and that a weekly pattern really repeats. */
export function isValidPattern(p: DayPattern): boolean {
  if (p.days.length !== FORTNIGHT_DAYS) return false;
  if (p.mode === 'weekly') {
    for (let i = 0; i < WEEKDAYS.length; i++) {
      if (p.days[i] !== p.days[i + WEEKDAYS.length]) return false;
    }
  }
  return true;
}

export function countDays(p: DayPattern): number {
  return p.days.filter(Boolean).length;
}

/** FTE derived from days, rounded to one decimal to avoid float noise. */
export function fteFromDays(fortnightDays: number): number {
  return Math.round(fortnightDays) / FORTNIGHT_DAYS;
}

export function fteOf(p: DayPattern): number {
  return fteFromDays(countDays(p));
}

/** True if both patterns share at least one fortnight day. */
export function overlaps(a: DayPattern, b: DayPattern): boolean {
  return a.days.some((d, i) => d && b.days[i] === true);
}

/** True if every day in `inner` is also a day in `outer`. */
export function isWithin(inner: DayPattern, outer: DayPattern): boolean {
  return inner.days.every((d, i) => !d || outer.days[i] === true);
}

/** Fortnight-day indices that are set, e.g. [0, 1, 5, 6]. */
export function dayIndices(p: DayPattern): number[] {
  return p.days.flatMap((d, i) => (d ? [i] : []));
}

/** Human-readable label, e.g. "Mon, Tue" or "A: Mon, Tue · B: Mon". */
export function describePattern(p: DayPattern): string {
  const names = (week: readonly boolean[]) =>
    WEEKDAYS.filter((_, i) => week[i]).join(', ') || 'none';
  const weekA = p.days.slice(0, WEEKDAYS.length);
  if (p.mode === 'weekly') return names(weekA);
  return `A: ${names(weekA)} · B: ${names(p.days.slice(WEEKDAYS.length))}`;
}
