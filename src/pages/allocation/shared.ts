import { dayIndices, describeDayIndices, type DayPattern } from '../../domain/dayPattern';
import type { PlanningYearSnapshot } from '../../data/repository';

export type PlanData = PlanningYearSnapshot;

export const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
export const bySortOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;

/** "Mon, Tue" / "Mon (A), Tue" / "none" */
export const daysLabel = (p: DayPattern) => describeDayIndices(dayIndices(p)) || 'none';

export function lookups(data: PlanData) {
  return {
    staffById: new Map(data.staff.map((s) => [s.id, s])),
    roleById: new Map(data.roles.map((r) => [r.id, r])),
    positionTypeById: new Map(data.positionTypes.map((p) => [p.id, p])),
  };
}
