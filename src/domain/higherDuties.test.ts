import { describe, expect, it } from 'vitest';
import { clashDays } from './allocation';
import { FULL_TIME, dayIndices, weekdays } from './dayPattern';
import { coverGaps } from './leave';
import { planHigherDuties, seniority, tidyHigherDuties, type HigherDutiesInput } from './higherDuties';
import { cellView, planAssign, type GridData } from './roleGrid';
import type { Allocation, EntitlementPosition, PositionType, Staff } from './types';

const y = 'y1';
const type = (id: string, name: string, category: PositionType['category']): PositionType => ({ id, planningYearId: y, name, category, sortOrder: 0 });
const types = [
  type('t-class', 'Classroom Teacher', 'class_teacher'),
  type('t-apci', 'Assistant Principal - Curriculum & Instruction', 'executive'),
  type('t-ap', 'Assistant Principal', 'executive'),
  type('t-dp', 'Deputy Principal', 'executive'),
  type('t-p', 'Principal', 'executive'),
];
const person = (id: string, name: string, days = FULL_TIME): Staff => ({
  id,
  planningYearId: y,
  name,
  workPattern: days,
  currentRole: 'Teacher',
  employmentType: 'permanent',
  preferences: '',
});
const position = (id: string, name: string, positionTypeId: string, days = FULL_TIME): EntitlementPosition => ({
  id,
  planningYearId: y,
  name,
  positionTypeId,
  days,
  sortOrder: 0,
});
const mira = person('mira', 'Mira Fenwick', weekdays('Mon', 'Tue', 'Wed'));
const otto = person('otto', 'Otto Brandt');
const positions = [
  position('class3', 'Classroom Teacher 3', 't-class'),
  position('apci1', 'AP C&I 1', 't-apci'),
  position('ap1', 'Assistant Principal 1', 't-ap'),
  position('dp1', 'Deputy Principal 1', 't-dp'),
];
const year = { start: '2027-01-28', end: '2027-12-17' };
const substantive: Allocation = { id: 'm1', planningYearId: y, staffId: 'mira', roleId: 'class3', days: weekdays('Mon', 'Tue', 'Wed') };
const input = (over: Partial<HigherDutiesInput> = {}): HigherDutiesInput => ({
  planningYearId: y,
  year,
  staff: [mira, otto],
  positions,
  positionTypes: types,
  matches: [substantive],
  leave: [],
  ...over,
});
let n = 0;
const newId = () => `id${++n}`;
const WED = [2, 7];

describe('seniority', () => {
  it('ranks principal above deputy above assistant principals above everyone else', () => {
    expect(types.map(seniority)).toEqual([1, 2, 2, 3, 4]);
  });
});

describe('planHigherDuties', () => {
  it('steps a teacher up into an executive position for the whole year, freeing their own day', () => {
    const plan = planHigherDuties(input(), 'mira', 'apci1', WED, newId);
    expect(plan?.ok).toBe(true);
    if (!plan?.ok) return;
    const [leave] = plan.leavePut;
    expect(leave).toMatchObject({ staffId: 'mira', leaveType: 'higher_duties', higherDutiesPositionId: 'apci1', startDate: year.start, endDate: year.end });
    expect(dayIndices(leave!.daysAffected)).toEqual(WED);
    expect(plan.matchPut).toEqual([expect.objectContaining({ staffId: 'mira', roleId: 'apci1', higherDutiesLeaveId: leave!.id })]);
    expect(plan.message).toContain('Classroom Teacher 3 on Wed');
    expect(plan.message).toContain('AP C&I 1');
  });

  it('extends existing higher duties in the same position', () => {
    const first = planHigherDuties(input(), 'mira', 'apci1', WED, newId);
    if (!first?.ok) throw new Error('expected a plan');
    const next = planHigherDuties(input({ leave: first.leavePut, matches: [substantive, ...first.matchPut] }), 'mira', 'apci1', [1, 6], newId);
    if (!next?.ok) throw new Error('expected a plan');
    expect(next.leavePut[0]!.id).toBe(first.leavePut[0]!.id);
    expect(dayIndices(next.leavePut[0]!.daysAffected)).toEqual([1, 2, 6, 7]);
    expect(next.matchPut[0]!.id).toBe(first.matchPut[0]!.id);
  });

  it("doesn't apply to non-executive positions or days they're free", () => {
    expect(planHigherDuties(input({ matches: [] }), 'mira', 'apci1', WED, newId)).toBeUndefined();
    const other = position('class4', 'Classroom Teacher 4', 't-class');
    expect(planHigherDuties(input({ positions: [...positions, other] }), 'mira', 'class4', WED, newId)).toBeUndefined();
  });

  it('only lets people step up', () => {
    const asAp: Allocation = { ...substantive, roleId: 'ap1' };
    const sideways = planHigherDuties(input({ matches: [asAp] }), 'mira', 'apci1', WED, newId);
    expect(sideways).toEqual({ ok: false, error: expect.stringContaining('more senior role than Assistant Principal 1') });
    expect(planHigherDuties(input({ matches: [asAp] }), 'mira', 'dp1', WED, newId)?.ok).toBe(true);
  });

  it("refuses when the executive position is held or doesn't run then", () => {
    const held: Allocation = { id: 'o1', planningYearId: y, staffId: 'otto', roleId: 'apci1', days: FULL_TIME };
    expect(planHigherDuties(input({ matches: [substantive, held] }), 'mira', 'apci1', WED, newId)).toEqual({
      ok: false,
      error: 'AP C&I 1 is already held by Otto Brandt on Wed',
    });
    const monOnly = positions.map((p) => (p.id === 'apci1' ? { ...p, days: weekdays('Mon') } : p));
    expect(planHigherDuties(input({ positions: monOnly }), 'mira', 'apci1', WED, newId)).toEqual({ ok: false, error: "AP C&I 1 doesn't run on Wed" });
  });
});

