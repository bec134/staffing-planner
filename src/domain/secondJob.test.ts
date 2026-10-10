import { describe, expect, it } from 'vitest';
import { clashDays } from './allocation';
import { FULL_TIME, dayIndices, weekdays } from './dayPattern';
import { actsUp, tidyHigherDuties, type HigherDutiesInput } from './higherDuties';
import { cellView, planAssign, type GridData } from './roleGrid';
import { planSecondJob } from './secondJob';
import type { Allocation, EntitlementPosition, Leave, PositionType, Staff } from './types';

const y = 'y1';
const year = { start: '2027-01-28', end: '2027-12-17' };
const type = (id: string, name: string, category: PositionType['category']): PositionType => ({ id, planningYearId: y, name, category, sortOrder: 0 });
const types = [type('t-class', 'Classroom Teacher', 'class_teacher'), type('t-ap', 'Assistant Principal', 'executive'), type('t-apci', 'Assistant Principal - Curriculum & Instruction', 'executive'), type('t-dp', 'Deputy Principal', 'executive')];
const position = (id: string, name: string, positionTypeId: string, days = FULL_TIME): EntitlementPosition => ({ id, planningYearId: y, name, positionTypeId, days, sortOrder: 0 });
const positions = [position('ap1', 'Assistant Principal 1', 't-ap'), position('class3', 'Classroom Teacher 3', 't-class'), position('class4', 'Classroom Teacher 4', 't-class')];
const person = (id: string, name: string, currentRole = 'Teacher'): Staff => ({ id, planningYearId: y, name, workPattern: FULL_TIME, currentRole, employmentType: 'permanent', preferences: '' });
const greta = person('greta', 'Greta Ellery', 'Assistant Principal');
const otto = person('otto', 'Otto Brandt');
const holdsAp: Allocation = { id: 'm-ap', planningYearId: y, staffId: 'greta', roleId: 'ap1', days: FULL_TIME };
const lwop: Leave = { id: 'lwop', planningYearId: y, staffId: 'greta', startDate: year.start, endDate: year.end, daysAffected: FULL_TIME, leaveType: 'lwop' };
const input = (over: Partial<HigherDutiesInput> = {}): HigherDutiesInput => ({
  planningYearId: y,
  year,
  staff: [greta, otto],
  positions,
  positionTypes: types,
  matches: [holdsAp],
  leave: [lwop],
  ...over,
});
let n = 0;
const newId = () => `id${++n}`;
const THU = [3, 8];

