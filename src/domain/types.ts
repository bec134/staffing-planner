/**
 * Core records (see PLAN.md "Data model"). Every record except PlanningYear
 * is scoped to a planning year so a school can keep more than one year's plan.
 *
 * Several fields are placeholders until Bec supplies details (see PLAN.md
 * "Open items for Bec"); those are marked TODO(open item).
 */
import type { DayPattern } from './dayPattern';

export type Id = string;
/** ISO calendar date, YYYY-MM-DD. */
export type IsoDate = string;

export interface PlanningYear {
  id: Id;
  year: number;
  schoolName: string;
  createdAt: string;
  updatedAt: string;
}

interface Scoped {
  id: Id;
  planningYearId: Id;
}

export type PositionCategory = 'class_teacher' | 'executive' | 'other_teaching';

export const POSITION_CATEGORY_LABELS: Record<PositionCategory, string> = {
  class_teacher: 'Class teacher',
  executive: 'Executive',
  other_teaching: 'Other teaching',
};

/** A position type, used both in the entitlement breakdown and as an allocatable role. */
export interface PositionType extends Scoped {
  name: string;
  category: PositionCategory;
  sortOrder: number;
}

/**
 * Entitlement is entered as exact decimal FTE (as the department supplies it)
 * and stored as whole thousandths of an FTE, so 2.316 FTE = 2316. See fte.ts.
 */
export interface EntitlementLine {
  positionTypeId: Id;
  milliFte: number;
}

export interface Entitlement extends Scoped {
  /** Total entitlement; the breakdown should sum to this. */
  totalMilliFte: number;
  lines: EntitlementLine[];
}

export type EmploymentType = 'permanent' | 'tpt' | 'temporary';

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  permanent: 'Permanent',
  tpt: 'TPT',
  temporary: 'Temporary',
};

export interface Staff extends Scoped {
  name: string;
  /** Days worked; FTE is derived from this, never stored separately. */
  workPattern: DayPattern;
  currentRole: string;
  employmentType: EmploymentType;
  /** TODO(open item): structured intention fields to be supplied by Bec. */
  preferences: string;
}

export interface Leave extends Scoped {
  staffId: Id;
  startDate: IsoDate;
  endDate: IsoDate;
  /** Days on leave; FTE affected is derived from this. */
  daysAffected: DayPattern;
  /** TODO(open item): free text until Bec supplies a list of leave types. */
  leaveType: string;
}

export interface Allocation extends Scoped {
  staffId: Id;
  positionTypeId: Id;
  /** Optional class label (e.g. a class created from a class structure). */
  classLabel?: string;
  days: DayPattern;
  startDate: IsoDate;
  endDate: IsoDate;
  /** Set when this allocation covers someone's leave. */
  coveringLeaveId?: Id;
}

export interface ClassStructure extends Scoped {
  /** e.g. "K", "1", "3/4" */
  grades: string;
  numberOfClasses: number;
  studentsPerClass: number;
  ruleSetId?: Id;
}

export interface Enrolment extends Scoped {
  grade: string;
  /** Numbers only; no student names are ever stored. */
  projectedCount: number;
}

/** TODO(open item): actual rules to be supplied by Bec. */
export interface ClassRules extends Scoped {
  maxClassSizeByGrade: Record<string, number>;
  permittedComposites: string[];
  availableClassrooms: number;
  availableTeachers: number;
}
