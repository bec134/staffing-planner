import { useEffect, useState } from 'react';
import type { Id } from '../domain/types';
import type { PlanningYearSnapshot } from './repository';
import { useDataVersion, useRepository } from './RepositoryContext';

/**
 * Everything stored for one planning year, reloaded after every write.
 * `undefined` while loading.
 */
export function usePlanData(planningYearId: Id | undefined): PlanningYearSnapshot | undefined {
  const repo = useRepository();
  const version = useDataVersion();
  const [data, setData] = useState<{ id: Id; version: number; snapshot: PlanningYearSnapshot } | undefined>();

  useEffect(() => {
    if (!planningYearId) return;
    let cancelled = false;
    void repo.exportPlanningYear(planningYearId).then((snapshot) => {
      if (!cancelled && snapshot) setData({ id: planningYearId, version, snapshot });
    });
    return () => {
      cancelled = true;
    };
  }, [repo, planningYearId, version]);

  // Never show another year's data while a newly selected year loads.
  return data && data.id === planningYearId ? data.snapshot : undefined;
}
