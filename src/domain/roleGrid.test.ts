import { buildSampleData } from '../data/sampleData';
import { FULL_TIME, describePattern, weekdays } from './dayPattern';
import {
  applyRemove,
  candidatesFor,
  cellView,
  fillableDays,
  patternOf,
  planAssign,
  planFill,
  planRemove,
  type GridData,
} from './roleGrid';
import type { Staff } from './types';

const Y = 'sample-2027';
const role = (key: string) => `${Y}-role-${key}`;
const MON = [0, 5];
const WED = [2, 7];
const THU = [3, 8];

const free: Staff = {
  id: 'free',
  planningYearId: Y,
  name: 'Free Person',
  workPattern: FULL_TIME,
  currentRole: '',
  employmentType: 'temporary',
  preferences: '',
};

function data(extraStaff: Staff[] = [free]): GridData {
  const s = buildSampleData('2026-01-01T00:00:00Z');
  return {
    planningYearId: Y,
    year: { start: '2027-01-28', end: '2027-12-17' },
    staff: [...s.staff, ...extraStaff],
    roles: s.roles,
    allocations: s.allocations,
    leave: s.leave,
  };
}
let n = 0;
const newId = () => `new-${n++}`;
const name = (d: GridData, id: string) => d.staff.find((s) => s.id === id)!.name;

describe('cellView', () => {
  it('shows the holder on leave greyed and their cover in colour', () => {
    const d = data();
    const thu = cellView(d.roles.find((r) => r.id === role('12-green'))!, THU, d);
    expect(thu.tiles.map((t) => [t.kind, name(d, t.staffId)])).toEqual([
      ['on-leave', 'Indi Calloway'],
      ['cover', 'Tara Quinlan'],
    ]);
    const mon = cellView(d.roles.find((r) => r.id === role('12-green'))!, MON, d);
    expect(mon.tiles.map((t) => [t.kind, name(d, t.staffId)])).toEqual([['holder', 'Indi Calloway']]);
  });

  it('shows leave without cover, and empty or non-running days', () => {
    const d = data();
    const eli = cellView(d.roles.find((r) => r.id === role('k-blue'))!, MON, d);
    expect(eli.tiles.map((t) => t.kind)).toEqual(['on-leave']);
    expect(eli.empty).toBe(false);
    const exec = cellView(d.roles.find((r) => r.id === role('exec-release'))!, MON, d);
    expect(exec).toMatchObject({ runs: true, empty: true, tiles: [] });
    expect(cellView(d.roles.find((r) => r.id === role('exec-release'))!, WED, d).runs).toBe(false);
  });

  it('marks part-year leave in the whole-year view, but not whole-year leave', () => {
    const d = data();
    const red = cellView(d.roles.find((r) => r.id === role('34-red'))!, MON, d);
    expect(red.tiles[0]).toMatchObject({ kind: 'on-leave', partYear: true });
    const green = cellView(d.roles.find((r) => r.id === role('12-green'))!, THU, d);
    expect(green.tiles[0]).toMatchObject({ kind: 'on-leave', partYear: false });
    expect(cellView(d.roles.find((r) => r.id === role('34-red'))!, MON, d, '2027-05-03').tiles[0]!.partYear).toBe(false);
  });

  it('filters by date', () => {
    const d = data();
    const red = d.roles.find((r) => r.id === role('34-red'))!;
    expect(cellView(red, MON, d, '2027-03-01').tiles.map((t) => t.kind)).toEqual(['holder']);
    expect(cellView(red, MON, d, '2027-05-03').tiles.map((t) => t.kind)).toEqual(['on-leave', 'cover']);
  });
});

