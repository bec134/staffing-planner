import type { ApplyPlan } from '../domain/intentions';
import type { Repository } from './repository';

/**
 * Save planned staff changes: the staff records, their whole-year leave,
 * any cover or Part 1 backfills trimmed to match, and their details.
 */
export async function saveStaffPlans(repo: Repository, plans: ApplyPlan[]) {
  const all = <T,>(pick: (p: ApplyPlan) => T[]) => plans.flatMap(pick);
  await repo.staff.putMany(plans.map((p) => p.staff));
  if (all((p) => p.allocationDelete).length) await repo.allocations.deleteMany(all((p) => p.allocationDelete));
  if (all((p) => p.allocationPut).length) await repo.allocations.putMany(all((p) => p.allocationPut));
  if (all((p) => p.matchDelete).length) await repo.matches.deleteMany(all((p) => p.matchDelete));
  if (all((p) => p.matchPut).length) await repo.matches.putMany(all((p) => p.matchPut));
  if (all((p) => p.leaveDelete).length) await repo.leave.deleteMany(all((p) => p.leaveDelete));
  if (all((p) => p.leavePut).length) await repo.leave.putMany(all((p) => p.leavePut));
  await repo.intentions.putMany(plans.map((p) => p.intention));
}
