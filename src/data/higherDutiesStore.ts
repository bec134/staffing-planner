/** Saving higher duties, and keeping it consistent after Part 1 changes (see domain/higherDuties.ts). */
import { tidyHigherDuties, type HigherDutiesPlan } from '../domain/higherDuties';
import type { Id } from '../domain/types';
import type { Repository } from './repository';

export async function saveHigherDuties(repo: Repository, plan: Extract<HigherDutiesPlan, { ok: true }>): Promise<void> {
  await repo.leave.putMany(plan.leavePut);
  await repo.matches.putMany(plan.matchPut);
}

/**
 * Bring higher-duties leave, backfills and Part 2 placements into line with
 * the higher-duties matches. Call after changing Part 1 matches or deleting
 * leave.
 */
export async function tidyHigherDutiesIn(repo: Repository, planningYearId: Id): Promise<void> {
  const [matches, leave, allocations] = await Promise.all([
    repo.matches.listByYear(planningYearId),
    repo.leave.listByYear(planningYearId),
    repo.allocations.listByYear(planningYearId),
  ]);
  const t = tidyHigherDuties(matches, leave, allocations);
  if (t.matchDelete.length) await repo.matches.deleteMany(t.matchDelete);
  if (t.matchPut.length) await repo.matches.putMany(t.matchPut);
  if (t.allocationDelete.length) await repo.allocations.deleteMany(t.allocationDelete);
  if (t.allocationPut.length) await repo.allocations.putMany(t.allocationPut);
  if (t.leaveDelete.length) await repo.leave.deleteMany(t.leaveDelete);
  if (t.leavePut.length) await repo.leave.putMany(t.leavePut);
}
