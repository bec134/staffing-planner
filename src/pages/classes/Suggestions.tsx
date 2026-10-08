import { useState } from 'react';
import { nameClasses, type Suggestion } from '../../domain/classStructure';
import type { ClassRules } from '../../domain/types';
import { ClassTable } from './ClassTable';

/** Step through suggestions; accept one. */
export function Suggestions({
  suggestions,
  reason,
  rules,
  onAccept,
}: {
  suggestions: Suggestion[];
  reason?: string;
  rules: ClassRules;
  onAccept(s: Suggestion): void;
}) {
  const [index, setIndex] = useState(0);
  if (reason) return <p className="warning">{reason}</p>;
  if (!suggestions.length) return null;
  const i = Math.min(index, suggestions.length - 1);
  const s = suggestions[i]!;
  const names = nameClasses(s.classes);
  const composites = s.classes.filter((c) => c.grades.length > 1).length;

  return (
    <section aria-labelledby="suggestion-heading" className="panel">
      <h2 id="suggestion-heading">
        Option {i + 1} of {suggestions.length}
        {i === 0 && <span className="badge">best fit</span>}
      </h2>
      <p>
        {s.classes.length} classes, {composites === 0 ? 'no composites' : `${composites} composite${composites > 1 ? 's' : ''}`}.
      </p>
      {s.issues.length > 0 && (
        <div className="warning">
          <strong>Rules this option can't meet:</strong>
          <ul>
            {s.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      <ClassTable rows={s.classes.map((c, j) => ({ name: names[j]!, students: c.students }))} rules={rules} />
      <div className="actions">
        <button onClick={() => onAccept(s)}>Accept this structure</button>
        <button className="secondary" disabled={i + 1 >= suggestions.length} onClick={() => setIndex(i + 1)}>
          Show another option
        </button>
        <button className="secondary" disabled={i === 0} onClick={() => setIndex(i - 1)}>
          Previous option
        </button>
      </div>
    </section>
  );
}
