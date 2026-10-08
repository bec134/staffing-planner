import { useState } from 'react';
import { DayPatternEditor } from '../../components/DayPatternEditor';
import { FULL_TIME, dayIndices, type DayPattern } from '../../domain/dayPattern';
import type { Id, PositionType, Role } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';

interface Props {
  planningYearId: Id;
  positionTypes: PositionType[];
  existing?: Role;
  otherNames: string[];
  nextSortOrder: number;
  onDone(saved?: Role): void;
}

export function RoleForm({ planningYearId, positionTypes, existing, otherNames, nextSortOrder, onDone }: Props) {
  const repo = useRepository();
  const [name, setName] = useState(existing?.name ?? '');
  const [positionTypeId, setPositionTypeId] = useState(existing?.positionTypeId ?? positionTypes[0]?.id ?? '');
  const [days, setDays] = useState<DayPattern>(existing?.days ?? FULL_TIME);
  const [saving, setSaving] = useState(false);

  const duplicate = otherNames.some((n) => n.trim().toLowerCase() === name.trim().toLowerCase());
  const error = !name.trim()
    ? 'Enter a name'
    : duplicate
      ? 'A role with this name already exists'
      : !positionTypeId
        ? 'Add a position type on the Entitlement page first'
        : dayIndices(days).length === 0
          ? 'Choose at least one day'
          : null;

  const save = async () => {
    if (error) return;
    const role: Role = {
      id: existing?.id ?? crypto.randomUUID(),
      planningYearId,
      name: name.trim(),
      positionTypeId,
      days,
      sortOrder: existing?.sortOrder ?? nextSortOrder,
    };
    setSaving(true);
    try {
      await repo.roles.put(role);
      onDone(role);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="panel"
      aria-label={existing ? `Edit ${existing.name}` : 'Add role'}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="form-grid">
        <label>
          Role name <input value={name} placeholder="e.g. 3/4B or RFF 1" onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          Position type{' '}
          <select value={positionTypeId} onChange={(e) => setPositionTypeId(e.target.value)}>
            {positionTypes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <DayPatternEditor legend="Days the role runs" value={days} onChange={setDays} />
      {existing && <p className="muted small">Allocations on days the role no longer runs will be flagged.</p>}
      <div className="actions">
        <button type="submit" disabled={!!error || saving}>
          {existing ? 'Save changes' : 'Add role'}
        </button>
        <button type="button" className="secondary" onClick={() => onDone()}>
          Cancel
        </button>
        {error && name && <span className="field-error">{error}</span>}
      </div>
    </form>
  );
}
