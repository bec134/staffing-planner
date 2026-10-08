import { weekdays, fortnightlyPattern } from './dayPattern';
import { formatFte, milliFteFromDays, milliFteOf, parseFte } from './fte';

describe('parseFte', () => {
  it.each([
    ['2.316', 2316],
    ['0.526', 526],
    ['1', 1000],
    ['1.0', 1000],
    ['1.', 1000],
    ['.5', 500],
    ['0.05', 50],
    ['  12.4 ', 12400],
    ['', 0],
  ])('parses %j as %i milli-FTE', (input, expected) => {
    expect(parseFte(input)).toEqual({ ok: true, value: expected });
  });

  it.each(['-1', 'abc', '1.2.3', '1,5', '.'])('rejects %j', (input) => {
    expect(parseFte(input).ok).toBe(false);
  });

  it('explains when there are too many decimals', () => {
    expect(parseFte('0.1234')).toEqual({ ok: false, error: 'Use at most 3 decimal places' });
  });
});

describe('formatFte', () => {
  it.each([
    [2316, '2.316'],
    [1000, '1.0'],
    [500, '0.5'],
    [0, '0.0'],
    [50, '0.05'],
    [-16, '-0.016'],
    [-1500, '-1.5'],
  ])('formats %i as %s', (value, expected) => {
    expect(formatFte(value)).toBe(expected);
  });

  it('round-trips with parseFte', () => {
    for (const v of [0, 1, 99, 526, 2316, 12400]) {
      expect(parseFte(formatFte(v))).toEqual({ ok: true, value: v });
    }
  });
});

describe('milli-FTE from days', () => {
  it('converts whole fortnight days and patterns', () => {
    expect(milliFteFromDays(1)).toBe(100);
    expect(milliFteFromDays(10)).toBe(1000);
    expect(milliFteOf(weekdays('Mon', 'Tue'))).toBe(400);
    expect(milliFteOf(fortnightlyPattern([true, true, true, false, false], [true, true, false, false, false]))).toBe(500);
  });
});
