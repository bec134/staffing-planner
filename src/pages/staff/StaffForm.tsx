import { useState } from 'react';
import { DayPatternEditor } from '../../components/DayPatternEditor';
import { FULL_TIME, dayIndices, type DayPattern } from '../../domain/dayPattern';
import { EMPLOYMENT_TYPE_LABELS, type EmploymentType, type Id, type Staff } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';

interface Props {
  planningYearId: Id;
  existing?: Staff;
  otherNames: string[];
  onDone(saved?: Staff): void;
}

export function StaffForm({ planningYearId, existing, otherNames, onDone }: Props) {
  const repo = useRepository();
  const [name, setName] = useState(existing?.name ?? '');
  const [employmentType, setEmploymentType] = useState<EmploymentType>(existing?.employmentType ?? 'permanent');
  const [currentRole, setCurrentRole] = useState(existing?.currentRole ?? '');
  const [workPattern, setWorkPattern] = useState<DayPattern>(existing?.workPattern ?? FULL_TIME);
  const [saving, setSaving] = useState(false);

  const duplicate = otherNames.some((n) => n.trim().toLowerCase() === name.trim().toLowerCase());
  const error = !name.trim()
    ? 'Enter a name'
    : duplicate
      ? 'Someone with this name is already in the plan'
      : dayIndices(workPattern).length === 0
        ? 'Choose at least one day worked'
        : null;

  const save = async () => {
    if (error) return;
    const staff: Staff = {
      id: existing?.id ?? crypto.randomUUID(),
      planningYearId,
      name: name.trim(),
      employmentType,
      currentRole: currentRole.trim(),
      workPattern,
      preferences: existing?.preferences ?? '',
    };
    setSaving(true);
    try {
      await repo.staff.put(staff);
      onDone(staff);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="panel"
      aria-label={existing ? `Edit ${existing.name}` : 'Add staff member'}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="form-grid">
        <label>
          Name <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          Employment type{' '}
          <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}>
            {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Current role <input value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} />
        </label>
      </div>
      <DayPatternEditor legend="Days worked" value={workPattern} onChange={setWorkPattern} />
      {existing && <p className="muted small">Existing allocations on days no longer worked will be flagged.</p>}
      <div className="actions">
        <button type="submit" disabled={!!error || saving}>
          {existing ? 'Save changes' : 'Add staff member'}
        </button>
        <button type="button" className="secondary" onClick={() => onDone()}>
          Cancel
        </button>
        {error && name && <span className="field-error">{error}</span>}
      </div>
    </form>
  );
}
