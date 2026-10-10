import { describe, expect, it } from 'vitest';
import { weekdays } from './dayPattern';
import { computeFlags } from './flags';
import { planAssign, type GridData } from './roleGrid';
import { describeShares, matchedByRole, roleOfType, splitBySubstantive, substantiveShares } from './substantive';
import type { Allocation, EntitlementPosition, PositionType, Staff } from './types';

const y = 'y1';
const type = (id: string, name: string, category: PositionType['category']): PositionType => ({ id, planningYearId: y, name, category, sortOrder: 0 });
const types = [
  type('t-class', 'Classroom Teacher', 'class_teacher'),
  type('t-rff', 'RFF Teacher', 'other_teaching'),
  type('t-apci', 'Assistant Principal - Curriculum & Instruction', 'executive'),
];
const position = (id: string, name: string, positionTypeId: string): EntitlementPosition => ({ id, planningYearId: y, name, positionTypeId, days: weekdays('Mon', 'Tue', 'Wed', 'Thu', 'Fri'), sortOrder: 0 });
const positions = [position('class3', 'Classroom Teacher 3', 't-class'), position('apci1', 'AP C&I 1', 't-apci')];
const sarah: Staff = {
  id: 'sarah',
  planningYearId: y,
  name: 'Sadie Marlow',
  workPattern: weekdays('Mon', 'Tue', 'Wed', 'Thu'),
  currentRole: 'Teacher',
  otherRoles: ['Assistant Principal - Curriculum & Instruction'],
  otherRoleMilliFte: { 'Assistant Principal - Curriculum & Instruction': 200 },
  employmentType: 'permanent',
  preferences: '',
};
const teaching: Allocation = { id: 'm1', planningYearId: y, staffId: 'sarah', roleId: 'class3', days: weekdays('Mon', 'Tue', 'Wed') };
const THU = [3, 8];
const FRI = [4, 9];

describe('substantive shares', () => {
  it('gives each role its FTE, the main role the rest of their days', () => {
    expect(substantiveShares(sarah)).toEqual([
      { role: 'Teacher', milliFte: 600 },
      { role: 'Assistant Principal - Curriculum & Instruction', milliFte: 200 },
    ]);
    expect(describeShares(sarah)).toBe('Teacher 0.6; Assistant Principal - Curriculum & Instruction 0.2');
    expect(substantiveShares({ ...sarah, otherRoles: [] })).toBeUndefined();
    expect(substantiveShares({ ...sarah, otherRoleMilliFte: undefined })?.[0]!.milliFte).toBeUndefined();
  });

  it('maps position types to roles', () => {
    expect(types.map(roleOfType)).toEqual(['Teacher', 'Teacher', 'Assistant Principal - Curriculum & Instruction']);
  });

  it('counts matched FTE per role', () => {
    const ap: Allocation = { ...teaching, id: 'm2', roleId: 'apci1', days: weekdays('Thu') };
    expect(matchedByRole(sarah, [teaching, ap], positions, types).map((r) => [r.role, r.matchedMilli])).toEqual([
      ['Teacher', 600],
      ['Assistant Principal - Curriculum & Instruction', 200],
    ]);
  });
});

describe('matching within and beyond the substantive FTE', () => {
  const grid = (allocations: Allocation[], staff = sarah): GridData => ({
    planningYearId: y,
    staff: [{ ...staff, workPattern: weekdays('Mon', 'Tue', 'Wed', 'Thu', 'Fri') }],
    roles: positions,
    allocations,
    leave: [],
    splitBySubstantive: (_staffId, roleId, indices) => splitBySubstantive(staff, roleId, indices, allocations, positions, types),
  });
  let n = 0;
  const newId = () => `id${++n}`;

  it('matches up to the FTE as their substantive role, and the rest as higher duties', () => {
    const first = planAssign(grid([teaching]), 'sarah', 'apci1', THU, newId);
    expect(first).toMatchObject({ ok: true, put: [expect.not.objectContaining({ aboveSubstantive: true })] });
    if (!first.ok) return;
    const second = planAssign(grid([teaching, ...first.put]), 'sarah', 'apci1', FRI, newId);
    expect(second).toMatchObject({ ok: true, put: [expect.objectContaining({ aboveSubstantive: true })] });
    if (!second.ok) return;
    expect(second.message).toContain('Fri on higher duties, beyond their substantive FTE');
    // Both days at once: Thu within, Fri over.
    const both = planAssign(grid([teaching]), 'sarah', 'apci1', [...THU, ...FRI], newId);
    if (!both.ok) throw new Error(both.errors.join());
    expect(both.put.map((a) => [a.aboveSubstantive ?? false, a.days.days.map(Number).join('')])).toEqual([
      [true, '0000100001'],
      [false, '0001000010'],
    ]);
  });

  it("doesn't limit classroom positions or people with one role", () => {
    expect(splitBySubstantive(sarah, 'class3', FRI, [teaching], positions, types)).toBeUndefined();
    expect(splitBySubstantive({ ...sarah, otherRoles: [] }, 'apci1', FRI, [], positions, types)).toBeUndefined();
  });

  it('warns when already matched beyond an executive FTE', () => {
    const ap: Allocation = { ...teaching, id: 'm2', roleId: 'apci1', days: weekdays('Thu', 'Fri') };
    const flags = computeFlags({
      planningYear: { id: y, name: '2027', year: 2027 },
      positionTypes: types,
      entitlement: undefined,
      staff: [sarah],
      roles: [],
      allocations: [],
      leave: [],
      positions,
      matches: [teaching, ap],
    } as unknown as Parameters<typeof computeFlags>[0]);
    expect(flags.find((f) => f.kind === 'over_substantive_fte')?.message).toContain(
      'Sadie Marlow is matched 0.4 FTE as Assistant Principal - Curriculum & Instruction, but their substantive Assistant Principal - Curriculum & Instruction is 0.2 FTE',
    );
  });
});
