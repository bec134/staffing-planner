/**
 * Allocating staff to roles (PLAN.md module 2).
 *
 * Rules: a teacher can only be allocated on days they work, a role can only
 * be held on days it runs, a person never holds two roles on the same day,
 * and a role day is held by one person (leave cover aside).
 */
import { describeDayIndices, dayIndices, intersect, subtract, union, type DayPattern } from './dayPattern';
import type { Allocation, Id, IsoDate, Role, Staff } from './types';

/** Date ranges overlap; a missing date means open-ended (whole year). */
export function datesOverlap(
  a: { startDate?: IsoDate; endDate?: IsoDate },
  b: { startDate?: IsoDate; endDate?: IsoDate },
): boolean {
  const aStart = a.startDate ?? '';
  const bStart = b.startDate ?? '';
  const aEnd = a.endDate ?? '9999-12-31';
  const bEnd = b.endDate ?? '9999-12-31';
  return aStart <= bEnd && bStart <= aEnd;
}

/** Ordinary allocations, i.e. not leave cover. */
const isSubstantive = (a: Allocation) => !a.coveringLeaveId;

/**
 * Days two of a person's allocations clash. Higher duties (Bec) is the one
 * exception: on those days the person is away from their substantive role
 * (it's backfilled), so it doesn't clash with their higher-duties one.
 */
export function clashDays(
  a: Pick<Allocation, 'days' | 'coveringLeaveId' | 'higherDutiesLeaveId'>,
  b: Pick<Allocation, 'days' | 'coveringLeaveId' | 'higherDutiesLeaveId'>,
): number[] {
  const plain = (x: typeof a) => !x.coveringLeaveId && !x.higherDutiesLeaveId;
  if ((a.higherDutiesLeaveId && plain(b)) || (b.higherDutiesLeaveId && plain(a))) return [];
  return dayIndices(intersect(a.days, b.days));
}

/** Days the staff member already holds through other allocations. */
export function staffBusyDays(staffId: Id, allocations: Allocation[], excludeId?: Id): DayPattern {
  return union(allocations.filter((a) => a.staffId === staffId && a.id !== excludeId).map((a) => a.days));
}

/** Role days already held by someone (leave cover excluded). */
export function roleFilledDays(roleId: Id, allocations: Allocation[], excludeId?: Id): DayPattern {
  return union(
    allocations.filter((a) => a.roleId === roleId && a.id !== excludeId && isSubstantive(a)).map((a) => a.days),
  );
}

/** Days this staff member could be given in this role. */
export function availableDays(
  staff: Staff,
  role: Role,
  allocations: Allocation[],
  excludeAllocationId?: Id,
): DayPattern {
  const both = intersect(staff.workPattern, role.days);
  const taken = union([
    staffBusyDays(staff.id, allocations, excludeAllocationId),
    roleFilledDays(role.id, allocations, excludeAllocationId),
  ]);
  return subtract(both, taken);
}

/** Reasons an allocation can't be saved; empty when valid. */
export function validateAllocation(
  candidate: Pick<Allocation, 'id' | 'staffId' | 'roleId' | 'days' | 'coveringLeaveId' | 'higherDutiesLeaveId'>,
  staff: Staff,
  role: Role,
  allocations: Allocation[],
): string[] {
  const errors: string[] = [];
  const { days } = candidate;
  if (dayIndices(days).length === 0) errors.push('Choose at least one day');

  const notWorking = subtract(days, staff.workPattern);
  if (dayIndices(notWorking).length) {
    errors.push(`${staff.name} doesn't work ${describeDayIndices(dayIndices(notWorking))}`);
  }
  const notRunning = subtract(days, role.days);
  if (dayIndices(notRunning).length) {
    errors.push(`${role.name} doesn't run on ${describeDayIndices(dayIndices(notRunning))}`);
  }
  const busy = [
    ...new Set(
      allocations
        .filter((a) => a.staffId === staff.id && a.id !== candidate.id)
        .flatMap((a) => clashDays(candidate, a)),
    ),
  ].sort((x, y) => x - y);
  if (busy.length) {
    errors.push(`${staff.name} already has another role on ${describeDayIndices(busy)}`);
  }
  const filled = intersect(days, roleFilledDays(role.id, allocations, candidate.id));
  if (dayIndices(filled).length) {
    errors.push(`${role.name} is already filled on ${describeDayIndices(dayIndices(filled))}`);
  }
  return errors;
}

/** Role days nobody holds yet. */
export function unfilledDays(role: Role, allocations: Allocation[]): DayPattern {
  return subtract(role.days, roleFilledDays(role.id, allocations));
}
