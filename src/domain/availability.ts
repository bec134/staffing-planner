/**
 * Part 2 availability (Bec): the days someone actually works next year,
 * after their Part 1 matching. Whole-year leave days are off (e.g. LWOP
 * Wed–Fri leaves Mon–Tue), except days they work elsewhere as a second job
 * (e.g. an AP on LWOP all year, matched on Wed as a temporary teacher).
 * Higher duties isn't time off: those days are worked in the executive role.
 */
import { subtract, union, type DayPattern } from './dayPattern';
import { freedBy, type Allocation, type DateRange, type EntitlementMatch, type Leave, type Staff } from './types';

const isWholeYear = (l: Leave, year: DateRange) => l.startDate <= year.start && l.endDate >= year.end;

export interface Availability {
  /** Days they work next year. */
  working: DayPattern;
  /** Working days not yet placed in a role. */
  free: DayPattern;
}

export function part2Availability(
  staff: Staff,
  allocations: Allocation[],
  leave: Leave[],
  matches: EntitlementMatch[],
  year: DateRange,
): Availability {
  const own = leave.filter((l) => l.staffId === staff.id && isWholeYear(l, year));
  const away = union(own.filter((l) => l.leaveType !== 'higher_duties').map((l) => l.daysAffected));
  const secondJobs = union(matches.filter((m) => m.staffId === staff.id && m.secondJobLeaveId).map((m) => m.days));
  const working = union([subtract(staff.workPattern, away), secondJobs]);
  // Placed days: a role they're on leave from isn't somewhere they work, but
  // a second job or higher duties is.
  const placed = union(
    allocations
      .filter((a) => a.staffId === staff.id)
      .map((a) => {
        const applying = own.filter((l) => l.id !== freedBy(a));
        return subtract(a.days, union(applying.map((l) => l.daysAffected)));
      }),
  );
  return { working, free: subtract(working, placed) };
}
