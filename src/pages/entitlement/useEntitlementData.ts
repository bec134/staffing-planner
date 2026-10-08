import { useCallback, useEffect, useState } from 'react';
import type { Allocation, Entitlement, Id, PositionType } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';

export interface EntitlementData {
  positionTypes: PositionType[];
  entitlement: Entitlement | undefined;
  allocations: Allocation[];
}

/** Loads everything the entitlement screen needs for one planning year. */
export function useEntitlementData(planningYearId: Id | undefined) {
  const repo = useRepository();
  const [data, setData] = useState<EntitlementData | null>(null);

  const reload = useCallback(async () => {
    if (!planningYearId) {
      setData(null);
      return;
    }
    const [positionTypes, entitlements, allocations] = await Promise.all([
      repo.positionTypes.listByYear(planningYearId),
      repo.entitlements.listByYear(planningYearId),
      repo.allocations.listByYear(planningYearId),
    ]);
    setData({
      positionTypes: [...positionTypes].sort((a, b) => a.sortOrder - b.sortOrder),
      entitlement: entitlements[0],
      allocations,
    });
  }, [repo, planningYearId]);

  useEffect(() => {
    setData(null);
    void reload();
  }, [reload]);

  return { data, reload };
}
