/**
 * Staff intentions for next year (Bec, Phase 6).
 *
 * An intention is saved on its own (entered by hand or imported from CSV)
 * and changes nothing until it's applied. Applying it sets the person's
 * employment type and days worked, and their whole-year leave, which is
 * what Part 1 matches against the entitlement:
 *
 *   days worked = preferred days + whole-year leave days
 *
 * and for permanent and TWT staff those should add up to their permanent
 * FTE (e.g. 1.0 permanent, preferring Mon–Wed with LWOP Thu–Fri). Grade
 * preferences are shown during Part 2 placement and flagged when someone is
 * placed on a class outside them.
 */
import { classGrades } from './classStructure';
import { FORTNIGHT_DAYS, FULL_TIME, dayIndices, describeDayIndices, intersect, repeatsWeekly, subtract, union, type DayPattern } from './dayPattern';
import { formatFte, milliFteOf } from './fte';
import { isWholeYearLeave } from './matching';
import {
  EMPLOYMENT_TYPE_LABELS,
  GRADE_LABELS,
  LEAVE_TYPE_LABELS,
  type Allocation,
  type ClassStructure,
  type DateRange,
  type EmploymentType,
  type EntitlementMatch,
  type Grade,
  type Id,
  type Leave,
  type Staff,
  type StaffIntention,
} from './types';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Permanent FTE only applies to permanent and TWT staff (Bec). */
export const hasPermanentFte = (t: EmploymentType) => t === 'permanent' || t === 'twt';

const withMode = (p: DayPattern): DayPattern => ({ mode: repeatsWeekly(p) ? 'weekly' : 'fortnightly', days: p.days });
const isEmpty = (p: DayPattern) => !p.days.some(Boolean);
const sameDays = (a: DayPattern, b: DayPattern) => a.days.every((d, i) => d === b.days[i]);
const describe = (p: DayPattern) => describeDayIndices(dayIndices(p)) || 'none';

/** The days worked an intention gives: preferred days plus whole-year leave days. */
export const intendedWorkPattern = (i: Pick<StaffIntention, 'preferredDays' | 'leaveDays'>) =>
  withMode(union([i.preferredDays, i.leaveDays]));

/** The staff member an intention is for: the one it was applied to, else by name. */
export function staffForIntention(intention: StaffIntention, staff: Staff[]): Staff | undefined {
  return (
    (intention.staffId ? staff.find((s) => s.id === intention.staffId) : undefined) ??
    staff.find((s) => norm(s.name) === norm(intention.name))
  );
}

/** A staff member's intention, if one has been entered. */
export function intentionForStaff(staff: Staff, intentions: StaffIntention[]): StaffIntention | undefined {
  return (
    intentions.find((i) => i.staffId === staff.id) ??
    intentions.find((i) => !i.staffId && norm(i.name) === norm(staff.name))
  );
}

/** "K, 1, 2" */
export const describeGrades = (grades: Grade[]) => grades.join(', ');

/**
 * A starting intention for someone already in the plan, from their current
 * days and whole-year leave, so manual entry only needs the changes.
 */
export function intentionFromPlan(staff: Staff, leave: Leave[], year: DateRange, newId: () => Id): StaffIntention {
  const wholeYear = leave.filter((l) => l.staffId === staff.id && isWholeYearLeave(l, year));
  const leaveDays = withMode(union(wholeYear.map((l) => l.daysAffected)));
  const preferredDays = withMode(subtract(staff.workPattern, leaveDays));
  return {
    id: newId(),
    planningYearId: staff.planningYearId,
    name: staff.name,
    staffId: staff.id,
    employmentType: staff.employmentType,
    permanentMilliFte: hasPermanentFte(staff.employmentType) ? milliFteOf(staff.workPattern) : undefined,
    workPreference: isEmpty(leaveDays) && sameDays(staff.workPattern, FULL_TIME) ? 'full_time' : 'part_time',
    preferredDays,
    leaveDays,
    leaveType: wholeYear[0]?.leaveType ?? 'lwop',
    gradePreferences: [],
  };
}

export interface IntentionCheck {
  /** Problems that stop the intention being applied. */
  errors: string[];
  /** Things worth a look that don't stop it. */
  warnings: string[];
}

