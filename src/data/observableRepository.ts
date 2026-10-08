/**
 * Wraps a Repository so every successful write notifies listeners. The UI
 * uses this to refresh screens and recompute flags whenever data changes.
 */
import type { PlanningYearCollection, Repository, ScopedCollection } from './repository';

export interface ObservableRepository extends Repository {
  subscribe(listener: () => void): () => void;
}

type AnyScoped = ScopedCollection<{ id: string; planningYearId: string }>;

const SCOPED_KEYS = [
  'positionTypes',
  'entitlements',
  'staff',
  'roles',
  'leave',
  'allocations',
  'classStructures',
  'enrolments',
  'classRules',
] as const satisfies readonly (keyof Repository)[];

export function observeRepository(repo: Repository): ObservableRepository {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const after =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    async (...args: A) => {
      await fn(...args);
      notify();
    };

  const wrapScoped = (c: AnyScoped): AnyScoped => ({
    ...c,
    put: after(c.put),
    putMany: after(c.putMany),
    delete: after(c.delete),
    deleteMany: after(c.deleteMany),
  });
  const planningYears: PlanningYearCollection = { ...repo.planningYears, put: after(repo.planningYears.put) };

  const wrapped = {
    ...repo,
    planningYears,
    importPlanningYear: after(repo.importPlanningYear),
    deletePlanningYear: after(repo.deletePlanningYear),
    clearAll: after(repo.clearAll),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as ObservableRepository;
  for (const key of SCOPED_KEYS) {
    (wrapped as unknown as Record<string, AnyScoped>)[key] = wrapScoped(repo[key] as unknown as AnyScoped);
  }
  return wrapped;
}
