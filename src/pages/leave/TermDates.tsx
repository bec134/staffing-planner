import { useState } from 'react';
import { formatRange } from '../../domain/dates';
import type { DateRange } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import type { PlanData } from '../allocation/shared';

/** The school's term dates, used as quick picks when assigning cover. */
export function TermDates({ data }: { data: PlanData }) {
  const repo = useRepository();
  const saved = data.planningYear.terms ?? [];
  const [terms, setTerms] = useState<{ start: string; end: string }[]>(
    [0, 1, 2, 3].map((i) => ({ start: saved[i]?.start ?? '', end: saved[i]?.end ?? '' })),
  );
  const [message, setMessage] = useState<string | null>(null);

  const problems = terms.map((t, i) => {
    if (!t.start && !t.end) return null;
    if (!t.start || !t.end) return `Term ${i + 1}: enter both dates`;
    if (t.end < t.start) return `Term ${i + 1}: the end is before the start`;
    if (i > 0) {
      const prev = terms[i - 1]!;
      if (prev.end && t.start <= prev.end) return `Term ${i + 1} starts before Term ${i} ends`;
    }
    return null;
  });
  const valid = problems.every((p) => p === null);

  const save = async () => {
    if (!valid) return;
    const cleaned: (DateRange | null)[] = terms.map((t) => (t.start && t.end ? { start: t.start, end: t.end } : null));
    await repo.planningYears.put({ ...data.planningYear, terms: cleaned, updatedAt: new Date().toISOString() });
    setMessage('Term dates saved.');
  };

  return (
    <section>
      <h2>Term dates {data.planningYear.year}</h2>
      <p className="muted small">Enter your school's term dates to get term quick picks when assigning cover.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <table className="entry">
          <tbody>
            {terms.map((t, i) => (
              <tr key={i}>
                <th scope="row">Term {i + 1}</th>
                <td>
                  <input
                    type="date"
                    aria-label={`Term ${i + 1} start`}
                    value={t.start}
                    onChange={(e) => {
                      setMessage(null);
                      setTerms(terms.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)));
                    }}
                  />{' '}
                  to{' '}
                  <input
                    type="date"
                    aria-label={`Term ${i + 1} end`}
                    value={t.end}
                    onChange={(e) => {
                      setMessage(null);
                      setTerms(terms.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)));
                    }}
                  />
                  {t.start && t.end && t.start <= t.end && <span className="muted small"> {formatRange(t)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {problems.filter(Boolean).map((p) => (
          <p key={p} className="field-error">
            {p}
          </p>
        ))}
        <div className="actions">
          <button type="submit" disabled={!valid}>
            Save term dates
          </button>
          {message && <span className="ok">{message}</span>}
        </div>
      </form>
    </section>
  );
}
