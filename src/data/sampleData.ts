/**
 * FICTIONAL sample data for development and demos.
 *
 * Every name here is invented. Never replace these with real staff names and
 * never commit real staff data to the repository (see CLAUDE.md).
 */
import { FULL_TIME, fortnightlyPattern, weekdays } from '../domain/dayPattern';
import { defaultPositionTypeId, defaultPositionTypes } from '../domain/positionTypes';
import type { Entitlement, PlanningYear, Staff } from '../domain/types';
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
  // department-style decimals.
  const lines: [string, number][] = [
    ['Classroom Teacher', 12000],
    ['Assistant Principal', 3000],
    ['Assistant Principal - Curriculum & Instruction', 1000],
    ['Deputy Principal', 1000],
    ['Teacher Librarian', 842],
    ['RFF Teacher', 2316],
    ['Executive Release Teacher', 400],
    ['QTSS Teacher', 526],
    ['Learning & Support Teacher', 1000],
    ['EaLD Teacher', 400],
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

  return {
    planningYear,
    positionTypes,
    entitlements: [entitlement],
    staff,
    // Leave types are an open item, and allocations, class structures,
    // enrolments and rules arrive in later phases.
    leave: [],
    allocations: [],
    classStructures: [],
    enrolments: [],
    classRules: [],
  };
}
