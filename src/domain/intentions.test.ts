import { buildSampleData } from '../data/sampleData';
import { FULL_TIME, NO_DAYS, describePattern, weekdays } from './dayPattern';
import { computeFlags, flagInputFrom } from './flags';
import {
  checkIntention,
  gradePreferenceMismatches,
  intendedWorkPattern,
  intentionForStaff,
  intentionFromPlan,
  planApplyIntention,
  planSaveStaff,
  staffForIntention,
  type PlanContext,
} from './intentions';
import { schoolYear } from './matching';
import type { StaffIntention } from './types';

const sample = buildSampleData();
const ctx: PlanContext = {
  planningYearId: sample.planningYear.id,
  year: schoolYear(sample.planningYear),
  staff: sample.staff,
  leave: sample.leave,
  allocations: sample.allocations,
  matches: sample.matches,
};
const intention = (name: string) => sample.intentions.find((i) => i.name === name)!;
const staffNamed = (name: string) => sample.staff.find((s) => s.name === name)!;
let n = 0;
const newId = () => `new-${n++}`;

const blank = (over: Partial<StaffIntention> = {}): StaffIntention => ({
  id: 'i',
  planningYearId: sample.planningYear.id,
  name: 'Quinn Example',
  employmentType: 'permanent',
  permanentMilliFte: 1000,
  workPreference: 'full_time',
  preferredDays: FULL_TIME,
  leaveDays: NO_DAYS,
  leaveType: 'lwop',
  gradePreferences: [],
  ...over,
});

describe('checking intentions', () => {
  it('accepts preferred days plus leave days that add up to the permanent FTE', () => {
    expect(
      checkIntention(blank({ workPreference: 'part_time', preferredDays: weekdays('Mon', 'Tue', 'Wed'), leaveDays: weekdays('Thu', 'Fri') })),
    ).toEqual({ errors: [], warnings: [] });
    expect(describePattern(intendedWorkPattern({ preferredDays: weekdays('Mon'), leaveDays: weekdays('Fri') }))).toBe('Mon, Fri');
  });

  it('warns when days and permanent FTE disagree, or the FTE is missing', () => {
    expect(checkIntention(blank({ workPreference: 'part_time', preferredDays: weekdays('Mon', 'Tue', 'Wed') })).warnings).toEqual([
      'Preferred days (0.6) come to 0.6 FTE, not their permanent FTE of 1.0',
    ]);
    expect(checkIntention(blank({ employmentType: 'twt', permanentMilliFte: undefined })).warnings).toEqual([
      'Permanent FTE is blank (needed for TWT staff)',
    ]);
    // Temporary staff have no permanent FTE to check.
    expect(checkIntention(blank({ employmentType: 'temporary', permanentMilliFte: undefined })).warnings).toEqual([]);
  });

  it('checks work preference against the days', () => {
    expect(checkIntention(blank({ preferredDays: weekdays('Mon', 'Tue', 'Wed', 'Thu') , permanentMilliFte: 800 })).warnings).toEqual([
      "Full time, but Fri aren't preferred days",
    ]);
    expect(checkIntention(blank({ workPreference: 'part_time' })).warnings).toEqual(['Part time, but every day is a preferred day']);
  });

  it('rejects a day that is both preferred and on leave, or no days at all', () => {
    expect(checkIntention(blank({ leaveDays: weekdays('Fri') })).errors).toEqual([
      "Fri can't be both a preferred day and a leave day",
    ]);
    expect(checkIntention(blank({ preferredDays: NO_DAYS, permanentMilliFte: undefined, employmentType: 'temporary' })).errors).toEqual([
      'No preferred days or leave days',
    ]);
  });
});

describe('linking intentions to staff', () => {
  it('uses the applied staff member, else matches by name ignoring case and spacing', () => {
    const kit = staffNamed('Kit Ashdown');
    expect(staffForIntention(blank({ name: '  kit   ashdown ' }), sample.staff)).toBe(kit);
    expect(staffForIntention(blank({ name: 'Renamed', staffId: kit.id }), sample.staff)).toBe(kit);
    expect(staffForIntention(blank(), sample.staff)).toBeUndefined();
    expect(intentionForStaff(kit, sample.intentions)?.name).toBe('Kit Ashdown');
  });
});

