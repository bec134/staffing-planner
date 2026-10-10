import { FULL_TIME, weekdays, type DayPattern } from './dayPattern';
import { computeFlags as computeAllFlags, type FlagInput } from './flags';
import { defaultPositionTypeId, defaultPositionTypes } from './positionTypes';
import type { Allocation, Leave, Role, Staff } from './types';

// The original Phase 3 tests use part-filled roles; leave the unfilled-role
// and Part 1 matching flags to their own tests below.
const LATER = new Set(['role_unfilled', 'unmatched_staff', 'temporary_before_permanent', 'placement_mismatch']);
const computeFlags = (input: FlagInput) => computeAllFlags(input).filter((f) => !LATER.has(f.kind));

const Y = 'y';
const types = defaultPositionTypes(Y);
const CT = defaultPositionTypeId(Y, 'Classroom Teacher');
const RFF = defaultPositionTypeId(Y, 'RFF Teacher');

const person = (id: string, workPattern: DayPattern = FULL_TIME): Staff => ({
  id,
  planningYearId: Y,
  name: `Teacher ${id}`,
  workPattern,
  currentRole: '',
  employmentType: 'permanent',
  preferences: '',
});
const role = (id: string, positionTypeId: string, days: DayPattern = FULL_TIME): Role => ({
  id,
  planningYearId: Y,
  name: `Role ${id}`,
  positionTypeId,
  days,
  sortOrder: 0,
});
let n = 0;
const alloc = (staffId: string, roleId: string, days: DayPattern, extra: Partial<Allocation> = {}): Allocation => ({
  id: `a${n++}`,
  planningYearId: Y,
  staffId,
  roleId,
  days,
  ...extra,
});

/**
 * Entitlement is now measured on Part 1 matches; these older tests use the
 * same roles and allocations as positions and matches unless given others.
 */
const base = (over: Partial<FlagInput> = {}): FlagInput => {
  const input = {
    entitlement: {
      id: 'e',
      planningYearId: Y,
      totalMilliFte: 1316,
      lines: [
        { positionTypeId: CT, milliFte: 1000 },
        { positionTypeId: RFF, milliFte: 316 },
      ],
    },
    positionTypes: types,
    roles: [role('c1', CT), role('r1', RFF)],
    staff: [person('s1'), person('s2', weekdays('Mon', 'Tue'))],
    allocations: [] as Allocation[],
    leave: [] as Leave[],
    ...over,
  };
  return { ...input, positions: over.positions ?? input.roles, matches: over.matches ?? input.allocations };
};
const kinds = (input: FlagInput) => computeFlags(input).map((f) => f.kind);

describe('entitlement flags', () => {
  it('flags under-allocation of 0.1 FTE or more, but not smaller remainders', () => {
    const input = base({
      allocations: [alloc('s1', 'c1', FULL_TIME), alloc('s2', 'r1', weekdays('Mon'))],
    });
    // RFF: 0.316 entitled, 0.2 allocated → 0.116 under (flagged). Total 1.316 vs 1.2 → 0.116 under.
    const flags = computeFlags(input);
    expect(flags.map((f) => f.key)).toEqual([`under:total`, `under:${RFF}`]);
    expect(flags[1]!.message).toBe('RFF Teacher: allocated 0.2 FTE, 0.116 under the entitlement of 0.316');

    const close = base({
      allocations: [alloc('s1', 'c1', FULL_TIME), alloc('s2', 'r1', weekdays('Mon', 'Tue')), ],
    });
    // RFF 0.316 vs 0.4 → over; make RFF entitlement 0.416 → 0.016 under → not flagged.
    close.entitlement = { ...close.entitlement!, totalMilliFte: 1416, lines: [close.entitlement!.lines[0]!, { positionTypeId: RFF, milliFte: 416 }] };
    expect(kinds(close)).toEqual([]);
  });

  it('always flags over-allocation', () => {
    const input = base({
      allocations: [alloc('s1', 'c1', FULL_TIME), alloc('s2', 'r1', weekdays('Mon', 'Tue'))],
    });
    const flags = computeFlags(input);
    expect(flags.map((f) => f.key)).toEqual([`over:total`, `over:${RFF}`]);
    expect(flags[0]!.message).toBe('Total: allocated 1.4 FTE, 0.084 over the entitlement of 1.316');
    expect(flags[0]!.link).toBe('/entitlement');
  });

  it('stays quiet for a blank plan', () => {
    expect(computeFlags(base({ entitlement: undefined }))).toEqual([]);
    const blank = base();
    blank.entitlement = { ...blank.entitlement!, totalMilliFte: 0, lines: [] };
    expect(computeFlags(blank)).toEqual([]);
  });

  it('ignores leave cover', () => {
    const input = base({
      allocations: [
        alloc('s1', 'c1', FULL_TIME),
        alloc('s2', 'r1', weekdays('Mon')),
        alloc('s2', 'r1', weekdays('Tue'), { coveringLeaveId: 'l' }),
      ],
    });
    expect(kinds(input).filter((k) => k.endsWith('entitlement'))).toEqual(['under_entitlement', 'under_entitlement']);
  });
});

