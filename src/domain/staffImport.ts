/**
 * Staff CSV import (Bec): one file with each person's details for next year
 * (name, employment status, permanent FTE, substantive role, work
 * preference, the days they'll work, whole-year leave and grade
 * preferences). Columns are mapped, every row is previewed with what it
 * will change, then saved to the plan.
 *
 * Days are written like "Mon-Fri" or "Mon Tue Wed" (weekly; set Week A/B
 * patterns by hand afterwards). A blank leave-days cell means no whole-year
 * leave, and a blank leave type means leave without pay.
 */
import { FULL_TIME, NO_DAYS, subtract, weeklyPattern, type DayPattern } from './dayPattern';
import { parseFte } from './fte';
import { hasPermanentFte } from './intentions';
import { SUBSTANTIVE_ROLES, type EmploymentType, type Grade, type RecordedLeaveType, type StaffIntention, type SubstantiveRole, type WorkPreference } from './types';

export type ColumnIndex = number | null;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function parseEmploymentType(text: string): EmploymentType | null {
  const t = norm(text).replace(/[\s_-]+/g, ' ');
  if (['permanent', 'perm', 'p', 'ongoing'].includes(t)) return 'permanent';
  // TWT = Temporary Workforce Transition (Bec). "TPT" was the app's earlier label.
  if (['twt', 'temporary workforce transition', 'tpt'].includes(t)) return 'twt';
  if (['temporary', 'temp', 't', 'temporary full time', 'temp full time'].includes(t)) return 'temporary';
  return null;
}

/** Weekday index 0–4 from "Mon", "monday", "Tues", "Thurs" etc. */
function weekdayIndex(token: string): number | null {
  const t = norm(token).replace(/\.$/, '');
  if (t.length < 2) return null;
  const full = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  // Any prefix of at least two letters: "mo", "tues", "thurs", "friday".
  const i = full.findIndex((d) => d.startsWith(t));
  return i >= 0 ? i : null;
}

/** "Mon Tue Wed", "Mon, Wed", "Monday-Wednesday", "Mon–Fri", "Mon/Thu". */
export function parseDaysText(text: string): boolean[] | null {
  const week = [false, false, false, false, false];
  // "Mon - Wed" and "Mon to Wed" become "Mon-Wed" before splitting on spaces.
  const compact = text.replace(/\s*(?:[-–—]|\bto\b)\s*/gi, '-');
  const parts = compact.split(/[,;/&+]|\s+and\s+|\s+/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    const range = part.split('-').map((p) => p.trim()).filter(Boolean);
    if (range.length === 2) {
      const from = weekdayIndex(range[0]!);
      const to = weekdayIndex(range[1]!);
      if (from === null || to === null || to < from) return null;
      for (let i = from; i <= to; i++) week[i] = true;
    } else if (range.length === 1) {
      const i = weekdayIndex(range[0]!);
      if (i === null) return null;
      week[i] = true;
    } else {
      return null;
    }
  }
  return week;
}

export const STAFF_IMPORT_FIELDS = [
  ['name', 'Name'],
  ['employmentType', 'Employment status'],
  ['permanentFte', 'Permanent FTE'],
  ['substantiveRole', 'Substantive role'],
  ['workPreference', 'Work preference'],
  ['preferredDays', 'Preferred days'],
  ['leaveDays', 'Whole year leave days'],
  ['leaveType', 'Leave type'],
  ['grade1', 'Grade preference 1'],
  ['grade2', 'Grade preference 2'],
  ['grade3', 'Grade preference 3'],
] as const;

export type StaffImportField = (typeof STAFF_IMPORT_FIELDS)[number][0];
export type StaffImportMapping = Record<StaffImportField, ColumnIndex>;

/** A person's details for next year, as entered in the staff form or a CSV row. */
export type StaffDraft = Omit<StaffIntention, 'id' | 'planningYearId' | 'staffId'> & {
  /** One of SUBSTANTIVE_ROLES, or blank. */
  substantiveRole: string;
  /** Other substantive roles (staff form only; a CSV row leaves them as they are). */
  otherRoles?: string[];
};

export interface StaffImportRow {
  /** 1-based line number in the file, counting the header row. */
  line: number;
  draft?: StaffDraft;
  errors: string[];
  /** Notes that don't stop the row importing. */
  notes: string[];
  /** Valid but not imported. */
  skipReason?: string;
  /** Updates someone already in the plan with the same name. */
  existing?: boolean;
}

