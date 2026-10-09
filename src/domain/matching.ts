/**
 * Part 1 (Bec): matching staff against the entitlement, by day.
 *
 * Each entitlement line becomes positions (e.g. Classroom Teacher 6.0 → six
 * Mon–Fri positions; RFF 1.316 → one Mon–Fri position and one of 3 fortnight
 * days). Staff are matched to positions on the days they work, permanent
 * first, then TWT, then temporary. Whole-year leave greys out the matched
 * days and opens them for a backfill, which doesn't use extra entitlement.
 * Permanent or TWT staff left unmatched are candidates for a nominated
 * transfer.
 *
 * Part 2 (placing staff in classes and roles) is checked against Part 1 only
 * by each person's total FTE, so someone matched to RFF can still be placed
 * on a class.
 */
import { dayIndices, FORTNIGHT_DAYS, WEEKDAYS, subtract, union, type DayPattern } from './dayPattern';
import { yearRange } from './dates';
import { milliFteOf, type MilliFte } from './fte';
import type {
  Allocation,
  DateRange,
  EmploymentType,
  Entitlement,
  EntitlementMatch,
  EntitlementPosition,
  Id,
  Leave,
  PlanningYear,
  PositionType,
  Staff,
} from './types';

/** The school year: Term 1 start to Term 4 end, or the calendar year. */
export function schoolYear(planningYear: PlanningYear): DateRange {
  const terms = (planningYear.terms ?? []).filter((t): t is DateRange => !!t);
  return terms.length ? { start: terms[0]!.start, end: terms[terms.length - 1]!.end } : yearRange(planningYear.year);
}

/** Leave that covers the whole school year (Bec: only this greys out in Part 1). */
export const isWholeYearLeave = (leave: Leave, year: DateRange) =>
  leave.startDate <= year.start && leave.endDate >= year.end;

/**
 * Pattern for a number of fortnight days, filling from Monday: even counts
 * repeat weekly (4 → Mon, Tue); odd counts put the extra day in Week A.
 */
export function patternForFortnightDays(count: number): DayPattern {
  const days = Array<boolean>(FORTNIGHT_DAYS).fill(false);
  const weekA = Math.ceil(count / 2);
  const weekB = Math.floor(count / 2);
  for (let i = 0; i < Math.min(weekA, WEEKDAYS.length); i++) days[i] = true;
  for (let i = 0; i < Math.min(weekB, WEEKDAYS.length); i++) days[i + WEEKDAYS.length] = true;
  return { mode: weekA === weekB ? 'weekly' : 'fortnightly', days };
}

/**
 * Positions for each entitlement line that doesn't have enough yet. Existing
 * positions are kept (they may have matches and edited days); only missing
 * ones are added. Anything under one fortnight day (e.g. 0.016) can't be a
 * position and is left as a remainder.
 */
export function positionsToCreate(
  entitlement: Entitlement | undefined,
  positionTypes: PositionType[],
  existing: EntitlementPosition[],
  planningYearId: Id,
  newId: () => Id,
): EntitlementPosition[] {
  const created: EntitlementPosition[] = [];
  let order = Math.max(-1, ...existing.map((p) => p.sortOrder)) + 1;
  for (const pt of [...positionTypes].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const milli = entitlement?.lines.find((l) => l.positionTypeId === pt.id)?.milliFte ?? 0;
    if (milli <= 0) continue;
    const wanted: DayPattern[] = [];
    for (let i = 0; i < Math.floor(milli / 1000); i++) wanted.push(patternForFortnightDays(FORTNIGHT_DAYS));
    const partDays = Math.floor((milli % 1000) / 100);
    if (partDays > 0) wanted.push(patternForFortnightDays(partDays));
    const have = existing.filter((p) => p.positionTypeId === pt.id).length;
    wanted.slice(have).forEach((days, i) =>
      created.push({
        id: newId(),
        planningYearId,
        name: `${pt.name} ${have + i + 1}`,
        positionTypeId: pt.id,
        days,
        sortOrder: order++,
      }),
    );
  }
  return created;
}

export interface MatchStatus {
  staff: Staff;
  /** Days worked, as FTE. */
  workMilli: MilliFte;
  /** Days matched (own positions and backfills), as FTE. */
  matchedMilli: MilliFte;
  /** Days worked but not matched to any position. */
  unmatched: DayPattern;
}

export function matchStatus(staff: Staff, matches: EntitlementMatch[]): MatchStatus {
  const mine = matches.filter((m) => m.staffId === staff.id);
  const matchedDays = union(mine.map((m) => m.days));
  return {
    staff,
    workMilli: milliFteOf(staff.workPattern),
    matchedMilli: milliFteOf(matchedDays),
    unmatched: subtract(staff.workPattern, matchedDays),
  };
}

/** Matching order (Bec): permanent, then TWT, then temporary. */
export const MATCH_ORDER: EmploymentType[] = ['permanent', 'twt', 'temporary'];

/**
 * FTE a person has been placed in Part 2 for the whole year: their
 * full-year allocations plus cover for whole-year leave. Part-year cover
 * (e.g. one term) isn't part of the entitlement, so it isn't counted.
 */
export function wholeYearPlacedMilli(
  staffId: Id,
  allocations: Allocation[],
  leave: Leave[],
  year: DateRange,
): MilliFte {
  const wholeYearLeave = new Set(leave.filter((l) => isWholeYearLeave(l, year)).map((l) => l.id));
  const counted = allocations.filter(
    (a) =>
      a.staffId === staffId &&
      (a.coveringLeaveId ? wholeYearLeave.has(a.coveringLeaveId) : !a.startDate && !a.endDate),
  );
  return milliFteOf(union(counted.map((a) => a.days)));
}

/** Staff offered for placement in Part 2: matched in Part 1 and not nominated for transfer. */
export const isMatched = (staff: Staff, matches: EntitlementMatch[]) =>
  !staff.nominatedForTransfer && matches.some((m) => m.staffId === staff.id);

export const unmatchedDayCount = (s: MatchStatus) => dayIndices(s.unmatched).length;
