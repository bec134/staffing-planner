import { useState, type FormEvent } from 'react';
import { DayPatternEditor } from '../../components/DayPatternEditor';
import { FULL_TIME, NO_DAYS, subtract, type DayPattern } from '../../domain/dayPattern';
import { formatFte, parseFte } from '../../domain/fte';
import { checkIntention, hasPermanentFte } from '../../domain/intentions';
import {
  EMPLOYMENT_TYPE_LABELS,
  GRADES,
  GRADE_LABELS,
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  WORK_PREFERENCE_LABELS,
  type EmploymentType,
  type Grade,
  type LeaveType,
  type StaffIntention,
  type WorkPreference,
} from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import type { PlanData } from '../allocation/shared';

const notIn = (p: DayPattern): DayPattern => subtract(FULL_TIME, p);

/** Add or edit one staff member's intentions for next year. */
export function IntentionForm({ data, existing, onDone }: { data: PlanData; existing?: StaffIntention; onDone(): void }) {
  const repo = useRepository();
  const [name, setName] = useState(existing?.name ?? '');
  const [employmentType, setEmploymentType] = useState<EmploymentType>(existing?.employmentType ?? 'permanent');
  const [fteText, setFteText] = useState(
    existing?.permanentMilliFte !== undefined ? formatFte(existing.permanentMilliFte) : '',
  );
  const [workPreference, setWorkPreference] = useState<WorkPreference>(existing?.workPreference ?? 'full_time');
  const [preferredDays, setPreferredDays] = useState<DayPattern>(existing?.preferredDays ?? FULL_TIME);
  const [leaveDays, setLeaveDays] = useState<DayPattern>(existing?.leaveDays ?? NO_DAYS);
  const [leaveType, setLeaveType] = useState<LeaveType>(existing?.leaveType ?? 'lwop');
  const [grades, setGrades] = useState<(Grade | '')[]>(() => [0, 1, 2].map((n) => existing?.gradePreferences[n] ?? ''));
  const [error, setError] = useState<string | null>(null);

  const others = data.intentions.filter((i) => i.id !== existing?.id);
  const hasLeave = leaveDays.days.some(Boolean);

  const build = (): StaffIntention | string => {
    if (!name.trim()) return 'Enter a name';
    if (others.some((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase())) {
      return `${name.trim()} already has intentions; edit those instead`;
    }
    let permanentMilliFte: number | undefined;
    if (hasPermanentFte(employmentType) && fteText.trim()) {
      const parsed = parseFte(fteText);
      if (!parsed.ok) return `Permanent FTE: ${parsed.error}`;
      permanentMilliFte = parsed.value;
    }
    return {
      id: existing?.id ?? crypto.randomUUID(),
      planningYearId: data.planningYear.id,
      // A renamed intention is matched by its new name until applied again.
      staffId: existing && existing.name === name.trim() ? existing.staffId : undefined,
      name: name.trim(),
      employmentType,
      permanentMilliFte,
      workPreference,
      preferredDays,
      leaveDays,
      leaveType,
      gradePreferences: grades.filter((g): g is Grade => g !== ''),
    };
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const record = build();
    if (typeof record === 'string') return setError(record);
    const { errors } = checkIntention(record);
    if (errors.length) return setError(errors.join('. '));
    await repo.intentions.put(record);
    onDone();
  };

  const draft = build();
  const warnings = typeof draft === 'string' ? [] : checkIntention(draft).warnings;

  return (
    <form className="panel" onSubmit={(e) => void submit(e)} aria-label="Intention">
      <h3>{existing ? `Edit ${existing.name}` : 'Add intentions'}</h3>
      <div className="form-grid">
        <label>
          Name{' '}
          <input value={name} onChange={(e) => setName(e.target.value)} list="intention-staff-names" />
          <datalist id="intention-staff-names">
            {data.staff.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
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
      <DayPatternEditor
        legend="Whole year leave days (if any)"
        value={leaveDays}
        onChange={setLeaveDays}
        allowed={notIn(preferredDays)}
      />
      <div className="form-grid">
        {hasLeave && (
          <label>
            Leave type{' '}
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
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
            <select
              value={g}
              onChange={(e) => setGrades((gs) => gs.map((x, m) => (m === n ? (e.target.value as Grade | '') : x)))}
            >
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
      {warnings.length > 0 && (
        <ul className="warning small">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {error && <p className="warning">{error}</p>}
      <div className="actions">
        <button type="submit">Save intentions</button>
        <button type="button" className="secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