describe('starting from the plan', () => {
  it('takes current days and whole-year leave, so applying it changes nothing', () => {
    for (const s of sample.staff) {
      const i = intentionFromPlan(s, sample.leave, ctx.year, newId);
      expect(checkIntention(i).errors).toEqual([]);
      expect(planApplyIntention(i, ctx, newId).changes).toEqual([]);
    }
    const indi = intentionFromPlan(staffNamed('Indi Calloway'), sample.leave, ctx.year, newId);
    expect([describePattern(indi.preferredDays), describePattern(indi.leaveDays), indi.workPreference, indi.permanentMilliFte]).toEqual([
      'Mon, Tue, Wed',
      'Thu, Fri',
      'part_time',
      1000,
    ]);
  });
});

// Kit, full time in the sample, going part time with LWOP on Thu and Fri.
const kitPartTime: StaffIntention = {
  ...sample.intentions.find((i) => i.name === 'Kit Ashdown')!,
  workPreference: 'part_time',
  preferredDays: weekdays('Mon', 'Tue', 'Wed'),
  leaveDays: weekdays('Thu', 'Fri'),
};

describe('applying an intention', () => {
  it('changes nothing when the plan already matches', () => {
    for (const name of ['Rowan Hale', 'Eli Brookfield', 'Indi Calloway', 'Morgan Pike', 'Tara Quinlan']) {
      expect(planApplyIntention(intention(name), ctx, newId).changes).toEqual([]);
    }
  });

  it('adds whole-year leave for the school year when going part time', () => {
    const plan = planApplyIntention(kitPartTime, ctx, newId);
    expect(plan.changes).toEqual(['Add whole-year Leave without pay (Thu, Fri) for the school year']);
    expect(plan.staff.workPattern).toEqual(FULL_TIME);
    expect(plan.leavePut).toEqual([
      expect.objectContaining({
        staffId: staffNamed('Kit Ashdown').id,
        startDate: '2027-01-28',
        endDate: '2027-12-17',
        leaveType: 'lwop',
        daysAffected: weekdays('Thu', 'Fri'),
      }),
    ]);
  });

  it('changes employment, days and leave type, trimming cover and backfills to the new leave days', () => {
    const plan = planApplyIntention(
      {
        ...intention('Indi Calloway'),
        employmentType: 'twt',
        permanentMilliFte: 800,
        preferredDays: weekdays('Mon', 'Tue', 'Wed'),
        leaveDays: weekdays('Thu'),
        leaveType: 'lsl',
      },
      ctx,
      newId,
    );
    expect(plan.changes).toEqual([
      'Employment: Permanent → TWT',
      'Days worked: Mon, Tue, Wed, Thu, Fri → Mon, Tue, Wed, Thu',
      'Change whole-year Leave without pay (Thu, Fri) → whole-year Long Service Leave (Thu)',
    ]);
    expect(plan.leavePut.map((l) => [l.id, describePattern(l.daysAffected)])).toEqual([['sample-2027-leave-03', 'Thu']]);
    // Tara's cover (Part 2) and backfill (Part 1) shrink to Thursday.
    expect(plan.allocationPut.map((a) => describePattern(a.days))).toEqual(['Thu']);
    expect(plan.matchPut.map((a) => describePattern(a.days))).toEqual(['Thu']);
    expect(plan.followUps).toEqual([
      "Still matched in Part 1 on Fri, which they'd no longer work",
      "Still placed in Part 2 on Fri, which they'd no longer work",
    ]);
  });

  it('removes whole-year leave, with its cover, when there are no leave days', () => {
    const plan = planApplyIntention({ ...intention('Indi Calloway'), preferredDays: FULL_TIME, leaveDays: NO_DAYS }, ctx, newId);
    expect(plan.changes).toEqual([
      'Remove whole-year Leave without pay (Thu, Fri), with its 1 cover allocation(s) and 1 Part 1 backfill(s)',
    ]);
    expect(plan.leaveDelete).toEqual(['sample-2027-leave-03']);
    expect(plan.allocationDelete).toHaveLength(1);
    expect(plan.matchDelete).toHaveLength(1);
  });

  it('leaves part-year leave alone', () => {
    const plan = planApplyIntention(intention('Jules Fernhill'), ctx, newId);
    expect(plan.leaveDelete).toEqual([]);
  });

  it('adds someone new, with their leave', () => {
    const plan = planApplyIntention(
      blank({ workPreference: 'part_time', preferredDays: weekdays('Mon', 'Tue'), leaveDays: weekdays('Wed', 'Thu', 'Fri'), leaveType: 'maternity' }),
      ctx,
      newId,
    );
    expect(plan.isNew).toBe(true);
    expect(plan.staff).toMatchObject({ name: 'Quinn Example', employmentType: 'permanent', workPattern: FULL_TIME });
    expect(plan.intention.staffId).toBe(plan.staff.id);
    expect(plan.leavePut[0]).toMatchObject({ staffId: plan.staff.id, leaveType: 'maternity' });
    expect(plan.changes).toEqual([
      'Add as a new staff member (Permanent, Mon, Tue, Wed, Thu, Fri)',
      'Add whole-year Maternity Leave (Wed, Thu, Fri) for the school year',
    ]);
  });
});

