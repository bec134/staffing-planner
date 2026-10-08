import { createContext, useContext, type ReactNode } from 'react';
import type { Repository } from './repository';

const RepositoryContext = createContext<Repository | null>(null);

export function RepositoryProvider({ repository, children }: { repository: Repository; children: ReactNode }) {
  return <RepositoryContext.Provider value={repository}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): Repository {
  const repo = useContext(RepositoryContext);
  if (!repo) throw new Error('useRepository must be used inside RepositoryProvider');
  return repo;
}
