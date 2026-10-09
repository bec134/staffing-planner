import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlanningYear } from '../../components/PlanningYearContext';
import { staffLink } from '../../domain/flags';
import { formatFte } from '../../domain/fte';
import {
  checkIntention,
  describeGrades,
  intentionForStaff,
  intentionFromPlan,
  planApplyIntention,
  staffForIntention,
  type ApplyPlan,
} from '../../domain/intentions';
import { schoolYear } from '../../domain/matching';
import { EMPLOYMENT_TYPE_LABELS, LEAVE_TYPE_SHORT, WORK_PREFERENCE_LABELS, type StaffIntention } from '../../domain/types';
import type { Repository } from '../../data/repository';
import { useRepository } from '../../data/RepositoryContext';
import { usePlanData } from '../../data/usePlanData';
import { byName, daysLabel, type PlanData } from '../allocation/shared';
import { IntentionForm } from './IntentionForm';
import { IntentionImport } from './IntentionImport';

/**
 * Staff intentions for next year (Bec, Phase 6): entered by hand or
 * imported from CSV, then applied to the plan. Applying sets employment
 * type, days worked and whole-year leave (Part 1); grade preferences show
 * during placement (Part 2).
 */
export function IntentionsPage() {
  const { current, loading } = usePlanningYear();
  const data = usePlanData(current?.id);

  if (loading) return <p>Loading…</p>;
  if (!current) {
    return (
      <section>
        <h1>Staff intentions</h1>
        <p>
          No plan yet. <Link to="/">Create a planning year or load the sample plan</Link> first.
        </p>
      </section>
    );
  }
  if (!data) return <p>Loading…</p>;
  return <Intentions data={data} />;
}

async function savePlans(repo: Repository, plans: ApplyPlan[]) {
  const all = <T,>(pick: (p: ApplyPlan) => T[]) => plans.flatMap(pick);
  await repo.staff.putMany(plans.map((p) => p.staff));
  if (all((p) => p.allocationDelete).length) await repo.allocations.deleteMany(all((p) => p.allocationDelete));
  if (all((p) => p.allocationPut).length) await repo.allocations.putMany(all((p) => p.allocationPut));
  if (all((p) => p.matchDelete).length) await repo.matches.deleteMany(all((p) => p.matchDelete));
  if (all((p) => p.matchPut).length) await repo.matches.putMany(all((p) => p.matchPut));
  if (all((p) => p.leaveDelete).length) await repo.leave.deleteMany(all((p) => p.leaveDelete));
  if (all((p) => p.leavePut).length) await repo.leave.putMany(all((p) => p.leavePut));
  await repo.intentions.putMany(plans.map((p) => p.intention));
}

