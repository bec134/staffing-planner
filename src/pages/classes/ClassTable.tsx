import { classGrades, classSize, guideFor } from '../../domain/classStructure';
import { GRADES, GRADE_LABELS, type ClassRules, type Grade } from '../../domain/types';

export interface ClassRow {
  name: string;
  students: Partial<Record<Grade, number>>;
}

/** Read-only table of classes with size against guide. */
export function ClassTable({ rows, rules, caption }: { rows: ClassRow[]; rules: ClassRules; caption?: string }) {
  return (
    <table>
      {caption && <caption>{caption}</caption>}
      <thead>
        <tr>
          <th>Class</th>
          <th>Students</th>
          <th className="num">Size</th>
          <th className="num">Guide</th>
          <th>Check</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const grades = classGrades(r);
          const size = classSize(r);
          const guide = grades.length ? guideFor(grades, rules) : 0;
          return (
            <tr key={i}>
              <td>{r.name}</td>
              <td>
                {grades.length > 1
                  ? grades.map((g) => `${r.students[g]} ${GRADE_LABELS[g]}`).join(' + ')
                  : grades.length
                    ? GRADE_LABELS[grades[0]!]
                    : '—'}
              </td>
              <td className="num">{size}</td>
              <td className="num">{guide || '—'}</td>
              <td>
                <SizeCheck size={size} guide={guide} allowance={rules.allowance} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SizeCheck({ size, guide, allowance }: { size: number; guide: number; allowance: number }) {
  if (!guide) return null;
  const over = size - guide;
  if (over > allowance) return <span className="status uncovered">{over} over (limit {guide + allowance})</span>;
  if (over > 0) return <span className="status partial">{over} over guide</span>;
  return <span className="status covered">OK</span>;
}

/** Grades that can be in one class: a single grade or an allowed composite. */
export const CLASS_KINDS: Grade[][] = [...GRADES.map((g) => [g]), ['1', '2'], ['3', '4'], ['5', '6']];
