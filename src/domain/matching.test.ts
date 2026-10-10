import { buildSampleData } from '../data/sampleData';
import { FULL_TIME, describePattern, weekdays } from './dayPattern';
import { computeFlags, flagInputFrom } from './flags';
import {
  isMatched,
  isWholeYearLeave,
  matchesOutsidePosition,
  matchStatus,
  patternForFortnightDays,
  planPositionDaysChange,
  planSplitPosition,
  positionsToCreate,
  schoolYear,
  wholeYearPlacedMilli,
} from './matching';
import type { EntitlementMatch, EntitlementPosition, Staff } from './types';

const sample = () => buildSampleData('2026-01-01T00:00:00Z');
const Y = 'sample-2027';
let n = 0;
const newId = () => `p${n++}`;

describe('positions from the entitlement', () => {
  it('fills part positions from Monday, extra day in Week A', () => {
    expect(describePattern(patternForFortnightDays(10))).toBe('Mon, Tue, Wed, Thu, Fri');
    expect(describePattern(patternForFortnightDays(4))).toBe('Mon, Tue');
    expect(describePattern(patternForFortnightDays(3))).toBe('A: Mon, Tue · B: Mon');
    expect(describePattern(patternForFortnightDays(8))).toBe('Mon, Tue, Wed, Thu');
  });

  it('makes whole positions plus a part position, ignoring remainders under a day', () => {
    const s = sample();
    const created = positionsToCreate(s.entitlements[0], s.positionTypes, [], Y, newId);
    const names = created.map((p) => p.name);
    expect(names.filter((x) => x.startsWith('Classroom Teacher'))).toHaveLength(6);
    // RFF 1.316 → one full position and one of 3 fortnight days (0.016 left over).
    const rff = created.filter((p) => p.name.startsWith('RFF'));
    expect(rff.map((p) => describePattern(p.days))).toEqual(['Mon, Tue, Wed, Thu, Fri', 'A: Mon, Tue · B: Mon']);
    // QTSS 0.526 → 5 fortnight days.
    expect(describePattern(created.find((p) => p.name === 'QTSS Teacher 1')!.days)).toBe('A: Mon, Tue, Wed · B: Mon, Tue');
  });

  it('only adds positions that are missing', () => {
    const s = sample();
    expect(positionsToCreate(s.entitlements[0], s.positionTypes, s.positions, Y, newId)).toEqual([]);
    const fewer = s.positions.filter((p) => p.name !== 'Classroom Teacher 6');
    const added = positionsToCreate(s.entitlements[0], s.positionTypes, fewer, Y, newId);
    expect(added.map((p) => p.name)).toEqual(['Classroom Teacher 6']);
  });
});

describe('whole-year leave and placement', () => {
  it('uses Term 1 start to Term 4 end as the school year', () => {
    const s = sample();
    const year = schoolYear(s.planningYear);
    expect(year).toEqual({ start: '2027-01-28', end: '2027-12-17' });
    expect(s.leave.map((l) => isWholeYearLeave(l, year))).toEqual([false, false, true, true]);
    expect(schoolYear({ ...s.planningYear, terms: undefined })).toEqual({ start: '2027-01-01', end: '2027-12-31' });
  });

  it('counts whole-year placements and whole-year cover, not part-year cover', () => {
    const s = sample();
    const year = schoolYear(s.planningYear);
    const placed = (id: string) => wholeYearPlacedMilli(`${Y}-staff-${id}`, s.allocations, s.leave, year);
    expect(placed('17')).toBe(400); // Tara: cover for Indi's whole-year LWOP
    expect(placed('16')).toBe(0); // Sam: only part-year cover
    expect(placed('07')).toBe(600); // Gus: class Thu–Fri + RFF Wed
  });

  it("reports each person's matched and unmatched days", () => {
    const s = sample();
    const frankie = s.staff.find((x) => x.name === 'Frankie Lowe')!;
    expect(matchStatus(frankie, s.matches)).toMatchObject({ workMilli: 600, matchedMilli: 600 });
    const sam = s.staff.find((x) => x.name === 'Sam Ridley')!;
    expect(describePattern(matchStatus(sam, s.matches).unmatched)).toBe('Mon, Tue, Wed, Thu, Fri');
    expect(isMatched(frankie, s.matches)).toBe(true);
    expect(isMatched(sam, s.matches)).toBe(false);
    expect(isMatched({ ...frankie, nominatedForTransfer: true }, s.matches)).toBe(false);
  });
});

