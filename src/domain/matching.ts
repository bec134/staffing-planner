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
import { dayIndices, describeDayIndices, FORTNIGHT_DAYS, repeatsWeekly, WEEKDAYS, subtract, union, type DayPattern } from './dayPattern';
import { yearRange } from './dates';
import { formatFte, milliFteOf, type MilliFte } from './fte';
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

export interface PositionDaysChange {
  matchPut: EntitlementMatch[];
  matchDelete: Id[];
  /** What happens to each person's matched days, for confirming first. */
  messages: string[];
}

const withMode = (days: boolean[]): DayPattern => {
  const p: DayPattern = { mode: 'weekly', days };
  return { mode: repeatsWeekly(p) ? 'weekly' : 'fortnightly', days };
};

/**
 * Changing the days a position runs (Bec: e.g. a 0.2 position from Monday
 * to Thursday). People matched on a day the position no longer runs move
 * with it to a newly added day, pairing removed and added days in order
 * (so Mon → Thu in both weeks). A day is only moved if the person works
 * it, isn't matched elsewhere then, and no one else holds the position
 * then; otherwise it's taken off their match, with a message saying why.
 * Backfills follow the leave they cover, so they aren't moved.
 */
export function planPositionDaysChange(
  position: EntitlementPosition,
  newDays: DayPattern,
  matches: EntitlementMatch[],
  staff: Staff[],
): PositionDaysChange {
  const removed = dayIndices(subtract(position.days, newDays));
  const added = dayIndices(subtract(newDays, position.days));
  const out: PositionDaysChange = { matchPut: [], matchDelete: [], messages: [] };
  if (!removed.length) return out;
  const target = new Map(removed.map((d, n) => [d, added[n]]));
  const name = (id: Id) => staff.find((s) => s.id === id)?.name ?? 'A deleted staff member';
  const here = matches.filter((m) => m.roleId === position.id);
  // Days of the position already taken, as moves are planned.
  const taken = new Set(here.filter((m) => !m.coveringLeaveId).flatMap((m) => dayIndices(m.days).filter((d) => !removed.includes(d))));

  for (const m of here) {
    const off = removed.filter((d) => m.days.days[d]);
    if (!off.length) continue;
    const days = [...m.days.days];
    const moved: number[] = [];
    // Days that can't move, grouped by reason so Week A and B read as one.
    type Reason = 'backfill' | 'none' | 'notWorking' | 'busy' | 'taken';
    const dropped = new Map<Reason, { days: number[]; to: number[] }>();
    const drop = (reason: Reason, day: number, to?: number) => {
      const entry = dropped.get(reason) ?? { days: [], to: [] };
      entry.days.push(day);
      if (to !== undefined) entry.to.push(to);
      dropped.set(reason, entry);
    };
    const person = staff.find((s) => s.id === m.staffId);
    const busy = union(matches.filter((x) => x.staffId === m.staffId && x.id !== m.id).map((x) => x.days));
    for (const d of off) {
      days[d] = false;
      const to = target.get(d);
      if (m.coveringLeaveId) drop('backfill', d);
      else if (to === undefined) drop('none', d);
      else if (!person?.workPattern.days[to]) drop('notWorking', d, to);
      else if (busy.days[to]) drop('busy', d, to);
      else if (taken.has(to)) drop('taken', d, to);
      else {
        days[to] = true;
        taken.add(to);
        moved.push(to);
      }
    }
    const droppedDays = [...dropped.values()].flatMap((x) => x.days);
    if (moved.length) {
      out.messages.push(
        `${name(m.staffId)} moves from ${describeDayIndices(off.filter((d) => !droppedDays.includes(d)))} to ${describeDayIndices(moved.sort((a, b) => a - b))}`,
      );
    }
    for (const [reason, { days: from, to }] of dropped) {
      const on = describeDayIndices(to.sort((a, b) => a - b));
      const why = {
        backfill: 'backfills stay with the leave they cover',
        none: 'the position has no new day to move to',
        notWorking: `they don't work ${on}`,
        busy: `they're matched elsewhere on ${on}`,
        taken: `someone else holds it on ${on}`,
      }[reason];
      out.messages.push(`${name(m.staffId)} is taken off ${describeDayIndices(from.sort((a, b) => a - b))}: ${why}`);
    }
    if (days.some(Boolean)) out.matchPut.push({ ...m, days: withMode(days) });
    else out.matchDelete.push(m.id);
  }
  return out;
}

