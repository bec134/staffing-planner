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

  it('has valid allocations: real staff and roles, on days both work, with no clashes', async () => {
    const { computeFlags } = await import('../domain/flags');
    const flags = computeFlags({
      entitlement: sample.entitlements[0],
      positionTypes: sample.positionTypes,
      roles: sample.roles,
      staff: sample.staff,
      allocations: sample.allocations,
    });
    const staffIds = new Set(sample.staff.map((s) => s.id));
    const roleIds = new Set(sample.roles.map((r) => r.id));
    expect(sample.allocations.every((a) => staffIds.has(a.staffId) && roleIds.has(a.roleId))).toBe(true);
    // Only entitlement shortfalls; no staff problems in the sample.
    expect(flags.every((f) => f.kind === 'under_entitlement')).toBe(true);
    expect(flags.map((f) => f.message)).toContain(
      'RFF Teacher: allocated 0.7 FTE, 0.616 under the entitlement of 1.316',
    );
    // Teacher Librarian is 0.042 under: shown on the dashboard but not flagged.
    expect(flags.some((f) => f.message.startsWith('Teacher Librarian'))).toBe(false);
  });
});
