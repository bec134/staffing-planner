import { useState } from 'react';
import { AssignmentGrid } from '../../components/AssignmentGrid';
import { fteOf } from '../../domain/dayPattern';
import { roleLink } from '../../domain/flags';
import { describeGrades, intentionForStaff } from '../../domain/intentions';
import { isMatched } from '../../domain/matching';
import { useRepository } from '../../data/RepositoryContext';
import type { PlanData } from './shared';

/**
 * Part 2: place staff in classes and roles, by day. Offers staff matched in
 * Part 1 (and not nominated for transfer) unless "Show all staff" is ticked.
 */
export function RoleGrid({ data }: { data: PlanData }) {
  const repo = useRepository();
  const [showAll, setShowAll] = useState(false);
  const matchingStarted = data.matches.length > 0;
  const offered = showAll || !matchingStarted ? data.staff : data.staff.filter((s) => isMatched(s, data.matches));
  const types = new Map(data.positionTypes.map((p) => [p.id, p]));

  return (
    <AssignmentGrid
      rows={data.roles}
      allocations={data.allocations}
      leave={data.leave}
      staff={data.staff}
      offered={offered}
      positionTypes={data.positionTypes}
      planningYear={data.planningYear}
      write={async (puts, deletes) => {
        if (deletes.length) await repo.allocations.deleteMany(deletes);
        if (puts.length) await repo.allocations.putMany(puts);
      }}
      saveStaff={(s) => repo.staff.put(s)}
      // A full-time teacher placed on a class fills the whole week (Bec).
      fillsWeek={(s, row) => types.get(row.positionTypeId)?.category === 'class_teacher' && fteOf(s.workPattern) === 1}
      rowLink={(row) => roleLink(row.id)}
      tileNote={(s) => {
        const grades = intentionForStaff(s, data.intentions)?.gradePreferences ?? [];
        return grades.length ? `Prefers ${describeGrades(grades)}` : undefined;
      }}
      showAsAt
      placesHigherDuties
      secondJobLeaveId={(staffId, day) =>
        data.matches.find((m) => m.staffId === staffId && m.secondJobLeaveId && m.days.days[day])?.secondJobLeaveId
      }
      words={{
        row: 'Role',
        cover: 'cover',
        result: 'Allocation result',
        testPrefix: '',
        full: 'fully placed',
        help: (
          <>
            Drag a name onto a role and day, or use <strong>+</strong> to choose one. A full-time teacher placed on a class
            fills the whole week, and dropping a name on a role's name fills every day they're free. Drag a tile to move
            it; × removes that day. Greyed tiles are on leave; dropping someone there assigns cover for that leave. Someone on higher duties
            can be placed in an executive role on those days.
          </>
        ),
      }}
      controls={
        matchingStarted && (
          <label className="field">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all staff
            (not just those matched in Part 1)
          </label>
        )
      }
    />
  );
}
