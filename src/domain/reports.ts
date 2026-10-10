/**
 * Reports (Phase 7). Each report is built here as plain tables, so the
 * printed/PDF view and the Excel workbook show exactly the same thing.
 *
 * Reports (Bec): staffing summary; Part 1 matching (with nominated
 * transfers); Part 2 placement (grid, by staff, by role); leave cover;
 * class structures; staff and intentions.
 */
import { classGrades, classSize } from './classStructure';
import { formatDate, formatRange } from './dates';
import { FORTNIGHT_DAYS, WEEKDAYS, dayIndices, describeDayIndices, repeatsWeekly, type DayPattern } from './dayPattern';
import { summariseEntitlement } from './entitlement';
import { computeFlags, flagInputFrom } from './flags';
import { formatFte, milliFteOf } from './fte';
import { checkIntention, describeGrades, intentionForStaff, planApplyIntention, staffForIntention } from './intentions';
import { allocationRange, coverGaps, coversFor, leaveRange } from './leave';
import { MATCH_ORDER, isWholeYearLeave, matchStatus, schoolYear } from './matching';
import { actsUp } from './higherDuties';
import { cellView, type GridData, type Tile } from './roleGrid';
import {
  EMPLOYMENT_TYPE_LABELS,
  GRADES,
  GRADE_LABELS,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPE_SHORT,
  WORK_PREFERENCE_LABELS,
  type Allocation,
  type Leave,
  type PlanningYear,
  type PositionType,
  type Role,
  type Staff,
} from './types';
import type { PlanningYearSnapshot } from '../data/repository';

/** How a cell is coloured: employment type, leave, cover, gaps and so on. */
export type Tone =
  | 'permanent'
  | 'twt'
  | 'temporary'
  | 'holder'
  | 'leave'
  | 'cover'
  | 'gap'
  | 'off'
  | 'ok'
  | 'warn'
  | 'heading'
  | 'total';

export interface ReportCell {
  /** Lines are separated by "\n". */
  text: string;
  tone?: Tone;
}

export interface ReportTable {
  title: string;
  note?: string;
  columns: string[];
  /** A row with a single "heading" cell is a group heading spanning the table. */
  rows: ReportCell[][];
  /** Rows × weekdays grid: wider columns, wrapped text. */
  grid?: boolean;
  /** Shown instead of the table when there are no rows. */
  empty?: string;
}

export const REPORT_IDS = ['summary', 'matching', 'placement', 'leave', 'classes', 'staff'] as const;
export type ReportId = (typeof REPORT_IDS)[number];

export interface Report {
  id: ReportId;
  title: string;
  /** Short name for the Excel sheet tab (≤ 31 characters). */
  sheet: string;
  landscape?: boolean;
  tables: ReportTable[];
}

export interface ReportSet {
  planningYear: PlanningYear;
  /** e.g. "Wattle Creek Public School · 2027 staffing plan" */
  heading: string;
  /** ISO date the reports were produced. */
  printedOn: string;
  reports: Report[];
}

const c = (text: string | number, tone?: Tone): ReportCell => ({ text: String(text), tone });
const heading = (text: string): ReportCell[] => [c(text, 'heading')];
const daysText = (p: DayPattern) => describeDayIndices(dayIndices(p)) || 'none';
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
const bySort = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;

/** Day columns: Mon–Fri, or Week A and Week B when any pattern differs between them. */
function dayColumns(patterns: DayPattern[]): { labels: string[]; indices: number[][] } {
  const fortnightly = patterns.some((p) => !repeatsWeekly(p));
  if (!fortnightly) {
    return { labels: [...WEEKDAYS], indices: WEEKDAYS.map((_, d) => [d, d + WEEKDAYS.length]) };
  }
  return {
    labels: [...Array(FORTNIGHT_DAYS).keys()].map((i) => `${WEEKDAYS[i % WEEKDAYS.length]} ${i < WEEKDAYS.length ? 'A' : 'B'}`),
    indices: [...Array(FORTNIGHT_DAYS).keys()].map((i) => [i]),
  };
}

/**
 * Rows (roles or positions) × days, grouped by position type, as in the
 * on-screen grids. Part 1 colours holders by employment type (Bec).
 */
