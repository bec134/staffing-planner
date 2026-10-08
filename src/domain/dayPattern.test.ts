import {
  FULL_TIME,
  NO_DAYS,
  countDays,
  dayIndices,
  describePattern,
  fortnightlyPattern,
  fteOf,
  isValidPattern,
  isWithin,
  overlaps,
  weekdays,
  weeklyPattern,
} from './dayPattern';

const T = true;
const F = false;

describe('day patterns', () => {
  it('stores a weekly pattern as the same week repeated', () => {
    const p = weekdays('Mon', 'Wed');
    expect(p.days).toEqual([T, F, T, F, F, T, F, T, F, F]);
    expect(isValidPattern(p)).toBe(true);
  });

  it('derives FTE from days: weekly 1 day = 0.2', () => {
    expect(fteOf(FULL_TIME)).toBe(1);
    expect(fteOf(NO_DAYS)).toBe(0);
    expect(fteOf(weekdays('Mon'))).toBe(0.2);
    expect(fteOf(weekdays('Mon', 'Tue', 'Wed'))).toBe(0.6);
  });

  it('derives FTE from days: fortnightly 1 day = 0.1', () => {
    // 0.5 FTE = 5 days per fortnight
    const p = fortnightlyPattern([T, T, T, F, F], [T, T, F, F, F]);
    expect(countDays(p)).toBe(5);
    expect(fteOf(p)).toBe(0.5);
    expect(fteOf(fortnightlyPattern([T, F, F, F, F], [F, F, F, F, F]))).toBe(0.1);
  });

  it('rejects malformed weeks', () => {
    expect(() => weeklyPattern([T, T])).toThrow();
    expect(() => fortnightlyPattern([T, T, T, T, T], [T])).toThrow();
  });

  it('flags a "weekly" pattern whose weeks differ as invalid', () => {
    expect(isValidPattern({ mode: 'weekly', days: [T, F, F, F, F, F, F, F, F, F] })).toBe(false);
    expect(isValidPattern({ mode: 'fortnightly', days: [T, F, F, F, F, F, F, F, F, F] })).toBe(true);
    expect(isValidPattern({ mode: 'fortnightly', days: [T] })).toBe(false);
  });

  it('detects overlapping days, including across Week A/B', () => {
    expect(overlaps(weekdays('Mon'), weekdays('Tue'))).toBe(false);
    expect(overlaps(weekdays('Mon', 'Tue'), weekdays('Tue'))).toBe(true);
    const weekBMonOnly = fortnightlyPattern([F, F, F, F, F], [T, F, F, F, F]);
    const weekAMonOnly = fortnightlyPattern([T, F, F, F, F], [F, F, F, F, F]);
    expect(overlaps(weekAMonOnly, weekBMonOnly)).toBe(false);
    expect(overlaps(weekdays('Mon'), weekBMonOnly)).toBe(true);
  });

  it('checks one pattern sits within another', () => {
    expect(isWithin(weekdays('Mon'), weekdays('Mon', 'Tue'))).toBe(true);
    expect(isWithin(weekdays('Mon', 'Wed'), weekdays('Mon', 'Tue'))).toBe(false);
    expect(isWithin(NO_DAYS, NO_DAYS)).toBe(true);
  });

  it('lists indices and describes patterns', () => {
    expect(dayIndices(weekdays('Tue'))).toEqual([1, 6]);
    expect(describePattern(weekdays('Mon', 'Fri'))).toBe('Mon, Fri');
    expect(describePattern(fortnightlyPattern([T, F, F, F, F], [F, F, F, F, F]))).toBe(
      'A: Mon · B: none',
    );
  });
});
