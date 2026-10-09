import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { staffBusyDays } from '../../domain/allocation';
import { subtract } from '../../domain/dayPattern';
import { leaveLink, staffLink, type Flag } from '../../domain/flags';
import { formatRange } from '../../domain/dates';
import { leaveRange } from '../../domain/leave';
import { formatFte, milliFteOf } from '../../domain/fte';
import { describeGrades, intentionForStaff } from '../../domain/intentions';
import { EMPLOYMENT_TYPE_LABELS, LEAVE_TYPE_LABELS, WORK_PREFERENCE_LABELS } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { AllocationTable } from './AllocationTable';
import { StaffForm } from './StaffForm';
import { daysLabel, type PlanData } from './shared';

export function StaffDetail({ data, flags }: { data: PlanData; flags: Flag[] }) {
  const { id } = useParams();
  const repo = useRepository();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const staff = data.staff.find((s) => s.id === id);
  if (!staff) {
    return (
      <p>
        Staff member not found. <Link to="/allocation">Back to staff</Link>
      </p>
    );
  }

  const allocations = data.allocations.filter((a) => a.staffId === staff.id);
  const allocatedMilli = allocations.reduce((s, a) => s + milliFteOf(a.days), 0);
  const unallocated = subtract(staff.workPattern, staffBusyDays(staff.id, data.allocations));
  const myFlags = flags.filter((f) => f.link === staffLink(staff.id));
  const intention = intentionForStaff(staff, data.intentions);

  const leave = data.leave.filter((l) => l.staffId === staff.id).sort((a, b) => a.startDate.localeCompare(b.startDate));

  const remove = async () => {
    // Their allocations, their leave, and any cover arranged for that leave.
    const leaveIds = new Set(leave.map((l) => l.id));
    const doomed = data.allocations.filter((a) => a.staffId === staff.id || (a.coveringLeaveId && leaveIds.has(a.coveringLeaveId)));
    const parts = [
      doomed.length ? `${doomed.length} allocation(s)` : '',
      leave.length ? `${leave.length} leave record(s)` : '',
      intention ? 'intentions' : '',
    ].filter(Boolean);
    const extra = parts.length ? ` Their ${parts.join(' and ')} will also be removed.` : '';
    if (!confirm(`Delete ${staff.name}?${extra}`)) return;
    await repo.allocations.deleteMany(doomed.map((a) => a.id));
    // Part 1 too: their matches, and backfills against their leave.
    await repo.matches.deleteMany(
      data.matches
        .filter((m) => m.staffId === staff.id || (m.coveringLeaveId && leaveIds.has(m.coveringLeaveId)))
        .map((m) => m.id),
    );
    await repo.leave.deleteMany([...leaveIds]);
    if (intention) await repo.intentions.delete(intention.id);
    await repo.staff.delete(staff.id);
    navigate('/allocation');
  };

  return (
    <section>
      <p>
        <Link to="/allocation">← All staff</Link>
      </p>
      <h2>{staff.name}</h2>
      {myFlags.length > 0 && (
        <ul className="warning">
          {myFlags.map((f) => (
            <li key={f.key}>{f.message}</li>
          ))}
        </ul>
      )}
      {editing ? (
        <StaffForm
          planningYearId={data.planningYear.id}
          existing={staff}
          otherNames={data.staff.filter((s) => s.id !== staff.id).map((s) => s.name)}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <dl className="facts">
            <dt>Employment</dt>
            <dd>{EMPLOYMENT_TYPE_LABELS[staff.employmentType]}</dd>
            <dt>Current role</dt>
            <dd>{staff.currentRole || '—'}</dd>
            <dt>Days worked</dt>
            <dd>
              {daysLabel(staff.workPattern)} ({formatFte(milliFteOf(staff.workPattern))} FTE)
            </dd>
            <dt>Allocated</dt>
            <dd>{formatFte(allocatedMilli)} FTE</dd>
            <dt>Unallocated days</dt>
            <dd>{daysLabel(unallocated) === 'none' ? '—' : daysLabel(unallocated)}</dd>
            <dt>Intentions</dt>
            <dd>
              {intention ? (
                <>
                  {WORK_PREFERENCE_LABELS[intention.workPreference]}, prefers {daysLabel(intention.preferredDays)}
                  {intention.gradePreferences.length > 0 && `; grades ${describeGrades(intention.gradePreferences)}`}.{' '}
                </>
              ) : (
                'None entered. '
              )}
              <Link to="/intentions">Staff intentions</Link>
            </dd>
          </dl>
          <div className="actions">
            <button className="secondary" onClick={() => setEditing(true)}>
              Edit details
            </button>
            <button className="danger" onClick={() => void remove()}>
              Delete staff member
            </button>
          </div>
        </>
      )}
      <AllocationTable data={data} show="role" allocations={allocations} fixed={{ staffId: staff.id }} />
      <h2>Leave</h2>
      {leave.length === 0 ? (
        <p className="muted">
          None. <Link to="/leave">Record leave</Link>
        </p>
      ) : (
        <ul>
          {leave.map((l) => (
            <li key={l.id}>
              <Link to={leaveLink(l.id)}>{LEAVE_TYPE_LABELS[l.leaveType]}</Link>, {formatRange(leaveRange(l))} (
              {daysLabel(l.daysAffected)})
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
