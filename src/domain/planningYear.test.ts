import { newPlanningYear, validateNewPlanningYear } from './planningYear';

describe('new planning year', () => {
  it('creates default position types and an empty entitlement', () => {
    const p = newPlanningYear(2028, '  Example PS ', 'abc', '2026-01-01T00:00:00Z');
    expect(p.planningYear).toMatchObject({ id: 'abc', year: 2028, schoolName: 'Example PS' });
    expect(p.positionTypes).toHaveLength(11);
    expect(p.positionTypes.every((t) => t.planningYearId === 'abc')).toBe(true);
    expect(p.entitlement).toEqual({ id: 'abc-entitlement', planningYearId: 'abc', totalMilliFte: 0, lines: [] });
  });

  it('validates input', () => {
    expect(validateNewPlanningYear(2028, 'X')).toBeNull();
    expect(validateNewPlanningYear(1999, 'X')).toMatch(/year/);
    expect(validateNewPlanningYear(2027.5, 'X')).toMatch(/year/);
    expect(validateNewPlanningYear(2028, ' ')).toMatch(/school/);
  });
});