describe('planAssign', () => {
  it('creates an allocation for an empty role day, then extends it', () => {
    const d = data();
    const first = planAssign(d, 'free', role('exec-release'), MON, newId);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.put).toHaveLength(1);
    expect(describePattern(first.put[0]!.days)).toBe('Mon');
    expect(first.message).toBe('Free Person → Executive release on Mon');

    const d2 = { ...d, allocations: [...d.allocations, ...first.put] };
    const second = planAssign(d2, 'free', role('exec-release'), [1, 6], newId);
    expect(second.ok && second.put[0]!.id).toBe(first.put[0]!.id);
    expect(second.ok && describePattern(second.put[0]!.days)).toBe('Mon, Tue');
  });

  it('assigns cover when the holder is on leave that day, for the leave dates', () => {
    const d = data();
    const result = planAssign(d, 'free', role('k-blue'), MON, newId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.put[0]).toMatchObject({
      coveringLeaveId: `${Y}-leave-04`,
      startDate: '2027-01-28',
      endDate: '2027-12-17',
    });
    expect(result.message).toBe('Free Person → K Blue on Mon as cover');
  });

  it('refuses a day already held by someone who is not on leave', () => {
    const result = planAssign(data(), 'free', role('k-blue'), WED, newId);
    expect(result).toEqual({ ok: false, errors: ['K Blue is already held by Eli Brookfield on Wed'] });
  });

  it('refuses days the role does not run', () => {
    const result = planAssign(data(), 'free', role('exec-release'), WED, newId);
    expect(result).toEqual({ ok: false, errors: ["Executive release doesn't run on Wed"] });
  });

  it('reports days the person does not work so they can be added', () => {
    const result = planAssign(data(), `${Y}-staff-14`, role('las'), WED, newId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(["Noor Haddon doesn't work Wed"]);
    expect(describePattern(result.missingWorkDays!)).toBe('Wed');
  });

  it('refuses someone who already has another role that day', () => {
    // Avery is Deputy Principal every day.
    const result = planAssign(data(), `${Y}-staff-01`, role('exec-release'), MON, newId);
    expect(result).toEqual({ ok: false, errors: ['Avery Quill already has another role on Mon'] });
  });

  it('lists only people who could take the day', () => {
    const names = candidatesFor(data(), role('exec-release'), MON).map((s) => s.name);
    expect(names).toContain('Free Person');
    expect(names).not.toContain('Avery Quill');
  });
});

describe('planRemove', () => {
  it('takes a day out, or deletes the allocation when none are left', () => {
    const d = data();
    const noor = d.allocations.find((a) => a.staffId === `${Y}-staff-14`)!;
    const change = planRemove(noor, THU);
    expect(describePattern(change.put!.days)).toBe('Fri');
    expect(planRemove({ ...noor, days: weekdays('Thu') }, THU)).toEqual({ deleteId: noor.id });
  });

  it('supports moving a tile: remove then assign elsewhere', () => {
    const d = data();
    const gus = d.allocations.find((a) => a.roleId === role('rff-2'))!;
    const removed = applyRemove(d.allocations, planRemove(gus, WED));
    const result = planAssign({ ...d, allocations: removed }, gus.staffId, role('las'), WED, newId);
    expect(result.ok).toBe(true);
  });

  it('builds weekly or fortnightly patterns from indices', () => {
    expect(patternOf(MON).mode).toBe('weekly');
    expect(patternOf([0]).mode).toBe('fortnightly');
  });
});

describe('planFill', () => {
  const emptyClass = {
    id: 'new-class',
    planningYearId: Y,
    name: 'K Green',
    positionTypeId: `${Y}-pt-classroom-teacher`,
    days: FULL_TIME,
    sortOrder: 99,
  };

  it('gives a full-time person every day of an empty class at once', () => {
    const d = { ...data(), roles: [...data().roles, emptyClass] };
    const result = planFill(d, 'free', 'new-class', newId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.put).toHaveLength(1);
    expect(describePattern(result.put[0]!.days)).toBe('Mon, Tue, Wed, Thu, Fri');
    expect(result.message).toBe('Free Person → K Green on Mon, Tue, Wed, Thu, Fri');
  });

  it('skips days someone else holds and says so', () => {
    const d = data();
    // 1/2 Blue: Frankie Mon–Wed, Gus Thu–Fri; remove Gus so Thu–Fri are free.
    const without = { ...d, allocations: d.allocations.filter((a) => !(a.roleId === role('12-blue') && a.staffId === `${Y}-staff-07`)) };
    const result = planFill(without, 'free', role('12-blue'), newId);
    expect(result.ok && result.message).toBe('Free Person → 1/2 Blue on Thu, Fri (Mon, Tue, Wed already held)');
  });

  it('only fills days a part-timer works and is free', () => {
    const partTimer: Staff = { ...free, id: 'pt', name: 'Part Timer', workPattern: weekdays('Mon', 'Tue', 'Wed') };
    const d = data([partTimer]);
    const result = planFill(d, 'pt', role('exec-release'), newId);
    expect(result.ok && describePattern(result.put[0]!.days)).toBe('Mon, Tue');
  });

  it('explains when there is nothing left to fill', () => {
    expect(planFill(data(), 'free', role('k-gold'), newId)).toEqual({
      ok: false,
      errors: ['Free Person has no free days that K Gold still needs filled'],
    });
  });

  it('lists fillable and held days', () => {
    expect(fillableDays(data(), 'free', role('rff-1'))).toEqual({ indices: [3, 4, 7, 8, 9], heldByOthers: [0, 1, 2, 5, 6] });
  });
});
