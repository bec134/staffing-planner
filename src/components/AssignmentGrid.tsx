import { useState, type DragEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { staffBusyDays } from '../domain/allocation';
import { formatDate, formatRange } from '../domain/dates';
import { FORTNIGHT_DAYS, WEEKDAYS, describeDayIndices, dayIndices, repeatsWeekly, subtract, union } from '../domain/dayPattern';
import { staffLink } from '../domain/flags';
import { allocationRange, leaveRange } from '../domain/leave';
import {
  applyRemove,
  candidatesFor,
  cellView,
  planAssign,
  planFill,
  planRemove,
  type GridData,
  type Tile,
} from '../domain/roleGrid';
import { schoolYear } from '../domain/matching';
import {
  EMPLOYMENT_TYPE_LABELS,
  LEAVE_TYPE_SHORT,
  type Allocation,
  type Leave,
  type PlanningYear,
  type PositionType,
  type Role,
  type Staff,
} from '../domain/types';
import { byName, bySortOrder, daysLabel } from '../pages/allocation/shared';

/** What is being dragged: a staff member from the list, or a tile from a cell. */
interface DragPayload {
  staffId: string;
  from?: { allocationId: string; indices: number[] };
}
const MIME = 'application/x-staffing-tile';

export interface AssignmentGridProps {
  /** Rows: Part 2 roles, or Part 1 entitlement positions. */
  rows: Role[];
  /** Part 2 allocations, or Part 1 matches. */
  allocations: Allocation[];
  /** Leave to show and backfill (Part 1: whole-year leave only). */
  leave: Leave[];
  staff: Staff[];
  /** Who can be dragged in or chosen. */
  offered: Staff[];
  positionTypes: PositionType[];
  planningYear: PlanningYear;
  write(puts: Allocation[], deletes: string[]): Promise<void>;
  saveStaff(staff: Staff): Promise<void>;
  /** Whether placing this person on an empty day fills their whole week. */
  fillsWeek(staff: Staff, row: Role): boolean;
  rowLink?(row: Role): string | undefined;
  /** Part 1: colour tiles by employment type and group the staff list. */
  byEmployment?: boolean;
  showAsAt?: boolean;
  /** Words that differ between the two parts. */
  words: { row: string; cover: string; result: string; testPrefix: string; full: string; help: ReactNode };
  controls?: ReactNode;
}

/**
 * Rows (roles or positions) × weekdays with staff tiles. Drag a name from
 * the staff list (or a tile from another cell) onto a row and day, or choose
 * a name with "+". × removes that day. A holder on leave shows greyed; the
 * person covering it shows in colour. Used for Part 1 matching and Part 2
 * placement.
 */
export function AssignmentGrid(props: AssignmentGridProps) {
  const { rows: roleRows, allocations, leave, staff: allStaff, offered, positionTypes, words } = props;
  const [asAt, setAsAt] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const staffById = new Map(allStaff.map((s) => [s.id, s]));
  const positionTypeById = new Map(positionTypes.map((p) => [p.id, p]));
  const offeredIds = new Set(offered.map((s) => s.id));
  const name = (id: string) => staffById.get(id)?.name ?? 'Deleted staff member';
  const empClass = (id: string) => {
    const s = staffById.get(id);
    return props.byEmployment && s ? ` emp-${s.employmentType}` : '';
  };
  const grid: GridData = {
    planningYearId: props.planningYear.id,
    year: schoolYear(props.planningYear),
    staff: allStaff,
    roles: roleRows,
    allocations,
    leave,
  };

  const anyFortnightly = [
    ...allStaff.map((s) => s.workPattern),
    ...roleRows.map((r) => r.days),
    ...allocations.map((a) => a.days),
    ...leave.map((l) => l.daysAffected),
  ].some((p) => !repeatsWeekly(p));
  // Weekdays are combined by default so one drop covers both weeks.
  const [splitWeeks, setSplitWeeks] = useState(false);
  const fortnightly = splitWeeks;
  const columns = fortnightly ? [...Array(FORTNIGHT_DAYS).keys()] : [...WEEKDAYS.keys()];
  const indicesFor = (col: number) => (fortnightly ? [col] : [col, col + WEEKDAYS.length]);
  const roles = [...roleRows].sort(
    (a, b) =>
      (positionTypeById.get(a.positionTypeId)?.sortOrder ?? 999) -
        (positionTypeById.get(b.positionTypeId)?.sortOrder ?? 999) || bySortOrder(a, b),
  );

  const write = props.write;

  /** Whether this drop should fill the person's whole week (see `fillsWeek`). */
  const shouldFill = (payload: DragPayload, role: Role, indices: number[]) => {
    if (payload.from) return false;
    const staff = staffById.get(payload.staffId);
    return !!staff && cellView(role, indices, grid).empty && props.fillsWeek(staff, role);
  };

  const fill = async (staffId: string, role: Role) => {
    setPicking(null);
    const result = planFill(grid, staffId, role.id, () => crypto.randomUUID());
    if (!result.ok) {
      setMessage({ ok: false, text: result.errors.join('. ') });
      return;
    }
    await write(result.put, []);
    setMessage({ ok: true, text: result.message });
  };

  /** Assign (or move) someone to a role on these days, asking to extend their days worked if needed. */
  const assign = async (payload: DragPayload, role: Role, indices: number[]) => {
    if (shouldFill(payload, role, indices)) {
      await fill(payload.staffId, role);
      return;
    }
    setPicking(null);
    let base = grid;
    let removal: { put?: Allocation; deleteId?: string } = {};
    if (payload.from) {
      const source = allocations.find((a) => a.id === payload.from!.allocationId);
      if (!source) return;
      if (source.roleId === role.id && payload.from.indices.join() === indices.join()) return;
      removal = planRemove(source, payload.from.indices);
      base = { ...grid, allocations: applyRemove(grid.allocations, removal) };
    }
    let result = planAssign(base, payload.staffId, role.id, indices, () => crypto.randomUUID());
    if (!result.ok && result.missingWorkDays) {
      const staff = staffById.get(payload.staffId)!;
      const days = describeDayIndices(dayIndices(result.missingWorkDays));
      if (!confirm(`${staff.name} doesn't work ${days}. Add ${days} to their days worked?`)) {
        setMessage({ ok: false, text: result.errors.join('. ') });
        return;
      }
      const workPattern = union([staff.workPattern, result.missingWorkDays]);
      const updated = { ...staff, workPattern: { ...workPattern, mode: repeatsWeekly(workPattern) ? 'weekly' : 'fortnightly' } as const };
      await props.saveStaff(updated);
      base = { ...base, staff: base.staff.map((s) => (s.id === staff.id ? updated : s)) };
      result = planAssign(base, payload.staffId, role.id, indices, () => crypto.randomUUID());
    }
    if (!result.ok) {
      setMessage({ ok: false, text: result.errors.join('. ') });
      return;
    }
    await write([...(removal.put ? [removal.put] : []), ...result.put], removal.deleteId ? [removal.deleteId] : []);
    setMessage({ ok: true, text: payload.from ? `Moved: ${result.message}` : result.message });
  };

  const remove = async (tile: Tile, indices: number[]) => {
    const days = indices.filter((d) => tile.allocation.days.days[d]);
    const change = planRemove(tile.allocation, days);
    await write(change.put ? [change.put] : [], change.deleteId ? [change.deleteId] : []);
    setMessage({ ok: true, text: `Removed ${name(tile.staffId)} from ${roleRows.find((r) => r.id === tile.allocation.roleId)?.name} on ${describeDayIndices(days)}` });
  };

  const onDrop = (e: DragEvent, role: Role, indices: number[]) => {
    e.preventDefault();
    setDropTarget(null);
    const raw = e.dataTransfer.getData(MIME) || e.dataTransfer.getData('text/plain');
    try {
      void assign(JSON.parse(raw) as DragPayload, role, indices);
    } catch {
      // Not one of our tiles.
    }
  };
  const startDrag = (e: DragEvent, payload: DragPayload) => {
    const json = JSON.stringify(payload);
    e.dataTransfer.setData(MIME, json);
    e.dataTransfer.setData('text/plain', json);
    e.dataTransfer.effectAllowed = 'move';
  };

  /** Staff list, grouped by employment type in matching order when asked. */
  const paletteGroups = (): [string, Staff[]][] => {
    const people = [...offered].sort(byName);
    if (!props.byEmployment) return [['', people]];
    return (['permanent', 'tpt', 'temporary'] as const)
      .map((t): [string, Staff[]] => [EMPLOYMENT_TYPE_LABELS[t], people.filter((p) => p.employmentType === t)])
      .filter(([, list]) => list.length > 0);
  };

  const tileTitle = (t: Tile) => {
    if (t.kind === 'on-leave' && t.leave) return `${name(t.staffId)}: ${LEAVE_TYPE_SHORT[t.leave.leaveType]}, ${formatRange(leaveRange(t.leave))}`;
    if (t.kind === 'cover') return `${name(t.staffId)}: ${words.cover} for ${t.leave ? name(t.leave.staffId) : 'leave'}, ${formatRange(allocationRange(t.allocation))}`;
    return `${name(t.staffId)} (${daysLabel(t.allocation.days)})`;
  };

  return (
    <section className="role-grid">
      {props.showAsAt && (
        <div className="inline-form">
          <label>
            As at{' '}
            <input type="date" value={asAt} onChange={(e) => setAsAt(e.target.value)} aria-label="As at date" />
          </label>
          {asAt ? (
            <button type="button" className="secondary" onClick={() => setAsAt('')}>
              Show whole year
            </button>
          ) : (
            <span className="muted small">Showing the whole year.</span>
          )}
        </div>
      )}
      {props.controls}
      <label className="field">
        <input type="checkbox" checked={splitWeeks} onChange={(e) => setSplitWeeks(e.target.checked)} /> Show Week A and
        Week B separately
      </label>
      <p className="muted small">
        {words.help}
        {!splitWeeks && anyFortnightly && ' Tiles marked "A only" or "B only" apply to one week of the fortnight.'}
        {asAt && ` As at ${formatDate(asAt)}.`}
      </p>
      {message && (
        <p className={message.ok ? 'ok' : 'warning'} role="status" aria-label={words.result}>
          {message.text}
        </p>
      )}

      <div className="palette" aria-label="Staff to drag">
        {paletteGroups().map(([group, people]) => (
          <div key={group} className="palette-group">
            {group && <div className="palette-heading">{group}</div>}
            {people.map((s) => {
              const freeDays = subtract(s.workPattern, staffBusyDays(s.id, allocations));
              const label = daysLabel(freeDays);
              return (
                <div
                  key={s.id}
                  className={`tile palette-tile${empClass(s.id)} ${label === 'none' ? 'full' : ''}`}
                  draggable
                  onDragStart={(e) => startDrag(e, { staffId: s.id })}
                  title={`${s.name} (${EMPLOYMENT_TYPE_LABELS[s.employmentType]}): works ${daysLabel(s.workPattern)}; free ${label}`}
                >
                  {s.name}
                  <span className="free">{label === 'none' ? words.full : `free ${label}`}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <table className="grid role-table">
        <thead>
          {fortnightly && (
            <tr>
              <th />
              <th colSpan={5}>Week A</th>
              <th colSpan={5}>Week B</th>
            </tr>
          )}
          <tr>
            <th>{words.row}</th>
            {columns.map((c) => (
              <th key={c}>{WEEKDAYS[c % WEEKDAYS.length]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((role, i) => {
            const type = positionTypeById.get(role.positionTypeId);
            const prevType = i > 0 ? roles[i - 1]!.positionTypeId : null;
            return [
              prevType !== role.positionTypeId && (
                <tr key={`h-${role.positionTypeId}`} className="group-row">
                  <th colSpan={columns.length + 1}>{type?.name ?? 'Deleted position type'}</th>
                </tr>
              ),
              <tr key={role.id}>
                <th
                  scope="row"
                  className={`role-name ${dropTarget === `${role.id}:all` ? 'over' : ''}`}
                  title="Drop a name here to give them every day they're free"
                  data-testid={`${words.testPrefix}role-${role.name}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropTarget(`${role.id}:all`);
                  }}
                  onDragLeave={() => setDropTarget((t) => (t === `${role.id}:all` ? null : t))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropTarget(null);
                    try {
                      const payload = JSON.parse(e.dataTransfer.getData(MIME) || e.dataTransfer.getData('text/plain')) as DragPayload;
                      if (!payload.from) void fill(payload.staffId, role);
                    } catch {
                      // Not one of our tiles.
                    }
                  }}
                >
                  {props.rowLink?.(role) ? <Link to={props.rowLink(role)!}>{role.name}</Link> : role.name}
                </th>
                {columns.map((c) => {
                  const indices = indicesFor(c);
                  const cell = cellView(role, indices, grid, asAt || undefined);
                  const cellKey = `${role.id}:${c}`;
                  const dayName = `${WEEKDAYS[c % WEEKDAYS.length]}${fortnightly ? ` week ${c < 5 ? 'A' : 'B'}` : ''}`;
                  if (!cell.runs) {
                    return (
                      <td key={c} className="cell off" data-testid={`${words.testPrefix}cell-${role.name}-${dayName}`}>
                        —
                      </td>
                    );
                  }
                  const needsSomeone = cell.empty || cell.tiles.some((t) => t.kind === 'on-leave');
                  return (
                    <td
                      key={c}
                      className={`cell drop ${dropTarget === cellKey ? 'over' : ''} ${cell.empty ? 'unfilled' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDropTarget(cellKey);
                      }}
                      onDragLeave={() => setDropTarget((t) => (t === cellKey ? null : t))}
                      onDrop={(e) => onDrop(e, role, indices)}
                      data-testid={`${words.testPrefix}cell-${role.name}-${dayName}`}
                    >
                      {cell.tiles.map((t) => (
                        <div
                          key={t.allocation.id}
                          className={`tile ${t.kind}${t.partYear ? ' part-year' : ''}${empClass(t.staffId)}`}
                          draggable
                          onDragStart={(e) => startDrag(e, { staffId: t.staffId, from: { allocationId: t.allocation.id, indices } })}
                          title={tileTitle(t)}
                        >
                          <Link to={staffLink(t.staffId)}>{name(t.staffId)}</Link>
                          {t.kind === 'on-leave' && t.leave && (
                            <span className="tag">
                              {LEAVE_TYPE_SHORT[t.leave.leaveType]}
                              {t.partYear && ` ${formatRange(leaveRange(t.leave))}`}
                            </span>
                          )}
                          {t.kind === 'cover' && (
                            <span className="tag">
                              {words.cover}
                              {!asAt && t.leave && grid.year && (t.leave.startDate > grid.year.start || t.leave.endDate < grid.year.end) &&
                                ` ${formatRange(allocationRange(t.allocation))}`}
                            </span>
                          )}
                          {indices.length === 2 && t.allocation.days.days[indices[0]!] !== t.allocation.days.days[indices[1]!] && (
                            <span className="tag">{t.allocation.days.days[indices[0]!] ? 'A only' : 'B only'}</span>
                          )}
                          <button
                            type="button"
                            className="remove"
                            aria-label={`Remove ${name(t.staffId)} from ${role.name} on ${dayName}`}
                            onClick={() => void remove(t, indices)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {cell.empty && <span className="muted small">unfilled</span>}
                      {needsSomeone &&
                        (picking === cellKey ? (
                          <select
                            autoFocus
                            aria-label={`Assign to ${role.name} on ${dayName}`}
                            defaultValue=""
                            onBlur={() => setPicking(null)}
                            onChange={(e) => e.target.value && void assign({ staffId: e.target.value }, role, indices)}
                          >
                            <option value="">Choose…</option>
                            {candidatesFor(grid, role.id, indices)
                              .filter((s) => offeredIds.has(s.id))
                              .sort(byName)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                          </select>
                        ) : (
                          <button
                            type="button"
                            className="add"
                            aria-label={`Choose someone for ${role.name} on ${dayName}`}
                            onClick={() => setPicking(cellKey)}
                          >
                            +
                          </button>
                        ))}
                    </td>
                  );
                })}
              </tr>,
            ];
          })}
        </tbody>
      </table>
      <p className="legend small">
        {props.byEmployment ? (
          <>
            <span className="tile emp-permanent">Permanent</span> <span className="tile emp-tpt">TPT</span>{' '}
            <span className="tile emp-temporary">Temporary</span>{' '}
          </>
        ) : (
          <>
            <span className="tile holder">Allocated</span> <span className="tile cover">Cover</span>{' '}
          </>
        )}
        <span className="tile on-leave">On leave</span>{' '}
        {!props.byEmployment && <span className="tile on-leave part-year">On leave for part of the year</span>}{' '}
        <span className="cell unfilled">Unfilled</span>
      </p>
    </section>
  );
}
