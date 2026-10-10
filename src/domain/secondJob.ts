/**
 * Second jobs (Bec): someone on whole-year leave from their own position can
 * work elsewhere on those days, e.g. an AP (1.0) on LWOP all year working
 * 0.2 as a temporary teacher. Their own position stays greyed (and is
 * backfilled as usual); the second job is an ordinary match linked to the
 * leave (`secondJobLeaveId`), with its own employment type, so it doesn't
 * clash with the position they're on leave from.
 */
import { dayIndices, describeDayIndices, repeatsWeekly, union, type DayPattern } from './dayPattern';
import type { HigherDutiesInput } from './higherDuties';
import { EMPLOYMENT_TYPE_LABELS, freedBy, type EmploymentType, type EntitlementMatch, type Id, type Leave } from './types';

export type SecondJobPlan =
  | { ok: true; message: string; matchPut: EntitlementMatch[] }
  | { ok: false; error: string };

const patternOf = (indices: number[]): DayPattern => {
  const days = Array.from({ length: 10 }, (_, i) => indices.includes(i));
  return { mode: repeatsWeekly({ mode: 'weekly', days }) ? 'weekly' : 'fortnightly', days };
};
const isWholeYear = (l: Leave, year: { start: string; end: string }) => l.startDate <= year.start && l.endDate >= year.end;

/**
 * Plan matching someone to a position on days they're on whole-year leave
 * from another position. Returns undefined when that isn't the situation
 * (they're free those days, or matched elsewhere and not on leave).
 */
export function planSecondJob(
  input: HigherDutiesInput,
  staffId: Id,
  positionId: Id,
  indices: number[],
  employmentType: EmploymentType,
  newId: () => Id,
): SecondJobPlan | undefined {
  const person = input.staff.find((s) => s.id === staffId);
  const target = input.positions.find((p) => p.id === positionId);
  if (!person || !target) return undefined;
  const nameOf = (id: Id) => input.staff.find((s) => s.id === id)?.name ?? 'someone else';
  const positionName = (id: Id) => input.positions.find((p) => p.id === id)?.name ?? 'their position';

  // Their own matches on each day, and the whole-year leave that frees them.
  const own = input.matches.filter((m) => m.staffId === staffId && m.roleId !== positionId && !m.coveringLeaveId && !freedBy(m));
  const freedOn = new Map<number, Leave>();
  const from = new Set<string>();
  for (const d of indices) {
    const busy = own.filter((m) => m.days.days[d]);
    if (!busy.length) continue;
    const leave = input.leave.find(
      (l) => l.staffId === staffId && l.leaveType !== 'higher_duties' && isWholeYear(l, input.year) && l.daysAffected.days[d],
    );
    if (!leave) return undefined;
    freedOn.set(d, leave);
    for (const m of busy) from.add(positionName(m.roleId));
  }
  if (!freedOn.size) return undefined;
  const notFreed = indices.filter((d) => !freedOn.has(d));
  if (notFreed.length) {
    return { ok: false, error: `Drop ${person.name} on ${describeDayIndices([...freedOn.keys()])} and ${describeDayIndices(notFreed)} separately` };
  }
  const notRunning = indices.filter((d) => !target.days.days[d]);
  if (notRunning.length) return { ok: false, error: `${target.name} doesn't run on ${describeDayIndices(notRunning)}` };

  // Each day is free, or held by someone on whole-year leave (a backfill).
  const groups = new Map<string, { freed: Leave; covering?: Leave; days: number[] }>();
  const held = new Map<string, number[]>();
  const add = (key: string, d: number) => held.set(key, [...(held.get(key) ?? []), d]);
  for (const d of indices) {
    const holder = input.matches.find((m) => m.roleId === positionId && m.staffId !== staffId && !m.coveringLeaveId && m.days.days[d]);
    let covering: Leave | undefined;
    if (holder) {
      covering = input.leave.find(
        (l) => l.staffId === holder.staffId && l.id !== freedBy(holder) && isWholeYear(l, input.year) && l.daysAffected.days[d],
      );
      if (!covering) {
        add(`held by ${nameOf(holder.staffId)}`, d);
        continue;
      }
      const taken = input.matches.find((m) => m.roleId === positionId && m.coveringLeaveId === covering!.id && m.staffId !== staffId && m.days.days[d]);
      if (taken) {
        add(`backfilled by ${nameOf(taken.staffId)}`, d);
        continue;
      }
    }
    const freed = freedOn.get(d)!;
    const key = `${freed.id}|${covering?.id ?? ''}`;
    const entry = groups.get(key) ?? { freed, covering, days: [] };
    entry.days.push(d);
    groups.set(key, entry);
  }

  if (held.size) {
    const [what, dayList] = [...held][0]!;
    return { ok: false, error: `${target.name} is already ${what} on ${describeDayIndices(dayList)}` };
  }

  const matchPut: EntitlementMatch[] = [];
  for (const { freed, covering, days } of groups.values()) {
    const existing = input.matches.find(
      (m) => m.staffId === staffId && m.roleId === positionId && m.secondJobLeaveId === freed.id && m.coveringLeaveId === covering?.id,
    );
    const type = employmentType === person.employmentType ? undefined : employmentType;
    matchPut.push(
      existing
        ? { ...existing, days: patternOf(dayIndices(union([existing.days, patternOf(days)]))), employmentType: type }
        : {
            id: newId(),
            planningYearId: input.planningYearId,
            staffId,
            roleId: positionId,
            days: patternOf(days),
            secondJobLeaveId: freed.id,
            ...(type ? { employmentType: type } : {}),
            ...(covering ? { coveringLeaveId: covering.id, startDate: covering.startDate, endDate: covering.endDate } : {}),
          },
    );
  }
  const dayText = describeDayIndices(indices);
  const backfilling = [...groups.values()].flatMap((g) => (g.covering ? [nameOf(g.covering.staffId)] : []));
  return {
    ok: true,
    matchPut,
    message: `${person.name} is on leave from ${[...from].join(' and ')} on ${dayText}. Match them to ${target.name} on ${dayText} as a second job (${EMPLOYMENT_TYPE_LABELS[employmentType]})${backfilling.length ? `, backfilling ${[...new Set(backfilling)].join(' and ')}'s leave` : ''}?`,
  };
}