describe('staff flags', () => {
  const noEntitlement = (allocations: Allocation[], extra: Partial<FlagInput> = {}) =>
    computeFlags(base({ entitlement: undefined, allocations, ...extra }));

  it('flags allocation on a day the person does not work', () => {
    const flags = noEntitlement([alloc('s2', 'c1', weekdays('Tue', 'Wed'))]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      kind: 'staff_not_working',
      message: "Teacher s2 is allocated to Role c1 on Wed, but doesn't work then",
      link: '/staff/s2',
    });
  });

  it('flags two roles on the same day', () => {
    const flags = noEntitlement([alloc('s1', 'c1', weekdays('Mon', 'Tue')), alloc('s1', 'r1', weekdays('Tue', 'Wed'))]);
    expect(flags.map((f) => f.message)).toEqual(['Teacher s1 is allocated to both Role c1 and Role r1 on Tue']);
  });

  it('does not flag same-day roles whose dates do not overlap', () => {
    const flags = noEntitlement([
      alloc('s1', 'c1', FULL_TIME, { startDate: '2027-01-27', endDate: '2027-06-30' }),
      alloc('s1', 'r1', FULL_TIME, { startDate: '2027-07-14', endDate: '2027-12-17' }),
    ]);
    expect(flags).toEqual([]);
  });

  it('flags allocation outside the days a role runs', () => {
    const flags = noEntitlement([alloc('s1', 'r1', weekdays('Mon', 'Fri'))], {
      roles: [role('c1', CT), role('r1', RFF, weekdays('Mon'))],
    });
    // The same days are also a Part 1 match here, so both parts flag it.
    expect(flags.map((f) => f.kind).sort()).toEqual(['outside_position_days', 'outside_role_days']);
    expect(flags.find((f) => f.kind === 'outside_role_days')).toMatchObject({ link: '/allocation/roles/r1' });
  });

  it('produces stable, unique keys', () => {
    const flags = noEntitlement([
      alloc('s1', 'c1', FULL_TIME),
      alloc('s1', 'r1', FULL_TIME),
      alloc('s2', 'c1', FULL_TIME),
    ]);
    const keys = flags.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('unfilled role flags', () => {
  it('flags role days with no one allocated, ignoring leave cover', () => {
    const flags = computeAllFlags(
      base({
        entitlement: undefined,
        roles: [role('r1', RFF, weekdays('Mon', 'Tue', 'Wed'))],
        allocations: [alloc('s1', 'r1', weekdays('Mon')), alloc('s2', 'r1', weekdays('Tue'), { coveringLeaveId: 'l' })],
        positions: [],
      }),
    );
    expect(flags.map((f) => [f.kind, f.message, f.link])).toEqual([
      ['role_unfilled', 'Role r1 has no one allocated on Tue, Wed', '/allocation/roles/r1'],
    ]);
  });
});

describe('leave gap flags', () => {
  const leave: Leave = {
    id: 'L1',
    planningYearId: Y,
    staffId: 's1',
    startDate: '2027-04-28',
    endDate: '2027-07-02',
    daysAffected: FULL_TIME,
    leaveType: 'lsl',
  };

  it('flags each uncovered stretch with days and dates', () => {
    const flags = computeAllFlags(
      base({
        entitlement: undefined,
        roles: [role('c1', CT)],
        allocations: [
          alloc('s1', 'c1', FULL_TIME),
          // s2 covers Mon–Tue for the first half only.
          alloc('s2', 'c1', weekdays('Mon', 'Tue'), {
            coveringLeaveId: 'L1',
            startDate: '2027-04-28',
            endDate: '2027-05-31',
          }),
        ],
        leave: [leave],
      }),
    );
    expect(flags.map((f) => f.message)).toEqual([
      "Role c1: no cover for Teacher s1's Long Service Leave on Mon, Tue, 1 Jun – 2 Jul 2027",
      "Role c1: no cover for Teacher s1's Long Service Leave on Wed, Thu, Fri, 28 Apr – 2 Jul 2027",
    ]);
    expect(flags[0]!.link).toBe('/leave/L1');
  });

  it('is quiet when the leave is fully covered', () => {
    const flags = computeAllFlags(
      base({
        entitlement: undefined,
        roles: [role('c1', CT)],
        allocations: [
          alloc('s1', 'c1', FULL_TIME),
          alloc('s2', 'c1', FULL_TIME, { coveringLeaveId: 'L1', startDate: '2027-04-28', endDate: '2027-07-02' }),
        ],
        staff: [person('s1'), person('s2')],
        leave: [leave],
      }),
    );
    expect(flags).toEqual([]);
  });
});
