/**
 * Entitlement vs allocated vs remaining (PLAN.md module 1).
 */
import { milliFteOf, type MilliFte } from './fte';
import type { Allocation, Entitlement, Id, PositionCategory, PositionType, Role } from './types';

export interface FteFigures {
  entitled: MilliFte;
  allocated: MilliFte;
  /** entitled − allocated; negative means over-allocated. */
  remaining: MilliFte;
}

export interface PositionTypeSummary extends FteFigures {
  positionType: PositionType;
}

export interface CategorySummary extends FteFigures {
  category: PositionCategory;
}

export interface EntitlementSummary {
  /** Figures against the entered total entitlement. */
  total: FteFigures;
  byPositionType: PositionTypeSummary[];
  byCategory: CategorySummary[];
  /** Sum of the per-position-type breakdown. */
  breakdownTotal: MilliFte;
  /** entered total − breakdown sum; 0 when the breakdown balances. */
  breakdownDifference: MilliFte;
  /** Allocations whose role or position type no longer exists. */
  unknownPositionTypeAllocated: MilliFte;
}

const figures = (entitled: MilliFte, allocated: MilliFte): FteFigures => ({
  entitled,
  allocated,
  remaining: entitled - allocated,
});

/** Smallest shortfall worth flagging: one fortnight day (0.1 FTE). Bec. */
export const UNDER_ENTITLEMENT_TOLERANCE: MilliFte = 100;

/**
 * Allocated FTE counts against the position type of the role it fills.
 *
 * Allocations that cover someone's leave are excluded: the person on leave
 * still holds that entitlement, so counting the cover as well would double
 * count it (to confirm with Bec; see PLAN.md open items).
 *
 * Every allocation counts as full-year for now (Bec, Phase 3).
 */
export function summariseEntitlement(
  entitlement: Entitlement | undefined,
  positionTypes: PositionType[],
  roles: Role[],
  allocations: Allocation[],
): EntitlementSummary {
  const entitledByType = new Map<Id, MilliFte>();
  for (const line of entitlement?.lines ?? []) {
    entitledByType.set(line.positionTypeId, (entitledByType.get(line.positionTypeId) ?? 0) + line.milliFte);
  }

  const roleType = new Map(roles.map((r) => [r.id, r.positionTypeId]));
  const allocatedByType = new Map<Id, MilliFte>();
  for (const a of allocations) {
    if (a.coveringLeaveId) continue;
    const typeId = roleType.get(a.roleId) ?? `missing-role:${a.roleId}`;
    allocatedByType.set(typeId, (allocatedByType.get(typeId) ?? 0) + milliFteOf(a.days));
  }

  const ordered = [...positionTypes].sort((a, b) => a.sortOrder - b.sortOrder);
  const knownIds = new Set(ordered.map((p) => p.id));
  const byPositionType = ordered.map((positionType) => ({
    positionType,
    ...figures(entitledByType.get(positionType.id) ?? 0, allocatedByType.get(positionType.id) ?? 0),
  }));

  const categories: PositionCategory[] = ['class_teacher', 'executive', 'other_teaching'];
  const byCategory = categories.map((category) => {
    const rows = byPositionType.filter((r) => r.positionType.category === category);
    return {
      category,
      ...figures(
        rows.reduce((s, r) => s + r.entitled, 0),
        rows.reduce((s, r) => s + r.allocated, 0),
      ),
    };
  });

  let unknownPositionTypeAllocated = 0;
  for (const [id, value] of allocatedByType) {
    if (!knownIds.has(id)) unknownPositionTypeAllocated += value;
  }

  // Lines for deleted position types still count towards the breakdown so
  // the mismatch is visible rather than silently dropped.
  const breakdownTotal = [...entitledByType.values()].reduce((s, v) => s + v, 0);
  const totalEntitled = entitlement?.totalMilliFte ?? 0;
  const totalAllocated = [...allocatedByType.values()].reduce((s, v) => s + v, 0);

  return {
    total: figures(totalEntitled, totalAllocated),
    byPositionType,
    byCategory,
    breakdownTotal,
    breakdownDifference: totalEntitled - breakdownTotal,
    unknownPositionTypeAllocated,
  };
}

export const entitlementIdFor = (planningYearId: Id) => `${planningYearId}-entitlement`;

export function emptyEntitlement(planningYearId: Id): Entitlement {
  return { id: entitlementIdFor(planningYearId), planningYearId, totalMilliFte: 0, lines: [] };
}