describe('Part 1 flags', () => {
  const extra = (over: Partial<Staff>): Staff => ({
    id: 'extra',
    planningYearId: Y,
    name: 'Extra Person',
    workPattern: FULL_TIME,
    currentRole: '',
    employmentType: 'permanent',
    preferences: '',
    ...over,
  });
  const flagsWith = (staff: Staff[], change: (s: ReturnType<typeof sample>) => void = () => {}) => {
    const s = sample();
    s.staff.push(...staff);
    change(s);
    return computeFlags(flagInputFrom(s));
  };

  it('has none in the sample', () => {
    const kinds = new Set(flagsWith([]).map((f) => f.kind));
    expect(kinds.has('unmatched_staff')).toBe(false);
    expect(kinds.has('placement_mismatch')).toBe(false);
  });

  it('flags permanent or TWT staff left unmatched, but not temporary staff', () => {
    const flags = flagsWith([extra({}), extra({ id: 'temp', name: 'Temp Person', employmentType: 'temporary' })]);
    const unmatched = flags.filter((f) => f.kind === 'unmatched_staff');
    expect(unmatched.map((f) => f.message)).toEqual([
      'Extra Person (Permanent) has 1.0 FTE not matched to the entitlement (Mon, Tue, Wed, Thu, Fri): match them or nominate for transfer',
    ]);
    expect(unmatched[0]!.link).toBe('/matching');
  });

  it('stops flagging someone nominated for transfer', () => {
    const flags = flagsWith([extra({ nominatedForTransfer: true, transferNotes: 'Nominated 1 Nov' })]);
    expect(flags.some((f) => f.kind === 'unmatched_staff')).toBe(false);
  });

  it('flags temporary staff matched while permanent staff are unmatched', () => {
    const flags = flagsWith([extra({})], (s) => {
      const sam = s.staff.find((x) => x.name === 'Sam Ridley')!;
      s.matches.push({
        id: 'm-sam',
        planningYearId: Y,
        staffId: sam.id,
        roleId: s.positions.find((p) => p.name === 'Executive Release Teacher 1')!.id,
        days: weekdays('Mon', 'Tue'),
      });
    });
    const message = flags.find((f) => f.kind === 'temporary_before_permanent')?.message ?? '';
    expect(message).toMatch(/^Temporary staff \(.*Sam Ridley.*\) are matched while permanent or TWT staff are still unmatched$/);
    expect(message).toContain('Harper Vale');
  });

  it('flags placement that differs from matching, and placed staff nominated for transfer', () => {
    const flags = flagsWith([], (s) => {
      const lou = s.staff.find((x) => x.name === 'Lou Merriweather')!;
      s.allocations = s.allocations.filter((a) => a.staffId !== lou.id);
      const harper = s.staff.find((x) => x.name === 'Harper Vale')!;
      harper.nominatedForTransfer = true;
    });
    const msgs = flags.filter((f) => f.kind === 'placement_mismatch').map((f) => f.message);
    expect(msgs).toContain('Lou Merriweather is matched for 0.8 FTE but placed for 0.0 FTE');
    expect(msgs).toContain('Harper Vale is nominated for transfer but still placed for 1.0 FTE');
  });

  it('counts entitlement against Part 1 matching, not Part 2 placement', () => {
    const flags = flagsWith([], (s) => {
      s.allocations = [];
    });
    expect(flags.some((f) => f.message.startsWith('Classroom Teacher:'))).toBe(false);
  });
});

