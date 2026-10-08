/**
 * FICTIONAL sample data for development and demos.
 *
 * Every name here is invented. Never replace these with real staff names and
 * never commit real staff data to the repository (see CLAUDE.md).
 */
import { FULL_TIME, fortnightlyPattern, weekdays } from '../domain/dayPattern';
import type {
  Entitlement,
  PlanningYear,
  PositionCategory,
  PositionType,
  Staff,
} from '../domain/types';
import type { PlanningYearSnapshot } from './repository';

export const SAMPLE_PLANNING_YEAR_ID = 'sample-2027';
const Y = SAMPLE_PLANNING_YEAR_ID;

/** Position types supplied by Bec; used for entitlement and as allocatable roles. */
export const DEFAULT_POSITION_TYPES: readonly { name: string; category: PositionCategory }[] = [
  { name: 'Classroom Teacher', category: 'class_teacher' },
  { name: 'Assistant Principal', category: 'executive' },
  { name: 'Assistant Principal - Curriculum & Instruction', category: 'executive' },
  { name: 'Deputy Principal', category: 'executive' },
  { name: 'Teacher Librarian', category: 'other_teaching' },
  { name: 'RFF Teacher', category: 'other_teaching' },
  { name: 'Executive Release Teacher', category: 'other_teaching' },
  { name: 'QTSS Teacher', category: 'other_teaching' },
  { name: 'Learning & Support Teacher', category: 'other_teaching' },
  { name: 'EaLD Teacher', category: 'other_teaching' },
];

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const positionTypeId = (name: string) => `${Y}-pt-${slug(name)}`;

export function buildSampleData(now = new Date().toISOString()): PlanningYearSnapshot {
  const planningYear: PlanningYear = {
    id: Y,
    year: 2027,
    schoolName: 'Wattle Creek Public School (fictional sample)',
    createdAt: now,
    updatedAt: now,
  };

  const positionTypes: PositionType[] = DEFAULT_POSITION_TYPES.map((pt, i) => ({
    id: positionTypeId(pt.name),
    planningYearId: Y,
    name: pt.name,
    category: pt.category,
    sortOrder: i,
  }));

  // Fictional entitlement figures, in fortnight days (10 days = 1.0 FTE).
  const lines: [string, number][] = [
    ['Classroom Teacher', 120],
    ['Assistant Principal', 30],
    ['Assistant Principal - Curriculum & Instruction', 10],
    ['Deputy Principal', 10],
    ['Teacher Librarian', 8],
    ['RFF Teacher', 22],
    ['Executive Release Teacher', 4],
    ['QTSS Teacher', 6],
    ['Learning & Support Teacher', 10],
    ['EaLD Teacher', 4],
  ];
  const entitlement: Entitlement = {
    id: `${Y}-entitlement`,
    planningYearId: Y,
    totalFortnightDays: lines.reduce((sum, [, days]) => sum + days, 0),
    lines: lines.map(([name, fortnightDays]) => ({ positionTypeId: positionTypeId(name), fortnightDays })),
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
