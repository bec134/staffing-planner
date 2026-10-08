/**
 * The role grid: roles × weekdays, with staff tiles (Bec, after Phase 5).
 *
 * Assigning someone to a role on a day (by drag and drop or by choosing a
 * name) adds that day to their allocation for the role, creating one if
 * needed, so their allocated days and FTE update. If the role's holder is on
 * leave that day, the assignment becomes cover for that leave instead, for
 * the leave's dates. Removing a tile takes that day out of the allocation.
 */
import { validateAllocation } from './allocation';
import {
  FORTNIGHT_DAYS,
  dayIndices,
  describeDayIndices,
  repeatsWeekly,
  subtract,
  union,
  type DayPattern,
} from './dayPattern';
import { containsDate } from './dates';
import { allocationRange, leaveRange, validateCover } from './leave';
import type { Allocation, DateRange, Id, IsoDate, Leave, Role, Staff } from './types';

export interface GridData {
  planningYearId: Id;
  /** The school year (Term 1 start to Term 4 end, or the calendar year). */
  year?: DateRange;
  staff: Staff[];
  roles: Role[];
  allocations: Allocation[];
  leave: Leave[];
}

/** A pattern holding exactly these fortnight-day indices. */
export function patternOf(indices: number[]): DayPattern {
  const days = Array<boolean>(FORTNIGHT_DAYS).fill(false);
  for (const i of indices) days[i] = true;
  return { mode: repeatsWeekly({ mode: 'weekly', days }) ? 'weekly' : 'fortnightly', days };
}

const withMode = (days: readonly boolean[]): DayPattern => ({
  mode: repeatsWeekly({ mode: 'weekly', days }) ? 'weekly' : 'fortnightly',
  days,
});

const hits = (p: DayPattern, indices: number[]) => indices.some((d) => p.days[d]);

export type TileKind = 'holder' | 'on-leave' | 'cover';

export interface Tile {
  kind: TileKind;
  allocation: Allocation;
  staffId: Id;
  /** For on-leave tiles: the leave; for cover tiles: the leave being covered. */
  leave?: Leave;
  /**
   * Whole-year view only: the leave is for part of the year, so the holder
   * is shown in colour with the leave dates rather than greyed out.
   */
  partYear?: boolean;
}

export interface CellView {
  runs: boolean;
  tiles: Tile[];
  /** Days in this cell with no holder at all. */
  empty: boolean;
}

/**
 * What to show in one role/day cell. With `asAt`, only allocations, leave and
 * cover that apply on that date; otherwise the whole year.
 */
export function cellView(role: Role, indices: number[], data: GridData, asAt?: IsoDate): CellView {
  const runs = hits(role.days, indices);
  const active = (a: Allocation) => !asAt || containsDate(allocationRange(a), asAt);
  const here = data.allocations.filter((a) => a.roleId === role.id && hits(a.days, indices) && active(a));
  const tiles: Tile[] = [];
  for (const a of here.filter((x) => !x.coveringLeaveId)) {
    const leave = data.leave.find(
      (l) =>
        l.staffId === a.staffId &&
        hits(l.daysAffected, indices) &&
        indices.some((d) => a.days.days[d] && l.daysAffected.days[d]) &&
        (!asAt || containsDate(leaveRange(l), asAt)),
    );
    const partYear =
      !!leave && !asAt && !!data.year && (leave.startDate > data.year.start || leave.endDate < data.year.end);
    tiles.push({ kind: leave ? 'on-leave' : 'holder', allocation: a, staffId: a.staffId, leave, partYear });
  }
  for (const a of here.filter((x) => x.coveringLeaveId)) {
    tiles.push({
      kind: 'cover',
      allocation: a,
      staffId: a.staffId,
      leave: data.leave.find((l) => l.id === a.coveringLeaveId),
    });
  }
  return { runs, tiles, empty: !tiles.some((t) => t.kind !== 'cover') };
}

export type AssignResult =
  | { ok: true; put: Allocation[]; message: string }
  | { ok: false; errors: string[]; /** Days the person would need to work for this to succeed. */ missingWorkDays?: DayPattern };

/**
 * Plan assigning `staffId` to `roleId` on fortnight days `indices`.
 * Pure: returns the allocations to save, or why it can't be done.
 */
