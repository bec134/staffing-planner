import { useState, type FormEvent } from 'react';
import { DayPatternEditor } from '../../components/DayPatternEditor';
import { FULL_TIME, NO_DAYS, subtract, union, type DayPattern } from '../../domain/dayPattern';
import { formatFte, milliFteOf, parseFte } from '../../domain/fte';
import { checkIntention, hasPermanentFte, intentionForStaff, intentionFromPlan, planSaveStaff } from '../../domain/intentions';
import { schoolYear } from '../../domain/matching';
import type { StaffDraft } from '../../domain/staffImport';
import {
  EMPLOYMENT_TYPE_LABELS,
  GRADES,
  GRADE_LABELS,
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  SUBSTANTIVE_ROLES,
  WORK_PREFERENCE_LABELS,
  type EmploymentType,
  type Grade,
  type RecordedLeaveType,
  type Staff,
  type WorkPreference,
} from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { saveStaffPlans } from '../../data/saveStaffPlans';
import type { PlanData } from '../allocation/shared';

const notIn = (p: DayPattern): DayPattern => subtract(FULL_TIME, p);

/**
 * Add or edit a staff member and their plans for next year, in one form
 * (Bec). Saving updates the plan straight away: their days worked are the
 * preferred days plus any whole-year leave days, and the leave itself.
 */
