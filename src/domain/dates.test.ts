import { addDays, containsDate, daysBetween, formatDate, formatRange, intersectRange, isIsoDate, subtractRanges } from './dates';

describe('dates', () => {
  it('validates ISO dates', () => {
    expect(isIsoDate('2027-02-28')).toBe(true);
    expect(isIsoDate('2027-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('28/02/2027')).toBe(false);
  });

  it('adds days across months and years', () => {
    expect(addDays('2027-01-31', 1)).toBe('2027-02-01');
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(daysBetween('2027-01-01', '2027-12-31')).toBe(364);
  });

  it('intersects ranges', () => {
    expect(intersectRange({ start: '2027-01-01', end: '2027-06-30' }, { start: '2027-04-01', end: '2027-12-31' })).toEqual({
      start: '2027-04-01',
      end: '2027-06-30',
    });
    expect(intersectRange({ start: '2027-01-01', end: '2027-01-31' }, { start: '2027-02-01', end: '2027-02-28' })).toBeNull();
    expect(containsDate({ start: '2027-01-01', end: '2027-01-31' }, '2027-01-31')).toBe(true);
  });

  it('subtracts ranges, leaving the uncovered pieces', () => {
    const term = { start: '2027-04-28', end: '2027-07-02' };
    expect(subtractRanges(term, [])).toEqual([term]);
    expect(subtractRanges(term, [{ start: '2027-05-10', end: '2027-05-21' }])).toEqual([
      { start: '2027-04-28', end: '2027-05-09' },
      { start: '2027-05-22', end: '2027-07-02' },
    ]);
    expect(subtractRanges(term, [{ start: '2027-01-01', end: '2027-12-31' }])).toEqual([]);
    expect(
      subtractRanges(term, [
        { start: '2027-04-28', end: '2027-05-31' },
        { start: '2027-06-01', end: '2027-07-02' },
      ]),
    ).toEqual([]);
  });

  it('formats dates and ranges', () => {
    expect(formatDate('2027-04-28')).toBe('28 Apr 2027');
    expect(formatRange({ start: '2027-04-28', end: '2027-07-02' })).toBe('28 Apr – 2 Jul 2027');
    expect(formatRange({ start: '2027-12-01', end: '2028-01-31' })).toBe('1 Dec 2027 – 31 Jan 2028');
    expect(formatRange({ start: '2027-05-03', end: '2027-05-03' })).toBe('3 May 2027');
  });
});