describe('grade preferences', () => {
  it('finds staff placed on a class with none of their preferred grades', () => {
    const found = gradePreferenceMismatches(sample.staff, sample.intentions, sample.classStructures, sample.allocations);
    // Jules (K, 1, 2) is on 3/4 Red. Sam's cover on 3/4 Red and 5/6 Gold suits 3, 4, 5.
    expect(found.map((m) => [m.staff.name, m.classStructure.name])).toEqual([['Jules Fernhill', '3/4 Red']]);
  });

  it('accepts a composite when either grade is preferred, and skips people with no preferences', () => {
    const gus = staffNamed('Gus Penrose');
    const only = (grades: StaffIntention['gradePreferences']) => [{ ...intention('Gus Penrose'), gradePreferences: grades }];
    expect(gradePreferenceMismatches([gus], only(['2']), sample.classStructures, sample.allocations)).toEqual([]);
    expect(gradePreferenceMismatches([gus], only([]), sample.classStructures, sample.allocations)).toEqual([]);
    expect(gradePreferenceMismatches([gus], only(['6']), sample.classStructures, sample.allocations)).toHaveLength(1);
  });
});

describe('intention flags', () => {
  const pending = { ...sample, intentions: sample.intentions.map((i) => (i.name === 'Kit Ashdown' ? kitPartTime : i)) };
  const flags = computeFlags(flagInputFrom(pending)).filter((f) =>
    ['intention_not_applied', 'intention_check', 'grade_preference'].includes(f.kind),
  );

  it('flags details not yet applied, and grade mismatches', () => {
    expect(flags.map((f) => f.message)).toEqual([
      "Kit Ashdown's details for next year aren't applied yet (see the Staff page): Add whole-year Leave without pay (Thu, Fri) for the school year",
      'Jules Fernhill is placed on 3/4 Red, outside their grade preferences (K, 1, 2)',
    ]);
  });

  it('flags intentions that do not add up', () => {
    const bad = { ...intention('Frankie Lowe'), permanentMilliFte: 1000 };
    const messages = computeFlags(flagInputFrom({ ...sample, intentions: [bad] })).map((f) => f.message);
    expect(messages).toContain('Frankie Lowe: Preferred days (0.6) come to 0.6 FTE, not their permanent FTE of 1.0');
  });
});

describe('saving a staff member with their details (one form)', () => {
  const draft = (over: Partial<Parameters<typeof planSaveStaff>[0]> = {}) => ({
    name: 'Quinn Example',
    employmentType: 'permanent' as const,
    permanentMilliFte: 1000,
    substantiveRole: 'Teacher',
    workPreference: 'part_time' as const,
    preferredDays: weekdays('Mon', 'Tue', 'Wed'),
    leaveDays: weekdays('Thu', 'Fri'),
    leaveType: 'lwop' as const,
    gradePreferences: ['K' as const],
    ...over,
  });

  it('adds someone new with their role, days, leave and details together', () => {
    const plan = planSaveStaff(draft(), ctx, {}, newId);
    expect(plan.isNew).toBe(true);
    expect(plan.staff).toMatchObject({ name: 'Quinn Example', currentRole: 'Teacher', workPattern: FULL_TIME });
    expect(plan.leavePut).toEqual([expect.objectContaining({ staffId: plan.staff.id, leaveType: 'lwop' })]);
    expect(plan.intention).toMatchObject({ staffId: plan.staff.id, gradePreferences: ['K'] });
    expect(plan.intention).not.toHaveProperty('substantiveRole');
  });

  it('edits someone, reporting a new name and role, and keeps their details record', () => {
    const kit = staffNamed('Kit Ashdown');
    const plan = planSaveStaff(
      draft({ name: 'Kit Ashdown-Lee', substantiveRole: 'Assistant Principal', preferredDays: FULL_TIME, leaveDays: NO_DAYS, workPreference: 'full_time' }),
      ctx,
      { staff: kit, intention: intention('Kit Ashdown') },
      newId,
    );
    expect(plan.isNew).toBe(false);
    expect(plan.staff.id).toBe(kit.id);
    expect(plan.intention.id).toBe(intention('Kit Ashdown').id);
    expect(plan.changes).toEqual(['Name: Kit Ashdown → Kit Ashdown-Lee', 'Substantive role: Teacher → Assistant Principal']);
  });
});
