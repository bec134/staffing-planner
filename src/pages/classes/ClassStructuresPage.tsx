import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlanningYear } from '../../components/PlanningYearContext';
import { defaultRules, nameClasses, suggestStructures, type Enrolments, type Suggestion } from '../../domain/classStructure';
import { GRADES, type ClassRules, type ClassStructure } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { usePlanData } from '../../data/usePlanData';
import { AcceptedStructure } from './AcceptedStructure';
import { ClassInputs } from './ClassInputs';
import { Suggestions } from './Suggestions';

export function ClassStructuresPage() {
  const { current, loading } = usePlanningYear();
  const data = usePlanData(current?.id);
  const repo = useRepository();
  // Suggestions for the inputs as they were when "Suggest" was pressed.
  const [result, setResult] = useState<{ run: number; rules: ClassRules; out: ReturnType<typeof suggestStructures> } | null>(
    null,
  );

  const rules = data ? (data.classRules[0] ?? defaultRules(data.planningYear.id)) : null;
  const enrol = useMemo(
    () =>
      data
        ? (Object.fromEntries(
            GRADES.map((g) => [g, data.enrolments.find((e) => e.grade === g)?.projectedCount ?? 0]),
          ) as Enrolments)
        : null,
    [data],
  );

  if (loading) return <p>Loading…</p>;
  if (!current) {
    return (
      <section>
        <h1>Class structures</h1>
        <p>
          No plan yet. <Link to="/">Create a planning year or load the sample plan</Link> first.
        </p>
      </section>
    );
  }
  if (!data || !rules || !enrol) return <p>Loading…</p>;

  const accept = async (s: Suggestion) => {
    if (data.classStructures.length && !confirm('Replace the accepted class structure? Class roles already created are kept.')) {
      return;
    }
    const names = nameClasses(s.classes);
    const records: ClassStructure[] = s.classes.map((c, i) => ({
      id: crypto.randomUUID(),
      planningYearId: data.planningYear.id,
      name: names[i]!,
      students: c.students,
      sortOrder: i,
    }));
    await repo.classStructures.deleteMany(data.classStructures.map((c) => c.id));
    await repo.classStructures.putMany(records);
    setResult(null);
  };

  return (
    <section>
      <h1>Class structures</h1>
      <p className="muted">Enter the total number of classes and the students in each grade, then ask for suggestions.</p>
      <ClassInputs
        key={data.planningYear.id}
        data={data}
        onSuggest={(e, r) => {
          const out = suggestStructures(e, r);
          setResult((prev) => ({ run: (prev?.run ?? 0) + 1, rules: r, out }));
        }}
      />
      {result && (
        <Suggestions
          key={result.run}
          suggestions={result.out.suggestions}
          reason={result.out.reason}
          rules={result.rules}
          onAccept={(s) => void accept(s)}
        />
      )}
      <AcceptedStructure key={data.planningYear.id} data={data} rules={rules} enrol={enrol} />
    </section>
  );
}
