/**
 * Higher duties (Bec): someone relieving in a higher executive role for the
 * whole year, e.g. a 0.6 teacher (Mon–Wed) acting as Assistant Principal -
 * Curriculum & Instruction on Wednesdays.
 *
 * They stay matched to their substantive position on all their days, so it
 * still counts against the entitlement. On the higher-duties days they're
 * also matched to the executive position (a match with
 * `higherDutiesLeaveId`), and a whole-year "higher duties" leave record
 * frees those days in the substantive position for a backfill, exactly
 * like other whole-year leave. People can only step up: a teacher into any
 * executive role, an Assistant Principal into Deputy Principal or
 * Principal, a Deputy into Principal.
 */
import { dayIndices, describeDayIndices, intersect, repeatsWeekly, subtract, union, type DayPattern } from './dayPattern';
import type { Allocation, DateRange, EntitlementMatch, EntitlementPosition, Id, Leave, PositionType, Staff } from './types';

/** Rank of an executive role by name: Principal 4, Deputy 3, Assistant Principals 2. */
function executiveRank(name: string): number {
  const n = name.trim().toLowerCase();
  if (n === 'principal') return 4;
  if (n.startsWith('deputy') || n === 'dp') return 3;
  return 2;
}

/** How senior a position type is: higher-duties moves must go up. */
export function seniority(type: PositionType | undefined): number {
  if (!type || type.category !== 'executive') return 1;
  return executiveRank(type.name);
}

/** How senior someone's most senior substantive role is; undefined when none is recorded. */
export function substantiveRank(staff: Pick<Staff, 'currentRole' | 'otherRoles'>): number | undefined {
  const ranks = [staff.currentRole, ...(staff.otherRoles ?? [])].map(roleRank).filter((r): r is number => r !== undefined);
  return ranks.length ? Math.max(...ranks) : undefined;
}

function roleRank(role: string): number | undefined {
  const n = role.trim().toLowerCase();
  if (!n) return undefined;
  if (n === 'principal' || n.startsWith('deputy') || n === 'dp' || n.startsWith('assistant principal') || /^ap\b/.test(n)) {
    return executiveRank(n);
  }
  return 1;
}

/**
 * Whether someone in this position (or role) is acting above their
 * substantive role (Bec: e.g. a temporary teacher matched to an unfilled AP
 * position), so their tile says "higher duties".
 */
export function actsUp(staff: Pick<Staff, 'currentRole' | 'otherRoles'> | undefined, type: PositionType | undefined): boolean {
  const rank = staff && substantiveRank(staff);
  return rank !== undefined && seniority(type) > rank;
}

/** Short name of an executive role: "Principal", "DP", "AP" or "AP C&I". */
function executiveShort(role: string): string | undefined {
  const n = role.trim().toLowerCase();
  if (roleRank(role) === undefined || roleRank(role)! < 2) return undefined;
  if (n === 'principal') return 'Principal';
  if (n.startsWith('deputy') || n === 'dp') return 'DP';
  if (n.includes('curriculum') || n.includes('c&i')) return 'AP C&I';
  return 'AP';
}

/**
 * Bec: an executive teaching a class (e.g. a teaching AP) shows their
 * executive role on the tile. Their most senior executive substantive
 * role, when they're in a non-executive position or role; otherwise undefined.
 */
export function teachingExecutive(
  staff: Pick<Staff, 'currentRole' | 'otherRoles'> | undefined,
  type: PositionType | undefined,
): string | undefined {
  if (!staff || type?.category === 'executive') return undefined;
  const roles = [staff.currentRole, ...(staff.otherRoles ?? [])].filter((r) => executiveShort(r));
  if (!roles.length) return undefined;
  const top = roles.reduce((a, b) => (roleRank(b)! > roleRank(a)! ? b : a));
  return executiveShort(top);
}

export const isHigherDuties = (l: Leave) => l.leaveType === 'higher_duties';

const withMode = (days: readonly boolean[]): DayPattern => {
  const p: DayPattern = { mode: 'weekly', days };
  return { mode: repeatsWeekly(p) ? 'weekly' : 'fortnightly', days };
};
const patternOf = (indices: number[]) => withMode(Array.from({ length: 10 }, (_, i) => indices.includes(i)));
const isWholeYear = (l: Leave, year: DateRange) => l.startDate <= year.start && l.endDate >= year.end;
const sameDays = (a: DayPattern, b: DayPattern) => a.days.every((d, i) => d === b.days[i]);

export interface HigherDutiesInput {
  planningYearId: Id;
  year: DateRange;
  staff: Staff[];
  positions: EntitlementPosition[];
  positionTypes: PositionType[];
  matches: EntitlementMatch[];
  leave: Leave[];
}

export type HigherDutiesPlan =
  | { ok: true; message: string; matchPut: EntitlementMatch[]; leavePut: Leave[] }
  | { ok: false; error: string };

