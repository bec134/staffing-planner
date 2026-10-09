/**
 * Staff intentions CSV import (Bec, Phase 6): map columns, preview every
 * row, then save. Importing only saves intentions; they're applied to the
 * plan separately (see intentions.ts).
 *
 * Days are written like "Mon-Fri" or "Mon Tue Wed" (weekly; set Week A/B
 * patterns by hand afterwards). A blank leave-days cell means no whole-year
 * leave, and a blank leave type means leave without pay.
 */
import { FULL_TIME, NO_DAYS, subtract, weeklyPattern, type DayPattern } from './dayPattern';
import { parseFte } from './fte';
import { hasPermanentFte } from './intentions';
import { parseDaysText, parseEmploymentType, type ColumnIndex } from './staffImport';
import { type Grade, type LeaveType, type StaffIntention, type WorkPreference } from './types';

export const INTENTION_FIELDS = [
  ['name', 'Name'],
  ['employmentType', 'Employment status'],
  ['permanentFte', 'Permanent FTE'],
  ['workPreference', 'Work preference'],
  ['preferredDays', 'Preferred days'],
  ['leaveDays', 'Whole year leave days'],
  ['leaveType', 'Leave type'],
  ['grade1', 'Grade preference 1'],
  ['grade2', 'Grade preference 2'],
  ['grade3', 'Grade preference 3'],
] as const;

export type IntentionField = (typeof INTENTION_FIELDS)[number][0];
export type IntentionMapping = Record<IntentionField, ColumnIndex>;

export type IntentionDraft = Omit<StaffIntention, 'id' | 'planningYearId' | 'staffId'>;

export interface IntentionImportRow {
  /** 1-based line number in the file, counting the header row. */
  line: number;
  draft?: IntentionDraft;
  errors: string[];
  /** Notes that don't stop the row importing. */
  notes: string[];
  /** Valid but not imported. */
  skipReason?: string;
  /** Replaces an intention already in the plan with the same name. */
  replaces?: boolean;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function parseWorkPreference(text: string): WorkPreference | null {
  const t = norm(text).replace(/[-_]/g, ' ');
  if (['full time', 'full', 'ft', 'fulltime'].includes(t)) return 'full_time';
  if (['part time', 'part', 'pt', 'parttime'].includes(t)) return 'part_time';
  return null;
}

export function parseLeaveType(text: string): LeaveType | null {
  const t = norm(text).replace(/[-_]/g, ' ');
  if (['lsl', 'long service leave', 'long service'].includes(t)) return 'lsl';
  if (['lwop', 'leave without pay', 'without pay'].includes(t)) return 'lwop';
  if (['maternity', 'maternity leave', 'mat leave'].includes(t)) return 'maternity';
  if (['paternity', 'paternity leave'].includes(t)) return 'paternity';
  return null;
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

export function parseIntentionRows(rows: string[][], mapping: IntentionMapping, existingNames: string[]): IntentionImportRow[] {
  const existing = new Set(existingNames.map(norm));
  const inFile = new Set<string>();
  return rows.map((row, i) => {
    const line = i + 2;
    const cell = (f: IntentionField) => {
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

    const leave = days(cell('leaveDays'));
    if (leave === null) errors.push(`Couldn't read whole year leave days "${cell('leaveDays')}"`);
    const leaveDays = leave === null || leave === 'blank' ? NO_DAYS : leave;

    let leaveType: LeaveType = 'lwop';
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

    if (errors.length || !employmentType || !workPreference) return { line, errors, notes };
    const draft: IntentionDraft = {
      name,
      employmentType,
      permanentMilliFte,
      workPreference,
      preferredDays,
      leaveDays,
      leaveType,
      gradePreferences,
    };
    const key = norm(name);
    if (inFile.has(key)) return { line, draft, errors, notes, skipReason: 'Repeated in this file' };
    inFile.add(key);
    return { line, draft, errors, notes, replaces: existing.has(key) };
  });
}

/** Best-guess mapping from header names; the user can change any of it. */
export function guessIntentionMapping(headers: string[]): IntentionMapping {
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
  const leaveType = find(/leave\s*type/);
  const leaveDays = find(/leave/);
  const grade1 = find(/grade.*1/, /1st.*grade/, /first.*grade/);
  const grade2 = find(/grade.*2/, /2nd.*grade/, /second.*grade/);
  const grade3 = find(/grade.*3/, /3rd.*grade/, /third.*grade/);
  const workPreference = find(/work\s*pref/, /full.*part/, /preference/);
  const preferredDays = find(/prefer.*days?/, /days/);
  const employmentType = find(/employment/, /status/, /^type$/, /contract/);
  const name = find(/^(staff\s*)?(full\s*)?name$/, /name/, /teacher/, /staff/);
  return { name, employmentType, permanentFte, workPreference, preferredDays, leaveDays, leaveType, grade1, grade2, grade3 };
}

/**
 * Downloadable template, built in code (never stored as a CSV file in the
 * repo) with obviously made-up example rows.
 */
export const INTENTION_TEMPLATE = {
  file: 'staff-intentions-template.csv',
  csv: [
    'Name,Employment Status,Permanent FTE,Work Preference,Preferred days,Whole year leave days,Leave type,Grade Preference 1,Grade Preference 2,Grade Preference 3',
    'Example Teacher,Permanent,1.0,Full time,Mon-Fri,,,K,1,2',
    'Example Part-timer,Permanent,1.0,Part time,Mon Tue Wed,Thu Fri,LWOP,3,4,',
    'Example Transition,TWT,0.6,Part time,Mon Tue Wed,,,5,6,',
    'Example Temp,Temporary,,Part time,Thu Fri,,,2,1,K',
  ].join('\r\n'),
} as const;