describe('higher duties on the grid', () => {
  const plan = planHigherDuties(input(), 'mira', 'apci1', WED, newId);
  if (!plan?.ok) throw new Error('expected a plan');
  const hdLeave = plan.leavePut[0]!;
  const hdMatch = plan.matchPut[0]!;
  const grid: GridData = { planningYearId: y, year, staff: [mira, otto], roles: positions, allocations: [substantive, hdMatch], leave: [hdLeave] };

  it('greys their own day, but not the higher-duties one', () => {
    expect(cellView(positions[0]!, WED, grid).tiles.map((t) => t.kind)).toEqual(['on-leave']);
    expect(cellView(positions[1]!, WED, grid).tiles.map((t) => t.kind)).toEqual(['holder']);
  });

  it('lets someone backfill their own position, but not the higher-duties one', () => {
    const backfill = planAssign(grid, 'otto', 'class3', WED, newId);
    expect(backfill).toMatchObject({ ok: true, put: [expect.objectContaining({ coveringLeaveId: hdLeave.id })] });
    expect(planAssign(grid, 'otto', 'apci1', WED, newId)).toEqual({ ok: false, errors: ['AP C&I 1 is already held by Mira Fenwick on Wed'] });
  });

  it("doesn't count the two as a clash, or the higher-duties role as needing cover", () => {
    expect(clashDays(substantive, hdMatch)).toEqual([]);
    expect(clashDays(substantive, { days: substantive.days })).toEqual([0, 1, 2, 5, 6, 7]);
    expect(coverGaps(hdLeave, [substantive, hdMatch]).map((g) => g.roleId)).toEqual(['class3']);
  });

  it('Part 2: places them in an executive role on their higher-duties days', () => {
    const roles = [position('r-class', 'Year 3', 't-class'), position('r-apci', 'AP C&I', 't-apci')];
    const placed: Allocation = { ...substantive, id: 'a1', roleId: 'r-class' };
    const part2: GridData = { ...grid, roles, allocations: [placed], higherDutiesTypeIds: new Set(['t-apci', 't-ap', 't-dp', 't-p']) };
    const result = planAssign(part2, 'mira', 'r-apci', WED, newId);
    expect(result).toMatchObject({ ok: true, put: [expect.objectContaining({ roleId: 'r-apci', higherDutiesLeaveId: hdLeave.id })] });
    expect(planAssign(part2, 'mira', 'r-apci', [0, 5], newId)).toMatchObject({ ok: false, errors: ['Mira Fenwick already has another role on Mon'] });
    expect(planAssign({ ...part2, higherDutiesTypeIds: undefined }, 'mira', 'r-apci', WED, newId).ok).toBe(false);
  });
});

describe('tidyHigherDuties', () => {
  const plan = planHigherDuties(input(), 'mira', 'apci1', [1, 2, 6, 7], newId);
  if (!plan?.ok) throw new Error('expected a plan');
  const leave = plan.leavePut[0]!;
  const hdMatch = plan.matchPut[0]!;
  const backfill: Allocation = { id: 'b1', planningYearId: y, staffId: 'otto', roleId: 'class3', days: weekdays('Tue', 'Wed'), coveringLeaveId: leave.id, startDate: year.start, endDate: year.end };
  const cover: Allocation = { ...backfill, id: 'c1', roleId: 'r-class' };
  const part2Hd: Allocation = { id: 'h2', planningYearId: y, staffId: 'mira', roleId: 'r-apci', days: weekdays('Tue', 'Wed'), higherDutiesLeaveId: leave.id };

  it('does nothing when everything lines up', () => {
    expect(tidyHigherDuties([substantive, hdMatch, backfill], [leave], [cover, part2Hd])).toEqual({
      leavePut: [],
      leaveDelete: [],
      matchPut: [],
      matchDelete: [],
      allocationPut: [],
      allocationDelete: [],
    });
  });

  it('shrinks the leave, backfills and cover with the higher-duties match', () => {
    const wedOnly = { ...hdMatch, days: weekdays('Wed') };
    const out = tidyHigherDuties([substantive, wedOnly, backfill], [leave], [cover, part2Hd]);
    expect(out.leavePut.map((l) => dayIndices(l.daysAffected))).toEqual([WED]);
    expect(out.matchPut.map((m) => [m.id, dayIndices(m.days)])).toEqual([['b1', WED]]);
    expect(out.allocationPut.map((a) => [a.id, dayIndices(a.days)])).toEqual([
      ['c1', WED],
      ['h2', WED],
    ]);
  });

  it('removes the leave, backfills and cover when higher duties ends', () => {
    const out = tidyHigherDuties([substantive, backfill], [leave], [cover, part2Hd]);
    expect(out).toMatchObject({ leaveDelete: [leave.id], matchDelete: ['b1'], allocationDelete: ['c1', 'h2'] });
  });

  it('removes higher-duties matches whose leave was deleted', () => {
    expect(tidyHigherDuties([substantive, hdMatch], [], []).matchDelete).toEqual([hdMatch.id]);
  });
});

