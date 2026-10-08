import { fteOf, isValidPattern } from '../domain/dayPattern';
import { DEFAULT_POSITION_TYPES } from '../domain/positionTypes';
import { buildSampleData } from './sampleData';

describe('sample data', () => {
  const sample = buildSampleData();

  it('includes every supplied position type with a category', () => {
    expect(sample.positionTypes.map((p) => p.name)).toEqual(DEFAULT_POSITION_TYPES.map((p) => p.name));
    expect(sample.positionTypes.find((p) => p.name === 'Classroom Teacher')?.category).toBe('class_teacher');
    expect(sample.positionTypes.find((p) => p.name === 'Deputy Principal')?.category).toBe('executive');
  });

  it('has an entitlement breakdown that sums to the total and references real position types', () => {
    const [ent] = sample.entitlements;
    const ptIds = new Set(sample.positionTypes.map((p) => p.id));
    expect(ent!.lines.reduce((s, l) => s + l.milliFte, 0)).toBe(ent!.totalMilliFte);
    expect(ent!.lines.every((l) => ptIds.has(l.positionTypeId))).toBe(true);
    expect(ent!.lines.every((l) => Number.isInteger(l.milliFte))).toBe(true);
  });

  it('has valid, unique staff with work patterns', () => {
    expect(new Set(sample.staff.map((s) => s.id)).size).toBe(sample.staff.length);
    expect(sample.staff.every((s) => isValidPattern(s.workPattern))).toBe(true);
    expect(sample.staff.some((s) => s.workPattern.mode === 'fortnightly' && fteOf(s.workPattern) === 0.5)).toBe(true);
  });

  it('scopes everything to the sample planning year', () => {
    const id = sample.planningYear.id;
    expect([...sample.positionTypes, ...sample.entitlements, ...sample.staff].every((r) => r.planningYearId === id)).toBe(true);
  });
});