export function parseWorkPreference(text: string): WorkPreference | null {
  const t = norm(text).replace(/[-_]/g, ' ');
  if (['full time', 'full', 'ft', 'fulltime'].includes(t)) return 'full_time';
  if (['part time', 'part', 'pt', 'parttime'].includes(t)) return 'part_time';
  return null;
}

export function parseLeaveType(text: string): RecordedLeaveType | null {
  const t = norm(text).replace(/[-_]/g, ' ');
  if (['lsl', 'long service leave', 'long service'].includes(t)) return 'lsl';
  if (['lwop', 'leave without pay', 'without pay'].includes(t)) return 'lwop';
  if (['maternity', 'maternity leave', 'mat leave'].includes(t)) return 'maternity';
  if (['paternity', 'paternity leave'].includes(t)) return 'paternity';
  return null;
}

/** A substantive role from Bec's list, allowing common short forms. */
export function parseSubstantiveRole(text: string): SubstantiveRole | null {
  const t = norm(text).replace(/&/g, 'and').replace(/[-_.,]/g, ' ').replace(/\s+/g, ' ').trim();
  const exact = SUBSTANTIVE_ROLES.find((r) => norm(r).replace(/&/g, 'and').replace(/[-_.,]/g, ' ').replace(/\s+/g, ' ') === t);
  if (exact) return exact;
  const synonyms: Record<string, SubstantiveRole> = {
    dp: 'Deputy Principal',
    ap: 'Assistant Principal',
    apci: 'Assistant Principal - Curriculum & Instruction',
    'ap c and i': 'Assistant Principal - Curriculum & Instruction',
    'ap candi': 'Assistant Principal - Curriculum & Instruction',
    'assistant principal curriculum and instruction': 'Assistant Principal - Curriculum & Instruction',
    'classroom teacher': 'Teacher',
    'class teacher': 'Teacher',
    librarian: 'Teacher Librarian',
    tl: 'Teacher Librarian',
    counsellor: 'School Counsellor',
    'school counselor': 'School Counsellor',
    counselor: 'School Counsellor',
  };
  return synonyms[t] ?? null;
}

/** "K", "Kindy", "Kindergarten", "Year 1", "Yr 2", "Y3", "4". */
export function parseGrade(text: string): Grade | null {
  const t = norm(text).replace(/\.$/, '');
  if (['k', 'kindy', 'kinder', 'kindergarten'].includes(t)) return 'K';
  const m = /^(?:year|yr|y)?\s*([1-6])$/.exec(t);
  return m ? (m[1] as Grade) : null;
}

const NONE = new Set(['', 'none', 'n/a', 'na', '-', 'no', 'nil']);

function days(text: string): DayPattern | null | 'blank' {
  if (NONE.has(norm(text))) return 'blank';
  const week = parseDaysText(text);
  return week ? weeklyPattern(week) : null;
}

