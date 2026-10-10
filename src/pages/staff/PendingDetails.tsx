import { checkIntention, planApplyIntention, staffForIntention } from '../../domain/intentions';
import { schoolYear } from '../../domain/matching';
import { useRepository } from '../../data/RepositoryContext';
import { saveStaffPlans } from '../../data/saveStaffPlans';
import type { PlanData } from '../allocation/shared';

/**
 * Details for next year saved before the staff form and import applied them
 * straight away (the old Staff intentions page), and not yet applied. Shown
 * so nothing is lost or changed without being seen.
 */
export function PendingDetails({ data }: { data: PlanData }) {
  const repo = useRepository();
  const ctx = {
    planningYearId: data.planningYear.id,
    year: schoolYear(data.planningYear),
    staff: data.staff,
    leave: data.leave,
    allocations: data.allocations,
    matches: data.matches,
  };
  const pending = data.intentions
    .map((i) => {
      const check = checkIntention(i);
      const plan = check.errors.length ? undefined : planApplyIntention(i, ctx, () => crypto.randomUUID());
      return { i, check, plan };
    })
    .filter((r) => !r.plan || r.plan.changes.length > 0);
  if (!pending.length) return null;

  return (
    <section className="panel" aria-label="Not yet applied">
      <h2>Details not yet applied</h2>
      <p className="muted small">
        These were saved earlier but haven't been applied to the plan. Apply them, or discard them to keep the plan as it is.
      </p>
      <ul>
        {pending.map(({ i, check, plan }) => (
          <li key={i.id}>
            <strong>{i.name}</strong>
            {!staffForIntention(i, data.staff) && ' (new)'}:{' '}
            {plan ? plan.changes.join('; ') : <span className="check-warning">{check.errors.join('; ')}</span>}{' '}
            {plan && (
              <button className="small" onClick={() => void saveStaffPlans(repo, [plan])}>
                Apply
              </button>
            )}{' '}
            <button
              className="secondary small"
              onClick={() => {
                if (confirm(`Discard these details for ${i.name}? The plan isn't changed.`)) void repo.intentions.delete(i.id);
              }}
            >
              Discard
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
