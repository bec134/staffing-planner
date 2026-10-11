/**
 * Leave and leave cover (PLAN.md module 3).
 *
 * The person on leave keeps their position (Bec): their allocations stay and
 * still count against entitlement. Cover is an Allocation with
 * `coveringLeaveId` set, for the same role, on some or all of the leave days,
 * for some or all of the leave dates. It isn't counted against entitlement.
 */
import { clashDays, datesOverlap } from './allocation';
import { containsDate, intersectRange, rangesOverlap, subtractRanges } from './dates';
import { dayIndices, describeDayIndices, intersect, subtract, union, type DayPattern } from './dayPattern';
import { freedBy, type Allocation, type DateRange, type Id, type IsoDate, type Leave, type Role, type Staff } from './types';

const WHOLE_YEAR: DateRange = { start: '0000-01-01', end: '9999-12-31' };

/** An allocation's dates; a missing date means open-ended. */
export const allocationRange = (a: Pick<Allocation, 'startDate' | 'endDate'>): DateRange => ({
  start: a.startDate ?? WHOLE_YEAR.start,
  end: a.endDate ?? WHOLE_YEAR.end,
});

export const leaveRange = (l: Leave): DateRange => ({ start: l.startDate, end: l.endDate });

export const coversFor = (leaveId: Id, allocations: Allocation[]) =>
  allocations.filter((a) => a.coveringLeaveId === leaveId);

/** A role, the days of it the person on leave would have worked, and when. */
export interface AffectedRole {
  allocation: Allocation;
  roleId: Id;
  days: DayPattern;
  range: DateRange;
}

/** The leave-taker's own (non-cover) allocations that the leave takes them away from. */
export function affectedRoles(leave: Leave, allocations: Allocation[]): AffectedRole[] {
  return allocations.flatMap((a) => {
    // Higher duties: the higher-duties role itself isn't left vacant.
    if (a.staffId !== leave.staffId || a.coveringLeaveId || freedBy(a) === leave.id) return [];
    const range = intersectRange(allocationRange(a), leaveRange(leave));
    const days = intersect(a.days, leave.daysAffected);
    return range && dayIndices(days).length ? [{ allocation: a, roleId: a.roleId, days, range }] : [];
  });
}

export interface CoverGap {
  leaveId: Id;
  roleId: Id;
  /** Fortnight-day indices with no cover over `range`. */
  days: number[];
  range: DateRange;
}

/** Role days and date ranges left uncovered by this leave. */
export function coverGaps(leave: Leave, allocations: Allocation[]): CoverGap[] {
  const covers = coversFor(leave.id, allocations);
  const gaps: CoverGap[] = [];
  for (const affected of affectedRoles(leave, allocations)) {
    // Group days with identical uncovered ranges into one gap.
    const byRanges = new Map<string, { days: number[]; ranges: DateRange[] }>();
    for (const d of dayIndices(affected.days)) {
      const cuts = covers
        .filter((c) => c.roleId === affected.roleId && c.days.days[d])
        .map((c) => allocationRange(c));
      const uncovered = subtractRanges(affected.range, cuts);
      if (!uncovered.length) continue;
      const key = JSON.stringify(uncovered);
      const entry = byRanges.get(key) ?? { days: [], ranges: uncovered };
      entry.days.push(d);
      byRanges.set(key, entry);
    }
    for (const { days, ranges } of byRanges.values()) {
      for (const range of ranges) gaps.push({ leaveId: leave.id, roleId: affected.roleId, days, range });
    }
  }
  return gaps;
}

/** Leave active on a date. */
export const onLeaveAt = (leave: Leave, date: IsoDate) => containsDate(leaveRange(leave), date);

export interface CoverCandidate {
  id?: Id;
  staffId: Id;
  roleId: Id;
  days: DayPattern;
  startDate: IsoDate;
  endDate: IsoDate;
  /** Cover given while on higher duties (see higherDuties.ts). */
  higherDutiesLeaveId?: Id;
  /** Cover given as a second job on the coverer's own leave days (see secondJob.ts). */
  secondJobLeaveId?: Id;
}

/** Days the coverer could take in this role over these dates. */
export function availableCoverDays(
  leave: Leave,
  coverer: Staff,
  roleId: Id,
  range: DateRange,
  allocations: Allocation[],
  leaves: Leave[],
  excludeId?: Id,
): DayPattern {
  const needed = union(
    affectedRoles(leave, allocations)
      .filter((a) => a.roleId === roleId && rangesOverlap(a.range, range))
      .map((a) => a.days),
  );
  const others = allocations.filter((a) => a.id !== excludeId && datesOverlap(a, { startDate: range.start, endDate: range.end }));
  const covererBusy = union(others.filter((a) => a.staffId === coverer.id).map((a) => a.days));
  const covererOnLeave = union(
    leaves.filter((l) => l.staffId === coverer.id && rangesOverlap(leaveRange(l), range)).map((l) => l.daysAffected),
  );
  const alreadyCovered = union(
    others.filter((a) => a.coveringLeaveId === leave.id && a.roleId === roleId).map((a) => a.days),
  );
  return subtract(intersect(needed, coverer.workPattern), union([covererBusy, covererOnLeave, alreadyCovered]));
}

