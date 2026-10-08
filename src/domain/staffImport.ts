/**
 * Staff CSV import with a column-mapping step (PLAN.md "Import").
 *
 * The CSV layout is an open item, so nothing about columns is assumed: the
 * user maps columns to fields, and every row is previewed before saving.
 * Days worked come from either one text column ("Mon Tue Wed", "Mon-Wed")
 * or one yes/no column per weekday. Fortnightly patterns are set by hand
 * after import.
 */
import { FULL_TIME, WEEKDAYS, weeklyPattern, type DayPattern } from './dayPattern';
import type { EmploymentType, Staff } from './types';

export type ColumnIndex = number | null;

export type DaysMapping =
  | { kind: 'none' }
  | { kind: 'text'; column: ColumnIndex }
  | { kind: 'columns'; columns: ColumnIndex[] };

export interface StaffMapping {
  name: ColumnIndex;
  employmentType: ColumnIndex;
  currentRole: ColumnIndex;
  days: DaysMapping;
  /** Used when the employment type column is unmapped or blank. */
  defaultEmploymentType: EmploymentType;
}

export type StaffDraft = Pick<Staff, 'name' | 'employmentType' | 'currentRole' | 'workPattern'>;

export interface ImportRow {
  /** 1-based line number in the file, counting the header row. */
  line: number;
  draft?: StaffDraft;
  errors: string[];
  /** Rows that are valid but won't be imported (e.g. duplicates). */
  skipReason?: string;
}

const norm = (s: string) => s.trim().toLowerCase();

export function parseEmploymentType(text: string): EmploymentType | null {
  const t = norm(text).replace(/[\s_-]+/g, ' ');
  if (['permanent', 'perm', 'p', 'ongoing'].includes(t)) return 'permanent';
  if (['tpt', 'temporary part time', 'temp part time', 'part time temporary'].includes(t)) return 'tpt';
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

const TRUTHY = new Set(['y', 'yes', '1', 'x', 'true', '✓', '✔', 'tick']);
const FALSY = new Set(['', 'n', 'no', '0', 'false', '-']);

function parseDays(row: string[], mapping: DaysMapping): { pattern?: DayPattern; error?: string } {
  if (mapping.kind === 'none') return { pattern: FULL_TIME };
  if (mapping.kind === 'text') {
    const text = mapping.column === null ? '' : (row[mapping.column] ?? '');
    if (!text.trim()) return { error: 'Days worked is blank' };
    const week = parseDaysText(text);
    return week ? { pattern: weeklyPattern(week) } : { error: `Couldn't read days worked "${text}"` };
  }
  const week: boolean[] = [];
  for (const [i, column] of mapping.columns.entries()) {
    const value = column === null ? '' : norm(row[column] ?? '');
    if (TRUTHY.has(value)) week.push(true);
    else if (FALSY.has(value)) week.push(false);
    else return { error: `Couldn't read "${row[column!]}" for ${WEEKDAYS[i]}` };
  }
  if (!week.some(Boolean)) return { error: 'No days worked' };
  return { pattern: weeklyPattern(week) };
}

export function parseStaffRows(rows: string[][], mapping: StaffMapping, existingNames: string[]): ImportRow[] {
  const seen = new Set(existingNames.map(norm));
  const inFile = new Set<string>();
  return rows.map((row, i) => {
    const line = i + 2;
    const errors: string[] = [];
    const name = mapping.name === null ? '' : (row[mapping.name] ?? '').trim();
    if (!name) errors.push('Name is blank');

    const typeText = mapping.employmentType === null ? '' : (row[mapping.employmentType] ?? '');
    let employmentType = mapping.defaultEmploymentType;
    if (typeText.trim()) {
      const parsed = parseEmploymentType(typeText);
      if (parsed) employmentType = parsed;
      else errors.push(`Unknown employment type "${typeText.trim()}"`);
    }

    const { pattern, error } = parseDays(row, mapping.days);
    if (error) errors.push(error);

    const currentRole = mapping.currentRole === null ? '' : (row[mapping.currentRole] ?? '').trim();
    if (errors.length || !pattern) return { line, errors };

    const draft: StaffDraft = { name, employmentType, currentRole, workPattern: pattern };
    const key = norm(name);
    if (seen.has(key)) return { line, draft, errors, skipReason: 'Already in this plan' };
    if (inFile.has(key)) return { line, draft, errors, skipReason: 'Repeated in this file' };
    inFile.add(key);
    return { line, draft, errors };
  });
}

/** Best-guess mapping from header names; the user can change any of it. */
export function guessMapping(headers: string[]): StaffMapping {
  const h = headers.map(norm);
  const find = (...patterns: RegExp[]): ColumnIndex => {
    for (const p of patterns) {
      const i = h.findIndex((x) => p.test(x));
      if (i >= 0) return i;
    }
    return null;
  };
  const dayCols = ['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => find(new RegExp(`^${d}`)));
  const daysText = find(/days?\s*(worked)?$/, /work(ing)?\s*days/, /pattern/);
  return {
    name: find(/^(staff\s*)?(full\s*)?name$/, /name/, /teacher/, /staff/),
    employmentType: find(/employment/, /^type$/, /status/, /contract/),
    currentRole: find(/current\s*role/, /^role$/, /position/, /role/),
    days: dayCols.every((c) => c !== null)
      ? { kind: 'columns', columns: dayCols }
      : daysText !== null
        ? { kind: 'text', column: daysText }
        : { kind: 'none' },
    defaultEmploymentType: 'permanent',
  };
}
