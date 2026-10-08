import { useState } from 'react';
import { COMPOSITE_KEYS, defaultRules } from '../../domain/classStructure';
import { GRADES, GRADE_LABELS, type ClassRules, type Enrolment, type Grade } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import type { PlanData } from '../allocation/shared';

const toText = (n: number | undefined) => (n === undefined || n === 0 ? '' : String(n));
const toNumber = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : s.trim() === '' ? 0 : NaN);

/** Total classes, students per grade and the rules; saved before suggesting. */
export function ClassInputs({
  data,
  onSuggest,
}: {
  data: PlanData;
  onSuggest(enrol: Record<Grade, number>, rules: ClassRules): void;
}) {
  const repo = useRepository();
  const yearId = data.planningYear.id;
  const savedRules = data.classRules[0] ?? defaultRules(yearId);
  const savedCount = (g: Grade) => data.enrolments.find((e) => e.grade === g)?.projectedCount;

  const [total, setTotal] = useState(toText(savedRules.totalClasses));
  const [counts, setCounts] = useState<Record<Grade, string>>(
    Object.fromEntries(GRADES.map((g) => [g, toText(savedCount(g))])) as Record<Grade, string>,
  );
  const [guide, setGuide] = useState<Record<Grade, string>>(
    Object.fromEntries(GRADES.map((g) => [g, String(savedRules.guide[g])])) as Record<Grade, string>,
  );
  const [allowance, setAllowance] = useState(String(savedRules.allowance));
  const [composites, setComposites] = useState<string[]>(savedRules.permittedComposites);

  const totalN = toNumber(total);
  const countN = Object.fromEntries(GRADES.map((g) => [g, toNumber(counts[g])])) as Record<Grade, number>;
  const guideN = Object.fromEntries(GRADES.map((g) => [g, toNumber(guide[g])])) as Record<Grade, number>;
  const allowanceN = toNumber(allowance);
  const invalid =
    Number.isNaN(totalN) ||
    GRADES.some((g) => Number.isNaN(countN[g]) || Number.isNaN(guideN[g]) || guideN[g] === 0) ||
    Number.isNaN(allowanceN);
  const students = GRADES.reduce((s, g) => s + (countN[g] || 0), 0);

  const save = async () => {
    if (invalid) return;
    const rules: ClassRules = {
      ...savedRules,
      totalClasses: totalN,
      guide: guideN,
      allowance: allowanceN,
      permittedComposites: composites,
    };
    const enrolments: Enrolment[] = GRADES.map((g) => ({
      id: `${yearId}-enrolment-${g}`,
      planningYearId: yearId,
      grade: g,
      projectedCount: countN[g],
    }));
    await repo.classRules.put(rules);
    await repo.enrolments.putMany(enrolments);
    onSuggest(countN, rules);
  };

  return (
    <form
      aria-label="Class structure inputs"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <table className="entry">
        <tbody>
          <tr className="total">
            <th scope="row">
              <label htmlFor="total-classes">Total number of classes</label>
            </th>
            <td>
              <input id="total-classes" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} />
            </td>
          </tr>
          {GRADES.map((g) => (
            <tr key={g}>
              <th scope="row">
                <label htmlFor={`enrol-${g}`}>{GRADE_LABELS[g]} students</label>
              </th>
              <td>
                <input
                  id={`enrol-${g}`}
                  inputMode="numeric"
                  value={counts[g]}
                  aria-invalid={Number.isNaN(countN[g])}
                  onChange={(e) => setCounts({ ...counts, [g]: e.target.value })}
                />
              </td>
            </tr>
          ))}
          <tr className="total">
            <th scope="row">Total students</th>
            <td className="num">{students}</td>
          </tr>
        </tbody>
      </table>

      <details className="rules">
        <summary>Rules</summary>
        <p className="muted small">
          Guide (average) class sizes. A class may go up to the allowance over its guide before a composite is
          preferred. A composite uses the lower of its two grades' guides.
        </p>
        <div className="form-grid">
          {GRADES.map((g) => (
            <label key={g}>
              {GRADE_LABELS[g]} guide
              <input
                className="short"
                inputMode="numeric"
                value={guide[g]}
                aria-invalid={Number.isNaN(guideN[g]) || guideN[g] === 0}
                onChange={(e) => setGuide({ ...guide, [g]: e.target.value })}
              />
            </label>
          ))}
          <label>
            Allowance over guide
            <input className="short" inputMode="numeric" value={allowance} onChange={(e) => setAllowance(e.target.value)} />
          </label>
        </div>
        <fieldset>
          <legend>Composite classes allowed</legend>
          <div className="mode-switch">
            {COMPOSITE_KEYS.map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={composites.includes(k)}
                  onChange={(e) => setComposites(e.target.checked ? [...composites, k] : composites.filter((c) => c !== k))}
                />
                {k}
              </label>
            ))}
          </div>
        </fieldset>
      </details>

      <div className="actions">
        <button type="submit" disabled={invalid}>
          Suggest class structures
        </button>
        {invalid && <span className="field-error">Use whole numbers only.</span>}
      </div>
    </form>
  );
}
