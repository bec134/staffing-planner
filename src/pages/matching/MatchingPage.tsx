import { useState } from 'react';
import { HelpLink } from '../../components/HelpLink';
import { Link } from 'react-router-dom';
import { AssignmentGrid } from '../../components/AssignmentGrid';
import { usePlanningYear } from '../../components/PlanningYearContext';
import { describeDayIndices, dayIndices, fteOf } from '../../domain/dayPattern';
import { summariseEntitlement } from '../../domain/entitlement';
import { formatFte, milliFteOf } from '../../domain/fte';
import {
  MATCH_ORDER,
  isWholeYearLeave,
  matchStatus,
  planPositionDaysChange,
  positionsToCreate,
  schoolYear,
  unmatchedDayCount,
} from '../../domain/matching';
import { moveGroup } from '../../domain/positionTypes';
import { EMPLOYMENT_TYPE_LABELS, type Staff } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { usePlanData } from '../../data/usePlanData';
import { bySortOrder, daysLabel, type PlanData } from '../allocation/shared';
import { RoleForm } from '../allocation/RoleForm';
import { EntitlementDashboard } from '../entitlement/EntitlementDashboard';

/**
 * Part 1 (Bec): match staff against the entitlement by day — permanent,
 * then TWT, then temporary. Whole-year leave greys out and can be
 * backfilled; permanent or TWT staff left over can be nominated for transfer.
 */
export function MatchingPage() {
  const { current, loading } = usePlanningYear();
  const data = usePlanData(current?.id);

  if (loading) return <p>Loading…</p>;
  if (!current) {
    return (
      <section>
        <h1>Match staff to entitlement</h1>
        <p>
          No plan yet. <Link to="/">Create a planning year or load the sample plan</Link> first.
        </p>
      </section>
    );
  }
  if (!data) return <p>Loading…</p>;
  return <Matching data={data} />;
}

function Matching({ data }: { data: PlanData }) {
  const repo = useRepository();
  const year = schoolYear(data.planningYear);
  const entitlement = data.entitlements[0];
  const positionTypes = [...data.positionTypes].sort(bySortOrder);
  const summary = summariseEntitlement(entitlement, positionTypes, data.positions, data.matches);
  const missing = positionsToCreate(entitlement, positionTypes, data.positions, data.planningYear.id, () => crypto.randomUUID());
  const wholeYearLeave = data.leave.filter((l) => isWholeYearLeave(l, year));

  return (
    <section>
      <h1>Match staff to entitlement</h1>
      <HelpLink topic="matching" />
      <p className="muted">
        Part 1: match permanent staff first, then TWT, then temporary, against the entitlement positions. Whole-year
        leave greys out and can be backfilled. Classes and roles are set in Part 2.
      </p>
      <p className="panel small">
        {data.staff.length === 0 ? <strong>No staff yet. </strong> : 'Someone missing? '}
        <Link to="/staff">Add staff</Link> on the Staff page, or <Link to="/staff/import">import them from a CSV file</Link>.
      </p>

      {!entitlement || entitlement.totalMilliFte === 0 ? (
        <p className="warning">
          Enter the entitlement first on the <Link to="/entitlement">Entitlement</Link> page.
        </p>
      ) : (
        <>
          {missing.length > 0 && (
            <div className="panel">
              <p>
                {data.positions.length === 0
                  ? 'Create positions from the entitlement to start matching.'
                  : `The entitlement has room for ${missing.length} more position(s).`}
              </p>
              <button onClick={() => void repo.positions.putMany(missing)}>
                {data.positions.length === 0 ? 'Create positions from entitlement' : 'Add missing positions'}
              </button>
            </div>
          )}
          {data.positions.length > 0 && (
            <>
              <AssignmentGrid
                rows={data.positions}
                allocations={data.matches}
                leave={wholeYearLeave}
                staff={data.staff}
                offered={data.staff.filter((s) => !s.nominatedForTransfer)}
                positionTypes={data.positionTypes}
                onMoveGroup={(id, direction) =>
                  void repo.positionTypes.putMany(
                    moveGroup(data.positionTypes, [...new Set(data.positions.map((p) => p.positionTypeId))], id, direction),
                  )
                }
                planningYear={data.planningYear}
                write={async (puts, deletes) => {
                  if (deletes.length) await repo.matches.deleteMany(deletes);
                  if (puts.length) await repo.matches.putMany(puts);
                }}
                saveStaff={(s) => repo.staff.put(s)}
                fillsWeek={(s) => fteOf(s.workPattern) === 1}
                byEmployment
                words={{
                  row: 'Position',
                  cover: 'backfill',
                  result: 'Match result',
                  testPrefix: 'match-',
                  full: 'fully matched',
                  help: (
                    <>
                      Drag a name onto a position and day, or use <strong>+</strong>. A full-time teacher fills the whole
                      week; dropping a name on a position's name fills every day they're free. × removes a day. Greyed
                      tiles are on whole-year leave: drop another teacher there to backfill. Use ↑ and ↓ beside a
                      heading to move that group of positions.
                    </>
                  ),
                }}
              />
              <Positions data={data} />
            </>
          )}
          <Unmatched data={data} />
          <EntitlementDashboard summary={summary} />
        </>
      )}
    </section>
  );
}

