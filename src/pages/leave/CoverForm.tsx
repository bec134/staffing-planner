import { useMemo, useState } from 'react';
import { DayPatternEditor } from '../../components/DayPatternEditor';
import { formatRange, intersectRange } from '../../domain/dates';
import { dayIndices, emptyPattern, repeatsWeekly, type DayPattern } from '../../domain/dayPattern';
import { formatFte, milliFteOf } from '../../domain/fte';
import { affectedRoles, availableCoverDays, leaveRange, validateCover } from '../../domain/leave';
import type { Allocation, DateRange, Leave } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { byName, type PlanData } from '../allocation/shared';

interface Props {
  data: PlanData;
  leave: Leave;
  existing?: Allocation;
  onDone(): void;
}

/** Assign someone to cover a leave: whole leave, some days, or some dates. */
export function CoverForm({ data, leave, existing, onDone }: Props) {
  const repo = useRepository();
  const affected = affectedRoles(leave, data.allocations);
  const roleIds = [...new Set(affected.map((a) => a.roleId))];
  const [roleId, setRoleId] = useState(existing?.roleId ?? (roleIds.length === 1 ? roleIds[0]! : ''));
  const [staffId, setStaffId] = useState(existing?.staffId ?? '');
  const [start, setStart] = useState(existing?.startDate ?? leave.startDate);
  const [end, setEnd] = useState(existing?.endDate ?? leave.endDate);
  const [days, setDays] = useState<DayPattern | null>(existing?.days ?? null);
  const role = data.roles.find((r) => r.id === roleId);
  const coverer = data.staff.find((s) => s.id === staffId);
  const range: DateRange = { start, end };

  const allowed = useMemo(
    () =>
      coverer && roleId && start <= end
        ? availableCoverDays(leave, coverer, roleId, range, data.allocations, data.leave, existing?.id)
        : undefined,
    [coverer, roleId, start, end, data.allocations, data.leave, leave, existing?.id],
  );
  const allowedWithOwn = existing && allowed ? { ...allowed, days: allowed.days.map((d, i) => d || existing.days.days[i] === true) } : allowed;
  const mode = allowedWithOwn && coverer && repeatsWeekly(allowedWithOwn) && repeatsWeekly(coverer.workPattern) ? 'weekly' : 'fortnightly';
  const shown: DayPattern = { ...(days ?? allowed ?? emptyPattern()), mode };
  const errors =
    coverer && role
      ? validateCover({ id: existing?.id, staffId, roleId, days: shown, startDate: start, endDate: end }, leave, coverer, role, data.allocations, data.leave)
      : [];

  // Quick picks: the whole leave, or each term that overlaps it.
  const presets: { label: string; range: DateRange }[] = [{ label: 'Whole leave', range: leaveRange(leave) }];
  (data.planningYear.terms ?? []).forEach((t, i) => {
    const r = t && intersectRange(t, leaveRange(leave));
    if (r) presets.push({ label: `Term ${i + 1} (${formatRange(r)})`, range: r });
  });

  const save = async () => {
    if (!coverer || !role || errors.length) return;
    await repo.allocations.put({
      id: existing?.id ?? crypto.randomUUID(),
      planningYearId: data.planningYear.id,
      staffId,
      roleId,
      days: { ...shown, mode: repeatsWeekly(shown) ? 'weekly' : 'fortnightly' },
      startDate: start,
      endDate: end,
      coveringLeaveId: leave.id,
    });
    onDone();
  };

  const covererOptions = [...data.staff].filter((s) => s.id !== leave.staffId).sort(byName);

  return (
    <form
      className="panel"
      aria-label={existing ? 'Edit cover' : 'Add cover'}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="form-grid">
        <label>
          Role to cover{' '}
          <select
            value={roleId}
            onChange={(e) => {
              setRoleId(e.target.value);
              setDays(null);
            }}
          >
            <option value="">Choose…</option>
            {roleIds.map((id) => (
              <option key={id} value={id}>
                {data.roles.find((r) => r.id === id)?.name ?? 'Deleted role'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Covered by{' '}
          <select
            value={staffId}
            onChange={(e) => {
              setStaffId(e.target.value);
              setDays(null);
            }}
          >
            <option value="">Choose…</option>
            {covererOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          From{' '}
          <input
            type="date"
            value={start}
            min={leave.startDate}
            max={leave.endDate}
            onChange={(e) => {
              setStart(e.target.value);
              setDays(null);
            }}
          />
        </label>
        <label>
          To{' '}
          <input
            type="date"
            value={end}
            min={leave.startDate}
            max={leave.endDate}
            onChange={(e) => {
              setEnd(e.target.value);
              setDays(null);
            }}
          />
        </label>
      </div>
      <div className="presets">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            className="secondary small"
            onClick={() => {
              setStart(p.range.start);
              setEnd(p.range.end);
              setDays(null);
            }}
          >
            {p.label}
          </button>
        ))}
        {presets.length === 1 && <span className="muted small">Add term dates to get term quick picks.</span>}
      </div>
      {coverer && role && (
        <>
          <DayPatternEditor legend="Days covered" value={shown} onChange={setDays} allowed={allowedWithOwn} allowModeSwitch={false} />
          {allowed && dayIndices(allowed).length === 0 && !existing && (
            <p className="warning">
              {coverer.name} has no free days to cover {role.name} between these dates.
            </p>
          )}
        </>
      )}
      {errors.length > 0 && dayIndices(shown).length > 0 && (
        <ul className="field-error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="submit" disabled={!coverer || !role || errors.length > 0}>
          {existing ? 'Save cover' : `Assign cover${coverer && role ? ` (${formatFte(milliFteOf(shown))} FTE)` : ''}`}
        </button>
        <button type="button" className="secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