export function planAssign(data: GridData, staffId: Id, roleId: Id, indices: number[], newId: () => Id): AssignResult {
  const staff = data.staff.find((s) => s.id === staffId);
  const role = data.roles.find((r) => r.id === roleId);
  if (!staff || !role) return { ok: false, errors: ['That staff member or role no longer exists'] };
  const wanted = patternOf(indices);

  const notRunning = dayIndices(subtract(wanted, role.days));
  if (notRunning.length) return { ok: false, errors: [`${role.name} doesn't run on ${describeDayIndices(notRunning)}`] };

  const missing = subtract(wanted, staff.workPattern);
  if (dayIndices(missing).length) {
    return {
      ok: false,
      errors: [`${staff.name} doesn't work ${describeDayIndices(dayIndices(missing))}`],
      missingWorkDays: missing,
    };
  }

  // Split the days into those left vacant by a holder's leave (→ cover) and
  // those with no holder (→ an ordinary allocation).
  const holders = data.allocations.filter((a) => a.roleId === role.id && !a.coveringLeaveId);
  const free: number[] = [];
  const coverByLeave = new Map<Id, { leave: Leave; days: number[] }>();
  // Days that can't be taken, grouped by who holds them.
  const blocked = new Map<Id, number[]>();
  for (const d of indices) {
    const holder = holders.find((a) => a.days.days[d]);
    if (!holder) {
      free.push(d);
      continue;
    }
    const leave =
      holder.staffId === staff.id
        ? undefined
        : data.leave.find((l) => l.staffId === holder.staffId && l.daysAffected.days[d]);
    if (!leave) {
      blocked.set(holder.staffId, [...(blocked.get(holder.staffId) ?? []), d]);
      continue;
    }
    const entry = coverByLeave.get(leave.id) ?? { leave, days: [] };
    entry.days.push(d);
    coverByLeave.set(leave.id, entry);
  }
  if (blocked.size) {
    return {
      ok: false,
      errors: [...blocked].map(([holderId, days]) =>
        holderId === staff.id
          ? `${staff.name} already holds ${role.name} on ${describeDayIndices(days)}`
          : `${role.name} is already held by ${data.staff.find((s) => s.id === holderId)?.name ?? 'someone else'} on ${describeDayIndices(days)}`,
      ),
    };
  }

  let allocations = data.allocations;
  const put: Allocation[] = [];
  const save = (a: Allocation) => {
    put.push(a);
    allocations = [...allocations.filter((x) => x.id !== a.id), a];
  };

  if (free.length) {
    const existing = allocations.find((a) => a.staffId === staff.id && a.roleId === role.id && !a.coveringLeaveId);
    const next: Allocation = existing
      ? { ...existing, days: withMode(union([existing.days, patternOf(free)]).days) }
      : { id: newId(), planningYearId: data.planningYearId, staffId: staff.id, roleId: role.id, days: patternOf(free) };
    const problems = validateAllocation(next, staff, role, allocations);
    if (problems.length) return { ok: false, errors: problems };
    save(next);
  }

  for (const { leave, days } of coverByLeave.values()) {
    const existing = allocations.find(
      (a) =>
        a.staffId === staff.id &&
        a.roleId === role.id &&
        a.coveringLeaveId === leave.id &&
        a.startDate === leave.startDate &&
        a.endDate === leave.endDate,
    );
    const next: Allocation = existing
      ? { ...existing, days: withMode(union([existing.days, patternOf(days)]).days) }
      : {
          id: newId(),
          planningYearId: data.planningYearId,
          staffId: staff.id,
          roleId: role.id,
          days: patternOf(days),
          startDate: leave.startDate,
          endDate: leave.endDate,
          coveringLeaveId: leave.id,
        };
    const problems = validateCover(
      { id: next.id, staffId: staff.id, roleId: role.id, days: next.days, startDate: leave.startDate, endDate: leave.endDate },
      leave,
      staff,
      role,
      allocations,
      data.leave,
    );
    if (problems.length) return { ok: false, errors: problems };
    save(next);
  }

  const what = coverByLeave.size && !free.length ? 'as cover' : coverByLeave.size ? 'and as cover' : '';
  return {
    ok: true,
    put,
    message: `${staff.name} → ${role.name} on ${describeDayIndices(indices)}${what ? ` ${what}` : ''}`,
  };
}

/** Take these days out of an allocation: the updated record, or a delete. */
export function planRemove(allocation: Allocation, indices: number[]): { put?: Allocation; deleteId?: Id } {
  const days = allocation.days.days.map((d, i) => d && !indices.includes(i));
  if (!days.some(Boolean)) return { deleteId: allocation.id };
  return { put: { ...allocation, days: withMode(days) } };
}

/** Apply a removal to a list of allocations (for planning a move). */
export function applyRemove(allocations: Allocation[], change: { put?: Allocation; deleteId?: Id }): Allocation[] {
  if (change.deleteId) return allocations.filter((a) => a.id !== change.deleteId);
  if (change.put) return allocations.map((a) => (a.id === change.put!.id ? change.put! : a));
  return allocations;
}

/** Staff who could be assigned to this role on these days (for the picker). */
export function candidatesFor(data: GridData, roleId: Id, indices: number[]): Staff[] {
  return data.staff.filter((s) => planAssign(data, s.id, roleId, indices, () => 'probe').ok);
}
