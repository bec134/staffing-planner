import { useMemo, useState } from 'react';
import { DayPatternEditor } from '../../components/DayPatternEditor';
import { availableDays, validateAllocation } from '../../domain/allocation';
import { dayIndices, emptyPattern, repeatsWeekly, union, type DayPattern } from '../../domain/dayPattern';
import { milliFteOf, formatFte } from '../../domain/fte';
import type { Allocation, Id } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { byName, bySortOrder, daysLabel, type PlanData } from './shared';

interface Props {
  data: PlanData;
  /** Allocating from a staff member's page or a role's page. */
  fixed: { staffId: Id } | { roleId: Id };
  existing?: Allocation;
  onDone(): void;
}

/** Weekly unless anything involved differs between Week A and Week B. */
const modeFor = (...patterns: DayPattern[]) => (patterns.every(repeatsWeekly) ? 'weekly' : 'fortnightly');

export function AllocationForm({ data, fixed, existing, onDone }: Props) {
  const repo = useRepository();
  const [staffId, setStaffId] = useState<Id>(existing?.staffId ?? ('staffId' in fixed ? fixed.staffId : ''));
  const [roleId, setRoleId] = useState<Id>(existing?.roleId ?? ('roleId' in fixed ? fixed.roleId : ''));
  const staff = data.staff.find((s) => s.id === staffId);
  const role = data.roles.find((r) => r.id === roleId);

  const allowed = useMemo(
    () => (staff && role ? availableDays(staff, role, data.allocations, existing?.id) : undefined),
    [staff, role, data.allocations, existing?.id],
  );
  // Fortnightly if the person, the role, the free days or the existing
  // allocation differ between Week A and Week B.
  const mode =
    staff && role && allowed ? modeFor(staff.workPattern, role.days, allowed, ...(existing ? [existing.days] : [])) : 'weekly';
  const [days, setDays] = useState<DayPattern | null>(existing?.days ?? null);
  // Until the user picks, offer every available day.
  const shownDays: DayPattern = { ...(days ?? allowed ?? emptyPattern()), mode };
  const [saving, setSaving] = useState(false);

  const errors = staff && role ? validateAllocation({ id: existing?.id ?? '', staffId, roleId, days: shownDays }, staff, role, data.allocations) : [];
  const nothingAvailable = !!allowed && dayIndices(allowed).length === 0 && !existing;

  const save = async () => {
    if (!staff || !role || errors.length) return;
    const allocation: Allocation = {
      ...existing,
      id: existing?.id ?? crypto.randomUUID(),
      planningYearId: data.planningYear.id,
      staffId,
      roleId,
      days: { ...shownDays, mode: modeFor(shownDays) },
    };
    setSaving(true);
    try {
      await repo.allocations.put(allocation);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const pick = (setter: (id: Id) => void) => (id: Id) => {
    setter(id);
    setDays(null);
  };

  return (
    <form
      className="panel"
      aria-label={existing ? 'Edit allocation' : 'Add allocation'}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="form-grid">
        {'roleId' in fixed ? (
          <label>
            Staff member{' '}
            <select value={staffId} onChange={(e) => pick(setStaffId)(e.target.value)}>
              <option value="">Choose…</option>
              {[...data.staff].sort(byName).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({daysLabel(s.workPattern)})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Role{' '}
            <select value={roleId} onChange={(e) => pick(setRoleId)(e.target.value)}>
              <option value="">Choose…</option>
              {[...data.roles].sort(bySortOrder).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({daysLabel(r.days)})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {staff && role && (
        <>
          <DayPatternEditor
            legend="Days in this role"
            value={shownDays}
            onChange={setDays}
            allowed={existing ? union([allowed!, existing.days]) : allowed}
            allowModeSwitch={false}
          />
          <p className="muted small">
            Only days {staff.name} works, {role.name} runs, and neither is already allocated can be chosen.
          </p>
          {nothingAvailable && (
            <p className="warning">No free days: {staff.name} and {role.name} have no available days in common.</p>
          )}
        </>
      )}

      {errors.length > 0 && dayIndices(shownDays).length > 0 && (
        <ul className="field-error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="submit" disabled={!staff || !role || errors.length > 0 || saving}>
          {existing ? 'Save allocation' : `Allocate${staff && role ? ` ${formatFte(milliFteOf(shownDays))} FTE` : ''}`}
        </button>
        <button type="button" className="secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
