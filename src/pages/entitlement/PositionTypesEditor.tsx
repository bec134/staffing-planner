import { useState } from 'react';
import { movePositionType, validatePositionTypeName } from '../../domain/positionTypes';
import {
  POSITION_CATEGORY_LABELS,
  type Allocation,
  type Entitlement,
  type Id,
  type PositionCategory,
  type PositionType,
} from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';

interface Props {
  planningYearId: Id;
  positionTypes: PositionType[];
  entitlement: Entitlement | undefined;
  allocations: Allocation[];
  onChange(): Promise<void>;
}

const CATEGORIES = Object.keys(POSITION_CATEGORY_LABELS) as PositionCategory[];

function NameInput({ pt, others, onRename }: { pt: PositionType; others: PositionType[]; onRename(name: string): void }) {
  const [value, setValue] = useState(pt.name);
  const error = value === pt.name ? null : validatePositionTypeName(value, others);
  return (
    <>
      <input
        aria-label={`Name of ${pt.name}`}
        value={value}
        aria-invalid={!!error}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value !== pt.name && !error) onRename(value.trim());
          else setValue(pt.name);
        }}
      />
      {error && <span className="field-error">{error}</span>}
    </>
  );
}

export function PositionTypesEditor({ planningYearId, positionTypes, entitlement, allocations, onChange }: Props) {
  const repo = useRepository();
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<PositionCategory>('other_teaching');
  const [message, setMessage] = useState<string | null>(null);
  const newNameError = newName ? validatePositionTypeName(newName, positionTypes) : null;

  const update = async (pt: PositionType) => {
    await repo.positionTypes.put(pt);
    await onChange();
  };

  const move = async (id: Id, direction: -1 | 1) => {
    await repo.positionTypes.putMany(movePositionType(positionTypes, id, direction));
    await onChange();
  };

  const remove = async (pt: PositionType) => {
    setMessage(null);
    const allocated = allocations.filter((a) => a.positionTypeId === pt.id).length;
    if (allocated > 0) {
      setMessage(`"${pt.name}" can't be deleted while ${allocated} allocation(s) use it.`);
      return;
    }
    const line = entitlement?.lines.find((l) => l.positionTypeId === pt.id);
    const warning = line ? ' Its entitlement figure will also be removed.' : '';
    if (!confirm(`Delete position type "${pt.name}"?${warning}`)) return;
    if (entitlement && line) {
      await repo.entitlements.put({
        ...entitlement,
        lines: entitlement.lines.filter((l) => l.positionTypeId !== pt.id),
      });
    }
    await repo.positionTypes.delete(pt.id);
    await onChange();
  };

  const add = async () => {
    if (validatePositionTypeName(newName, positionTypes)) return;
    await repo.positionTypes.put({
      id: crypto.randomUUID(),
      planningYearId,
      name: newName.trim(),
      category: newCategory,
      sortOrder: Math.max(-1, ...positionTypes.map((p) => p.sortOrder)) + 1,
    });
    setNewName('');
    await onChange();
  };

  return (
    <section aria-labelledby="pt-heading">
      <h2 id="pt-heading">Position types</h2>
      <p className="muted small">These are used for the entitlement breakdown and as the roles staff are allocated to.</p>
      {message && (
        <p className="warning" role="alert">
          {message}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Order</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {positionTypes.map((pt, i) => (
            <tr key={pt.id}>
              <td>
                <NameInput
                  key={pt.name}
                  pt={pt}
                  others={positionTypes.filter((p) => p.id !== pt.id)}
                  onRename={(name) => void update({ ...pt, name })}
                />
              </td>
              <td>
                <select
                  aria-label={`Category of ${pt.name}`}
                  value={pt.category}
                  onChange={(e) => void update({ ...pt, category: e.target.value as PositionCategory })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {POSITION_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="nowrap">
                <button
                  type="button"
                  className="icon"
                  aria-label={`Move ${pt.name} up`}
                  disabled={i === 0}
                  onClick={() => void move(pt.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon"
                  aria-label={`Move ${pt.name} down`}
                  disabled={i === positionTypes.length - 1}
                  onClick={() => void move(pt.id, 1)}
                >
                  ↓
                </button>
              </td>
              <td>
                <button type="button" className="danger" onClick={() => void remove(pt)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label>
          New position type{' '}
          <input value={newName} aria-invalid={!!newNameError} onChange={(e) => setNewName(e.target.value)} />
        </label>
        <label>
          Category{' '}
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as PositionCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {POSITION_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={!newName.trim() || !!newNameError}>
          Add
        </button>
        {newNameError && <span className="field-error">{newNameError}</span>}
      </form>
    </section>
  );
}