function Intentions({ data }: { data: PlanData }) {
  const repo = useRepository();
  const [editing, setEditing] = useState<StaffIntention | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const year = schoolYear(data.planningYear);
  const ctx = {
    planningYearId: data.planningYear.id,
    year,
    staff: data.staff,
    leave: data.leave,
    allocations: data.allocations,
    matches: data.matches,
  };

  const rows = [...data.intentions].sort(byName).map((i) => {
    const check = checkIntention(i);
    const plan = check.errors.length ? undefined : planApplyIntention(i, ctx, () => crypto.randomUUID());
    return { i, check, plan, staff: staffForIntention(i, data.staff) };
  });
  const pending = rows.filter((r) => r.plan && r.plan.changes.length > 0);
  const withoutIntentions = data.staff.filter((s) => !intentionForStaff(s, data.intentions));

  const apply = async (plans: ApplyPlan[]) => {
    await savePlans(repo, plans);
    setMessage(`Applied intentions for ${plans.map((p) => p.staff.name).join(', ')}.`);
  };

  return (
    <section>
      <h1>Staff intentions</h1>
      <p className="muted">
        Each staff member's plans for next year. Applying them sets their employment status, days worked (preferred days
        plus whole-year leave days) and whole-year leave, which <Link to="/matching">Part 1</Link> matches against the
        entitlement. Grade preferences show on name tiles when placing staff in <Link to="/allocation">Part 2</Link>.
      </p>
      {message && (
        <p className="ok" role="status">
          {message}
        </p>
      )}

      <div className="actions">
        <button onClick={() => setEditing('new')}>Add intentions</button>
        {withoutIntentions.length > 0 && (
          <button
            className="secondary"
            onClick={() => {
              void repo.intentions.putMany(
                withoutIntentions.map((s) => intentionFromPlan(s, data.leave, year, () => crypto.randomUUID())),
              );
              setMessage(`Started intentions from the current plan for ${withoutIntentions.length} staff member(s). Edit them below.`);
            }}
          >
            Start from current plan ({withoutIntentions.length} staff without intentions)
          </button>
        )}
      </div>
      {editing && (
        <IntentionForm data={data} existing={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
      )}

      {pending.length > 0 && (
        <div className="panel">
          <p>
            {pending.length} staff member{pending.length === 1 ? "'s" : "s'"} intentions differ from the plan. Review the
            changes below, then apply them.
          </p>
          <button
            onClick={() => {
              if (!confirm(`Apply intentions for ${pending.map((r) => r.i.name).join(', ')}?`)) return;
              void apply(pending.map((r) => r.plan!));
            }}
          >
            Apply all {pending.length} to the plan
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="muted">No intentions yet. Add them by hand or import a CSV below.</p>
      ) : (
        <table className="intentions">
          <thead>
            <tr>
              <th>Name</th>
              <th>Employment</th>
              <th className="num">Permanent FTE</th>
              <th>Preference</th>
              <th>Preferred days</th>
              <th>Whole year leave</th>
              <th>Grades</th>
              <th>In the plan</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ i, check, plan, staff }) => (
              <tr key={i.id} className={check.errors.length ? 'row-error' : ''} data-testid={`intention-${i.name}`}>
                <td>{staff ? <Link to={staffLink(staff.id)}>{i.name}</Link> : i.name}</td>
                <td>{EMPLOYMENT_TYPE_LABELS[i.employmentType]}</td>
                <td className="num">{i.permanentMilliFte !== undefined ? formatFte(i.permanentMilliFte) : '—'}</td>
                <td>{WORK_PREFERENCE_LABELS[i.workPreference]}</td>
                <td>{daysLabel(i.preferredDays)}</td>
                <td>{i.leaveDays.days.some(Boolean) ? `${daysLabel(i.leaveDays)} (${LEAVE_TYPE_SHORT[i.leaveType]})` : '—'}</td>
                <td>{describeGrades(i.gradePreferences) || '—'}</td>
                <td>
                  {[...check.errors, ...check.warnings].map((w) => (
                    <div key={w} className="check-warning small">
                      {w}
                    </div>
                  ))}
                  {plan && plan.changes.length === 0 && <span className="status covered">Up to date</span>}
                  {plan && plan.changes.length > 0 && (
                    <>
                      <span className="status partial">Not applied</span>
                      <ul className="small">
                        {plan.changes.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                        {plan.followUps.map((c) => (
                          <li key={c} className="muted">
                            Then: {c}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </td>
                <td className="actions">
                  {plan && plan.changes.length > 0 && (
                    <button className="small" onClick={() => void apply([plan])}>
                      Apply
                    </button>
                  )}
                  <button className="secondary small" onClick={() => setEditing(i)}>
                    Edit
                  </button>
                  <button
                    className="danger small"
                    onClick={() => {
                      if (confirm(`Delete ${i.name}'s intentions? The plan isn't changed.`)) void repo.intentions.delete(i.id);
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <IntentionImport data={data} onDone={(n) => setMessage(`Imported ${n} intention(s). Review and apply them above.`)} />
    </section>
  );
}