/** Edit position days, add or remove positions. */
function Positions({ data }: { data: PlanData }) {
  const repo = useRepository();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const types = [...data.positionTypes].sort(bySortOrder);
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const positions = [...data.positions].sort(bySortOrder);
  const save = async (p: (typeof positions)[number]) => {
    // Matched people move with the position's days (e.g. Monday → Thursday).
    const before = data.positions.find((x) => x.id === p.id);
    const change = before ? planPositionDaysChange(before, p.days, data.matches, data.staff) : undefined;
    if (change?.messages.length && !confirm(`Change the days ${p.name} runs?\n\n${change.messages.join('\n')}`)) return false;
    await repo.positions.put(p);
    if (change?.matchDelete.length) await repo.matches.deleteMany(change.matchDelete);
    if (change?.matchPut.length) await repo.matches.putMany(change.matchPut);
  };

  return (
    <details className="rules">
      <summary>Positions ({positions.length})</summary>
      <p className="muted small">
        Change which days a part position runs (anyone matched moves with it), or add and remove positions.
      </p>
      <table>
        <thead>
          <tr>
            <th>Position</th>
            <th>Type</th>
            <th>Days</th>
            <th className="num">FTE</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {positions.map((p) =>
            editing === p.id ? (
              <tr key={p.id}>
                <td colSpan={5}>
                  <RoleForm
                    planningYearId={data.planningYear.id}
                    positionTypes={types}
                    existing={p}
                    otherNames={positions.filter((x) => x.id !== p.id).map((x) => x.name)}
                    nextSortOrder={p.sortOrder}
                    save={save}
                    noun="position"
                    onDone={() => setEditing(null)}
                  />
                </td>
              </tr>
            ) : (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{typeName.get(p.positionTypeId) ?? 'Deleted position type'}</td>
                <td>{daysLabel(p.days)}</td>
                <td className="num">{formatFte(milliFteOf(p.days))}</td>
                <td className="nowrap">
                  <button className="secondary" onClick={() => setEditing(p.id)}>
                    Edit
                  </button>{' '}
                  <button
                    className="danger"
                    onClick={() => {
                      const matched = data.matches.filter((m) => m.roleId === p.id);
                      if (!confirm(`Delete ${p.name}?${matched.length ? ` Its ${matched.length} match(es) will be removed.` : ''}`)) return;
                      void repo.matches.deleteMany(matched.map((m) => m.id)).then(() => repo.positions.delete(p.id));
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {adding ? (
        <RoleForm
          planningYearId={data.planningYear.id}
          positionTypes={types}
          otherNames={positions.map((x) => x.name)}
          nextSortOrder={Math.max(-1, ...positions.map((x) => x.sortOrder)) + 1}
          save={save}
          noun="position"
          onDone={() => setAdding(false)}
        />
      ) : (
        <button className="secondary" onClick={() => setAdding(true)}>
          Add position
        </button>
      )}
    </details>
  );
}

/** Permanent and TWT staff not fully matched, and nominated transfers. */
function Unmatched({ data }: { data: PlanData }) {
  const repo = useRepository();
  const [nominating, setNominating] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const statuses = data.staff
    .filter((s) => !s.nominatedForTransfer && s.employmentType !== 'temporary')
    .map((s) => matchStatus(s, data.matches))
    .filter((st) => unmatchedDayCount(st) > 0)
    .sort((a, b) => MATCH_ORDER.indexOf(a.staff.employmentType) - MATCH_ORDER.indexOf(b.staff.employmentType));
  const nominated = data.staff.filter((s) => s.nominatedForTransfer);

  const nominate = async (s: Staff) => {
    const matched = data.matches.filter((m) => m.staffId === s.id);
    if (matched.length && !confirm(`${s.name} has ${matched.length} match(es); they will be removed.`)) return;
    await repo.matches.deleteMany(matched.map((m) => m.id));
    await repo.staff.put({ ...s, nominatedForTransfer: true, transferNotes: notes.trim() });
    setNominating(null);
    setNotes('');
  };

  return (
    <section aria-labelledby="unmatched-heading">
      <h2 id="unmatched-heading">Not yet matched</h2>
      {statuses.length === 0 ? (
        <p className="ok">All permanent and TWT staff are fully matched.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Staff member</th>
              <th>Employment</th>
              <th>Unmatched</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {statuses.map((st) => (
              <tr key={st.staff.id}>
                <td>{st.staff.name}</td>
                <td>
                  <span className={`tile emp-${st.staff.employmentType}`}>{EMPLOYMENT_TYPE_LABELS[st.staff.employmentType]}</span>
                </td>
                <td>
                  {formatFte(st.workMilli - st.matchedMilli)} FTE ({describeDayIndices(dayIndices(st.unmatched))})
                </td>
                <td>
                  {nominating === st.staff.id ? (
                    <form
                      className="inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void nominate(st.staff);
                      }}
                    >
                      <label>
                        Notes <input value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus />
                      </label>
                      <button type="submit">Confirm nomination</button>
                      <button type="button" className="secondary" onClick={() => setNominating(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button className="secondary" onClick={() => setNominating(st.staff.id)}>
                      Nominate for transfer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {nominated.length > 0 && (
        <>
          <h3>Nominated for transfer</h3>
          <table>
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Employment</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {nominated.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{EMPLOYMENT_TYPE_LABELS[s.employmentType]}</td>
                  <td>
                    <input
                      aria-label={`Transfer notes for ${s.name}`}
                      defaultValue={s.transferNotes ?? ''}
                      onBlur={(e) => e.target.value !== (s.transferNotes ?? '') && void repo.staff.put({ ...s, transferNotes: e.target.value })}
                    />
                  </td>
                  <td>
                    <button className="secondary" onClick={() => void repo.staff.put({ ...s, nominatedForTransfer: false })}>
                      Withdraw nomination
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
