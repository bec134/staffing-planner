import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../App';
import { createDexieRepository } from '../../data/dexieRepository';
import { RepositoryProvider } from '../../data/RepositoryContext';

let n = 0;
function renderApp() {
  window.location.hash = '';
  const repo = createDexieRepository(`help-ui-${n++}`);
  render(
    <RepositoryProvider repository={repo}>
      <App />
    </RepositoryProvider>,
  );
  return repo;
}

describe('Help', () => {
  it('lists topics, searches them, and opens a step-by-step guide', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('link', { name: 'Help' }));
    expect(await screen.findByRole('heading', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Getting started' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Search help/), { target: { value: 'nominate transfer' } });
    expect(screen.queryByRole('link', { name: 'Getting started' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Part 1: Match staff to the entitlement' }));

    const guide = await screen.findByRole('article', { name: 'Part 1: Match staff to the entitlement' });
    expect(guide).toHaveTextContent('Click Nominate for transfer, add Notes, and click Confirm nomination.');
    expect(screen.getByRole('link', { name: 'Go to Match staff →' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Part 2: Class structures →' })).toBeInTheDocument();
  });

  it('links from each page to its guide', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /load fictional sample plan/i }));
    await screen.findByText('Morgan Pike');
    fireEvent.click(screen.getByRole('link', { name: 'Leave cover' }));
    fireEvent.click(await screen.findByRole('link', { name: 'How to use this page' }));
    expect(await screen.findByRole('article', { name: 'Part 2: Leave and cover' })).toBeInTheDocument();
  });
});