/**
 * Plan putting someone on higher duties in an executive position on these
 * days, when they're already matched elsewhere then. Returns undefined when
 * higher duties doesn't apply (not an executive position, or they're free
 * on those days anyway).
 */
export function planHigherDuties(
  input: HigherDutiesInput,
  staffId: Id,
  positionId: Id,
  indices: number[],
  newId: () => Id,
): HigherDutiesPlan | undefined {
  const person = input.staff.find((s) => s.id === staffId);
  const target = input.positions.find((p) => p.id === positionId);
  const typeById = new Map(input.positionTypes.map((t) => [t.id, t]));
  if (!person || !target) return undefined;
  const targetRank = seniority(typeById.get(target.positionTypeId));
  if (targetRank < 2) return undefined;
  const days = patternOf(indices);
  const dayText = describeDayIndices(indices);

  // Where they're matched on these days now (their own positions, not backfills or other higher duties).
  const substantive = input.matches.filter(
    (m) => m.staffId === staffId && !m.coveringLeaveId && !m.higherDutiesLeaveId && m.roleId !== positionId && indices.some((d) => m.days.days[d]),
  );
  if (!substantive.length) return undefined;
  const covered = union(substantive.map((m) => m.days));
  const notMatched = dayIndices(subtract(days, covered));
  if (notMatched.length) {
    return { ok: false, error: `${person.name} isn't matched to a position on ${describeDayIndices(notMatched)}, so there's nothing to step up from` };
  }
  const fromPositions = substantive.map((m) => input.positions.find((p) => p.id === m.roleId));
  const higher = fromPositions.filter((p) => seniority(p && typeById.get(p.positionTypeId)) >= targetRank);
  if (higher.length) {
    return { ok: false, error: `${person.name} can only step up into a more senior role than ${higher.map((p) => p?.name).join(', ')}` };
  }
  const notRunning = dayIndices(subtract(days, target.days));
  if (notRunning.length) return { ok: false, error: `${target.name} doesn't run on ${describeDayIndices(notRunning)}` };
  // Each day is either free, or held by someone on whole-year leave (Bec:
  // the AP is on leave, so the person on higher duties backfills them).
  const nameOf = (id: Id) => input.staff.find((s) => s.id === id)?.name ?? 'someone else';
  const free: number[] = [];
  const backfill = new Map<Id, { leave: Leave; days: number[] }>();
  const takenBy = new Map<Id, number[]>();
  for (const d of indices) {
    const holder = input.matches.find((m) => m.roleId === positionId && m.staffId !== staffId && !m.coveringLeaveId && m.days.days[d]);
    if (!holder) {
      free.push(d);
      continue;
    }
    const away = input.leave.find(
      (l) => l.staffId === holder.staffId && l.id !== holder.higherDutiesLeaveId && isWholeYear(l, input.year) && l.daysAffected.days[d],
    );
    if (!away) return { ok: false, error: `${target.name} is already held by ${nameOf(holder.staffId)} on ${dayText}` };
    const taken = input.matches.find((m) => m.roleId === positionId && m.coveringLeaveId === away.id && m.staffId !== staffId && m.days.days[d]);
    if (taken) {
      takenBy.set(taken.staffId, [...(takenBy.get(taken.staffId) ?? []), d]);
      continue;
    }
    const entry = backfill.get(away.id) ?? { leave: away, days: [] };
    entry.days.push(d);
    backfill.set(away.id, entry);
  }

  const existingLeave = input.leave.find((l) => isHigherDuties(l) && l.staffId === staffId && l.higherDutiesPositionId === positionId);
  const leave: Leave = existingLeave
    ? { ...existingLeave, daysAffected: withMode(union([existingLeave.daysAffected, days]).days) }
    : {
        id: newId(),
        planningYearId: input.planningYearId,
        staffId,
        startDate: input.year.start,
        endDate: input.year.end,
        daysAffected: days,
        leaveType: 'higher_duties',
        higherDutiesPositionId: positionId,
      };
  if (takenBy.size) {
    const [who, dayList] = [...takenBy][0]!;
    return { ok: false, error: `${target.name} is already backfilled by ${nameOf(who)} on ${describeDayIndices(dayList)}` };
  }

  // One match for the free days, and one backfill per leave they cover.
  const matchPut: EntitlementMatch[] = [];
  const addMatch = (dayList: number[], covering?: Leave) => {
    if (!dayList.length) return;
    const existing = input.matches.find(
      (m) => m.staffId === staffId && m.higherDutiesLeaveId === leave.id && m.coveringLeaveId === covering?.id,
    );
    matchPut.push(
      existing
        ? { ...existing, days: withMode(union([existing.days, patternOf(dayList)]).days) }
        : {
            id: newId(),
            planningYearId: input.planningYearId,
            staffId,
            roleId: positionId,
            days: patternOf(dayList),
            higherDutiesLeaveId: leave.id,
            ...(covering ? { coveringLeaveId: covering.id, startDate: covering.startDate, endDate: covering.endDate } : {}),
          },
    );
  };
  addMatch(free);
  for (const { leave: away, days: dayList } of backfill.values()) addMatch(dayList, away);
  const backfilling = [...backfill.values()].map(({ leave: away }) => nameOf(away.staffId));
  const from = [...new Set(fromPositions.map((p) => p?.name ?? 'their position'))].join(' and ');
  return {
    ok: true,
    leavePut: [leave],
    matchPut,
    message: `${person.name} is matched to ${from} on ${dayText}. Put them on higher duties as ${target.name} on ${dayText} for the whole year${backfilling.length ? `, backfilling ${backfilling.join(' and ')}'s leave` : ''}? Their ${dayText} in ${from} will open up for a backfill.`,
  };
}

