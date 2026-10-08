import { availableDays, datesOverlap, roleFilledDays, staffBusyDays, unfilledDays, validateAllocation } from './allocation';
import { FULL_TIME, describePattern, fortnightlyPattern, weekdays, type DayPattern } from './dayPattern';
import type { Allocation, Role, Staff } from './types';

const staff = (id: string, workPattern: DayPattern): Staff => ({
  id,
  planningYearId: 'y',
  name: `Person ${id}`,
  workPattern,
  currentRole: '',
  employmentType: 'permanent',
  preferences: '',
});
const role = (id: string, days: DayPattern): Role => ({
  id,
  planningYearId: 'y',
  name: `Role ${id}`,
  positionTypeId: 'pt',
  days,
  sortOrder: 0,
});
let n = 0;
const alloc = (staffId: string, roleId: string, days: DayPattern, extra: Partial<Allocation> = {}): Allocation => ({
  id: `a${n++}`,
  planningYearId: 'y',
  staffId,
  roleId,
  days,
  ...extra,
});

describe('datesOverlap', () => {
  it('treats missing dates as the whole year', () => {
    expect(datesOverlap({}, {})).toBe(true);
    expect(datesOverlap({ startDate: '2027-01-01', endDate: '2027-06-30' }, {})).toBe(true);
  });
  it('compares date ranges inclusively', () => {
    const t1 = { startDate: '2027-01-27', endDate: '2027-04-11' };
    expect(datesOverlap(t1, { startDate: '2027-04-28', endDate: '2027-07-04' })).toBe(false);
    expect(datesOverlap(t1, { startDate: '2027-04-11', endDate: '2027-07-04' })).toBe(true);
  });
});

describe('allocation days', () => {
  const ft = staff('ft', FULL_TIME);
  const pt = staff('pt', weekdays('Mon', 'Tue', 'Wed'));
  const cls = role('cls', FULL_TIME);
  const rff = role('rff', weekdays('Wed', 'Thu'));

  it('offers only days the person works and the role runs', () => {
    expect(describePattern(availableDays(pt, rff, []))).toBe('Wed');
    expect(describePattern(availableDays(ft, rff, []))).toBe('Wed, Thu');
  });

  it('removes days the person already holds and days the role is filled', () => {
    const existing = [alloc('ft', 'rff', weekdays('Wed')), alloc('pt', 'cls', weekdays('Mon'))];
    expect(describePattern(availableDays(ft, cls, existing))).toBe('Tue, Thu, Fri');
    expect(describePattern(availableDays(pt, cls, existing))).toBe('Tue, Wed');
  });

  it('excludes the allocation being edited', () => {
    const own = alloc('pt', 'cls', weekdays('Mon', 'Tue'));
    expect(describePattern(availableDays(pt, cls, [own], own.id))).toBe('Mon, Tue, Wed');
  });

  it('ignores leave cover when working out filled role days', () => {
    const cover = alloc('ft', 'cls', FULL_TIME, { coveringLeaveId: 'l1' });
    expect(describePattern(roleFilledDays('cls', [cover]))).toBe('none');
    expect(describePattern(staffBusyDays('ft', [cover]))).toBe('Mon, Tue, Wed, Thu, Fri');
  });

  it('reports unfilled role days', () => {
    expect(describePattern(unfilledDays(cls, [alloc('pt', 'cls', weekdays('Mon', 'Tue', 'Wed'))]))).toBe('Thu, Fri');
  });

  it('handles fortnightly patterns', () => {
    const fortnightly = staff('f', fortnightlyPattern([true, true, true, false, false], [true, true, false, false, false]));
    expect(describePattern(availableDays(fortnightly, rff, []))).toBe('A: Wed · B: none');
  });
});

describe('validateAllocation', () => {
  const pt = staff('pt', weekdays('Mon', 'Tue', 'Wed'));
  const cls = role('cls', weekdays('Mon', 'Tue', 'Wed', 'Thu'));
  const candidate = (days: DayPattern) => ({ id: 'new', staffId: 'pt', roleId: 'cls', days });

  it('accepts a valid allocation', () => {
    expect(validateAllocation(candidate(weekdays('Mon', 'Tue')), pt, cls, [])).toEqual([]);
  });

  it('needs at least one day', () => {
    expect(validateAllocation(candidate(weekdays()), pt, cls, [])).toEqual(['Choose at least one day']);
  });

  it('rejects days the person does not work or the role does not run', () => {
    expect(validateAllocation(candidate(weekdays('Thu', 'Fri')), pt, cls, [])).toEqual([
      "Person pt doesn't work Thu, Fri",
      "Role cls doesn't run on Fri",
    ]);
  });

  it('rejects a second role on the same day, and an already-filled role day', () => {
    const existing = [alloc('pt', 'other', weekdays('Mon')), alloc('someone', 'cls', weekdays('Tue'))];
    expect(validateAllocation(candidate(weekdays('Mon', 'Tue', 'Wed')), pt, cls, existing)).toEqual([
      'Person pt already has another role on Mon',
      'Role cls is already filled on Tue',
    ]);
  });

  it('names fortnight weeks when only one week clashes', () => {
    const existing = [alloc('pt', 'other', fortnightlyPattern([true, false, false, false, false], [false, false, false, false, false]))];
    expect(validateAllocation(candidate(weekdays('Mon')), pt, cls, existing)).toEqual([
      'Person pt already has another role on Mon (A)',
    ]);
  });
});
