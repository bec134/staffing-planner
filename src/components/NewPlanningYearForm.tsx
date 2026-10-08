import { useState } from 'react';
import { newPlanningYear, validateNewPlanningYear } from '../domain/planningYear';
import type { Id } from '../domain/types';
import { useRepository } from '../data/RepositoryContext';

export function NewPlanningYearForm({ onCreated }: { onCreated(id: Id): Promise<void> }) {
  const repo = useRepository();
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [schoolName, setSchoolName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const problem = validateNewPlanningYear(Number(year), schoolName);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const plan = newPlanningYear(Number(year), schoolName);
      await repo.importPlanningYear({
        planningYear: plan.planningYear,
        positionTypes: plan.positionTypes,
        entitlements: [plan.entitlement],
        staff: [],
        roles: [],
        leave: [],
        allocations: [],
        classStructures: [],
        enrolments: [],
        classRules: [],
        positions: [],
        matches: [],
      });
      setSchoolName('');
      await onCreated(plan.planningYear.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="inline-form"
      aria-label="New planning year"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <label>
        Year <input className="short" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
      </label>
      <label>
        School name <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
      </label>
      <button type="submit" disabled={busy}>
        Create planning year
      </button>
      {error && <span className="field-error">{error}</span>}
    </form>
  );
}