describe('changing the days a position runs', () => {
  const position: EntitlementPosition = { id: 'pos', planningYearId: Y, name: 'EaLD Teacher 1', positionTypeId: 'pt', days: weekdays('Mon'), sortOrder: 0 };
  const person = (id: string, ...days: Parameters<typeof weekdays>): Staff => ({
    id,
    planningYearId: Y,
    name: id,
    workPattern: weekdays(...days),
    currentRole: 'Teacher',
    employmentType: 'permanent',
    preferences: '',
  });
  const match = (id: string, staffId: string, days = weekdays('Mon'), roleId = 'pos'): EntitlementMatch => ({ id, planningYearId: Y, staffId, roleId, days });

  it('moves the person with the position, Monday to Thursday in both weeks', () => {
    const staff = [person('Pat', 'Mon', 'Thu')];
    const change = planPositionDaysChange(position, weekdays('Thu'), [match('m1', 'Pat')], staff);
    expect(change.messages).toEqual(['Pat moves from Mon to Thu']);
    expect(change.matchPut.map((m) => describePattern(m.days))).toEqual(['Thu']);
    expect(change.matchDelete).toEqual([]);
  });

  it("takes the day off when they can't move, and says why", () => {
    const staff = [person('Oak', 'Mon'), person('Lee', 'Mon', 'Thu')];
    // Oak doesn't work Thursday.
    const notWorking = planPositionDaysChange(position, weekdays('Thu'), [match('m1', 'Oak')], staff);
    expect(notWorking.messages).toEqual(["Oak is taken off Mon: they don't work Thu"]);
    expect(notWorking.matchDelete).toEqual(['m1']);
    // Lee is matched elsewhere on Thursday.
    const busy = planPositionDaysChange(position, weekdays('Thu'), [match('m1', 'Lee'), match('m2', 'Lee', weekdays('Thu'), 'other')], staff);
    expect(busy.messages).toEqual(["Lee is taken off Mon: they're matched elsewhere on Thu"]);
    // Only removing a day: nowhere to move.
    const two = { ...position, days: weekdays('Mon', 'Tue') };
    const shrink = planPositionDaysChange(two, weekdays('Tue'), [match('m1', 'Lee', weekdays('Mon', 'Tue'))], staff);
    expect(shrink.messages).toEqual(['Lee is taken off Mon: the position has no new day to move to']);
    expect(shrink.matchPut.map((m) => describePattern(m.days))).toEqual(['Tue']);
  });

  it('leaves backfills with their leave, and changes nothing when no day is removed', () => {
    const staff = [person('Pat', 'Mon', 'Thu')];
    const backfill = { ...match('m1', 'Pat'), coveringLeaveId: 'leave' };
    expect(planPositionDaysChange(position, weekdays('Thu'), [backfill], staff).messages).toEqual([
      'Pat is taken off Mon: backfills stay with the leave they cover',
    ]);
    expect(planPositionDaysChange(position, weekdays('Mon', 'Thu'), [match('m1', 'Pat')], staff)).toEqual({ matchPut: [], matchDelete: [], messages: [] });
  });

  it('flags matches left on days their position no longer runs', () => {
    const s = sample();
    const eald = s.positions.find((p) => p.name === 'EaLD Teacher 1')!;
    s.positions = s.positions.map((p) => (p.id === eald.id ? { ...p, days: weekdays('Thu') } : p));
    expect(matchesOutsidePosition(s.positions, s.matches).map((x) => x.position.name)).toEqual(['EaLD Teacher 1']);
    expect(computeFlags(flagInputFrom(s)).map((f) => f.message)).toContain(
      "Oak Delaney is matched to EaLD Teacher 1 on Mon, but the position doesn't run then",
    );
  });
});

describe('splitting a position', () => {
  const s = sample();
  const ct = s.positions.find((p) => p.name === 'Classroom Teacher 5')!; // Kit, Mon–Fri
  const split = (parts: ReturnType<typeof weekdays>[]) =>
    planSplitPosition(ct, parts, s.positions, s.matches, s.staff, 'Classroom Teacher', newId);

  it('splits 1.0 into 0.4 + 0.4 + 0.2, and the person follows their days', () => {
    const result = split([weekdays('Mon', 'Tue'), weekdays('Wed', 'Thu'), weekdays('Fri')]);
    if (typeof result === 'string') throw new Error(result);
    expect(result.positionPut.map((p) => [p.name, describePattern(p.days)])).toEqual([
      ['Classroom Teacher 5', 'Mon, Tue'],
      ['Classroom Teacher 7', 'Wed, Thu'],
      ['Classroom Teacher 8', 'Fri'],
    ]);
    const kit = s.staff.find((x) => x.name === 'Kit Ashdown')!.id;
    expect(result.matchPut.filter((m) => m.staffId === kit).map((m) => describePattern(m.days))).toEqual(['Mon, Tue', 'Wed, Thu', 'Fri']);
    expect(result.messages).toEqual(['Kit Ashdown: Wed, Thu moves to Classroom Teacher 7', 'Kit Ashdown: Fri moves to Classroom Teacher 8']);
  });

  it('needs every day in exactly one part', () => {
    expect(split([weekdays('Mon', 'Tue'), weekdays('Tue', 'Wed', 'Thu', 'Fri')])).toBe('A day can only be in one part');
    expect(split([weekdays('Mon', 'Tue'), weekdays('Wed')])).toBe('Every day of the position must go to one part');
    expect(split([weekdays('Mon', 'Tue', 'Wed', 'Thu', 'Fri')])).toBe('Give each part at least one day');
  });
});
