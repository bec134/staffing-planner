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

export interface DateRange {
  start: IsoDate;
  end: IsoDate;
}

export interface PlanningYear {
  id: Id;
  year: number;
  schoolName: string;
  /** Term 1–4 dates, entered by the school; used as quick picks for cover. */
  terms?: (DateRange | null)[];
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

export type EmploymentType = 'permanent' | 'twt' | 'temporary';

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  permanent: 'Permanent',
  /** Temporary Workforce Transition (Bec). */
  twt: 'TWT',
  temporary: 'Temporary',
};

/** Substantive roles a staff member can hold (Bec). */
export const SUBSTANTIVE_ROLES = [
  'Principal',
  'Deputy Principal',
  'Assistant Principal',
  'Assistant Principal - Curriculum & Instruction',
  'Teacher',
  'Teacher Librarian',
  'School Counsellor',
] as const;
export type SubstantiveRole = (typeof SUBSTANTIVE_ROLES)[number];

export interface Staff extends Scoped {
  name: string;
  /** Days worked; FTE is derived from this, never stored separately. */
  workPattern: DayPattern;
  /** Substantive role: one of SUBSTANTIVE_ROLES (older plans may hold free text). */
  currentRole: string;
  employmentType: EmploymentType;
  /** Other substantive roles someone holds (Bec: e.g. Teacher 0.6 and AP C&I 0.2). */
  otherRoles?: string[];
  /** FTE (milli-FTE) of each of `otherRoles`; the substantive role has the rest of their days (Bec). */
  otherRoleMilliFte?: Record<string, number>;
  /** Free-text notes. Structured plans for next year are a StaffIntention. */
  preferences: string;
  /** Part 1: surplus to entitlement and nominated for transfer (Bec). */
  nominatedForTransfer?: boolean;
  transferNotes?: string;
}

export interface Leave extends Scoped {
  staffId: Id;
  startDate: IsoDate;
  endDate: IsoDate;
  /** Days on leave; FTE affected is derived from this. */
  daysAffected: DayPattern;
  leaveType: LeaveType;
  /** Higher duties only: the executive position (Part 1) the person steps up into. */
  higherDutiesPositionId?: Id;
}

/** Leave types supplied by Bec, which can be recorded as leave. */
export const LEAVE_TYPES = ['lsl', 'lwop', 'maternity', 'paternity'] as const;
/**
 * Plus higher duties (Bec): someone relieving in a higher executive role for
 * the whole year is away from their substantive position on those days,
 * like leave, so it can be backfilled. Only created from Match staff.
 */
export type LeaveType = RecordedLeaveType | 'higher_duties';
export type RecordedLeaveType = (typeof LEAVE_TYPES)[number];

/** Short labels for tight spaces such as grid cells. */
export const LEAVE_TYPE_SHORT: Record<LeaveType, string> = {
  lsl: 'LSL',
  lwop: 'LWOP',
  maternity: 'Maternity leave',
  paternity: 'Paternity leave',
  higher_duties: 'Higher duties',
};

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  lsl: 'Long Service Leave',
  lwop: 'Leave without pay',
  maternity: 'Maternity Leave',
  paternity: 'Paternity Leave',
  higher_duties: 'Higher duties',
};

/**
 * A role staff are allocated to, e.g. "Class 3/4B" or "RFF 1". Its FTE comes
 * from the days it runs. Roles run all year for now (Bec: full-year only
 * until date-based leave cover in Phase 4).
 */
export interface Role extends Scoped {
  name: string;
  positionTypeId: Id;
  days: DayPattern;
  sortOrder: number;
}

/**
 * Part 1 (Bec): a position within the entitlement, e.g. "Classroom Teacher 3"
 * Mon–Fri or "RFF Teacher 2" on 3 fortnight days. Same shape as a Role so the
 * same grid logic serves both parts, but stored separately.
 */
export type EntitlementPosition = Role;

/**
 * Part 1: a staff member matched to an entitlement position on some days.
 * `roleId` is the position. A backfill against whole-year leave sets
 * `coveringLeaveId` (and the leave's dates), like cover in Part 2.
 */
export type EntitlementMatch = Allocation;

