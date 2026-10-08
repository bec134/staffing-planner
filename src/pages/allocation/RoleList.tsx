import { useState } from 'react';
import { Link } from 'react-router-dom';
import { unfilledDays } from '../../domain/allocation';
import { roleLink, staffLink } from '../../domain/flags';
import { formatFte, milliFteOf } from '../../domain/fte';
import { RoleForm } from './RoleForm';
import { bySortOrder, daysLabel, lookups, type PlanData } from './shared';

export function RoleList({ data }: { data: PlanData }) {
  const [adding, setAdding] = useState(false);
  const { staffById, positionTypeById } = lookups(data);
  const positionTypes = [...data.positionTypes].sort(bySortOrder);
  // Group roles by position type, in position-type order.
  const roles = [...data.roles].sort(
    (a, b) =>
      (positionTypeById.get(a.positionTypeId)?.sortOrder ?? 999) -
        (positionTypeById.get(b.positionTypeId)?.sortOrder ?? 999) || bySortOrder(a, b),
  );

  return (
    <section>
      <div className="actions">{!adding && <button onClick={() => setAdding(true)}>Add role</button>}</div>
      {adding && (
        <RoleForm
          planningYearId={data.planningYear.id}
          positionTypes={positionTypes}
          otherNames={data.roles.map((r) => r.name)}
          nextSortOrder={Math.max(-1, ...data.roles.map((r) => r.sortOrder)) + 1}
          onDone={() => setAdding(false)}
        />
      )}
      {roles.length === 0 ? (
        <p className="muted">No roles yet. Add roles such as classes, RFF or Learning &amp; Support, then allocate staff.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Position type</th>
              <th>Runs</th>
              <th className="num">FTE</th>
              <th>Held by</th>
              <th>Unfilled days</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => {
              const holders = data.allocations.filter((a) => a.roleId === r.id);
              const unfilled = daysLabel(unfilledDays(r, data.allocations));
              return (
                <tr key={r.id}>
                  <td>
                    <Link to={roleLink(r.id)}>{r.name}</Link>
                  </td>
                  <td>{positionTypeById.get(r.positionTypeId)?.name ?? <em>Deleted position type</em>}</td>
                  <td>{daysLabel(r.days)}</td>
                  <td className="num">{formatFte(milliFteOf(r.days))}</td>
                  <td>
                    {holders.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      holders.map((a) => {
                        const s = staffById.get(a.staffId);
                        return (
                          <div key={a.id}>
                            {s ? <Link to={staffLink(s.id)}>{s.name}</Link> : 'Deleted staff member'}{' '}
                            <span className="muted small">({daysLabel(a.days)})</span>
                          </div>
                        );
                      })
                    )}
                  </td>
                  <td className={unfilled === 'none' ? '' : 'unfilled'}>{unfilled === 'none' ? '—' : unfilled}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
