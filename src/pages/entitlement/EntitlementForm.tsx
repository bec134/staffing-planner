import { useEffect, useMemo, useRef, useState } from 'react';
import { entitlementIdFor } from '../../domain/entitlement';
import { formatFte, parseFte } from '../../domain/fte';
import type { Entitlement, Id, PositionType } from '../../domain/types';

interface Props {
  planningYearId: Id;
  positionTypes: PositionType[];
  entitlement: Entitlement | undefined;
  onSave(entitlement: Entitlement): Promise<void>;
}

type Draft = { total: string; lines: Record<Id, string> };

function toDraft(entitlement: Entitlement | undefined, positionTypes: PositionType[]): Draft {
  const lines: Record<Id, string> = {};
  for (const pt of positionTypes) {
    const line = entitlement?.lines.find((l) => l.positionTypeId === pt.id);
    lines[pt.id] = line && line.milliFte !== 0 ? formatFte(line.milliFte) : '';
  }
  return { total: entitlement && entitlement.totalMilliFte !== 0 ? formatFte(entitlement.totalMilliFte) : '', lines };
}

export function EntitlementForm({ planningYearId, positionTypes, entitlement, onSave }: Props) {
  const saved = useMemo(() => toDraft(entitlement, positionTypes), [entitlement, positionTypes]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [saving, setSaving] = useState(false);
  const previousSaved = useRef(saved);

  // When saved data reloads (e.g. a position type is added or renamed), keep
  // any unsaved edits and only pick up the rows that changed underneath them.
  const resetAfterSave = useRef(false);
  useEffect(() => {
    const before = previousSaved.current;
    previousSaved.current = saved;
    if (resetAfterSave.current) {
      resetAfterSave.current = false;
      setDraft(saved);
      return;
    }
    setDraft((d) => ({
      total: d.total === before.total ? saved.total : d.total,
      lines: Object.fromEntries(
        Object.entries(saved.lines).map(([id, v]) => [id, id in d.lines && d.lines[id] !== before.lines[id] ? d.lines[id]! : v]),
      ),
    }));
  }, [saved]);

  const total = parseFte(draft.total);
  const lines = positionTypes.map((pt) => ({ pt, parsed: parseFte(draft.lines[pt.id] ?? '') }));
  const allValid = total.ok && lines.every((l) => l.parsed.ok);
  const breakdownTotal = lines.reduce((s, l) => s + (l.parsed.ok ? l.parsed.value : 0), 0);
  const difference = total.ok ? total.value - breakdownTotal : 0;
  // Compare values, not text, so "2" and "2.0" count as the same.
  const valueOf = (text: string | undefined) => {
    const r = parseFte(text ?? '');
    return r.ok ? r.value : text;
  };
  const dirty =
    valueOf(draft.total) !== valueOf(saved.total) ||
    positionTypes.some((pt) => valueOf(draft.lines[pt.id]) !== valueOf(saved.lines[pt.id]));

  const save = async () => {
    if (!total.ok) return;
    const result: Entitlement = {
      id: entitlement?.id ?? entitlementIdFor(planningYearId),
      planningYearId,
      totalMilliFte: total.value,
      lines: lines.flatMap(({ pt, parsed }) =>
        parsed.ok && parsed.value !== 0 ? [{ positionTypeId: pt.id, milliFte: parsed.value }] : [],
      ),
    };
    setSaving(true);
    resetAfterSave.current = true;
    try {
      await onSave(result);
    } catch (e) {
      resetAfterSave.current = false;
      throw e;
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="entry-heading">
      <h2 id="entry-heading">Enter entitlement</h2>
      <p className="muted small">Enter FTE exactly as supplied, up to 3 decimal places (e.g. 2.316).</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <table className="entry">
          <tbody>
            <tr className="total">
              <th scope="row">
                <label htmlFor="ent-total">Total entitlement</label>
              </th>
              <td>
                <input
                  id="ent-total"
                  inputMode="decimal"
                  value={draft.total}
                  aria-invalid={!total.ok}
                  onChange={(e) => setDraft({ ...draft, total: e.target.value })}
                />
                {!total.ok && <span className="field-error">{total.error}</span>}
              </td>
            </tr>
            {lines.map(({ pt, parsed }) => (
              <tr key={pt.id}>
                <th scope="row">
                  <label htmlFor={`ent-${pt.id}`}>{pt.name}</label>
                </th>
                <td>
                  <input
                    id={`ent-${pt.id}`}
                    inputMode="decimal"
                    value={draft.lines[pt.id] ?? ''}
                    aria-invalid={!parsed.ok}
                    onChange={(e) => setDraft({ ...draft, lines: { ...draft.lines, [pt.id]: e.target.value } })}
                  />
                  {!parsed.ok && <span className="field-error">{parsed.error}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {total.ok && (
          <p className={difference === 0 ? 'ok' : 'warning'} role="status">
            Breakdown sums to {formatFte(breakdownTotal)} FTE.{' '}
            {difference === 0
              ? 'This matches the total.'
              : difference > 0
                ? `${formatFte(difference)} FTE of the total is not yet broken down.`
                : `The breakdown is ${formatFte(-difference)} FTE more than the total.`}
          </p>
        )}

        <div className="actions">
          <button type="submit" disabled={!allValid || !dirty || saving}>
            Save entitlement
          </button>
          <button type="button" className="secondary" disabled={!dirty || saving} onClick={() => setDraft(saved)}>
            Discard changes
          </button>
          {dirty && <span className="muted small">Unsaved changes</span>}
        </div>
      </form>
    </section>
  );
}
