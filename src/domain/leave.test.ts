import { FULL_TIME, describePattern, fortnightlyPattern, weekdays, type DayPattern } from './dayPattern';
import { affectedRoles, availableCoverDays, coverGaps, validateCover, validateLeave } from './leave';
import type { Allocation, Leave, Role, Staff } from './types';

const person = (id: string, workPattern: DayPattern = FULL_TIME): Staff => ({
  id,
  planningYearId: 'y',
  name: `Person ${id}`,
  workPattern,
  currentRole: '',
  employmentType: 'permanent',
  preferences: '',
});
const role: Role = { id: 'cls', planningYearId: 'y', name: '3/4 Red', positionTypeId: 'pt', days: FULL_TIME, sortOrder: 0 };
let n = 0;
const alloc = (staffId: string, roleId: string, days: DayPattern, extra: Partial<Allocation> = {}): Allocation => ({
  id: `a${n++}`,
  planningYearId: 'y',
  staffId,
  roleId,
  days,
  ...extra,
});
const leave = (extra: Partial<Leave> = {}): Leave => ({
  id: 'L1',
  planningYearId: 'y',
  staffId: 'holder',
  startDate: '2027-04-28',
  endDate: '2027-07-02',
  daysAffected: FULL_TIME,
  leaveType: 'lsl',
  ...extra,
});
const T2 = { startDate: '2027-04-28', endDate: '2027-07-02' };

describe('affectedRoles', () => {
  it('lists the leave-taker’s own allocations on leave days, not cover they give', () => {
    const allocations = [
      alloc('holder', 'cls', weekdays('Mon', 'Tue', 'Wed')),
      alloc('holder', 'rff', weekdays('Thu')),
      alloc('holder', 'other', weekdays('Fri'), { coveringLeaveId: 'X' }),
    ];
    const affected = affectedRoles(leave({ daysAffected: weekdays('Tue', 'Wed', 'Thu') }), allocations);
    expect(affected.map((a) => [a.roleId, describePattern(a.days)])).toEqual([
      ['cls', 'Tue, Wed'],
      ['rff', 'Thu'],
    ]);
  });

  it('ignores allocations whose dates miss the leave', () => {
    const allocations = [alloc('holder', 'cls', FULL_TIME, { startDate: '2027-07-14', endDate: '2027-12-17' })];
    expect(affectedRoles(leave(), allocations)).toEqual([]);
  });
});

describe('coverGaps', () => {
  const held = alloc('holder', 'cls', FULL_TIME);

  it('is the whole leave when nobody covers', () => {
    expect(coverGaps(leave(), [held])).toEqual([
      { leaveId: 'L1', roleId: 'cls', days: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], range: { start: '2027-04-28', end: '2027-07-02' } },
    ]);
  });

  it('subtracts part-time and part-term cover', () => {
    const gaps = coverGaps(leave(), [
      held,
      alloc('c1', 'cls', weekdays('Mon', 'Tue', 'Wed'), { coveringLeaveId: 'L1', ...T2 }),
      alloc('c2', 'cls', weekdays('Thu', 'Fri'), { coveringLeaveId: 'L1', startDate: '2027-04-28', endDate: '2027-05-31' }),
    ]);
    expect(gaps).toEqual([
      { leaveId: 'L1', roleId: 'cls', days: [3, 4, 8, 9], range: { start: '2027-06-01', end: '2027-07-02' } },
    ]);
  });

  it('ignores cover for other leave or other roles', () => {
    const gaps = coverGaps(leave(), [
      held,
      alloc('c1', 'cls', FULL_TIME, { coveringLeaveId: 'OTHER', ...T2 }),
      alloc('c1', 'rff', FULL_TIME, { coveringLeaveId: 'L1', ...T2 }),
    ]);
    expect(gaps).toHaveLength(1);
  });
});

