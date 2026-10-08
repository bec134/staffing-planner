/**
 * FICTIONAL sample data for development and demos.
 *
 * Every name here is invented. Never replace these with real staff names and
 * never commit real staff data to the repository (see CLAUDE.md).
 */
import { FULL_TIME, fortnightlyPattern, weekdays, type DayPattern } from '../domain/dayPattern';
import { defaultPositionTypeId, defaultPositionTypes } from '../domain/positionTypes';
import type { Allocation, Entitlement, PlanningYear, Role, Staff } from '../domain/types';
import type { PlanningYearSnapshot } from './repository';

export const SAMPLE_PLANNING_YEAR_ID = 'sample-2027';
const Y = SAMPLE_PLANNING_YEAR_ID;

export const positionTypeId = (name: string) => defaultPositionTypeId(Y, name);

export function buildSampleData(now = new Date().toISOString()): PlanningYearSnapshot {
  const planningYear: PlanningYear = {
    id: Y,
    year: 2027,
    schoolName: 'Wattle Creek Public School (fictional sample)',
    createdAt: now,
    updatedAt: now,
  };

  const positionTypes = defaultPositionTypes(Y);

  // Fictional entitlement figures in milli-FTE (1000 = 1.0 FTE), with some
  // department-style decimals. Sized so the sample plan shows a mix of
  // balanced, under-allocated and within-tolerance position types.
  const lines: [string, number][] = [
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
    person(5, 'Eli Brookfield', 'Classroom Teacher'),
    person(6, 'Frankie Lowe', 'Classroom Teacher', weekdays('Mon', 'Tue', 'Wed'), 'permanent'),
    person(7, 'Gus Penrose', 'Classroom Teacher', weekdays('Wed', 'Thu', 'Fri'), 'permanent'),
    person(8, 'Harper Vale', 'Classroom Teacher', FULL_TIME, 'temporary'),
    person(9, 'Indi Calloway', 'Classroom Teacher'),
    person(10, 'Jules Fernhill', 'Classroom Teacher', FULL_TIME, 'temporary'),
    person(11, 'Kit Ashdown', 'Classroom Teacher'),
    person(12, 'Lou Merriweather', 'Teacher Librarian', weekdays('Mon', 'Tue', 'Wed', 'Thu')),
    // 0.5 FTE = 5 days per fortnight, so this needs a fortnightly pattern.
    person(
      13,
      'Morgan Pike',
      'RFF Teacher',
      fortnightlyPattern([true, true, true, false, false], [true, true, false, false, false]),
      'temporary',
    ),
    person(14, 'Noor Haddon', 'Learning & Support Teacher', weekdays('Thu', 'Fri')),
    person(15, 'Oak Delaney', 'EaLD Teacher', weekdays('Mon'), 'tpt'),
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

  return {
    planningYear,
    positionTypes,
    entitlements: [entitlement],
    staff,
    roles,
    allocations,
    // Leave types are an open item; class structures, enrolments and rules
    // arrive in later phases.
    leave: [],
    classStructures: [],
    enrolments: [],
    classRules: [],
  };
}
