import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { classGrades, classLabel, classSize, guideFor, placementGaps, type Enrolments } from '../../domain/classStructure';
import { FULL_TIME } from '../../domain/dayPattern';
import { roleLink } from '../../domain/flags';
import { GRADE_LABELS, type ClassRules, type ClassStructure, type Grade } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { bySortOrder, type PlanData } from '../allocation/shared';
import { CLASS_KINDS, SizeCheck } from './ClassTable';

interface Draft {
  id: string;
  name: string;
  grades: Grade[];
  students: Partial<Record<Grade, string>>;
  roleId?: string;
}

const toDraft = (c: ClassStructure): Draft => {
  const grades = classGrades(c);
  return {
    id: c.id,
    name: c.name,
    grades: grades.length ? grades : (Object.keys(c.students) as Grade[]),
    students: Object.fromEntries(Object.entries(c.students).map(([g, n]) => [g, String(n ?? 0)])),
    roleId: c.roleId,
  };
};

const parseCount = (s: string | undefined) => (s && /^\d+$/.test(s.trim()) ? Number(s.trim()) : s?.trim() ? NaN : 0);

/** The accepted structure, editable by hand, and its link to class roles. */
export function AcceptedStructure({ data, rules, enrol }: { data: PlanData; rules: ClassRules; enrol: Enrolments }) {
  const repo = useRepository();
  const saved = useMemo(() => [...data.classStructures].sort(bySortOrder), [data.classStructures]);
  const [rows, setRows] = useState<Draft[]>(() => saved.map(toDraft));
  const [newKind, setNewKind] = useState('K');
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setRows(saved.map(toDraft)), [saved]);

  const parsed = rows.map((r) => ({
    ...r,
    counts: Object.fromEntries(r.grades.map((g) => [g, parseCount(r.students[g])])) as Partial<Record<Grade, number>>,
  }));
  const invalid = parsed.some((r) => !r.name.trim() || Object.values(r.counts).some((n) => Number.isNaN(n)));
  const duplicateNames = new Set(
    rows.map((r) => r.name.trim().toLowerCase()).filter((n, i, all) => n && all.indexOf(n) !== i),
  );
  const gaps = placementGaps(parsed.map((r) => ({ students: r.counts })), enrol);
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved.map(toDraft));
  const roleById = new Map(data.roles.map((r) => [r.id, r]));
  const classType = [...data.positionTypes].sort(bySortOrder).find((p) => p.category === 'class_teacher');

  const update = (id: string, change: Partial<Draft>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const save = async () => {
    if (invalid || duplicateNames.size) return;
    const records: ClassStructure[] = parsed.map((r, i) => ({
      id: r.id,
      planningYearId: data.planningYear.id,
      name: r.name.trim(),
      students: r.counts,
      sortOrder: i,
      roleId: r.roleId,
    }));
    const removed = saved.filter((s) => !records.some((r) => r.id === s.id));
    await repo.classStructures.deleteMany(removed.map((r) => r.id));
    await repo.classStructures.putMany(records);
    // Keep linked class roles' names in step with their classes.
    const renamed = records.flatMap((r) => {
      const role = r.roleId ? roleById.get(r.roleId) : undefined;
      return role && role.name !== r.name ? [{ ...role, name: r.name }] : [];
    });
    if (renamed.length) await repo.roles.putMany(renamed);
    setMessage('Class structure saved.');
  };

  const remove = async (row: Draft) => {
    if (!confirm(`Remove class ${row.name || '(unnamed)'}?`)) return;
    setRows(rows.filter((r) => r.id !== row.id));
    const role = row.roleId ? roleById.get(row.roleId) : undefined;
    if (role) {
      const allocations = data.allocations.filter((a) => a.roleId === role.id);
      const keep = !confirm(
        `Also delete the class teacher role "${role.name}"${allocations.length ? ` and its ${allocations.length} allocation(s)` : ''}? Cancel keeps the role.`,
      );
      if (!keep) {
        await repo.allocations.deleteMany(allocations.map((a) => a.id));
        await repo.roles.delete(role.id);
      }
    }
  };

  const add = () => {
    const grades = CLASS_KINDS.find((k) => classLabel(k) === newKind)!;
    const label = classLabel(grades);
    const taken = new Set(rows.map((r) => r.name));
    let n = 0;
    while (taken.has(`${label}${String.fromCharCode(65 + n)}`)) n++;
    setRows([
      ...rows,
      {
        id: crypto.randomUUID(),
        name: `${label}${String.fromCharCode(65 + n)}`,
        grades,
        students: Object.fromEntries(grades.map((g) => [g, '0'])),
      },
    ]);
  };

  const createRoles = async () => {
    if (!classType) return;
    const nextOrder = Math.max(-1, ...data.roles.map((r) => r.sortOrder)) + 1;
    const unlinked = saved.filter((c) => !c.roleId || !roleById.has(c.roleId));
    const existingByName = new Map(data.roles.map((r) => [r.name.toLowerCase(), r]));
    const roles = [];
    const links: ClassStructure[] = [];
    for (const [i, c] of unlinked.entries()) {
      // Reuse a role that already has the class's name rather than duplicating it.
      const existing = existingByName.get(c.name.toLowerCase());
      if (existing) {
        links.push({ ...c, roleId: existing.id });
        continue;
      }
      const role = {
        id: crypto.randomUUID(),
        planningYearId: data.planningYear.id,
        name: c.name,
        positionTypeId: classType.id,
        days: FULL_TIME,
        sortOrder: nextOrder + i,
      };
      roles.push(role);
      links.push({ ...c, roleId: role.id });
    }
    if (roles.length) await repo.roles.putMany(roles);
    if (links.length) await repo.classStructures.putMany(links);
    setMessage(`${roles.length} class role(s) created${links.length > roles.length ? `, ${links.length - roles.length} linked to existing roles` : ''}.`);
  };

  if (saved.length === 0 && rows.length === 0) return null;
  const unlinkedCount = saved.filter((c) => !c.roleId || !roleById.has(c.roleId)).length;
  const otherClassRoles = data.roles.filter(
    (r) => r.positionTypeId === classType?.id && !saved.some((c) => c.roleId === r.id),
  );

  return (
    <section aria-labelledby="accepted-heading">
      <h2 id="accepted-heading">Accepted class structure</h2>
      <p className="muted small">Edit names and numbers, add or remove classes, then save.</p>
      <table>
        <thead>
          <tr>
            <th>Class</th>
            <th>Students</th>
            <th className="num">Size</th>
            <th className="num">Guide</th>
            <th>Check</th>
            <th>Role</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {parsed.map((r) => {
            const size = classSize({ students: Object.fromEntries(Object.entries(r.counts).map(([g, n]) => [g, n || 0])) });
            const guide = guideFor(r.grades, rules);
            const role = r.roleId ? roleById.get(r.roleId) : undefined;
            return (
              <tr key={r.id}>
                <td>
                  <input
                    aria-label={`Name of class ${r.name}`}
                    value={r.name}
                    aria-invalid={!r.name.trim() || duplicateNames.has(r.name.trim().toLowerCase())}
                    onChange={(e) => update(r.id, { name: e.target.value })}
                  />
                </td>
                <td className="nowrap">
                  {r.grades.map((g) => (
                    <label key={g} className="grade-count">
                      <input
                        className="short"
                        inputMode="numeric"
                        aria-label={`${GRADE_LABELS[g]} students in ${r.name}`}
                        value={r.students[g] ?? ''}
                        aria-invalid={Number.isNaN(r.counts[g])}
                        onChange={(e) => update(r.id, { students: { ...r.students, [g]: e.target.value } })}
                      />{' '}
                      {GRADE_LABELS[g]}
                    </label>
                  ))}
                </td>
                <td className="num">{size}</td>
                <td className="num">{guide}</td>
                <td>
                  <SizeCheck size={size} guide={guide} allowance={rules.allowance} />
                </td>
                <td>{role ? <Link to={roleLink(role.id)}>{role.name}</Link> : <span className="muted">—</span>}</td>
                <td>
                  <button type="button" className="danger" onClick={() => void remove(r)}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {Object.keys(gaps).length > 0 && (
        <ul className="warning" role="status" aria-label="Placement check">
          {(Object.entries(gaps) as [Grade, number][]).map(([g, n]) => (
            <li key={g}>
              {GRADE_LABELS[g]}: {n > 0 ? `${n} student${n === 1 ? '' : 's'} not in a class` : `${-n} more placed than enrolled`}
            </li>
          ))}
        </ul>
      )}
      {duplicateNames.size > 0 && <p className="field-error">Each class needs a different name.</p>}

      <div className="inline-form">
        <label>
          Add a class{' '}
          <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
            {CLASS_KINDS.map((k) => (
              <option key={classLabel(k)} value={classLabel(k)}>
                {k.length > 1 ? `${classLabel(k)} composite` : GRADE_LABELS[k[0]!]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary" onClick={add}>
          Add class
        </button>
      </div>

      <div className="actions">
        <button onClick={() => void save()} disabled={!dirty || invalid || duplicateNames.size > 0}>
          Save changes
        </button>
        <button className="secondary" disabled={!dirty} onClick={() => setRows(saved.map(toDraft))}>
          Discard changes
        </button>
        <button
          className="secondary"
          disabled={dirty || unlinkedCount === 0 || !classType}
          title={dirty ? 'Save changes first' : undefined}
          onClick={() => void createRoles()}
        >
          Create class roles{unlinkedCount ? ` (${unlinkedCount})` : ''}
        </button>
        {message && !dirty && <span className="ok">{message}</span>}
      </div>
      {!classType && <p className="warning">Add a position type in the "Class teacher" category to create class roles.</p>}
      {otherClassRoles.length > 0 && (
        <p className="muted small">
          Other class teacher roles not in this structure: {otherClassRoles.map((r) => r.name).join(', ')}. Delete them
          on the <Link to="/allocation/roles">roles page</Link> if they're no longer needed.
        </p>
      )}
    </section>
  );
}