export function parseStaffRows(rows: string[][], mapping: StaffImportMapping, existingNames: string[]): StaffImportRow[] {
  const existing = new Set(existingNames.map(norm));
  const inFile = new Set<string>();
  return rows.map((row, i) => {
    const line = i + 2;
    const cell = (f: StaffImportField) => {
      const c = mapping[f];
      return c === null ? '' : (row[c] ?? '').trim();
    };
    const errors: string[] = [];
    const notes: string[] = [];

    const name = cell('name');
    if (!name) errors.push('Name is blank');

    const employmentType = parseEmploymentType(cell('employmentType'));
    if (!employmentType) {
      errors.push(cell('employmentType') ? `Unknown employment status "${cell('employmentType')}"` : 'Employment status is blank');
    }

    let permanentMilliFte: number | undefined;
    const fteText = cell('permanentFte');
    if (fteText) {
      const parsed = parseFte(fteText);
      if (!parsed.ok) errors.push(`Permanent FTE "${fteText}": ${parsed.error}`);
      else if (employmentType && !hasPermanentFte(employmentType)) notes.push('Permanent FTE ignored for temporary staff');
      else permanentMilliFte = parsed.value;
    }

    const roleText = cell('substantiveRole');
    const role = roleText ? parseSubstantiveRole(roleText) : '';
    if (role === null) errors.push(`Unknown substantive role "${roleText}"`);

    const leave = days(cell('leaveDays'));
    if (leave === null) errors.push(`Couldn't read whole year leave days "${cell('leaveDays')}"`);
    const leaveDays = leave === null || leave === 'blank' ? NO_DAYS : leave;

    let leaveType: RecordedLeaveType = 'lwop';
    if (cell('leaveType')) {
      const parsed = parseLeaveType(cell('leaveType'));
      if (parsed) leaveType = parsed;
      else errors.push(`Unknown leave type "${cell('leaveType')}"`);
    }

    const prefText = cell('workPreference');
    let workPreference = prefText ? parseWorkPreference(prefText) : null;
    if (prefText && !workPreference) errors.push(`Unknown work preference "${prefText}"`);

    const preferred = days(cell('preferredDays'));
    let preferredDays: DayPattern = NO_DAYS;
    if (preferred === null) errors.push(`Couldn't read preferred days "${cell('preferredDays')}"`);
    else if (preferred !== 'blank') preferredDays = preferred;
    else if (workPreference === 'full_time') {
      // Full time with no days listed: every day not on leave.
      preferredDays = subtract(FULL_TIME, leaveDays);
    }
    // No preference given: full time if they'd work every day not on leave.
    if (!prefText) {
      const everyDay = preferredDays.days.some(Boolean) && preferredDays.days.every((d, n) => d || leaveDays.days[n]);
      workPreference = everyDay ? 'full_time' : 'part_time';
    }

    const gradePreferences: Grade[] = [];
    for (const f of ['grade1', 'grade2', 'grade3'] as const) {
      const text = cell(f);
      if (NONE.has(norm(text))) continue;
      const g = parseGrade(text);
      if (g) gradePreferences.push(g);
      else errors.push(`Unknown grade "${text}" (use K or 1–6)`);
    }

    if (errors.length || !employmentType || !workPreference || role === null) return { line, errors, notes };
    const draft: StaffDraft = {
      name,
      employmentType,
      permanentMilliFte,
      workPreference,
      preferredDays,
      leaveDays,
      leaveType,
      gradePreferences,
      substantiveRole: role,
    };
    const key = norm(name);
    if (inFile.has(key)) return { line, draft, errors, notes, skipReason: 'Repeated in this file' };
    inFile.add(key);
    return { line, draft, errors, notes, existing: existing.has(key) };
  });
}

/** Best-guess mapping from header names; the user can change any of it. */
export function guessStaffImportMapping(headers: string[]): StaffImportMapping {
  const h = headers.map(norm);
  const taken = new Set<number>();
  const find = (...patterns: RegExp[]): ColumnIndex => {
    for (const p of patterns) {
      const i = h.findIndex((x, n) => !taken.has(n) && p.test(x));
      if (i >= 0) {
        taken.add(i);
        return i;
      }
    }
    return null;
  };
  // Most specific first, so "Whole year leave days" isn't taken as preferred days.
  const permanentFte = find(/permanent\s*fte/, /\bfte\b/);
  const substantiveRole = find(/substantive/, /current\s*role/, /^role$/, /position/);
  const leaveType = find(/leave\s*type/);
  const leaveDays = find(/leave/);
  const grade1 = find(/grade.*1/, /1st.*grade/, /first.*grade/);
  const grade2 = find(/grade.*2/, /2nd.*grade/, /second.*grade/);
  const grade3 = find(/grade.*3/, /3rd.*grade/, /third.*grade/);
  const workPreference = find(/work\s*pref/, /full.*part/, /preference/);
  const preferredDays = find(/prefer.*days?/, /days/);
  const employmentType = find(/employment/, /status/, /^type$/, /contract/);
  const name = find(/^(staff\s*)?(full\s*)?name$/, /name/, /teacher/, /staff/);
  return { name, employmentType, permanentFte, substantiveRole, workPreference, preferredDays, leaveDays, leaveType, grade1, grade2, grade3 };
}

/**
 * Downloadable template, built in code (never stored as a CSV file in the
 * repo) with obviously made-up example rows.
 */
export const STAFF_TEMPLATE = {
  file: 'staff-template.csv',
  csv: [
    'Name,Employment Status,Permanent FTE,Substantive Role,Work Preference,Preferred days,Whole year leave days,Leave type,Grade Preference 1,Grade Preference 2,Grade Preference 3',
    'Example Teacher,Permanent,1.0,Teacher,Full time,Mon-Fri,,,K,1,2',
    'Example Part-timer,Permanent,1.0,Teacher,Part time,Mon Tue Wed,Thu Fri,LWOP,3,4,',
    'Example Transition,TWT,0.6,Teacher Librarian,Part time,Mon Tue Wed,,,,,',
    'Example Temp,Temporary,,Teacher,Part time,Thu Fri,,,2,1,K',
  ].join('\r\n'),
} as const;