function gridTable(
  title: string,
  rows: Role[],
  data: GridData,
  positionTypes: PositionType[],
  part: 1 | 2,
): ReportTable {
  const staffById = new Map(data.staff.map((s) => [s.id, s]));
  const name = (id: string) => staffById.get(id)?.name ?? 'Deleted staff member';
  const cols = dayColumns([...rows.map((r) => r.days), ...data.allocations.map((a) => a.days), ...data.leave.map((l) => l.daysAffected)]);
  const coverWord = part === 1 ? 'Backfill' : 'Cover';
  const out: ReportCell[][] = [];

  for (const pt of [...positionTypes].sort(bySort)) {
    const hdTag = (t: Tile) =>
      (t.allocation.higherDutiesLeaveId || t.allocation.aboveSubstantive || actsUp(staffById.get(t.staffId), pt) ? ' (higher duties)' : '') +
      (t.allocation.secondJobLeaveId ? ' (second job)' : '');
    const group = rows.filter((r) => r.positionTypeId === pt.id).sort(bySort);
    if (!group.length) continue;
    out.push(heading(pt.name));
    for (const row of group) {
      const cells = cols.indices.map((indices): ReportCell => {
        const view = cellView(row, indices, data);
        if (!view.runs) return c('—', 'off');
        if (!view.tiles.length) return c(part === 1 ? 'Unmatched' : 'Unfilled', 'gap');
        const lines: string[] = [];
        let tone: Tone | undefined;
        let uncoveredLeave = false;
        for (const t of view.tiles) {
          if (t.kind === 'holder') {
            lines.push(`${name(t.staffId)}${hdTag(t)}`);
            tone ??= part === 1 ? (t.allocation.employmentType ?? staffById.get(t.staffId)?.employmentType) : 'holder';
          } else if (t.kind === 'on-leave') {
            const when = t.partYear && t.leave ? `, ${formatRange(leaveRange(t.leave))}` : '';
            lines.push(`${name(t.staffId)} (${t.leave ? LEAVE_TYPE_SHORT[t.leave.leaveType] : 'leave'}${when})`);
            tone ??= t.partYear ? 'holder' : 'leave';
            if (!t.partYear && !view.tiles.some((x) => x.kind === 'cover')) uncoveredLeave = true;
          } else {
            const range = allocationRange(t.allocation);
            const when = data.year && (range.start > data.year.start || range.end < data.year.end) ? `, ${formatRange(range)}` : '';
            lines.push(`${coverWord}: ${name(t.staffId)}${hdTag(t)}${when}`);
            tone ??= 'cover';
          }
        }
        if (uncoveredLeave) {
          lines.push(`No ${coverWord.toLowerCase()}`);
          tone = 'gap';
        }
        return c(lines.join('\n'), tone);
      });
      out.push([c(row.name), ...cells]);
    }
  }
  return {
    title,
    columns: [part === 1 ? 'Position' : 'Role', ...cols.labels],
    rows: out,
    grid: true,
    empty: part === 1 ? 'No positions yet.' : 'No roles yet.',
  };
}

function summaryReport(d: PlanningYearSnapshot): Report {
  const types = [...d.positionTypes].sort(bySort);
  const s = summariseEntitlement(d.entitlements[0], types, d.positions, d.matches);
  const fig = (n: number) => formatFte(n);
  const remaining = (n: number): ReportCell => c(fig(n), n < 0 ? 'gap' : n >= 100 ? 'warn' : 'ok');
  const flags = computeFlags(flagInputFrom(d));
  return {
    id: 'summary',
    title: 'Staffing summary',
    sheet: 'Summary',
    tables: [
      {
        title: 'Entitlement vs matched (Part 1)',
        note: 'Remaining: positive = still to match, negative = over the entitlement.',
        columns: ['Position type', 'Entitlement FTE', 'Matched FTE', 'Remaining FTE'],
        rows: [
          ...s.byPositionType
            .filter((r) => r.entitled || r.allocated)
            .map((r) => [c(r.positionType.name), c(fig(r.entitled)), c(fig(r.allocated)), remaining(r.remaining)]),
          [c('Total', 'total'), c(fig(s.total.entitled), 'total'), c(fig(s.total.allocated), 'total'), remaining(s.total.remaining)],
        ],
      },
      {
        title: `Warnings (${flags.length})`,
        columns: ['Warning'],
        rows: flags.map((f) => [c(f.message, 'warn')]),
        empty: 'No warnings.',
      },
    ],
  };
}

