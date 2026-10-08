import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Id, PlanningYear } from '../domain/types';
import { useRepository } from '../data/RepositoryContext';

interface PlanningYearState {
  years: PlanningYear[];
  current: PlanningYear | undefined;
  loading: boolean;
  select(id: Id): void;
  refresh(): Promise<void>;
}

const Ctx = createContext<PlanningYearState | null>(null);
const STORAGE_KEY = 'staffing-planner.currentPlanningYear';

function readSaved(): Id | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function save(id: Id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Remembering the selection is a convenience only.
  }
}

export function PlanningYearProvider({ children }: { children: ReactNode }) {
  const repo = useRepository();
  const [years, setYears] = useState<PlanningYear[]>([]);
  const [currentId, setCurrentId] = useState<Id | null>(readSaved);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setYears(await repo.planningYears.list());
    setLoading(false);
  }, [repo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const select = useCallback((id: Id) => {
    setCurrentId(id);
    save(id);
  }, []);

  // Fall back to the latest year if the saved one no longer exists.
  const current = years.find((y) => y.id === currentId) ?? years[years.length - 1];

  return <Ctx.Provider value={{ years, current, loading, select, refresh }}>{children}</Ctx.Provider>;
}

export function usePlanningYear(): PlanningYearState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlanningYear must be used inside PlanningYearProvider');
  return ctx;
}
