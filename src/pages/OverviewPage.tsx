import { useEffect, useState } from 'react';
import { HelpLink } from '../components/HelpLink';
import { describePattern, fteOf } from '../domain/dayPattern';
import {
  EMPLOYMENT_TYPE_LABELS,
  POSITION_CATEGORY_LABELS,
  type PositionType,
  type Staff,
} from '../domain/types';
import { useRepository } from '../data/RepositoryContext';
import { buildSampleData, SAMPLE_PLANNING_YEAR_ID } from '../data/sampleData';
import { BackupPanel, RestorePanel } from '../components/BackupPanels';
import { NewPlanningYearForm } from '../components/NewPlanningYearForm';
import { usePlanningYear } from '../components/PlanningYearContext';

export function OverviewPage() {
  const repo = useRepository();
  const { years, current, loading, select, refresh } = usePlanningYear();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [positionTypes, setPositionTypes] = useState<PositionType[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!current) {
      setStaff([]);
      setPositionTypes([]);
      return;
    }
    let cancelled = false;
    void Promise.all([repo.staff.listByYear(current.id), repo.positionTypes.listByYear(current.id)]).then(
      ([s, p]) => {
        if (cancelled) return;
        setStaff([...s].sort((a, b) => a.name.localeCompare(b.name)));
        setPositionTypes([...p].sort((a, b) => a.sortOrder - b.sortOrder));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repo, current]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const loadSample = () =>
    run(async () => {
      const hasSample = years.some((y) => y.id === SAMPLE_PLANNING_YEAR_ID);
      if (hasSample && !confirm('Reset the fictional sample plan? Any changes made to it will be lost.')) return;
      await repo.importPlanningYear(buildSampleData());
      select(SAMPLE_PLANNING_YEAR_ID);
    });

  const clearAll = () =>
    run(async () => {
      if (!confirm('Delete ALL planning data stored in this browser? This cannot be undone.')) return;
      await repo.clearAll();
    });

  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h1>Overview</h1>
      <HelpLink topic="plans" />

      {years.length === 0 ? (
        <p>
          No plans are stored in this browser yet. Restore a previous session from a backup file, create a planning year
          below, or load the fictional sample plan to explore the app.
        </p>
      ) : (
        <label className="field">
          Planning year{' '}
          <select value={current?.id} onChange={(e) => select(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.year} · {y.schoolName}
              </option>
            ))}
          </select>
        </label>
      )}

      <RestorePanel />
      {current && <BackupPanel planningYearId={current.id} />}

      <h2>New planning year</h2>
      <p className="muted small">Starts with the standard position types and a blank entitlement.</p>
      <NewPlanningYearForm
        onCreated={async (id) => {
          await refresh();
          select(id);
        }}
      />

      <div className="actions">
        <button className="secondary" onClick={loadSample} disabled={busy}>
          Load fictional sample plan
        </button>
        <button className="danger" onClick={clearAll} disabled={busy || years.length === 0}>
          Delete all data in this browser
        </button>
      </div>

      {current && (
        <>
          <h2>
            {current.schoolName} — {current.year}
          </h2>

          <h3>Position types ({positionTypes.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Position type</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {positionTypes.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{POSITION_CATEGORY_LABELS[p.category]}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Staff ({staff.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Current role</th>
                <th>Employment</th>
                <th>Days</th>
                <th className="num">FTE</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.currentRole}</td>
                  <td>{EMPLOYMENT_TYPE_LABELS[s.employmentType]}</td>
                  <td>{describePattern(s.workPattern)}</td>
                  <td className="num">{fteOf(s.workPattern).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
