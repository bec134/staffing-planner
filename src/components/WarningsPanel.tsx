import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { computeFlags, flagInputFrom } from '../domain/flags';
import { usePlanData } from '../data/usePlanData';
import { usePlanningYear } from './PlanningYearContext';

/** The automatic flags for the current plan, on every screen. */
export function WarningsPanel() {
  const { current } = usePlanningYear();
  const data = usePlanData(current?.id);
  const flags = useMemo(
    () =>
      data
        ? computeFlags(flagInputFrom(data))
        : [],
    [data],
  );
  if (!current || !data) return null;
  if (flags.length === 0) {
    return (
      <div className="warnings-panel clear" role="status">
        No warnings
      </div>
    );
  }
  return (
    <details className="warnings-panel" open>
      <summary>
        Warnings ({flags.length})
      </summary>
      <ul>
        {flags.map((f) => (
          <li key={f.key} className={`flag ${f.kind}`}>
            <Link to={f.link}>{f.message}</Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
