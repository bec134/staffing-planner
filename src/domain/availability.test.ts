import { describe, expect, it } from 'vitest';
import { part2Availability } from './availability';
import { FULL_TIME, dayIndices, weekdays } from './dayPattern';
import { planAssign, planFill, type GridData } from './roleGrid';
import type { Allocation, Leave, Role, Staff } from './types';

const y = 'y1';
const year = { start: '2027-01-28', end: '2027-12-17' };
const person = (id: string, name: string): Staff => ({ id, planningYearId: y, name, workPattern: FULL_TIME, currentRole: 'Teacher', employmentType: 'permanent', preferences: '' });
const greta = person('greta', 'Greta Ellery');
const olive = person('olive', 'Olive Daintree');
const leave = (id: string, staffId: string, days = FULL_TIME, leaveType: Leave['leaveType'] = 'lwop', endDate = year.end): Leave => ({ id, planningYearId: y, staffId, startDate: year.start, endDate, daysAffected: days, leaveType });
const role = (id: string, name: string): Role => ({ id, planningYearId: y, name, positionTypeId: 't-class', days: FULL_TIME, sortOrder: 0 });
const days = (p: { days: readonly boolean[] }) => dayIndices(p as never);

describe('part2Availability', () => {
  it('leaves out whole-year leave days', () => {
    const a = part2Availability(olive, [], [leave('l1', 'olive', weekdays('Wed', 'Thu', 'Fri'))], [], year);
    expect(days(a.working)).toEqual(days(weekdays('Mon', 'Tue')));
    expect(days(a.free)).toEqual(days(weekdays('Mon', 'Tue')));
  });

  it('adds back second-job days', () => {
    const job = { id: 'm', planningYearId: y, staffId: 'greta', roleId: 'p', days: weekdays('Wed'), secondJobLeaveId: 'l1' };
    const a = part2Availability(greta, [], [leave('l1', 'greta')], [job], year);
    expect(days(a.working)).toEqual(days(weekdays('Wed')));
  });

  it("doesn't count a role they're on leave from as placed, but does count higher duties", () => {
    const holds: Allocation = { id: 'a', planningYearId: y, staffId: 'olive', roleId: 'r1', days: FULL_TIME };
    const a = part2Availability(olive, [holds], [leave('l1', 'olive', weekdays('Wed', 'Thu', 'Fri'))], [], year);
    expect(days(a.free)).toEqual([]); // Mon–Tue placed; Wed–Fri on leave
    const hd = leave('hd', 'olive', weekdays('Wed'), 'higher_duties');
    const b = part2Availability(olive, [{ ...holds, days: weekdays('Mon', 'Tue', 'Wed', 'Thu', 'Fri') }], [hd], [], year);
    expect(days(b.working)).toEqual(days(FULL_TIME));
    expect(days(b.free)).toEqual(days(weekdays('Wed')));
  });

  it('uses the days they are matched in Part 1, less leave', () => {
    const m = (days: ReturnType<typeof weekdays>, extra = {}) => ({ id: `m${Math.random()}`, planningYearId: y, staffId: 'olive', roleId: 'p', days, ...extra });
    // Works Mon–Fri but only matched Mon–Wed, with LWOP Wed.
    const a = part2Availability(olive, [], [leave('l1', 'olive', weekdays('Wed'))], [m(weekdays('Mon', 'Tue', 'Wed'))], year);
    expect(days(a.working)).toEqual(days(weekdays('Mon', 'Tue')));
    // A backfill they do elsewhere counts.
    const b = part2Availability(olive, [], [], [m(weekdays('Mon')), m(weekdays('Fri'), { coveringLeaveId: 'x' })], year);
    expect(days(b.working)).toEqual(days(weekdays('Mon', 'Fri')));
    // Higher duties: own position on leave Wed, but the higher-duties match Wed is worked.
    const hd = leave('hd', 'olive', weekdays('Wed'), 'higher_duties');
    const c = part2Availability(olive, [], [hd], [m(weekdays('Mon', 'Tue', 'Wed')), m(weekdays('Wed'), { higherDutiesLeaveId: 'hd' })], year);
    expect(days(c.working)).toEqual(days(weekdays('Mon', 'Tue', 'Wed')));
  });

  it('ignores part-year leave', () => {
    const a = part2Availability(olive, [], [leave('l1', 'olive', FULL_TIME, 'lsl', '2027-04-09')], [], year);
    expect(days(a.working)).toEqual(days(FULL_TIME));
  });
});

describe('placing in Part 2 on leave days', () => {
  const grid: GridData = {
    planningYearId: y,
    year,
    staff: [olive],
    roles: [role('r1', 'Year 3')],
    allocations: [],
    leave: [leave('l1', 'olive', weekdays('Wed', 'Thu', 'Fri'))],
    offDays: () => weekdays('Wed', 'Thu', 'Fri'),
  };
  let n = 0;
  const newId = () => `id${++n}`;

  it('refuses leave days and fills only working days', () => {
    expect(planAssign(grid, 'olive', 'r1', [2, 7], newId)).toEqual({ ok: false, errors: ['Olive Daintree is on whole-year leave on Wed'] });
    const filled = planFill(grid, 'olive', 'r1', newId);
    expect(filled.ok && days(filled.put[0]!.days)).toEqual(days(weekdays('Mon', 'Tue')));
  });
});
