import { fireEvent, render, screen } from '@testing-library/react';
import { App, MODULES } from './App';
import { createDexieRepository } from './data/dexieRepository';
import { RepositoryProvider } from './data/RepositoryContext';

describe('App shell', () => {
  it('shows navigation for every module and loads the sample plan', async () => {
    const repo = createDexieRepository('app-test');
    render(
      <RepositoryProvider repository={repo}>
        <App />
      </RepositoryProvider>,
    );

    for (const m of MODULES) {
      expect(screen.getByRole('link', { name: m.label })).toBeInTheDocument();
    }
    const loadButton = await screen.findByRole('button', { name: /load fictional sample plan/i });
    fireEvent.click(loadButton);

    expect(await screen.findByText('Morgan Pike')).toBeInTheDocument();
    expect(screen.getByText('A: Mon, Tue, Wed · B: Mon, Tue')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Export & reports' }));
    expect(await screen.findByText(/built in Phase 7/)).toBeInTheDocument();
    repo.close();
  });
});