function matchingReport(d: PlanningYearSnapshot): Report {
  const year = schoolYear(d.planningYear);
  const wholeYearLeave = d.leave.filter((l) => isWholeYearLeave(l, year));
  const grid = gridTable(
    'Positions by day',
    d.positions,
    { planningYearId: d.planningYear.id, year, staff: d.staff, roles: d.positions, allocations: d.matches, leave: wholeYearLeave },
    d.positionTypes,
    1,
  );
  grid.note = 'Coloured by employment type: permanent, TWT, temporary. Grey = whole-year leave; green = backfill.';
  const statuses = d.staff
    .filter((s) => !s.nominatedForTransfer)
    .map((s) => matchStatus(s, d.matches))
    .filter((st) => dayIndices(st.unmatched).length > 0)
    .sort((a, b) => MATCH_ORDER.indexOf(a.staff.employmentType) - MATCH_ORDER.indexOf(b.staff.employmentType) || byName(a.staff, b.staff));
  return {
    id: 'matching',
    title: 'Part 1 · Entitlement matching',
    sheet: 'Part 1 matching',
    landscape: true,
    tables: [
      grid,
      {
        title: 'Not fully matched',
        columns: ['Name', 'Employment', 'Days worked', 'Unmatched days', 'Unmatched FTE'],
        rows: statuses.map((st) => [
          c(st.staff.name),
          c(EMPLOYMENT_TYPE_LABELS[st.staff.employmentType], st.staff.employmentType),
          c(daysText(st.staff.workPattern)),
          c(daysText(st.unmatched)),
          c(formatFte(st.workMilli - st.matchedMilli)),
        ]),
        empty: 'Everyone is fully matched.',
      },
      {
        title: 'Nominated for transfer',
        columns: ['Name', 'Employment', 'Days worked', 'FTE', 'Notes'],
        rows: d.staff
          .filter((s) => s.nominatedForTransfer)
          .sort(byName)
          .map((s) => [
            c(s.name),
            c(EMPLOYMENT_TYPE_LABELS[s.employmentType], s.employmentType),
            c(daysText(s.workPattern)),
            c(formatFte(milliFteOf(s.workPattern))),
            c(s.transferNotes ?? ''),
          ]),
        empty: 'No one is nominated for transfer.',
      },
    ],
  };
}

function placementReport(d: PlanningYearSnapshot): Report {
  const year = schoolYear(d.planningYear);
  const roleById = new Map(d.roles.map((r) => [r.id, r]));
  const staffById = new Map(d.staff.map((s) => [s.id, s]));
  const types = new Map(d.positionTypes.map((p) => [p.id, p]));
  const allocLine = (a: Allocation, who: string) => {
    const range = allocationRange(a);
    const partYear = range.start > year.start || range.end < year.end;
    const leave = a.coveringLeaveId ? d.leave.find((l) => l.id === a.coveringLeaveId) : undefined;
    const cover = a.coveringLeaveId ? ` (cover for ${leave ? (staffById.get(leave.staffId)?.name ?? 'leave') : 'leave'})` : '';
    const hd =
      (a.secondJobLeaveId ? ' (second job)' : '') +
      (a.higherDutiesLeaveId || actsUp(staffById.get(a.staffId), types.get(roleById.get(a.roleId)?.positionTypeId ?? ''))
        ? ' (higher duties)'
        : '');
    return `${who}: ${daysText(a.days)}${cover}${hd}${partYear ? `, ${formatRange(range)}` : ''}`;
  };
  return {
    id: 'placement',
    title: 'Part 2 · Placement',
    sheet: 'Part 2 placement',
    landscape: true,
    tables: [
      {
        ...gridTable(
          'Roles by day (whole year)',
          d.roles,
          { planningYearId: d.planningYear.id, year, staff: d.staff, roles: d.roles, allocations: d.allocations, leave: d.leave },
          d.positionTypes,
          2,
        ),
        note: 'Grey = on leave; green = cover. Part-year leave and cover show their dates.',
      },
      {
        title: 'By staff member',
        columns: ['Name', 'Employment', 'Days worked', 'FTE', 'Placed in', 'Grade preferences'],
        rows: [...d.staff].sort(byName).map((s) => {
          const mine = d.allocations.filter((a) => a.staffId === s.id);
          return [
            c(s.name),
            c(EMPLOYMENT_TYPE_LABELS[s.employmentType]),
            c(daysText(s.workPattern)),
            c(formatFte(milliFteOf(s.workPattern))),
            mine.length
              ? c(mine.map((a) => allocLine(a, roleById.get(a.roleId)?.name ?? 'Deleted role')).join('\n'))
              : c('Not placed', 'warn'),
            c(describeGrades(intentionForStaff(s, d.intentions)?.gradePreferences ?? [])),
          ];
        }),
        empty: 'No staff yet.',
      },
      {
        title: 'By role',
        columns: ['Role', 'Position type', 'Runs', 'FTE', 'Held by'],
        rows: [...d.roles]
          .sort((a, b) => (types.get(a.positionTypeId)?.sortOrder ?? 0) - (types.get(b.positionTypeId)?.sortOrder ?? 0) || bySort(a, b))
          .map((r) => {
            const held = d.allocations.filter((a) => a.roleId === r.id);
            return [
              c(r.name),
              c(types.get(r.positionTypeId)?.name ?? 'Deleted position type'),
              c(daysText(r.days)),
              c(formatFte(milliFteOf(r.days))),
              held.length
                ? c(held.map((a) => allocLine(a, staffById.get(a.staffId)?.name ?? 'Deleted staff member')).join('\n'))
                : c('Unfilled', 'gap'),
            ];
          }),
        empty: 'No roles yet.',
      },
    ],
  };
}

