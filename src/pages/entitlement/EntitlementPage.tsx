import { Link } from 'react-router-dom';
import { summariseEntitlement } from '../../domain/entitlement';
import type { Entitlement } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { usePlanData } from '../../data/usePlanData';
import { usePlanningYear } from '../../components/PlanningYearContext';
import { EntitlementDashboard } from './EntitlementDashboard';
import { EntitlementForm } from './EntitlementForm';
import { PositionTypesEditor } from './PositionTypesEditor';

export function EntitlementPage() {
  const repo = useRepository();
  const { current, loading } = usePlanningYear();
  const data = usePlanData(current?.id);

  if (loading) return <p>Loading…</p>;
  if (!current) {
    return (
      <section>
        <h1>Entitlement</h1>
        <p>
          No plan yet. <Link to="/">Create a planning year or load the sample plan</Link> first.
        </p>
      </section>
    );
  }
  if (!data) return <p>Loading…</p>;

  const positionTypes = [...data.positionTypes].sort((a, b) => a.sortOrder - b.sortOrder);
  const entitlement = data.entitlements[0];
  const summary = summariseEntitlement(entitlement, positionTypes, data.roles, data.allocations);
  const save = (e: Entitlement) => repo.entitlements.put(e);

  return (
    <section>
      <h1>Entitlement</h1>
      <p className="muted">
        {current.schoolName} — {current.year}
      </p>
      <EntitlementDashboard summary={summary} />
      <EntitlementForm
        planningYearId={current.id}
        positionTypes={positionTypes}
        entitlement={entitlement}
        onSave={save}
      />
      <PositionTypesEditor
        planningYearId={current.id}
        positionTypes={positionTypes}
        entitlement={entitlement}
        roles={data.roles}
      />
    </section>
  );
}
