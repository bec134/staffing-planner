import { FULL_TIME, weekdays } from './dayPattern';
import { emptyEntitlement, summariseEntitlement } from './entitlement';
import { defaultPositionTypeId, defaultPositionTypes } from './positionTypes';
import type { Allocation, Entitlement, Role } from './types';

const Y = 'y';

const types = defaultPositionTypes(Y);
const pt = (name: string) => defaultPositionTypeId(Y, name);
const CT = pt('Classroom Teacher');
const RFF = pt('RFF Teacher');
const DP = pt('Deputy Principal');

// One full-time role per position type, with the role ID = position type ID + "-role".
const roles: Role[] = types.map((t, i) => ({
  id: `${t.id}-role`,
  planningYearId: Y,
  name: t.name,
  positionTypeId: t.id,
  days: FULL_TIME,
  sortOrder: i,
}));

let n = 0;
const alloc = (positionTypeId: string, days = FULL_TIME, extra: Partial<Allocation> = {}): Allocation => ({
  id: `a${n++}`,
  planningYearId: Y,
  staffId: 's',
  roleId: `${positionTypeId}-role`,
  days,
  ...extra,
});

const entitlement: Entitlement = {
  id: 'e',
  planningYearId: Y,
  totalMilliFte: 4316,
  lines: [
    { positionTypeId: CT, milliFte: 2000 },
    { positionTypeId: RFF, milliFte: 1316 },
    { positionTypeId: DP, milliFte: 1000 },
  ],
};

const summariseEntitlement_ = (e: Entitlement | undefined, t: typeof types, a: Allocation[]) =>
  summariseEntitlement(e, t, roles, a);

describe('summariseEntitlement', () => {
  it('reports a balanced breakdown', () => {
    const s = summariseEntitlement_(entitlement, types, []);
    expect(s.breakdownTotal).toBe(4316);
    expect(s.breakdownDifference).toBe(0);
    expect(s.total).toEqual({ entitled: 4316, allocated: 0, remaining: 4316 });
  });

  it('reports how far the breakdown is from the total', () => {
    const s = summariseEntitlement_({ ...entitlement, totalMilliFte: 5000 }, types, []);
    expect(s.breakdownDifference).toBe(684);
    const under = summariseEntitlement_({ ...entitlement, totalMilliFte: 4000 }, types, []);
    expect(under.breakdownDifference).toBe(-316);
  });

  it('subtracts allocations by position type, keeping exact decimals', () => {
    const s = summariseEntitlement_(entitlement, types, [
      alloc(CT),
      alloc(CT, weekdays('Mon', 'Tue', 'Wed')),
      alloc(RFF, weekdays('Mon', 'Tue', 'Wed', 'Thu', 'Fri')),
      alloc(RFF, weekdays('Mon')),
    ]);
    const row = (id: string) => s.byPositionType.find((r) => r.positionType.id === id)!;
    expect(row(CT)).toMatchObject({ entitled: 2000, allocated: 1600, remaining: 400 });
    expect(row(RFF)).toMatchObject({ entitled: 1316, allocated: 1200, remaining: 116 });
    expect(row(DP)).toMatchObject({ entitled: 1000, allocated: 0, remaining: 1000 });
    expect(s.total).toEqual({ entitled: 4316, allocated: 2800, remaining: 1516 });
  });

  it('shows over-allocation as negative remaining', () => {
    const s = summariseEntitlement_(entitlement, types, [alloc(DP), alloc(DP, weekdays('Mon'))]);
    expect(s.byPositionType.find((r) => r.positionType.id === DP)!.remaining).toBe(-200);
  });

  it('excludes allocations that cover leave', () => {
    const s = summariseEntitlement_(entitlement, types, [alloc(CT), alloc(CT, FULL_TIME, { coveringLeaveId: 'l1' })]);
    expect(s.total.allocated).toBe(1000);
  });

  it('totals by category', () => {
    const s = summariseEntitlement_(entitlement, types, [alloc(DP)]);
    const cat = (c: string) => s.byCategory.find((r) => r.category === c)!;
    expect(cat('class_teacher').entitled).toBe(2000);
    expect(cat('executive')).toMatchObject({ entitled: 1000, allocated: 1000, remaining: 0 });
    expect(cat('other_teaching').entitled).toBe(1316);
  });

  it('counts allocations whose role is missing as unknown', () => {
    const s = summariseEntitlement(entitlement, types, [], [alloc(CT)]);
    expect(s.unknownPositionTypeAllocated).toBe(1000);
    expect(s.total.allocated).toBe(1000);
  });

  it('keeps lines and allocations for deleted position types visible', () => {
    const withoutRff = types.filter((t) => t.id !== RFF);
    const s = summariseEntitlement_(entitlement, withoutRff, [alloc(RFF)]);
    expect(s.byPositionType.some((r) => r.positionType.id === RFF)).toBe(false);
    expect(s.breakdownTotal).toBe(4316);
    expect(s.unknownPositionTypeAllocated).toBe(1000);
  });

  it('handles no entitlement yet', () => {
    const s = summariseEntitlement_(undefined, types, []);
    expect(s.total).toEqual({ entitled: 0, allocated: 0, remaining: 0 });
    expect(s.byPositionType).toHaveLength(types.length);
    expect(summariseEntitlement_(emptyEntitlement(Y), types, []).breakdownDifference).toBe(0);
  });

  it('lists position types in sort order', () => {
    const reversed = types.map((t) => ({ ...t, sortOrder: -t.sortOrder }));
    const s = summariseEntitlement_(entitlement, reversed, []);
    expect(s.byPositionType[0]!.positionType.name).toBe(types.at(-1)!.name);
  });
});
