import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { unfilledDays } from '../../domain/allocation';
import { formatFte, milliFteOf } from '../../domain/fte';
import { useRepository } from '../../data/RepositoryContext';
import { AllocationTable } from './AllocationTable';
import { RoleForm } from './RoleForm';
import { bySortOrder, daysLabel, lookups, type PlanData } from './shared';

export function RoleDetail({ data }: { data: PlanData }) {
  const { id } = useParams();
  const repo = useRepository();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const role = data.roles.find((r) => r.id === id);
  if (!role) {
    return (
      <p>
        Role not found. <Link to="/allocation/roles">Back to roles</Link>
      </p>
    );
  }
  const { positionTypeById } = lookups(data);
  const allocations = data.allocations.filter((a) => a.roleId === role.id);
  const filledMilli = allocations.filter((a) => !a.coveringLeaveId).reduce((s, a) => s + milliFteOf(a.days), 0);

  const remove = async () => {
    const extra = allocations.length ? ` Its ${allocations.length} allocation(s) will also be removed.` : '';
    if (!confirm(`Delete role "${role.name}"?${extra}`)) return;
    await repo.allocations.deleteMany(allocations.map((a) => a.id));
    await repo.roles.delete(role.id);
    navigate('/allocation/roles');
  };

  return (
    <section>
      <p>
        <Link to="/allocation/roles">← All roles</Link>
      </p>
      <h2>{role.name}</h2>
      {editing ? (
        <RoleForm
          planningYearId={data.planningYear.id}
          positionTypes={[...data.positionTypes].sort(bySortOrder)}
          existing={role}
          otherNames={data.roles.filter((r) => r.id !== role.id).map((r) => r.name)}
          nextSortOrder={role.sortOrder}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <dl className="facts">
            <dt>Position type</dt>
            <dd>{positionTypeById.get(role.positionTypeId)?.name ?? 'Deleted position type'}</dd>
            <dt>Runs</dt>
            <dd>
              {daysLabel(role.days)} ({formatFte(milliFteOf(role.days))} FTE)
            </dd>
            <dt>Filled</dt>
            <dd>{formatFte(filledMilli)} FTE</dd>
            <dt>Unfilled days</dt>
            <dd>{daysLabel(unfilledDays(role, data.allocations)) === 'none' ? '—' : daysLabel(unfilledDays(role, data.allocations))}</dd>
          </dl>
          <div className="actions">
            <button className="secondary" onClick={() => setEditing(true)}>
              Edit role
            </button>
            <button className="danger" onClick={() => void remove()}>
              Delete role
            </button>
          </div>
        </>
      )}
      <AllocationTable data={data} show="staff" allocations={allocations} fixed={{ roleId: role.id }} />
    </section>
  );
}
