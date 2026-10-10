import { useState } from 'react';
import { FORTNIGHT_DAYS, WEEKDAYS, dayIndices, describeDayIndices, repeatsWeekly, type DayPattern } from '../../domain/dayPattern';
import { formatFte, milliFteOf } from '../../domain/fte';
import { planSplitPosition } from '../../domain/matching';
import type { EntitlementPosition } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import type { PlanData } from '../allocation/shared';

/**
 * Split a position into parts (Bec: e.g. 1.0 into 0.4 + 0.4 + 0.2). Each of
 * its days is given to a part; part 1 stays as this position and the rest
 * become new positions. Anyone matched follows their days.
 */
export function SplitPosition({ data, position, typeName, onDone }: {
  data: PlanData;
  position: EntitlementPosition;
  typeName: string;
  onDone(): void;
}) {
  const repo = useRepository();
  // Weekly positions split by weekday (both weeks together); others by fortnight day.
  const weekly = repeatsWeekly(position.days);
  const slots = (weekly ? dayIndices(position.days).filter((d) => d < WEEKDAYS.length) : dayIndices(position.days)).map((d) =>
    weekly ? [d, d + WEEKDAYS.length] : [d],
  );
  const [partCount, setPartCount] = useState(2);
  const [partOf, setPartOf] = useState<number[]>(() => slots.map(() => 0));
  const [error, setError] = useState<string | null>(null);

  const parts: DayPattern[] = [...Array(partCount).keys()].map((p) => {
    const days = Array<boolean>(FORTNIGHT_DAYS).fill(false);
    slots.forEach((slot, i) => partOf[i] === p && slot.forEach((d) => (days[d] = true)));
    return { mode: 'fortnightly', days };
  });

  const split = async () => {
    const plan = planSplitPosition(position, parts, data.positions, data.matches, data.staff, typeName, () => crypto.randomUUID());
    if (typeof plan === 'string') return setError(plan);
    const summary = plan.positionPut.map((p) => `${p.name}: ${describeDayIndices(dayIndices(p.days))} (${formatFte(milliFteOf(p.days))})`);
    if (!confirm(`Split ${position.name}?\n\n${[...summary, ...plan.messages].join('\n')}`)) return;
    await repo.positions.putMany(plan.positionPut);
    if (plan.matchPut.length) await repo.matches.putMany(plan.matchPut);
    onDone();
  };

  return (
    <div className="panel" role="group" aria-label={`Split ${position.name}`}>
      <p>
        <strong>Split {position.name}</strong> ({formatFte(milliFteOf(position.days))} FTE). Choose which part each day goes to.
        Part 1 stays as {position.name}; the others become new {typeName} positions. Anyone matched moves with their days.
      </p>
      <table className="split-table">
        <thead>
          <tr>
            <th>Day</th>
            {[...Array(partCount).keys()].map((p) => (
              <th key={p}>Part {p + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot, i) => {
            const label = describeDayIndices(slot);
            return (
              <tr key={label}>
                <th scope="row">{label}</th>
                {[...Array(partCount).keys()].map((p) => (
                  <td key={p}>
                    <input
                      type="radio"
                      name={`split-${position.id}-${i}`}
                      aria-label={`${label} in part ${p + 1}`}
                      checked={partOf[i] === p}
                      onChange={() => setPartOf((cur) => cur.map((x, j) => (j === i ? p : x)))}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
          <tr>
            <th scope="row">FTE</th>
            {parts.map((part, p) => (
              <td key={p}>{formatFte(milliFteOf(part))}</td>
            ))}
          </tr>
        </tbody>
      </table>
      {error && <p className="field-error">{error}</p>}
      <div className="actions">
        <button type="button" className="secondary" onClick={() => setPartCount((c) => c + 1)} disabled={partCount >= slots.length}>
          Add a part
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setPartCount((c) => c - 1);
            setPartOf((cur) => cur.map((x) => (x >= partCount - 1 ? 0 : x)));
          }}
          disabled={partCount <= 2}
        >
          Remove a part
        </button>
        <button type="button" onClick={() => void split()}>
          Split position
        </button>
        <button type="button" className="secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