export function checkIntention(i: StaffIntention): IntentionCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!i.name.trim()) errors.push('Name is blank');
  const both = dayIndices(intersect(i.preferredDays, i.leaveDays));
  if (both.length) errors.push(`${describeDayIndices(both)} can't be both a preferred day and a leave day`);
  const work = intendedWorkPattern(i);
  if (isEmpty(work)) errors.push('No preferred days or leave days');

  if (i.workPreference === 'full_time') {
    const missing = dayIndices(subtract(subtract(FULL_TIME, i.leaveDays), i.preferredDays));
    if (missing.length) warnings.push(`Full time, but ${describeDayIndices(missing)} aren't preferred days`);
  } else if (dayIndices(i.preferredDays).length === FORTNIGHT_DAYS) {
    warnings.push('Part time, but every day is a preferred day');
  }

  if (hasPermanentFte(i.employmentType)) {
    if (i.permanentMilliFte === undefined) {
      warnings.push(`Permanent FTE is blank (needed for ${EMPLOYMENT_TYPE_LABELS[i.employmentType]} staff)`);
    } else if (!isEmpty(work) && milliFteOf(work) !== i.permanentMilliFte) {
      const leave = milliFteOf(i.leaveDays);
      warnings.push(
        `Preferred days (${formatFte(milliFteOf(i.preferredDays))})${leave ? ` plus leave days (${formatFte(leave)})` : ''} come to ${formatFte(milliFteOf(work))} FTE, not their permanent FTE of ${formatFte(i.permanentMilliFte)}`,
      );
    }
  }

  const repeated = i.gradePreferences.filter((g, n) => i.gradePreferences.indexOf(g) !== n);
  if (repeated.length) warnings.push(`${GRADE_LABELS[repeated[0]!]} is listed more than once`);
  return { errors, warnings };
}

export interface PlanContext {
  planningYearId: Id;
  year: DateRange;
  staff: Staff[];
  leave: Leave[];
  allocations: Allocation[];
  matches: EntitlementMatch[];
}

/** What applying an intention would save, and a plain description of it. */
export interface ApplyPlan {
  intention: StaffIntention;
  staff: Staff;
  isNew: boolean;
  leavePut: Leave[];
  leaveDelete: Id[];
  allocationPut: Allocation[];
  allocationDelete: Id[];
  matchPut: EntitlementMatch[];
  matchDelete: Id[];
  /** One line per change; empty when the plan already matches. */
  changes: string[];
  /** Things to sort out afterwards in Part 1 or Part 2. */
  followUps: string[];
}

/** Trim cover (or backfills) for a leave to its new days, or remove them. */
function trimCover<T extends Allocation>(covers: T[], leaveDays: DayPattern | undefined, put: T[], del: Id[]) {
  for (const c of covers) {
    const days = leaveDays ? intersect(c.days, leaveDays) : undefined;
    if (!days || isEmpty(days)) del.push(c.id);
    else if (!sameDays(days, c.days)) put.push({ ...c, days: withMode(days) });
  }
}

/**
 * Plan applying an intention. Pure: returns the records to save. Part-year
 * leave is left alone; the person's whole-year leave becomes exactly the
 * intention's leave days (one record for the school year), and any cover
 * or Part 1 backfill for days no longer on leave is removed.
 */