describe('planSecondJob', () => {
  it('matches someone on whole-year leave to another position as a second job', () => {
    const plan = planSecondJob(input(), 'greta', 'class3', THU, 'temporary', newId);
    if (!plan?.ok) throw new Error(JSON.stringify(plan));
    expect(plan.matchPut).toEqual([
      expect.objectContaining({ staffId: 'greta', roleId: 'class3', secondJobLeaveId: 'lwop', employmentType: 'temporary' }),
    ]);
    expect(dayIndices(plan.matchPut[0]!.days)).toEqual(THU);
    expect(plan.message).toBe(
      'Greta Ellery is on leave from Assistant Principal 1 on Thu. Match them to Classroom Teacher 3 on Thu as a second job (Temporary)?',
    );
    // Their own employment type isn't stored again.
    const same = planSecondJob(input(), 'greta', 'class3', THU, 'permanent', newId);
    expect(same?.ok && same.matchPut[0]!.employmentType).toBeUndefined();
  });

  it("doesn't apply when they're free, or matched and not on leave", () => {
    expect(planSecondJob(input({ matches: [] }), 'greta', 'class3', THU, 'temporary', newId)).toBeUndefined();
    expect(planSecondJob(input({ leave: [] }), 'greta', 'class3', THU, 'temporary', newId)).toBeUndefined();
    const termOnly = { ...lwop, endDate: '2027-04-09' };
    expect(planSecondJob(input({ leave: [termOnly] }), 'greta', 'class3', THU, 'temporary', newId)).toBeUndefined();
  });

  it('refuses a position someone else holds, but backfills one whose holder is on whole-year leave', () => {
    const ottoHolds: Allocation = { id: 'o', planningYearId: y, staffId: 'otto', roleId: 'class3', days: FULL_TIME };
    expect(planSecondJob(input({ matches: [holdsAp, ottoHolds] }), 'greta', 'class3', THU, 'temporary', newId)).toEqual({
      ok: false,
      error: 'Classroom Teacher 3 is already held by Otto Brandt on Thu',
    });
    const ottoLeave: Leave = { ...lwop, id: 'ol', staffId: 'otto', daysAffected: weekdays('Thu') };
    const plan = planSecondJob(input({ matches: [holdsAp, ottoHolds], leave: [lwop, ottoLeave] }), 'greta', 'class3', THU, 'temporary', newId);
    expect(plan).toMatchObject({ ok: true, matchPut: [expect.objectContaining({ coveringLeaveId: 'ol', secondJobLeaveId: 'lwop' })] });
  });

  it('shows on the grid without clashing or greying', () => {
    const plan = planSecondJob(input(), 'greta', 'class3', THU, 'temporary', newId);
    if (!plan?.ok) throw new Error('expected a plan');
    const job = plan.matchPut[0]!;
    expect(clashDays(holdsAp, job)).toEqual([]);
    const grid: GridData = { planningYearId: y, year, staff: [greta, otto], roles: positions, allocations: [holdsAp, job], leave: [lwop] };
    expect(cellView(positions[0]!, THU, grid).tiles.map((t) => t.kind)).toEqual(['on-leave']);
    expect(cellView(positions[1]!, THU, grid).tiles.map((t) => t.kind)).toEqual(['holder']);
    // Someone dropped on her second-job day can't treat it as leave to cover.
    expect(planAssign(grid, 'otto', 'class3', THU, newId).ok).toBe(false);
  });

  it('goes when the leave goes, and shrinks with it', () => {
    const plan = planSecondJob(input(), 'greta', 'class3', [1, 3, 6, 8], 'temporary', newId);
    if (!plan?.ok) throw new Error('expected a plan');
    const job = plan.matchPut[0]!;
    expect(tidyHigherDuties([holdsAp, job], [], []).matchDelete).toEqual([job.id]);
    const shorter = { ...lwop, daysAffected: weekdays('Mon', 'Tue') };
    expect(tidyHigherDuties([holdsAp, job], [shorter], []).matchPut.map((m) => dayIndices(m.days))).toEqual([[1, 6]]);
  });
});

describe('Part 2 second jobs', () => {
  const roles = [position('r-ap', 'AP K-2', 't-ap'), position('r-3', 'Year 3', 't-class')];
  const placed: Allocation = { ...holdsAp, id: 'a-ap', roleId: 'r-ap' };
  const grid: GridData = { planningYearId: y, year, staff: [greta, otto], roles, allocations: [placed], leave: [lwop] };

  it('places them on days their Part 1 second job covers, and nowhere else on leave', () => {
    const part2 = { ...grid, secondJobLeaveId: (staffId: string, d: number) => (staffId === 'greta' && THU.includes(d) ? 'lwop' : undefined) };
    expect(planAssign(part2, 'greta', 'r-3', THU, newId)).toMatchObject({
      ok: true,
      put: [expect.objectContaining({ roleId: 'r-3', secondJobLeaveId: 'lwop' })],
    });
    expect(planAssign(part2, 'greta', 'r-3', [0, 5], newId).ok).toBe(false);
    expect(planAssign(grid, 'greta', 'r-3', THU, newId).ok).toBe(false);
  });
});

describe('more than one substantive role', () => {
  it("doesn't label someone higher duties in a role they also hold", () => {
    const sarah = { currentRole: 'Teacher', otherRoles: ['Assistant Principal - Curriculum & Instruction'] };
    expect(actsUp(sarah, types[2])).toBe(false);
    expect(actsUp(sarah, types[3])).toBe(true);
    expect(actsUp({ currentRole: 'Teacher' }, types[2])).toBe(true);
  });
});
