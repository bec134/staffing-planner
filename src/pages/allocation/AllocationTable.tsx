import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatRange } from '../../domain/dates';
import { leaveLink, roleLink, staffLink } from '../../domain/flags';
import { allocationRange } from '../../domain/leave';
import { formatFte, milliFteOf } from '../../domain/fte';
import type { Allocation } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { AllocationForm } from './AllocationForm';
import { daysLabel, lookups, type PlanData } from './shared';

/** Allocations for one staff member or one role, with edit and remove. */
export function AllocationTable({ data, show, allocations, fixed }: {
  data: PlanData;
  show: 'role' | 'staff';
  allocations: Allocation[];
  fixed: { staffId: string } | { roleId: string };
}) {
  const repo = useRepository();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { staffById, roleById, positionTypeById } = lookups(data);

  return (
    <section>
      <h2>Allocations</h2>
      {allocations.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{show === 'role' ? 'Role' : 'Staff member'}</th>
              {show === 'role' && <th>Position type</th>}
              <th>Days</th>
              <th className="num">FTE</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {allocations.map((a) => {
              const role = roleById.get(a.roleId);
              const staff = staffById.get(a.staffId);
              return editing === a.id ? (
                <tr key={a.id}>
                  <td colSpan={5}>
                    <AllocationForm data={data} fixed={fixed} existing={a} onDone={() => setEditing(null)} />
                  </td>
                </tr>
              ) : (
                <tr key={a.id}>
                  <td>
                    {show === 'role' ? (
                      role ? <Link to={roleLink(role.id)}>{role.name}</Link> : 'Deleted role'
                    ) : staff ? (
                      <Link to={staffLink(staff.id)}>{staff.name}</Link>
                    ) : (
                      'Deleted staff member'
                    )}
                    {a.coveringLeaveId && <span className="badge">cover</span>}
                    {a.coveringLeaveId && <div className="muted small">{formatRange(allocationRange(a))}</div>}
                  </td>
                  {show === 'role' && <td>{role ? positionTypeById.get(role.positionTypeId)?.name : ''}</td>}
                  <td>{daysLabel(a.days)}</td>
                  <td className="num">{formatFte(milliFteOf(a.days))}</td>
                  <td className="nowrap">
                    {a.coveringLeaveId ? (
                      <Link to={leaveLink(a.coveringLeaveId)}>Manage on the leave page</Link>
                    ) : (
                      <>
                    <button type="button" className="secondary" onClick={() => setEditing(a.id)}>
                      Edit
                    </button>{' '}
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        if (confirm('Remove this allocation?')) void repo.allocations.delete(a.id);
                      }}
                    >
                      Remove
                    </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {adding ? (
        <AllocationForm data={data} fixed={fixed} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)}>
          Add allocation
        </button>
      )}
    </section>
  );
}