function leaveReport(d: PlanningYearSnapshot): Report {
  const staffById = new Map(d.staff.map((s) => [s.id, s]));
  const roleById = new Map(d.roles.map((r) => [r.id, r]));
  const name = (id: string) => staffById.get(id)?.name ?? 'Deleted staff member';
  const roleName = (id: string) => roleById.get(id)?.name ?? 'Deleted role';
  const year = schoolYear(d.planningYear);
  const rows = [...d.leave]
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || name(a.staffId).localeCompare(name(b.staffId)))
    .map((l: Leave) => {
      const covers = coversFor(l.id, d.allocations);
      const gaps = coverGaps(l, d.allocations);
      const backfills = d.matches.filter((m) => m.coveringLeaveId === l.id);
      return [
        c(name(l.staffId)),
        c(LEAVE_TYPE_LABELS[l.leaveType]),
        c(`${formatRange(leaveRange(l))}${isWholeYearLeave(l, year) ? ' (whole year)' : ''}`),
        c(`${daysText(l.daysAffected)} (${formatFte(milliFteOf(l.daysAffected))} FTE)`),
        covers.length
          ? c(covers.map((a) => `${name(a.staffId)}: ${roleName(a.roleId)}, ${daysText(a.days)}, ${formatRange(allocationRange(a))}`).join('\n'), 'cover')
          : c('None'),
        gaps.length
          ? c(gaps.map((g) => `${roleName(g.roleId)}: ${describeDayIndices(g.days)}, ${formatRange(g.range)}`).join('\n'), 'gap')
          : c('Fully covered', 'ok'),
        c(backfills.map((m) => `${name(m.staffId)}: ${daysText(m.days)}`).join('\n')),
      ];
    });
  return {
    id: 'leave',
    title: 'Leave cover summary',
    sheet: 'Leave cover',
    landscape: true,
    tables: [
      {
        title: 'Leave and cover',
        columns: ['Staff member', 'Leave type', 'Dates', 'Days on leave', 'Cover (Part 2)', 'Not covered', 'Backfill (Part 1)'],
        rows,
        empty: 'No leave recorded.',
      },
    ],
  };
}

function classesReport(d: PlanningYearSnapshot): Report {
  const staffById = new Map(d.staff.map((s) => [s.id, s]));
  const teachers = (roleId: string | undefined) =>
    roleId
      ? d.allocations
          .filter((a) => a.roleId === roleId)
          .map((a) => `${staffById.get(a.staffId)?.name ?? 'Deleted staff member'}${a.coveringLeaveId ? ' (cover)' : ''}: ${daysText(a.days)}`)
          .join('\n')
      : '';
  const classes = [...d.classStructures].sort(bySort);
  const placed = (g: (typeof GRADES)[number]) => classes.reduce((n, k) => n + (k.students[g] ?? 0), 0);
  return {
    id: 'classes',
    title: 'Class structure summary',
    sheet: 'Class structures',
    tables: [
      {
        title: 'Classes',
        columns: ['Class', 'Grades', 'Students by grade', 'Total', 'Teacher(s)'],
        rows: [
          ...classes.map((k) => {
            const grades = classGrades(k);
            const t = teachers(k.roleId);
            return [
              c(k.name),
              c(grades.map((g) => (g === 'K' ? 'K' : `Y${g}`)).join('/')),
              c(grades.map((g) => `${GRADE_LABELS[g]}: ${k.students[g]}`).join('\n')),
              c(classSize(k)),
              t ? c(t) : c(k.roleId ? 'No teacher placed' : 'No role linked', 'warn'),
            ];
          }),
          [c('Total', 'total'), c('', 'total'), c('', 'total'), c(classes.reduce((n, k) => n + classSize(k), 0), 'total'), c('', 'total')],
        ],
        empty: 'No class structure accepted yet.',
      },
      {
        title: 'Enrolments by grade',
        columns: ['Grade', 'Projected students', 'Placed in classes'],
        rows: GRADES.map((g) => {
          const projected = d.enrolments.find((e) => e.grade === g)?.projectedCount ?? 0;
          return [c(GRADE_LABELS[g]), c(projected), c(placed(g), placed(g) === projected ? undefined : 'warn')];
        }),
      },
    ],
  };
}