describe('availableCoverDays and validateCover', () => {
  const held = alloc('holder', 'cls', FULL_TIME);
  const holder = person('holder');
  const range = { start: '2027-04-28', end: '2027-07-02' };

  it('offers leave days the coverer works and is free on during the dates', () => {
    const coverer = person('c', weekdays('Mon', 'Tue', 'Wed', 'Thu'));
    const allocations = [
      held,
      alloc('c', 'rff', weekdays('Mon')), // full year, so busy every Monday
      alloc('c', 'other', weekdays('Tue'), { startDate: '2027-01-27', endDate: '2027-04-11' }), // Term 1 only
    ];
    expect(describePattern(availableCoverDays(leave(), coverer, 'cls', range, allocations, []))).toBe('Tue, Wed, Thu');
  });

  it('excludes days already covered and days the coverer is on leave', () => {
    const coverer = person('c');
    const allocations = [held, alloc('x', 'cls', weekdays('Mon'), { coveringLeaveId: 'L1', ...T2 })];
    const theirLeave = leave({ id: 'L2', staffId: 'c', daysAffected: weekdays('Fri'), startDate: '2027-06-01', endDate: '2027-06-30' });
    expect(describePattern(availableCoverDays(leave(), coverer, 'cls', range, allocations, [theirLeave]))).toBe('Tue, Wed, Thu');
  });

  it('accepts valid cover and explains invalid cover', () => {
    const coverer = person('c', weekdays('Mon', 'Tue', 'Wed'));
    const ok = { staffId: 'c', roleId: 'cls', days: weekdays('Mon', 'Tue'), ...T2 };
    expect(validateCover(ok, leave(), coverer, role, [held], [])).toEqual([]);

    expect(
      validateCover(
        { ...ok, days: weekdays('Wed', 'Thu'), startDate: '2027-04-01', endDate: '2027-07-02' },
        leave({ daysAffected: weekdays('Mon', 'Tue', 'Wed') }),
        coverer,
        role,
        [held],
        [],
      ),
    ).toEqual([
      'Cover must fall within the leave dates',
      "3/4 Red isn't left vacant by this leave on Thu",
      "Person c doesn't work Thu",
    ]);

    expect(validateCover(ok, leave(), holder, role, [held], [])).toContain("Someone can't cover their own leave");
    expect(validateCover({ ...ok, endDate: '2027-04-01' }, leave(), coverer, role, [held], [])).toEqual([
      'The end date must be on or after the start date',
    ]);
  });

  it('rejects double cover and clashes, but only when dates overlap', () => {
    const coverer = person('c');
    const allocations = [
      held,
      alloc('x', 'cls', weekdays('Mon'), { coveringLeaveId: 'L1', startDate: '2027-04-28', endDate: '2027-05-31' }),
      alloc('c', 'rff', weekdays('Tue'), { startDate: '2027-06-15', endDate: '2027-12-17' }),
    ];
    const cand = { staffId: 'c', roleId: 'cls', days: weekdays('Mon', 'Tue') };
    expect(validateCover({ ...cand, ...T2 }, leave(), coverer, role, allocations, [])).toEqual([
      'Person c already has a role on Tue during these dates',
      '3/4 Red is already covered on Mon during these dates',
    ]);
    expect(
      validateCover({ ...cand, startDate: '2027-06-01', endDate: '2027-06-14' }, leave(), coverer, role, allocations, []),
    ).toEqual([]);
  });
});

describe('validateLeave', () => {
  const staff = person('s', fortnightlyPattern([true, true, true, false, false], [true, true, false, false, false]));
  it('needs dates in order and days the person works', () => {
    expect(validateLeave({ startDate: '2027-05-01', endDate: '2027-05-31', daysAffected: staff.workPattern }, staff)).toEqual([]);
    expect(validateLeave({ startDate: '2027-05-31', endDate: '2027-05-01', daysAffected: weekdays('Wed') }, staff)).toEqual([
      'The end date must be on or after the start date',
      "Person s doesn't work Wed (B)",
    ]);
    expect(validateLeave({ startDate: '', endDate: '', daysAffected: weekdays() }, staff)).toEqual([
      'Enter start and end dates',
      'Choose at least one day of leave',
    ]);
  });
});
