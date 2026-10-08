import { emptyEntitlement } from './entitlement';
import { defaultPositionTypes } from './positionTypes';
import type { Id, PlanningYear, PositionType, Entitlement } from './types';

export interface NewPlanningYear {
  planningYear: PlanningYear;
  positionTypes: PositionType[];
  entitlement: Entitlement;
}

/** A new, empty plan with the default position types and a blank entitlement. */
export function newPlanningYear(
  year: number,
  schoolName: string,
  id: Id = crypto.randomUUID(),
  now = new Date().toISOString(),
): NewPlanningYear {
  return {
    planningYear: { id, year, schoolName: schoolName.trim(), createdAt: now, updatedAt: now },
    positionTypes: defaultPositionTypes(id),
    entitlement: emptyEntitlement(id),
  };
}

export function validateNewPlanningYear(year: number, schoolName: string): string | null {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return 'Enter a year between 2000 and 2100';
  if (!schoolName.trim()) return 'Enter a school name';
  return null;
}