export interface Allocation extends Scoped {
  staffId: Id;
  roleId: Id;
  days: DayPattern;
  /** Omitted = whole planning year. Date-based allocations arrive in Phase 4. */
  startDate?: IsoDate;
  endDate?: IsoDate;
  /** Set when this allocation covers someone's leave. */
  coveringLeaveId?: Id;
  /** Part 1: a higher-duties match, linked to the higher-duties "leave" from the substantive position. */
  higherDutiesLeaveId?: Id;
  /**
   * A second job on days the person is on whole-year leave from their own
   * position (Bec: an AP on LWOP working 0.2 as a temporary teacher). That
   * leave doesn't apply to this allocation, and the two don't clash.
   */
  secondJobLeaveId?: Id;
  /**
   * Part 1: days beyond the FTE of the person's substantive role in this
   * position type (Bec: Sarah's AP C&I is 0.2; more is higher duties).
   */
  aboveSubstantive?: boolean;
  /** Part 1: employment for this position when it differs from the person's own (e.g. Temporary). */
  employmentType?: EmploymentType;
}

/** The leave that frees this allocation from the person's other positions, if any. */
export const freedBy = (a: Pick<Allocation, 'higherDutiesLeaveId' | 'secondJobLeaveId'>) => a.higherDutiesLeaveId ?? a.secondJobLeaveId;

export const GRADES = ['K', '1', '2', '3', '4', '5', '6'] as const;
export type Grade = (typeof GRADES)[number];
export const GRADE_LABELS: Record<Grade, string> = {
  K: 'Kindergarten',
  '1': 'Year 1',
  '2': 'Year 2',
  '3': 'Year 3',
  '4': 'Year 4',
  '5': 'Year 5',
  '6': 'Year 6',
};

/** The only composite classes allowed (Bec). */
export const COMPOSITE_PAIRS = [
  ['1', '2'],
  ['3', '4'],
  ['5', '6'],
] as const satisfies readonly (readonly [Grade, Grade])[];

/**
 * One class in the accepted class structure. Accepting a structure creates
 * one record per class; they can then be edited by hand.
 */
export interface ClassStructure extends Scoped {
  /** e.g. "KA", "1/2A", or whatever the school renames it to. */
  name: string;
  /** Students in this class by grade; two grades for a composite. */
  students: Partial<Record<Grade, number>>;
  sortOrder: number;
  /** The class teacher role created for this class, if any. */
  roleId?: Id;
}

export interface Enrolment extends Scoped {
  grade: Grade;
  /** Numbers only; no student names are ever stored. */
  projectedCount: number;
}

/** Inputs and rules for suggesting a class structure (Bec, Phase 5). */
export interface ClassRules extends Scoped {
  /** Total number of classes across the school. */
  totalClasses: number;
  /** Average class size to aim for, per grade. */
  guide: Record<Grade, number>;
  /** How far over the guide a class may go before a composite is preferred. */
  allowance: number;
  /** Which of the allowed composite pairs may be used, e.g. ["1/2", "3/4"]. */
  permittedComposites: string[];
}

export type WorkPreference = 'full_time' | 'part_time';

export const WORK_PREFERENCE_LABELS: Record<WorkPreference, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
};

/**
 * A staff member's intentions for next year (Bec, Phase 6), entered by hand
 * or imported from CSV. Saved on its own; "Apply to plan" then sets the
 * staff member's employment type and days and their whole-year leave
 * (Part 1). Grade preferences show during placement (Part 2).
 */
export interface StaffIntention extends Scoped {
  /** As entered; matched to a staff member by name until applied. */
  name: string;
  /** The staff member it was applied to. */
  staffId?: Id;
  employmentType: EmploymentType;
  /** Permanent or TWT only: their substantive FTE. */
  permanentMilliFte?: number;
  workPreference: WorkPreference;
  /** Days they want to work next year. */
  preferredDays: DayPattern;
  /** Days on leave for the whole school year, if any. */
  leaveDays: DayPattern;
  /** Type of that whole-year leave. */
  leaveType: RecordedLeaveType;
  /** Up to three grades, most preferred first. */
  gradePreferences: Grade[];
}
