/**
 * FICTIONAL sample data for development and demos.
 *
 * Every name here is invented. Never replace these with real staff names and
 * never commit real staff data to the repository (see CLAUDE.md).
 */
import { FULL_TIME, NO_DAYS, fortnightlyPattern, weekdays, type DayPattern } from '../domain/dayPattern';
import { defaultPositionTypeId, defaultPositionTypes } from '../domain/positionTypes';
import { defaultRules } from '../domain/classStructure';
import { positionsToCreate } from '../domain/matching';
import {
  GRADES,
  type Allocation,
  type ClassStructure,
  type Enrolment,
  type Entitlement,
  type EntitlementMatch,
  type Grade,
  type Leave,
  type PlanningYear,
  type Role,
  type Staff,
  type StaffIntention,
} from '../domain/types';
import type { PlanningYearSnapshot } from './repository';

export const SAMPLE_PLANNING_YEAR_ID = 'sample-2027';
const Y = SAMPLE_PLANNING_YEAR_ID;

export const positionTypeId = (name: string) => defaultPositionTypeId(Y, name);

export function buildSampleData(now = new Date().toISOString()): PlanningYearSnapshot {
  const planningYear: PlanningYear = {
    id: Y,
    year: 2027,
    schoolName: 'Wattle Creek Public School (fictional sample)',
    // Illustrative term dates for the sample only; schools enter their own.
    terms: [
      { start: '2027-01-28', end: '2027-04-09' },
      { start: '2027-04-27', end: '2027-07-02' },
      { start: '2027-07-20', end: '2027-09-24' },
      { start: '2027-10-12', end: '2027-12-17' },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const positionTypes = defaultPositionTypes(Y);

  // Fictional entitlement figures in milli-FTE (1000 = 1.0 FTE), with some
  // department-style decimals. Sized so the sample plan shows a mix of
  // balanced, under-allocated and within-tolerance position types.
  const lines: [string, number][] = [
    ['Principal', 1000],
    ['Classroom Teacher', 6000],
    ['Assistant Principal', 2000],
    ['Assistant Principal - Curriculum & Instruction', 1000],
    ['Deputy Principal', 1000],
    ['Teacher Librarian', 842],
    ['RFF Teacher', 1316],
    ['Executive Release Teacher', 400],
    ['QTSS Teacher', 526],
    ['Learning & Support Teacher', 600],
    ['EaLD Teacher', 200],
  ];
  const entitlement: Entitlement = {
    id: `${Y}-entitlement`,
    planningYearId: Y,
    totalMilliFte: lines.reduce((sum, [, milliFte]) => sum + milliFte, 0),
    lines: lines.map(([name, milliFte]) => ({ positionTypeId: positionTypeId(name), milliFte })),
  };

  const person = (
    n: number,
    name: string,
    currentRole: string,
    workPattern = FULL_TIME,
    employmentType: Staff['employmentType'] = 'permanent',
  ): Staff => ({
    id: `${Y}-staff-${String(n).padStart(2, '0')}`,
    planningYearId: Y,
    name,
    workPattern,
    currentRole,
    employmentType,
    preferences: '',
  });

  const staff: Staff[] = [
    person(1, 'Avery Quill', 'Deputy Principal'),
    person(2, 'Bodhi Marsh', 'Assistant Principal'),
    person(3, 'Casey Wren', 'Assistant Principal'),
    person(4, 'Dana Thistle', 'Assistant Principal - Curriculum & Instruction'),
    person(5, 'Eli Brookfield', 'Teacher'),
    person(6, 'Frankie Lowe', 'Teacher', weekdays('Mon', 'Tue', 'Wed'), 'permanent'),
    person(7, 'Gus Penrose', 'Teacher', weekdays('Wed', 'Thu', 'Fri'), 'permanent'),
    person(8, 'Harper Vale', 'Teacher', FULL_TIME, 'temporary'),
    person(9, 'Indi Calloway', 'Teacher'),
    person(10, 'Jules Fernhill', 'Teacher', FULL_TIME, 'temporary'),
    person(11, 'Kit Ashdown', 'Teacher'),
    person(12, 'Lou Merriweather', 'Teacher Librarian', weekdays('Mon', 'Tue', 'Wed', 'Thu')),
    // 0.5 FTE = 5 days per fortnight, so this needs a fortnightly pattern.
    person(
      13,
      'Morgan Pike',
      'Teacher',
      fortnightlyPattern([true, true, true, false, false], [true, true, false, false, false]),
      'temporary',
    ),
    person(14, 'Noor Haddon', 'Teacher', weekdays('Thu', 'Fri')),
    person(15, 'Oak Delaney', 'Teacher', weekdays('Mon'), 'twt'),
    // Temporary teacher employed to cover leave.
    person(16, 'Sam Ridley', 'Teacher', FULL_TIME, 'temporary'),
    // Part-time temporary teacher backfilling a whole-year leave without pay.
    person(17, 'Tara Quinlan', 'Teacher', weekdays('Thu', 'Fri'), 'twt'),
    person(18, 'Rowan Hale', 'Principal'),
  ];

  const role = (key: string, name: string, positionType: string, days: DayPattern, order: number): Role => ({
    id: `${Y}-role-${key}`,
    planningYearId: Y,
    name,
    positionTypeId: positionTypeId(positionType),
    days,
    sortOrder: order,
  });
  const roles: Role[] = [
    role('k-blue', 'K Blue', 'Classroom Teacher', FULL_TIME, 0),
    role('k-gold', 'K Gold', 'Classroom Teacher', FULL_TIME, 1),
    role('12-green', '1/2 Green', 'Classroom Teacher', FULL_TIME, 2),
    role('12-blue', '1/2 Blue', 'Classroom Teacher', FULL_TIME, 3),
    role('34-red', '3/4 Red', 'Classroom Teacher', FULL_TIME, 4),
    role('56-gold', '5/6 Gold', 'Classroom Teacher', FULL_TIME, 5),
    role('ap-es1-s1', 'AP Early Stage 1 & Stage 1', 'Assistant Principal', FULL_TIME, 6),
    role('ap-s2-s3', 'AP Stages 2 & 3', 'Assistant Principal', FULL_TIME, 7),
    role('apci', 'AP Curriculum & Instruction', 'Assistant Principal - Curriculum & Instruction', FULL_TIME, 8),
    role('dp', 'Deputy Principal', 'Deputy Principal', FULL_TIME, 9),
    role('principal', 'Principal', 'Principal', FULL_TIME, 16),
    role('library', 'Library', 'Teacher Librarian', weekdays('Mon', 'Tue', 'Wed', 'Thu'), 10),
    role('rff-1', 'RFF 1', 'RFF Teacher', FULL_TIME, 11),
    role('rff-2', 'RFF 2', 'RFF Teacher', weekdays('Wed'), 12),
    role('exec-release', 'Executive release', 'Executive Release Teacher', weekdays('Mon', 'Tue'), 13),
    role('las', 'Learning & Support', 'Learning & Support Teacher', weekdays('Wed', 'Thu', 'Fri'), 14),
    role('eald', 'EaLD', 'EaLD Teacher', weekdays('Mon'), 15),
  ];

  const staffId = (name: string) => staff.find((p) => p.name === name)!.id;
  let allocationNumber = 0;
  const allocate = (name: string, roleKey: string, days?: DayPattern): Allocation => {
    const person = staff.find((p) => p.name === name)!;
    return {
      id: `${Y}-alloc-${String(++allocationNumber).padStart(2, '0')}`,
      planningYearId: Y,
      staffId: staffId(name),
      roleId: `${Y}-role-${roleKey}`,
      days: days ?? person.workPattern,
    };
  };
  const allocations: Allocation[] = [
    allocate('Rowan Hale', 'principal'),
    allocate('Avery Quill', 'dp'),
    allocate('Bodhi Marsh', 'ap-es1-s1'),
    allocate('Casey Wren', 'ap-s2-s3'),
    allocate('Dana Thistle', 'apci'),
    allocate('Eli Brookfield', 'k-blue'),
    allocate('Harper Vale', 'k-gold'),
    allocate('Indi Calloway', '12-green'),
    // Job share: Frankie Mon–Wed, Gus Thu–Fri, with Gus on RFF on Wednesday.
    allocate('Frankie Lowe', '12-blue'),
    allocate('Gus Penrose', '12-blue', weekdays('Thu', 'Fri')),
    allocate('Gus Penrose', 'rff-2', weekdays('Wed')),
    allocate('Jules Fernhill', '34-red'),
    allocate('Kit Ashdown', '56-gold'),
    allocate('Lou Merriweather', 'library'),
    allocate('Morgan Pike', 'rff-1'),
    allocate('Noor Haddon', 'las', weekdays('Thu', 'Fri')),
    allocate('Oak Delaney', 'eald'),
  ];

  const leave: Leave[] = [
    // Term 2 long service leave, covered Mon–Wed only: Thu–Fri is a gap.
    {
      id: `${Y}-leave-01`,
      planningYearId: Y,
      staffId: staffId('Jules Fernhill'),
      startDate: '2027-04-27',
      endDate: '2027-07-02',
      daysAffected: FULL_TIME,
      leaveType: 'lsl',
    },
    // Two weeks of paternity leave in Term 3, fully covered.
    {
      id: `${Y}-leave-02`,
      planningYearId: Y,
      staffId: staffId('Kit Ashdown'),
      startDate: '2027-08-02',
      endDate: '2027-08-13',
      daysAffected: FULL_TIME,
      leaveType: 'paternity',
    },
    // Leave without pay 2 days a week for the whole school year (Term 1 start
    // to Term 4 end). Indi's Thu–Fri is covered all year by Tara (TWT).
    {
      id: `${Y}-leave-03`,
      planningYearId: Y,
      staffId: staffId('Indi Calloway'),
      startDate: '2027-01-28',
      endDate: '2027-12-17',
      daysAffected: weekdays('Thu', 'Fri'),
      leaveType: 'lwop',
    },
    // The same arrangement for Eli on Mon–Tue, with no cover yet.
    {
      id: `${Y}-leave-04`,
      planningYearId: Y,
      staffId: staffId('Eli Brookfield'),
      startDate: '2027-01-28',
      endDate: '2027-12-17',
      daysAffected: weekdays('Mon', 'Tue'),
      leaveType: 'lwop',
    },
  ];
  const cover = (
    roleKey: string,
    leaveId: string,
    days: DayPattern,
    startDate: string,
    endDate: string,
    coverer = 'Sam Ridley',
  ): Allocation => ({
    ...allocate(coverer, roleKey, days),
    coveringLeaveId: leaveId,
    startDate,
    endDate,
  });
  allocations.push(
    cover('34-red', `${Y}-leave-01`, weekdays('Mon', 'Tue', 'Wed'), '2027-04-27', '2027-07-02'),
    cover('56-gold', `${Y}-leave-02`, FULL_TIME, '2027-08-02', '2027-08-13'),
    cover('12-green', `${Y}-leave-03`, weekdays('Thu', 'Fri'), '2027-01-28', '2027-12-17', 'Tara Quinlan'),
  );

  // Fictional projected enrolments for 6 classes.
  const counts: Record<Grade, number> = { K: 40, '1': 30, '2': 16, '3': 15, '4': 15, '5': 14, '6': 16 };
  const enrolments: Enrolment[] = GRADES.map((g) => ({
    id: `${Y}-enrolment-${g}`,
    planningYearId: Y,
    grade: g,
    projectedCount: counts[g],
  }));
  // An accepted structure, renamed by hand to match the existing class roles.
  const klass = (name: string, roleKey: string, students: Partial<Record<Grade, number>>, sortOrder: number): ClassStructure => ({
    id: `${Y}-class-${roleKey}`,
    planningYearId: Y,
    name,
    students,
    sortOrder,
    roleId: `${Y}-role-${roleKey}`,
  });
  const classStructures: ClassStructure[] = [
    klass('K Blue', 'k-blue', { K: 20 }, 0),
    klass('K Gold', 'k-gold', { K: 20 }, 1),
    klass('1/2 Green', '12-green', { '1': 15, '2': 8 }, 2),
    klass('1/2 Blue', '12-blue', { '1': 15, '2': 8 }, 3),
    klass('3/4 Red', '34-red', { '3': 15, '4': 15 }, 4),
    klass('5/6 Gold', '56-gold', { '5': 14, '6': 16 }, 5),
  ];

  // Part 1: positions from the entitlement, and staff matched to them.
  let positionNumber = 0;
  const positions = positionsToCreate(entitlement, positionTypes, [], Y, () => `${Y}-pos-${String(++positionNumber).padStart(2, '0')}`);
  const position = (name: string) => positions.find((p) => p.name === name)!;
  // Part positions whose days are set to suit the staff available.
  position('RFF Teacher 2').days = fortnightlyPattern([false, false, true, true, false], [false, false, true, false, false]);
  position('Learning & Support Teacher 1').days = weekdays('Wed', 'Thu', 'Fri');
  let matchNumber = 0;
  const match = (name: string, positionName: string, days?: DayPattern): EntitlementMatch => ({
    id: `${Y}-match-${String(++matchNumber).padStart(2, '0')}`,
    planningYearId: Y,
    staffId: staffId(name),
    roleId: position(positionName).id,
    days: days ?? staff.find((p) => p.name === name)!.workPattern,
  });
  const matches: EntitlementMatch[] = [
    match('Rowan Hale', 'Principal 1'),
    match('Eli Brookfield', 'Classroom Teacher 1'),
    match('Harper Vale', 'Classroom Teacher 2'),
    match('Indi Calloway', 'Classroom Teacher 3'),
    match('Jules Fernhill', 'Classroom Teacher 4'),
    match('Kit Ashdown', 'Classroom Teacher 5'),
    match('Frankie Lowe', 'Classroom Teacher 6'),
    match('Gus Penrose', 'Classroom Teacher 6', weekdays('Thu', 'Fri')),
    match('Bodhi Marsh', 'Assistant Principal 1'),
    match('Casey Wren', 'Assistant Principal 2'),
    match('Dana Thistle', 'Assistant Principal - Curriculum & Instruction 1'),
    match('Avery Quill', 'Deputy Principal 1'),
    match('Lou Merriweather', 'Teacher Librarian 1'),
    match('Morgan Pike', 'RFF Teacher 1'),
    match('Gus Penrose', 'RFF Teacher 2', weekdays('Wed')),
    match('Noor Haddon', 'Learning & Support Teacher 1'),
    match('Oak Delaney', 'EaLD Teacher 1'),
    // Tara backfills Indi's whole-year LWOP (Thu–Fri). Eli's (Mon–Tue) is left open.
    {
      ...match('Tara Quinlan', 'Classroom Teacher 3', weekdays('Thu', 'Fri')),
      coveringLeaveId: `${Y}-leave-03`,
      startDate: '2027-01-28',
      endDate: '2027-12-17',
    },
  ];

  // Each person's details for next year, all applied to the plan. Jules
  // prefers K–2 but is placed on 3/4 Red, to show the grade flag.
  const intend = (
    name: string,
    opts: {
      fte?: number;
      preferred?: DayPattern;
      leave?: DayPattern;
      leaveType?: StaffIntention['leaveType'];
      grades?: Grade[];
    } = {},
  ): StaffIntention => {
    const p = staff.find((x) => x.name === name)!;
    const leaveDays = opts.leave ?? NO_DAYS;
    const preferredDays = opts.preferred ?? p.workPattern;
    return {
      id: `${Y}-intention-${p.id.slice(-2)}`,
      planningYearId: Y,
      name,
      staffId: p.id,
      employmentType: p.employmentType,
      permanentMilliFte: p.employmentType === 'temporary' ? undefined : (opts.fte ?? 1000),
      workPreference: leaveDays.days.some(Boolean) || preferredDays.days.some((d) => !d) ? 'part_time' : 'full_time',
      preferredDays,
      leaveDays,
      leaveType: opts.leaveType ?? 'lwop',
      gradePreferences: opts.grades ?? [],
    };
  };
  const intentions: StaffIntention[] = [
    intend('Rowan Hale'),
    intend('Avery Quill'),
    intend('Bodhi Marsh', { grades: ['K', '1', '2'] }),
    intend('Casey Wren', { grades: ['5', '6', '4'] }),
    intend('Dana Thistle'),
    intend('Eli Brookfield', { preferred: weekdays('Wed', 'Thu', 'Fri'), leave: weekdays('Mon', 'Tue'), grades: ['K', '1'] }),
    intend('Frankie Lowe', { fte: 600, grades: ['1', '2'] }),
    intend('Gus Penrose', { fte: 600, grades: ['2', '1', '3'] }),
    intend('Harper Vale', { grades: ['K'] }),
    intend('Indi Calloway', { preferred: weekdays('Mon', 'Tue', 'Wed'), leave: weekdays('Thu', 'Fri'), grades: ['1', '2'] }),
    intend('Jules Fernhill', { grades: ['K', '1', '2'] }),
    intend('Kit Ashdown', { grades: ['5', '6'] }),
    intend('Lou Merriweather', { fte: 800 }),
    intend('Morgan Pike'),
    intend('Noor Haddon', { fte: 400 }),
    intend('Oak Delaney', { fte: 200 }),
    intend('Sam Ridley', { grades: ['3', '4', '5'] }),
    intend('Tara Quinlan', { fte: 400, grades: ['1', '2'] }),
  ];

  return {
    planningYear,
    positionTypes,
    entitlements: [entitlement],
    staff,
    roles,
    allocations,
    leave,
    classStructures,
    enrolments,
    classRules: [{ ...defaultRules(Y), totalClasses: 6 }],
    positions,
    matches,
    intentions,
  };
}
