import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { observeRepository, type ObservableRepository } from './observableRepository';
import type { Repository } from './repository';

interface RepositoryState {
  repository: ObservableRepository;
  /** Increments after every write, so data hooks know to reload. */
  version: number;
}

const RepositoryContext = createContext<RepositoryState | null>(null);

export function RepositoryProvider({ repository, children }: { repository: Repository; children: ReactNode }) {
  const observed = useMemo(() => observeRepository(repository), [repository]);
  const [version, setVersion] = useState(0);
  useEffect(() => observed.subscribe(() => setVersion((v) => v + 1)), [observed]);
  const value = useMemo(() => ({ repository: observed, version }), [observed, version]);
  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

function useRepositoryState(): RepositoryState {
  const state = useContext(RepositoryContext);
  if (!state) throw new Error('useRepository must be used inside RepositoryProvider');
  return state;
}

export function useRepository(): Repository {
  return useRepositoryState().repository;
}

export function useDataVersion(): number {
  return useRepositoryState().version;
}