export interface HigherDutiesTidy {
  leavePut: Leave[];
  leaveDelete: Id[];
  matchPut: EntitlementMatch[];
  matchDelete: Id[];
  allocationPut: Allocation[];
  allocationDelete: Id[];
}

/**
 * Keep higher duties consistent after matches change: each higher-duties
 * leave covers exactly the days of its higher-duties match. When the match
 * shrinks the leave shrinks (with backfills and cover trimmed); when it's
 * removed the leave goes too, with its backfills and cover. A higher-duties
 * match whose leave was deleted is removed.
 */
export function tidyHigherDuties(matches: EntitlementMatch[], leave: Leave[], allocations: Allocation[]): HigherDutiesTidy {
  const out: HigherDutiesTidy = { leavePut: [], leaveDelete: [], matchPut: [], matchDelete: [], allocationPut: [], allocationDelete: [] };
  const trim = <T extends Allocation>(list: T[], leaveId: Id, days: DayPattern | undefined, put: T[], del: Id[]) => {
    for (const c of list.filter((x) => x.coveringLeaveId === leaveId)) {
      const left = days ? intersect(c.days, days) : undefined;
      if (!left || !dayIndices(left).length) del.push(c.id);
      else if (!sameDays(left, c.days)) put.push({ ...c, days: withMode(left.days) });
    }
  };
  for (const l of leave.filter(isHigherDuties)) {
    const own = matches.filter((m) => m.higherDutiesLeaveId === l.id);
    if (!own.length) {
      out.leaveDelete.push(l.id);
      trim(matches, l.id, undefined, out.matchPut, out.matchDelete);
      trim(allocations, l.id, undefined, out.allocationPut, out.allocationDelete);
      continue;
    }
    const days = withMode(union(own.map((m) => m.days)).days);
    if (!sameDays(days, l.daysAffected)) {
      out.leavePut.push({ ...l, daysAffected: days });
      trim(matches, l.id, days, out.matchPut, out.matchDelete);
      trim(allocations, l.id, days, out.allocationPut, out.allocationDelete);
    }
  }
  const leaveIds = new Set(leave.map((l) => l.id));
  for (const m of matches) if (m.higherDutiesLeaveId && !leaveIds.has(m.higherDutiesLeaveId)) out.matchDelete.push(m.id);
  // Part 2 higher-duties placements stay within the higher-duties days.
  const gone = new Set(out.leaveDelete);
  const daysOf = new Map(leave.filter(isHigherDuties).map((l) => [l.id, l.daysAffected]));
  for (const l of out.leavePut) daysOf.set(l.id, l.daysAffected);
  for (const a of allocations.filter((x) => x.higherDutiesLeaveId)) {
    const days = gone.has(a.higherDutiesLeaveId!) ? undefined : daysOf.get(a.higherDutiesLeaveId!);
    const left = days ? intersect(a.days, days) : undefined;
    if (!left || !dayIndices(left).length) out.allocationDelete.push(a.id);
    else if (!sameDays(left, a.days)) out.allocationPut.push({ ...a, days: withMode(left.days) });
  }
  // Second jobs stay within the leave days that free them (and go with the leave).
  const leaveDays = new Map(leave.map((l) => [l.id, l.daysAffected]));
  const keep = <T extends Allocation>(list: T[], put: T[], del: Id[]) => {
    for (const a of list.filter((x) => x.secondJobLeaveId && !del.includes(x.id))) {
      const days = leaveDays.get(a.secondJobLeaveId!);
      const left = days ? intersect(a.days, days) : undefined;
      if (!left || !dayIndices(left).length) del.push(a.id);
      else if (!sameDays(left, a.days)) put.push({ ...a, days: withMode(left.days) });
    }
  };
  keep(matches, out.matchPut, out.matchDelete);
  keep(allocations, out.allocationPut, out.allocationDelete);
  return out;
}

/** Days someone is away on higher duties (free for executive roles in Part 2). */
export const higherDutiesDays = (staffId: Id, leave: Leave[]) =>
  union(leave.filter((l) => isHigherDuties(l) && l.staffId === staffId).map((l) => l.daysAffected));