export function StaffForm({ data, existing, onDone }: { data: PlanData; existing?: Staff; onDone(saved?: Staff): void }) {
  const repo = useRepository();
  const year = schoolYear(data.planningYear);
  const [start] = useState(() =>
    existing ? (intentionForStaff(existing, data.intentions) ?? intentionFromPlan(existing, data.leave, year, () => 'new')) : undefined,
  );
  const [name, setName] = useState(existing?.name ?? '');
  const [employmentType, setEmploymentType] = useState<EmploymentType>(existing?.employmentType ?? 'permanent');
  const [fteText, setFteText] = useState(start?.permanentMilliFte !== undefined ? formatFte(start.permanentMilliFte) : '');
  const [role, setRole] = useState(existing?.currentRole ?? '');
  const [otherRoles, setOtherRoles] = useState<string[]>(existing?.otherRoles ?? []);
  const [otherFte, setOtherFte] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(existing?.otherRoleMilliFte ?? {}).map(([r, v]) => [r, formatFte(v)])),
  );
  const [workPreference, setWorkPreference] = useState<WorkPreference>(start?.workPreference ?? 'full_time');
  const [preferredDays, setPreferredDays] = useState<DayPattern>(start?.preferredDays ?? FULL_TIME);
  const [leaveDays, setLeaveDays] = useState<DayPattern>(start?.leaveDays ?? NO_DAYS);
  const [leaveType, setLeaveType] = useState<RecordedLeaveType>(start?.leaveType ?? 'lwop');
  const [grades, setGrades] = useState<(Grade | '')[]>(() => [0, 1, 2].map((n) => start?.gradePreferences[n] ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasLeave = leaveDays.days.some(Boolean);
  const oldRole = role && !(SUBSTANTIVE_ROLES as readonly string[]).includes(role);

  const build = (): StaffDraft | string => {
    if (!name.trim()) return 'Enter a name';
    const others = data.staff.filter((s) => s.id !== existing?.id);
    if (others.some((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase())) {
      return 'Someone with this name is already in the plan';
    }
    let permanentMilliFte: number | undefined;
    if (hasPermanentFte(employmentType) && fteText.trim()) {
      const parsed = parseFte(fteText);
      if (!parsed.ok) return `Permanent FTE: ${parsed.error}`;
      permanentMilliFte = parsed.value;
    }
    const extraRoles = otherRoles.filter((r) => r !== role);
    const otherRoleMilliFte: Record<string, number> = {};
    for (const r of extraRoles) {
      const parsed = parseFte(otherFte[r] ?? '');
      if (!parsed.ok || parsed.value <= 0) return `Enter the FTE for ${r} (e.g. 0.2)`;
      otherRoleMilliFte[r] = parsed.value;
    }
    const worked = milliFteOf(union([preferredDays, leaveDays]));
    const othersTotal = Object.values(otherRoleMilliFte).reduce((a, b) => a + b, 0);
    if (extraRoles.length && othersTotal >= worked) {
      return `Their other roles add up to ${formatFte(othersTotal)} FTE, leaving nothing of their ${formatFte(worked)} FTE for ${role || 'their substantive role'}`;
    }
    return {
      name: name.trim(),
      employmentType,
      permanentMilliFte,
      substantiveRole: role,
      otherRoles: extraRoles,
      otherRoleMilliFte,
      workPreference,
      preferredDays,
      leaveDays,
      leaveType,
      gradePreferences: grades.filter((g): g is Grade => g !== ''),
    };
  };

  const draft = build();
  const check = typeof draft === 'string' ? undefined : checkIntention({ ...draft, id: '', planningYearId: '' });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (typeof draft === 'string') return setError(draft);
    if (check?.errors.length) return setError(check.errors.join('. '));
    const plan = planSaveStaff(
      draft,
      {
        planningYearId: data.planningYear.id,
        year,
        staff: data.staff,
        leave: data.leave,
        allocations: data.allocations,
        matches: data.matches,
      },
      { staff: existing, intention: existing ? intentionForStaff(existing, data.intentions) : undefined },
      () => crypto.randomUUID(),
    );
    // Removing leave also removes its cover: check first.
    const removes = plan.leaveDelete.length + plan.allocationDelete.length + plan.matchDelete.length;
    if (removes && !confirm(`Save these changes for ${draft.name}?\n\n${plan.changes.join('\n')}`)) return;
    setSaving(true);
    try {
      await saveStaffPlans(repo, [plan]);
      onDone(plan.staff);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel" onSubmit={(e) => void submit(e)} aria-label={existing ? `Edit ${existing.name}` : 'Add staff member'}>
      <div className="form-grid">
        <label>
          Name <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          Employment status{' '}
          <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}>
            {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {hasPermanentFte(employmentType) && (
          <label>
            Permanent FTE{' '}
            <input value={fteText} onChange={(e) => setFteText(e.target.value)} inputMode="decimal" placeholder="e.g. 1.0" size={6} />
          </label>
        )}
        <label>
          Substantive role{' '}
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">— choose —</option>
            {SUBSTANTIVE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            {oldRole && <option value={role}>{role} (not in the list)</option>}
          </select>
        </label>
        <fieldset className="checks">
          <legend>Also substantive in</legend>
          <span className="muted small">For someone holding two positions, e.g. Teacher 0.6 and AP C&amp;I 0.2.</span>
          {SUBSTANTIVE_ROLES.filter((r) => r !== role).map((r) => (
            <span key={r} className="check-with-fte">
              <label>
                <input
                  type="checkbox"
                  checked={otherRoles.includes(r)}
                  onChange={(e) => setOtherRoles((list) => (e.target.checked ? [...list, r] : list.filter((x) => x !== r)))}
                />{' '}
                {r}
              </label>
              {otherRoles.includes(r) && (
                <input
                  className="fte-input"
                  inputMode="decimal"
                  placeholder="FTE"
                  aria-label={`${r} FTE`}
                  value={otherFte[r] ?? ''}
                  onChange={(e) => setOtherFte((f) => ({ ...f, [r]: e.target.value }))}
                />
              )}
            </span>
          ))}
          {otherRoles.some((r) => r !== role) && (() => {
            const worked = milliFteOf(union([preferredDays, leaveDays]));
            const others = otherRoles.filter((r) => r !== role).map((r) => parseFte(otherFte[r] ?? ''));
            if (others.some((p) => !p.ok)) return null;
            const rest = worked - others.reduce((sum, p) => sum + (p.ok ? p.value : 0), 0);
            return (
              <span className="muted small" aria-label="Main role FTE">
                {role || 'Substantive role'}: {formatFte(Math.max(0, rest))} FTE (the rest of their {formatFte(worked)} FTE). Matches
                beyond a role's FTE in an executive position are higher duties.
              </span>
            );
          })()}
        </fieldset>
        <label>
          Work preference{' '}
          <select
            value={workPreference}
            onChange={(e) => {
              const value = e.target.value as WorkPreference;
              setWorkPreference(value);
              // Full time: every day that isn't a leave day.
              if (value === 'full_time') setPreferredDays(notIn(leaveDays));
            }}
          >
            {Object.entries(WORK_PREFERENCE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <DayPatternEditor legend="Preferred days" value={preferredDays} onChange={setPreferredDays} allowed={notIn(leaveDays)} />
      <DayPatternEditor legend="Whole year leave days (if any)" value={leaveDays} onChange={setLeaveDays} allowed={notIn(preferredDays)} />
      <div className="form-grid">
        {hasLeave && (
          <label>
            Leave type{' '}
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as RecordedLeaveType)}>
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LEAVE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        )}
        {grades.map((g, n) => (
          <label key={n}>
            Grade preference {n + 1}{' '}
            <select value={g} onChange={(e) => setGrades((gs) => gs.map((x, m) => (m === n ? (e.target.value as Grade | '') : x)))}>
              <option value="">—</option>
              {GRADES.map((gr) => (
                <option key={gr} value={gr}>
                  {GRADE_LABELS[gr]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="muted small">
        Days worked = preferred days plus whole-year leave days. Whole-year leave runs for the whole school year.
      </p>
      {check && check.warnings.length > 0 && (
        <ul className="warning small">
          {check.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {existing && <p className="muted small">Placements on days they no longer work will be flagged.</p>}
      {error && <p className="field-error">{error}</p>}
      <div className="actions">
        <button type="submit" disabled={saving}>
          {existing ? 'Save changes' : 'Add staff member'}
        </button>
        <button type="button" className="secondary" onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
