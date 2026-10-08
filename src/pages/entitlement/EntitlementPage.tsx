import { Link } from 'react-router-dom';
import { summariseEntitlement } from '../../domain/entitlement';
import type { Entitlement } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { usePlanningYear } from '../../components/PlanningYearContext';
import { EntitlementDashboard } from './EntitlementDashboard';
import { EntitlementForm } from './EntitlementForm';
import { PositionTypesEditor } from './PositionTypesEditor';
import { useEntitlementData } from './useEntitlementData';

export function EntitlementPage() {
  const repo = useRepository();
  const { current, loading } = usePlanningYear();
  const { data, reload } = useEntitlementData(current?.id);

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

  const summary = summariseEntitlement(data.entitlement, data.positionTypes, data.allocations);
  const save = async (entitlement: Entitlement) => {
    await repo.entitlements.put(entitlement);
    await reload();
  };

  return (
    <section>
      <h1>Entitlement</h1>
      <p className="muted">
        {current.schoolName} — {current.year}
      </p>
      <EntitlementDashboard summary={summary} />
      <EntitlementForm
        planningYearId={current.id}
        positionTypes={data.positionTypes}
        entitlement={data.entitlement}
        onSave={save}
      />
      <PositionTypesEditor
        planningYearId={current.id}
        positionTypes={data.positionTypes}
        entitlement={data.entitlement}
        allocations={data.allocations}
        onChange={reload}
      />
    </section>
  );
}