function staffReport(d: PlanningYearSnapshot): Report {
  const year = schoolYear(d.planningYear);
  const ctx = { planningYearId: d.planningYear.id, year, staff: d.staff, leave: d.leave, allocations: d.allocations, matches: d.matches };
  const intentionCells = (s: Staff | undefined, i: (typeof d.intentions)[number] | undefined): ReportCell[] => {
    if (!i) return [c(''), c(''), c(''), c(''), c(''), c('No details for next year', s ? 'warn' : undefined)];
    const check = checkIntention(i);
    const plan = check.errors.length ? undefined : planApplyIntention(i, ctx, () => 'report');
    const status = check.errors.length
      ? c(check.errors.join('\n'), 'gap')
      : plan!.changes.length
        ? c(`Not applied: ${plan!.changes.join('; ')}`, 'warn')
        : c(check.warnings.length ? `Up to date. ${check.warnings.join('; ')}` : 'Up to date', check.warnings.length ? 'warn' : 'ok');
    return [
      c(i.permanentMilliFte !== undefined ? formatFte(i.permanentMilliFte) : ''),
      c(WORK_PREFERENCE_LABELS[i.workPreference]),
      c(daysText(i.preferredDays)),
      c(i.leaveDays.days.some(Boolean) ? `${daysText(i.leaveDays)} (${LEAVE_TYPE_SHORT[i.leaveType]})` : ''),
      c(describeGrades(i.gradePreferences)),
      status,
    ];
  };
  const rows = [...d.staff].sort(byName).map((s) => [
    c(s.name),
    c(EMPLOYMENT_TYPE_LABELS[s.employmentType], s.employmentType),
    c(daysText(s.workPattern)),
    c(formatFte(milliFteOf(s.workPattern))),
    c(s.currentRole),
    c(s.nominatedForTransfer ? `Nominated${s.transferNotes ? `: ${s.transferNotes}` : ''}` : ''),
    ...intentionCells(s, intentionForStaff(s, d.intentions)),
  ]);
  // Details saved for people not in the plan yet (not yet applied).
  for (const i of [...d.intentions].sort(byName).filter((i) => !staffForIntention(i, d.staff))) {
    rows.push([c(i.name), c(EMPLOYMENT_TYPE_LABELS[i.employmentType], i.employmentType), c('Not in the plan yet', 'warn'), c(''), c(''), c(''), ...intentionCells(undefined, i)]);
  }
  return {
    id: 'staff',
    title: 'Staff',
    sheet: 'Staff',
    landscape: true,
    tables: [
      {
        title: 'Staff',
        columns: [
          'Name',
          'Employment',
          'Days worked',
          'FTE',
          'Substantive role',
          'Transfer',
          'Permanent FTE',
          'Work preference',
          'Preferred days',
          'Whole year leave',
          'Grade preferences',
          'Details applied',
        ],
        rows,
        empty: 'No staff yet.',
      },
    ],
  };
}

/** Every report for a plan. */
export function buildReports(d: PlanningYearSnapshot, today: string): ReportSet {
  return {
    planningYear: d.planningYear,
    heading: `${d.planningYear.schoolName} · ${d.planningYear.year} staffing plan`,
    printedOn: today,
    reports: [summaryReport(d), matchingReport(d), placementReport(d), leaveReport(d), classesReport(d), staffReport(d)],
  };
}

export const printedLine = (set: ReportSet) => `Produced ${formatDate(set.printedOn)}`;
