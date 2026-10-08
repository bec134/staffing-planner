/**
 * Automatic flags (PLAN.md "Automatic flags"). Recomputed whenever data
 * changes and shown in the warnings panel, each linking to its record.
 *
 * Phase 3 covers over/under entitlement and staff over their FTE. Unfilled
 * roles and leave gaps arrive with leave cover in Phase 4.
 */
import { datesOverlap } from './allocation';
import { dayIndices, describeDayIndices, intersect, subtract } from './dayPattern';
import { summariseEntitlement, UNDER_ENTITLEMENT_TOLERANCE } from './entitlement';
import { formatFte } from './fte';
import type { Allocation, Entitlement, Id, PositionType, Role, Staff } from './types';

export type FlagKind =
  | 'over_entitlement'
  | 'under_entitlement'
  | 'staff_not_working'
  | 'staff_double_booked'
  | 'outside_role_days';

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
}

export const staffLink = (id: Id) => `/allocation/staff/${id}`;
export const roleLink = (id: Id) => `/allocation/roles/${id}`;

function entitlementFlags(input: FlagInput): Flag[] {
  const summary = summariseEntitlement(input.entitlement, input.positionTypes, input.roles, input.allocations);
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
  if (!input.entitlement || (input.entitlement.totalMilliFte === 0 && input.allocations.length === 0)) return [];
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

export function computeFlags(input: FlagInput): Flag[] {
  return [...staffFlags(input), ...entitlementFlags(input)];
}