/** Reasons a cover allocation can't be saved; empty when valid. */
export function validateCover(
  candidate: CoverCandidate,
  leave: Leave,
  coverer: Staff,
  role: Role,
  allocations: Allocation[],
  leaves: Leave[],
): string[] {
  const errors: string[] = [];
  const range = { start: candidate.startDate, end: candidate.endDate };
  if (coverer.id === leave.staffId) errors.push("Someone can't cover their own leave");
  if (!(range.start <= range.end)) {
    errors.push('The end date must be on or after the start date');
    return errors;
  }
  if (range.start < leave.startDate || range.end > leave.endDate) errors.push('Cover must fall within the leave dates');
  if (dayIndices(candidate.days).length === 0) errors.push('Choose at least one day');

  const needed = union(
    affectedRoles(leave, allocations)
      .filter((a) => a.roleId === role.id)
      .map((a) => a.days),
  );
  const notNeeded = dayIndices(subtract(candidate.days, needed));
  if (notNeeded.length) errors.push(`${role.name} isn't left vacant by this leave on ${describeDayIndices(notNeeded)}`);

  const notWorking = dayIndices(subtract(candidate.days, coverer.workPattern));
  if (notWorking.length) errors.push(`${coverer.name} doesn't work ${describeDayIndices(notWorking)}`);

  const others = allocations.filter(
    (a) => a.id !== candidate.id && datesOverlap(a, { startDate: range.start, endDate: range.end }),
  );
  const busy = [
    ...new Set(others.filter((a) => a.staffId === coverer.id).flatMap((a) => clashDays({ ...candidate, coveringLeaveId: leave.id }, a))),
  ].sort((x, y) => x - y);
  if (busy.length) errors.push(`${coverer.name} already has a role on ${describeDayIndices(busy)} during these dates`);

  const ownLeave = leaves.filter(
    (l) => l.staffId === coverer.id && l.id !== candidate.higherDutiesLeaveId && l.id !== candidate.secondJobLeaveId && rangesOverlap(leaveRange(l), range),
  );
  const away = dayIndices(intersect(candidate.days, union(ownLeave.map((l) => l.daysAffected))));
  if (away.length) errors.push(`${coverer.name} is on leave on ${describeDayIndices(away)} during these dates`);

  const covered = dayIndices(
    intersect(
      candidate.days,
      union(others.filter((a) => a.coveringLeaveId === leave.id && a.roleId === role.id).map((a) => a.days)),
    ),
  );
  if (covered.length) errors.push(`${role.name} is already covered on ${describeDayIndices(covered)} during these dates`);
  return errors;
}

/** Reasons a leave record can't be saved; empty when valid. */
export function validateLeave(leave: Pick<Leave, 'startDate' | 'endDate' | 'daysAffected'>, staff: Staff): string[] {
  const errors: string[] = [];
  if (!leave.startDate || !leave.endDate) errors.push('Enter start and end dates');
  else if (leave.endDate < leave.startDate) errors.push('The end date must be on or after the start date');
  if (dayIndices(leave.daysAffected).length === 0) errors.push('Choose at least one day of leave');
  const off = dayIndices(subtract(leave.daysAffected, staff.workPattern));
  if (off.length) errors.push(`${staff.name} doesn't work ${describeDayIndices(off)}`);
  return errors;
}

const isWholeYear = (l: Leave, year: DateRange) => l.startDate <= year.start && l.endDate >= year.end;

/**
 * Part 1: per position, the days this leave leaves vacant and those not
 * yet backfilled (a backfill is a match in that position covering the leave).
 */
export function part1Gaps(leave: Leave, matches: Allocation[]): { positionId: Id; days: number[]; open: number[] }[] {
  const own = matches.filter((m) => m.staffId === leave.staffId && !m.coveringLeaveId && !freedBy(m));
  return [...new Set(own.map((m) => m.roleId))].flatMap((positionId) => {
    const days = dayIndices(intersect(union(own.filter((m) => m.roleId === positionId).map((m) => m.days)), leave.daysAffected));
    if (!days.length) return [];
    const backfills = union(matches.filter((m) => m.coveringLeaveId === leave.id && m.roleId === positionId).map((m) => m.days));
    return [{ positionId, days, open: days.filter((d) => !backfills.days[d]) }];
  });
}

/** Part 1: the days this leave leaves vacant in their positions, and those backfilled. */
export function part1Backfill(leave: Leave, matches: Allocation[]): { days: number[]; backfilled: number[] } {
  const gaps = part1Gaps(leave, matches);
  const days = [...new Set(gaps.flatMap((g) => g.days))].sort((a, b) => a - b);
  const open = new Set(gaps.flatMap((g) => g.open));
  return { days, backfilled: days.filter((d) => !open.has(d)) };
}

/** Whole-year leave is covered in Part 1; other leave in Part 2 (Bec). */
export const coveredInPart1 = (leave: Leave, year?: DateRange) => !!year && isWholeYear(leave, year);

export type CoverStatus = 'covered' | 'partial' | 'uncovered' | 'nothing';

/**
 * Whether this leave is covered (Bec).
 * - Whole-year leave is covered in Part 1: the person's position days on
 *   leave are backfilled (`part1Backfill`). In Part 2 they're simply not
 *   available on those days, and whoever is placed in the class then is fine.
 * - Other leave is covered in Part 2: cover for the roles they hold then.
 */
export function coverStatus(leave: Leave, allocations: Allocation[], matches: Allocation[], year?: DateRange): CoverStatus {
  if (coveredInPart1(leave, year)) {
    const p1 = part1Backfill(leave, matches);
    if (!p1.days.length) return 'nothing';
    return p1.backfilled.length === p1.days.length ? 'covered' : p1.backfilled.length ? 'partial' : 'uncovered';
  }
  if (!affectedRoles(leave, allocations).length) return 'nothing';
  if (coverGaps(leave, allocations).length === 0) return 'covered';
  return allocations.some((a) => a.coveringLeaveId === leave.id) ? 'partial' : 'uncovered';
}

export const COVER_STATUS_LABELS: Record<CoverStatus, string> = {
  covered: 'Fully covered',
  partial: 'Partly covered',
  uncovered: 'No cover',
  nothing: 'No roles affected',
};
