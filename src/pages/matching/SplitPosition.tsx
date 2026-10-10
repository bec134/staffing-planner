import { useState } from 'react';
import { DayPatternEditor } from '../../components/DayPatternEditor';
import { dayIndices, describeDayIndices, emptyPattern, type DayPattern } from '../../domain/dayPattern';
import { formatFte, milliFteOf } from '../../domain/fte';
import { planSplitPosition } from '../../domain/matching';
import type { EntitlementPosition } from '../../domain/types';
import { tidyHigherDutiesIn } from '../../data/higherDutiesStore';
import { useRepository } from '../../data/RepositoryContext';
import type { PlanData } from '../allocation/shared';

/**
 * Split a position into parts (Bec: e.g. 1.0 into 0.4 + 0.4 + 0.2). Each
 * part has its own days, which may overlap (two parts on Wed–Thu), as long
 * as they add up to the position's FTE. Part 1 stays as this position and
 * the rest become new positions; anyone matched follows their days.
 */
export function SplitPosition({ data, position, typeName, onDone }: {
  data: PlanData;
  position: EntitlementPosition;
  typeName: string;
  onDone(): void;
}) {
  const repo = useRepository();
  const [parts, setParts] = useState<DayPattern[]>(() => [position.days, emptyPattern(position.days.mode)]);
  const [error, setError] = useState<string | null>(null);
  const whole = milliFteOf(position.days);
  const total = parts.reduce((sum, p) => sum + milliFteOf(p), 0);

  const split = async () => {
    const plan = planSplitPosition(position, parts, data.positions, data.matches, data.staff, typeName, () => crypto.randomUUID());
    if (typeof plan === 'string') return setError(plan);
    const summary = plan.positionPut.map((p) => `${p.name}: ${describeDayIndices(dayIndices(p.days))} (${formatFte(milliFteOf(p.days))})`);
    if (!confirm(`Split ${position.name}?\n\n${[...summary, ...plan.messages].join('\n')}`)) return;
    await repo.positions.putMany(plan.positionPut);
    if (plan.matchDelete.length) await repo.matches.deleteMany(plan.matchDelete);
    if (plan.matchPut.length) await repo.matches.putMany(plan.matchPut);
    await tidyHigherDutiesIn(repo, data.planningYear.id);
    onDone();
  };

  return (
    <div className="panel" role="group" aria-label={`Split ${position.name}`}>
      <p>
        <strong>Split {position.name}</strong> ({formatFte(whole)} FTE, {describeDayIndices(dayIndices(position.days))}). Tick
        the days for each part. Parts can share days (for example two 0.4 parts both on Wed–Thu), as long as they add up
        to {formatFte(whole)} FTE. Part 1 stays as {position.name}; the others become new {typeName} positions. Anyone
        matched moves with their days.
      </p>
      {parts.map((part, i) => (
        <DayPatternEditor
          key={i}
          legend={`Part ${i + 1}`}
          value={part}
          onChange={(value) => setParts((cur) => cur.map((p, j) => (j === i ? value : p)))}
        />
      ))}
      <p className={total === whole ? 'ok' : 'warning'} role="status" aria-label="Split check">
        Parts add up to {formatFte(total)} of {formatFte(whole)} FTE.
      </p>
      {error && <p className="field-error">{error}</p>}
      <div className="actions">
        <button type="button" className="secondary" onClick={() => setParts((cur) => [...cur, emptyPattern(position.days.mode)])}>
          Add a part
        </button>
        <button type="button" className="secondary" onClick={() => setParts((cur) => cur.slice(0, -1))} disabled={parts.length <= 2}>
          Remove a part
        </button>
        <button type="button" onClick={() => void split()} disabled={total !== whole}>
          Split position
        </button>
        <button type="button" className="secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
