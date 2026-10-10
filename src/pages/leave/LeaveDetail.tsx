import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatRange } from '../../domain/dates';
import { describeDayIndices } from '../../domain/dayPattern';
import { roleLink, staffLink } from '../../domain/flags';
import { formatFte, milliFteOf } from '../../domain/fte';
import { affectedRoles, allocationRange, coverGaps, coversFor } from '../../domain/leave';
import { LEAVE_TYPE_LABELS } from '../../domain/types';
import { tidyHigherDutiesIn } from '../../data/higherDutiesStore';
import { useRepository } from '../../data/RepositoryContext';
import { daysLabel, lookups, type PlanData } from '../allocation/shared';
import { CoverForm } from './CoverForm';
import { LeaveForm } from './LeaveForm';
import { COVER_STATUS_LABELS, coverStatus, leaveDates } from './leaveShared';

export function LeaveDetail({ data }: { data: PlanData }) {
  const { id } = useParams();
  const repo = useRepository();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [addingCover, setAddingCover] = useState(false);
  const [editingCover, setEditingCover] = useState<string | null>(null);
  const leave = data.leave.find((l) => l.id === id);
  if (!leave) {
    return (
      <p>
        Leave not found. <Link to="/leave">Back to leave</Link>
      </p>
    );
  }
  const { staffById, roleById } = lookups(data);
  const staff = staffById.get(leave.staffId);
  const affected = affectedRoles(leave, data.allocations);
  const gaps = coverGaps(leave, data.allocations);
  const covers = coversFor(leave.id, data.allocations);
  const status = coverStatus(leave, data);

  const remove = async () => {
    const extra = [
      leave.leaveType === 'higher_duties' ? ' This ends their higher duties: the match on Match staff is removed too.' : '',
      covers.length ? ` Its ${covers.length} cover allocation(s) will also be removed.` : '',
    ].join('');
    if (!confirm(`Delete this leave?${extra}`)) return;
    await repo.allocations.deleteMany(covers.map((c) => c.id));
    // Part 1 backfills against this leave go too.
    await repo.matches.deleteMany(data.matches.filter((m) => m.coveringLeaveId === leave.id).map((m) => m.id));
    await repo.leave.delete(leave.id);
    await tidyHigherDutiesIn(repo, leave.planningYearId);
    navigate('/leave');
  };

  return (
    <section>
      <p>
        <Link to="/leave">← All leave</Link>
      </p>
      <h2>
        {staff ? <Link to={staffLink(staff.id)}>{staff.name}</Link> : 'Deleted staff member'} —{' '}
        {LEAVE_TYPE_LABELS[leave.leaveType]}
      </h2>
      {editing ? (
        <LeaveForm data={data} existing={leave} onDone={() => setEditing(false)} />
      ) : (
        <>
          <dl className="facts">
            <dt>Dates</dt>
            <dd>{leaveDates(leave)}</dd>
            <dt>Days on leave</dt>
            <dd>
              {daysLabel(leave.daysAffected)} ({formatFte(milliFteOf(leave.daysAffected))} FTE)
            </dd>
            {leave.leaveType === 'higher_duties' && (
              <>
                <dt>Stepping up to</dt>
                <dd>
                  {data.positions.find((p) => p.id === leave.higherDutiesPositionId)?.name ?? 'A deleted position'} (
                  <Link to="/matching">Match staff</Link>)
                </dd>
              </>
            )}
            <dt>Cover</dt>
            <dd>
              <span className={`status ${status}`}>{COVER_STATUS_LABELS[status]}</span>
            </dd>
          </dl>
          <p className="muted small">
            {leave.leaveType === 'higher_duties'
              ? `${staff?.name ?? 'They'} keep${staff ? 's' : ''} their own position, which is backfilled on these days. Change higher duties on Match staff.`
              : `${staff?.name ?? 'They'} keep${staff ? 's' : ''} their position while on leave, so it still counts against entitlement; cover does not.`}
          </p>
          <div className="actions">
            {leave.leaveType !== 'higher_duties' && (
              <button className="secondary" onClick={() => setEditing(true)}>
                Edit leave
              </button>
            )}
            <button className="danger" onClick={() => void remove()}>
              Delete leave
            </button>
          </div>
        </>
      )}

      <h3>Positions left vacant</h3>
      {affected.length === 0 ? (
        <p className="muted">
          {staff?.name} has no allocations on these days, so no cover is needed. Allocate them on the Staff &amp;
          allocation page first if they hold a role.
        </p>
      ) : (
        <ul>
          {affected.map((a) => (
            <li key={a.allocation.id}>
              <Link to={roleLink(a.roleId)}>{roleById.get(a.roleId)?.name ?? 'Deleted role'}</Link> on{' '}
              {daysLabel(a.days)}, {formatRange(a.range)}
            </li>
          ))}
        </ul>
      )}

      {gaps.length > 0 && (
        <>
          <h3>Not yet covered</h3>
          <ul className="warning">
            {gaps.map((g) => (
              <li key={`${g.roleId}-${g.days.join()}-${g.range.start}`}>
                {roleById.get(g.roleId)?.name ?? 'Deleted role'}: {describeDayIndices(g.days)}, {formatRange(g.range)}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Cover</h3>
      {covers.length === 0 ? (
        <p className="muted">No cover assigned.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Covered by</th>
              <th>Role</th>
              <th>Days</th>
              <th>Dates</th>
              <th className="num">FTE</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {covers.map((c) =>
              editingCover === c.id ? (
                <tr key={c.id}>
                  <td colSpan={6}>
                    <CoverForm data={data} leave={leave} existing={c} onDone={() => setEditingCover(null)} />
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td>
                    <Link to={staffLink(c.staffId)}>{staffById.get(c.staffId)?.name ?? 'Deleted staff member'}</Link>
                  </td>
                  <td>{roleById.get(c.roleId)?.name ?? 'Deleted role'}</td>
                  <td>{daysLabel(c.days)}</td>
                  <td>{formatRange(allocationRange(c))}</td>
                  <td className="num">{formatFte(milliFteOf(c.days))}</td>
                  <td className="nowrap">
                    <button type="button" className="secondary" onClick={() => setEditingCover(c.id)}>
                      Edit
                    </button>{' '}
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        if (confirm('Remove this cover?')) void repo.allocations.delete(c.id);
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
      {affected.length > 0 &&
        (addingCover ? (
          <CoverForm data={data} leave={leave} onDone={() => setAddingCover(false)} />
        ) : (
          <button type="button" onClick={() => setAddingCover(true)}>
            Add cover
          </button>
        ))}
    </section>
  );
}
