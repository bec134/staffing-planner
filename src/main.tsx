import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createDexieRepository } from './data/dexieRepository';
import { RepositoryProvider } from './data/RepositoryContext';
import './styles.css';

const repository = createDexieRepository();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RepositoryProvider repository={repository}>
      <App />
    </RepositoryProvider>
  </StrictMode>,
);
