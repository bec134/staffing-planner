/**
 * Automatic flags (PLAN.md "Automatic flags"). Recomputed whenever data
 * changes and shown in the warnings panel, each linking to its record.
 *
 * Part 1 (matching to entitlement): over/under entitlement, permanent or
 * TPT staff left unmatched, and temporary staff matched ahead of them.
 * Part 2 (placement): staff over their FTE, unfilled roles, leave gaps, and
 * placements that don't add up to what each person was matched for.
 */
import { datesOverlap, unfilledDays } from './allocation';
import { formatRange } from './dates';
import { dayIndices, describeDayIndices, intersect, subtract } from './dayPattern';
import { summariseEntitlement, UNDER_ENTITLEMENT_TOLERANCE } from './entitlement';
import { formatFte } from './fte';
import { coverGaps } from './leave';
import { MATCH_ORDER, matchStatus, schoolYear, unmatchedDayCount, wholeYearPlacedMilli } from './matching';
import {
  EMPLOYMENT_TYPE_LABELS,
  LEAVE_TYPE_LABELS,
  type Allocation,
  type DateRange,
  type Entitlement,
  type EntitlementMatch,
  type EntitlementPosition,
  type Id,
  type Leave,
  type PlanningYear,
  type PositionType,
  type Role,
  type Staff,
} from './types';

export type FlagKind =
  | 'over_entitlement'
  | 'under_entitlement'
  | 'staff_not_working'
  | 'staff_double_booked'
  | 'outside_role_days'
  | 'role_unfilled'
  | 'leave_gap'
  | 'unmatched_staff'
  | 'temporary_before_permanent'
  | 'placement_mismatch';

export interface Flag {
  /** Stable key, so the panel can render lists without duplicates. */
  key: string;
  kind: FlagKind;
  message: string;
  /** In-app link to the record causing the flag. */
  link: string;
}

export interface FlagInput {
  entitlement: Entitlement | undefined;
  positionTypes: PositionType[];
  roles: Role[];
  staff: Staff[];
  allocations: Allocation[];
  leave: Leave[];
  /** Part 1. */
  positions: EntitlementPosition[];
  matches: EntitlementMatch[];
  /** The school year, to tell whole-year leave and placements apart. */
  year?: DateRange;
}

/** Everything the flags need, from a plan snapshot. */
export const flagInputFrom = (d: {
  entitlements: Entitlement[];
  positionTypes: PositionType[];
  roles: Role[];
  staff: Staff[];
  allocations: Allocation[];
  leave: Leave[];
  positions: EntitlementPosition[];
  matches: EntitlementMatch[];
  planningYear: PlanningYear;
}): FlagInput => ({
  entitlement: d.entitlements[0],
  positionTypes: d.positionTypes,
  roles: d.roles,
  staff: d.staff,
  allocations: d.allocations,
  leave: d.leave,
  positions: d.positions,
  matches: d.matches,
  year: schoolYear(d.planningYear),
});

export const staffLink = (id: Id) => `/allocation/staff/${id}`;
export const roleLink = (id: Id) => `/allocation/roles/${id}`;
export const leaveLink = (id: Id) => `/leave/${id}`;
export const MATCHING_LINK = '/matching';

function entitlementFlags(input: FlagInput): Flag[] {
  // Part 1 matching is what counts against the entitlement (Bec).
  const summary = summariseEntitlement(input.entitlement, input.positionTypes, input.positions, input.matches);
  const flags: Flag[] = [];
  const check = (key: string, label: string, entitled: number, allocated: number, remaining: number) => {
    if (remaining < 0) {
      flags.push({
        key: `over:${key}`,
        kind: 'over_entitlement',
        message: `${label}: allocated ${formatFte(allocated)} FTE, ${formatFte(-remaining)} over the entitlement of ${formatFte(entitled)}`,
        link: '/entitlement',
      });
    } else if (remaining >= UNDER_ENTITLEMENT_TOLERANCE) {
      flags.push({
        key: `under:${key}`,
        kind: 'under_entitlement',
        message: `${label}: allocated ${formatFte(allocated)} FTE, ${formatFte(remaining)} under the entitlement of ${formatFte(entitled)}`,
        link: '/entitlement',
      });
    }
  };
  // Nothing entered yet is a blank plan, not a problem worth flagging.
  if (!input.entitlement || (input.entitlement.totalMilliFte === 0 && input.matches.length === 0)) return [];
  check('total', 'Total', summary.total.entitled, summary.total.allocated, summary.total.remaining);
  for (const row of summary.byPositionType) {
    if (row.entitled === 0 && row.allocated === 0) continue;
    check(row.positionType.id, row.positionType.name, row.entitled, row.allocated, row.remaining);
  }
  return flags;
}