export function planApplyIntention(intention: StaffIntention, ctx: PlanContext, newId: () => Id): ApplyPlan {
  const existing = staffForIntention(intention, ctx.staff);
  const workPattern = intendedWorkPattern(intention);
  const changes: string[] = [];
  const followUps: string[] = [];

  const staff: Staff = existing
    ? { ...existing, employmentType: intention.employmentType, workPattern }
    : {
        id: newId(),
        planningYearId: ctx.planningYearId,
        name: intention.name.trim(),
        workPattern,
        currentRole: '',
        employmentType: intention.employmentType,
        preferences: '',
      };
  if (!existing) {
    changes.push(`Add as a new staff member (${EMPLOYMENT_TYPE_LABELS[staff.employmentType]}, ${describe(workPattern)})`);
  } else {
    if (existing.employmentType !== staff.employmentType) {
      changes.push(`Employment: ${EMPLOYMENT_TYPE_LABELS[existing.employmentType]} → ${EMPLOYMENT_TYPE_LABELS[staff.employmentType]}`);
    }
    if (!sameDays(existing.workPattern, workPattern)) {
      changes.push(`Days worked: ${describe(existing.workPattern)} → ${describe(workPattern)}`);
    }
  }

  const leavePut: Leave[] = [];
  const leaveDelete: Id[] = [];
  const allocationPut: Allocation[] = [];
  const allocationDelete: Id[] = [];
  const matchPut: EntitlementMatch[] = [];
  const matchDelete: Id[] = [];

  const wholeYear = existing
    ? ctx.leave.filter((l) => l.staffId === existing.id && isWholeYearLeave(l, ctx.year)).sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const wanted = isEmpty(intention.leaveDays) ? undefined : withMode(intention.leaveDays);
  const [keep, ...extra] = wholeYear;
  const label = (l: Pick<Leave, 'leaveType' | 'daysAffected'>) => `whole-year ${LEAVE_TYPE_LABELS[l.leaveType]} (${describe(l.daysAffected)})`;
  const coverCount = (ids: Id[]) => {
    const n = ctx.allocations.filter((a) => a.coveringLeaveId && ids.includes(a.coveringLeaveId)).length;
    const m = ctx.matches.filter((a) => a.coveringLeaveId && ids.includes(a.coveringLeaveId)).length;
    return [n ? `${n} cover allocation(s)` : '', m ? `${m} Part 1 backfill(s)` : ''].filter(Boolean).join(' and ');
  };

  const removeLeave = (ls: Leave[]) => {
    for (const l of ls) {
      const also = coverCount([l.id]);
      changes.push(`Remove ${label(l)}${also ? `, with its ${also}` : ''}`);
      leaveDelete.push(l.id);
      trimCover(ctx.allocations.filter((a) => a.coveringLeaveId === l.id), undefined, allocationPut, allocationDelete);
      trimCover(ctx.matches.filter((a) => a.coveringLeaveId === l.id), undefined, matchPut, matchDelete);
    }
  };

  if (!wanted) {
    removeLeave(wholeYear);
  } else if (keep) {
    const next: Leave = { ...keep, daysAffected: wanted, leaveType: intention.leaveType };
    if (!sameDays(keep.daysAffected, wanted) || keep.leaveType !== intention.leaveType) {
      changes.push(`Change ${label(keep)} → ${label(next)}`);
      leavePut.push(next);
      trimCover(ctx.allocations.filter((a) => a.coveringLeaveId === keep.id), wanted, allocationPut, allocationDelete);
      trimCover(ctx.matches.filter((a) => a.coveringLeaveId === keep.id), wanted, matchPut, matchDelete);
    }
    removeLeave(extra);
  } else {
    const next: Leave = {
      id: newId(),
      planningYearId: ctx.planningYearId,
      staffId: staff.id,
      startDate: ctx.year.start,
      endDate: ctx.year.end,
      daysAffected: wanted,
      leaveType: intention.leaveType,
    };
    changes.push(`Add ${label(next)} for the school year`);
    leavePut.push(next);
  }

  if (existing) {
    const left = (rs: Allocation[]) =>
      dayIndices(subtract(union(rs.filter((r) => r.staffId === existing.id).map((r) => r.days)), workPattern));
    const offMatched = left(ctx.matches.filter((m) => !matchDelete.includes(m.id)));
    const offPlaced = left(ctx.allocations.filter((a) => !allocationDelete.includes(a.id)));
    if (offMatched.length) followUps.push(`Still matched in Part 1 on ${describeDayIndices(offMatched)}, which they'd no longer work`);
    if (offPlaced.length) followUps.push(`Still placed in Part 2 on ${describeDayIndices(offPlaced)}, which they'd no longer work`);
  }

  return {
    intention: { ...intention, staffId: staff.id },
    staff,
    isNew: !existing,
    leavePut,
    leaveDelete,
    allocationPut,
    allocationDelete,
    matchPut,
    matchDelete,
    changes,
    followUps,
  };
}

export interface GradeMismatch {
  staff: Staff;
  classStructure: ClassStructure;
  preferences: Grade[];
}

/**
 * Staff placed (Part 2) on a class with none of its grades among their
 * grade preferences. People with no grade preferences aren't checked.
 */
export function gradePreferenceMismatches(
  staff: Staff[],
  intentions: StaffIntention[],
  classStructures: ClassStructure[],
  allocations: Allocation[],
): GradeMismatch[] {
  const out: GradeMismatch[] = [];
  for (const s of staff) {
    const prefs = intentionForStaff(s, intentions)?.gradePreferences ?? [];
    if (!prefs.length) continue;
    const roleIds = new Set(allocations.filter((a) => a.staffId === s.id).map((a) => a.roleId));
    for (const c of classStructures) {
      if (!c.roleId || !roleIds.has(c.roleId)) continue;
      if (!classGrades(c).some((g) => prefs.includes(g))) out.push({ staff: s, classStructure: c, preferences: prefs });
    }
  }
  return out;
}