/** Matches on days their position doesn't run (shouldn't happen, but older plans may have them). */
export function matchesOutsidePosition(positions: EntitlementPosition[], matches: EntitlementMatch[]) {
  const byId = new Map(positions.map((p) => [p.id, p]));
  return matches.flatMap((m) => {
    const position = byId.get(m.roleId);
    const off = position ? dayIndices(subtract(m.days, position.days)) : [];
    return position && off.length ? [{ match: m, position, days: off }] : [];
  });
}

export interface PositionSplit {
  /** The original position (now part 1's days) and the new positions. */
  positionPut: EntitlementPosition[];
  matchPut: EntitlementMatch[];
  matchDelete: Id[];
  messages: string[];
}

/**
 * Split a position into parts (Bec: e.g. a 1.0 position into 0.4 + 0.4 +
 * 0.2). Each part has its own days, which may overlap (two 0.4 parts both
 * on Wed–Thu), as long as the parts add up to the position's FTE. Part 1
 * stays as the original position; the others become new positions of the
 * same type, named after the type. Matched people follow their days: each
 * day goes to the first part that has it and is still free that day, and a
 * day no part has (or with no room left) comes off their match, with a
 * message. Returns an error message if the parts don't add up.
 */
export function planSplitPosition(
  position: EntitlementPosition,
  parts: DayPattern[],
  positions: EntitlementPosition[],
  matches: EntitlementMatch[],
  staff: Staff[],
  typeName: string,
  newId: () => Id,
): PositionSplit | string {
  if (parts.length < 2 || parts.some((p) => dayIndices(p).length === 0)) return 'Give each part at least one day';
  const total = parts.reduce((sum, p) => sum + milliFteOf(p), 0);
  const whole = milliFteOf(position.days);
  if (total !== whole) return `The parts add up to ${formatFte(total)} FTE, but ${position.name} is ${formatFte(whole)} FTE`;

  const sameType = positions.filter((p) => p.positionTypeId === position.positionTypeId);
  const taken = new Set(positions.map((p) => p.name.trim().toLowerCase()));
  let number = sameType.length;
  const nextName = () => {
    let candidate: string;
    do candidate = `${typeName} ${++number}`;
    while (taken.has(candidate.toLowerCase()));
    taken.add(candidate.toLowerCase());
    return candidate;
  };
  let order = Math.max(...positions.map((p) => p.sortOrder));
  const created = parts.slice(1).map((days) => ({
    ...position,
    id: newId(),
    name: nextName(),
    days: withMode([...days.days]),
    sortOrder: ++order,
  }));
  const targets = [position, ...created];
  const out: PositionSplit = {
    positionPut: [{ ...position, days: withMode([...parts[0]!.days]) }, ...created],
    matchPut: [],
    matchDelete: [],
    messages: [],
  };
  const name = (id: Id) => staff.find((s) => s.id === id)?.name ?? 'A deleted staff member';
  // Who already has each part's day: holders and backfills separately, as a
  // backfill shares a day with the holder on leave.
  const used = new Set<string>();
  const key = (part: number, day: number, backfill: boolean) => `${part}:${day}:${backfill}`;

  for (const m of matches.filter((x) => x.roleId === position.id)) {
    const backfill = !!m.coveringLeaveId;
    const perPart = parts.map(() => Array<boolean>(FORTNIGHT_DAYS).fill(false));
    const lost: number[] = [];
    for (const d of dayIndices(m.days)) {
      const part = parts.findIndex((p, i) => p.days[d] && !used.has(key(i, d, backfill)));
      if (part < 0) {
        lost.push(d);
        continue;
      }
      used.add(key(part, d, backfill));
      perPart[part]![d] = true;
    }
    perPart.forEach((days, i) => {
      if (i === 0) {
        if (!days.some(Boolean)) out.matchDelete.push(m.id);
        else if (days.some((d, n) => d !== m.days.days[n])) out.matchPut.push({ ...m, days: withMode(days) });
      } else if (days.some(Boolean)) {
        out.matchPut.push({ ...m, id: newId(), roleId: targets[i]!.id, days: withMode(days) });
        out.messages.push(`${name(m.staffId)}: ${describeDayIndices(dayIndices(withMode(days)))} moves to ${targets[i]!.name}`);
      }
    });
    if (lost.length) {
      out.messages.push(`${name(m.staffId)} is taken off ${describeDayIndices(lost)}: no part has room for them then`);
    }
  }
  return out;
}