function staffFlags(input: FlagInput): Flag[] {
  const flags: Flag[] = [];
  const staffById = new Map(input.staff.map((s) => [s.id, s]));
  const roleById = new Map(input.roles.map((r) => [r.id, r]));
  const roleName = (id: Id) => roleById.get(id)?.name ?? 'a deleted role';

  const byStaff = new Map<Id, Allocation[]>();
  for (const a of input.allocations) {
    byStaff.set(a.staffId, [...(byStaff.get(a.staffId) ?? []), a]);
  }

  for (const [staffId, allocations] of byStaff) {
    const staff = staffById.get(staffId);
    if (!staff) continue;

    for (const a of allocations) {
      const off = dayIndices(subtract(a.days, staff.workPattern));
      if (off.length) {
        flags.push({
          key: `notworking:${a.id}`,
          kind: 'staff_not_working',
          message: `${staff.name} is allocated to ${roleName(a.roleId)} on ${describeDayIndices(off)}, but doesn't work then`,
          link: staffLink(staff.id),
        });
      }
      const role = roleById.get(a.roleId);
      const outside = role ? dayIndices(subtract(a.days, role.days)) : [];
      if (role && outside.length) {
        flags.push({
          key: `outside:${a.id}`,
          kind: 'outside_role_days',
          message: `${staff.name} is allocated to ${role.name} on ${describeDayIndices(outside)}, but the role doesn't run then`,
          link: roleLink(role.id),
        });
      }
    }

    // Two roles on the same day only clash if their dates also overlap.
    for (let i = 0; i < allocations.length; i++) {
      for (let j = i + 1; j < allocations.length; j++) {
        const a = allocations[i]!;
        const b = allocations[j]!;
        if (!datesOverlap(a, b)) continue;
        const clash = dayIndices(intersect(a.days, b.days));
        if (clash.length) {
          flags.push({
            key: `double:${[a.id, b.id].sort().join('+')}`,
            kind: 'staff_double_booked',
            message: `${staff.name} is allocated to both ${roleName(a.roleId)} and ${roleName(b.roleId)} on ${describeDayIndices(clash)}`,
            link: staffLink(staff.id),
          });
        }
      }
    }
  }
  return flags;
}

function vacancyFlags(input: FlagInput): Flag[] {
  const flags: Flag[] = [];
  for (const role of input.roles) {
    const empty = dayIndices(unfilledDays(role, input.allocations));
    if (empty.length) {
      flags.push({
        key: `unfilled:${role.id}`,
        kind: 'role_unfilled',
        message: `${role.name} has no one allocated on ${describeDayIndices(empty)}`,
        link: roleLink(role.id),
      });
    }
  }
  const staffById = new Map(input.staff.map((s) => [s.id, s]));
  const roleById = new Map(input.roles.map((r) => [r.id, r]));
  for (const leave of input.leave) {
    const who = staffById.get(leave.staffId)?.name ?? 'A deleted staff member';
    for (const gap of coverGaps(leave, input.allocations)) {
      flags.push({
        key: `gap:${leave.id}:${gap.roleId}:${gap.days.join(',')}:${gap.range.start}`,
        kind: 'leave_gap',
        message: `${roleById.get(gap.roleId)?.name ?? 'A deleted role'}: no cover for ${who}'s ${LEAVE_TYPE_LABELS[leave.leaveType]} on ${describeDayIndices(gap.days)}, ${formatRange(gap.range)}`,
        link: leaveLink(leave.id),
      });
    }
  }
  return flags;
}

/** Part 1: unmatched permanent/TPT staff, and temporaries matched ahead of them. */
function matchingFlags(input: FlagInput): Flag[] {
  // Nothing to say until matching has started.
  if (input.positions.length === 0) return [];
  const flags: Flag[] = [];
  const statuses = input.staff.filter((s) => !s.nominatedForTransfer).map((s) => matchStatus(s, input.matches));
  const waiting = statuses.filter(
    (st) => st.staff.employmentType !== 'temporary' && unmatchedDayCount(st) > 0,
  );
  for (const st of waiting.sort(
    (a, b) => MATCH_ORDER.indexOf(a.staff.employmentType) - MATCH_ORDER.indexOf(b.staff.employmentType),
  )) {
    const left = st.workMilli - st.matchedMilli;
    flags.push({
      key: `unmatched:${st.staff.id}`,
      kind: 'unmatched_staff',
      message: `${st.staff.name} (${EMPLOYMENT_TYPE_LABELS[st.staff.employmentType]}) has ${formatFte(left)} FTE not matched to the entitlement (${describeDayIndices(dayIndices(st.unmatched))}): match them or nominate for transfer`,
      link: MATCHING_LINK,
    });
  }
  const temps = statuses.filter((st) => st.staff.employmentType === 'temporary' && st.matchedMilli > 0);
  if (waiting.length && temps.length) {
    flags.push({
      key: 'temporary-before-permanent',
      kind: 'temporary_before_permanent',
      message: `Temporary staff (${temps.map((t) => t.staff.name).join(', ')}) are matched while permanent or TPT staff are still unmatched`,
      link: MATCHING_LINK,
    });
  }
  return flags;
}

/** Part 2 against Part 1: each person's placed FTE should equal what they were matched for. */
function placementFlags(input: FlagInput): Flag[] {
  if (input.positions.length === 0 || !input.year) return [];
  const flags: Flag[] = [];
  for (const staff of input.staff) {
    const matched = matchStatus(staff, input.matches).matchedMilli;
    const placed = wholeYearPlacedMilli(staff.id, input.allocations, input.leave, input.year);
    if (staff.nominatedForTransfer) {
      if (placed > 0) {
        flags.push({
          key: `placed-transfer:${staff.id}`,
          kind: 'placement_mismatch',
          message: `${staff.name} is nominated for transfer but still placed for ${formatFte(placed)} FTE`,
          link: staffLink(staff.id),
        });
      }
      continue;
    }
    if (matched !== placed) {
      flags.push({
        key: `placement:${staff.id}`,
        kind: 'placement_mismatch',
        message: `${staff.name} is matched for ${formatFte(matched)} FTE but placed for ${formatFte(placed)} FTE`,
        link: staffLink(staff.id),
      });
    }
  }
  return flags;
}

export function computeFlags(input: FlagInput): Flag[] {
  return [
    ...matchingFlags(input),
    ...entitlementFlags(input),
    ...placementFlags(input),
    ...staffFlags(input),
    ...vacancyFlags(input),
  ];
}
