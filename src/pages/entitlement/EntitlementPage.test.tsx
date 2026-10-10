import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../App';
import { createDexieRepository } from '../../data/dexieRepository';
import { RepositoryProvider } from '../../data/RepositoryContext';

let n = 0;

async function setup() {
  window.location.hash = '';
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  const repo = createDexieRepository(`entitlement-ui-${n++}`);
  render(
    <RepositoryProvider repository={repo}>
      <App />
    </RepositoryProvider>,
  );
  const form = await screen.findByRole('form', { name: 'New planning year' });
  fireEvent.change(within(form).getByLabelText('Year'), { target: { value: '2028' } });
  fireEvent.change(within(form).getByLabelText('School name'), { target: { value: 'Test School' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Create planning year' }));
  await screen.findByRole('heading', { name: /Test School — 2028/ });
  fireEvent.click(screen.getByRole('link', { name: 'Entitlement' }));
  await screen.findByLabelText('Total entitlement');
  return repo;
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Entitlement page', () => {
  it('enters exact decimal entitlement, checks the breakdown and updates the dashboard', async () => {
    const repo = await setup();

    type('Total entitlement', '3.316');
    type('Classroom Teacher', '2');
    expect(screen.getByRole('status', { name: 'Breakdown check' })).toHaveTextContent('1.316 FTE of the total is not yet broken down');

    type('RFF Teacher', '1.5');
    expect(screen.getByRole('status', { name: 'Breakdown check' })).toHaveTextContent('The breakdown is 0.184 FTE more than the total');

    type('RFF Teacher', '1.316');
    expect(screen.getByRole('status', { name: 'Breakdown check' })).toHaveTextContent('This matches the total');

    fireEvent.click(screen.getByRole('button', { name: 'Save entitlement' }));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());

    const stats = await screen.findAllByText('3.316');
    expect(stats.length).toBeGreaterThan(0);
    const [ent] = await repo.entitlements.listByYear((await repo.planningYears.list())[0]!.id);
    expect(ent!.totalMilliFte).toBe(3316);
    expect(ent!.lines).toHaveLength(2);
  });

  it('blocks saving invalid figures', async () => {
    await setup();
    type('Total entitlement', '1.2345');
    expect(screen.getByText('Use at most 3 decimal places')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save entitlement' })).toBeDisabled();
  });

  it('adds a position type without losing unsaved entitlement edits', async () => {
    await setup();
    type('Total entitlement', '5');
    fireEvent.change(screen.getByLabelText(/New position type/), { target: { value: 'Instructional Leader' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'executive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByLabelText('Instructional Leader')).toBeInTheDocument();
    expect(screen.getByLabelText('Total entitlement')).toHaveValue('5');
  });

  it('rejects a duplicate position type name', async () => {
    await setup();
    fireEvent.change(screen.getByLabelText(/New position type/), { target: { value: 'rff teacher' } });
    expect(screen.getByText('A position type with this name already exists')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('includes Part-time Teacher and School Counsellor, and adds them to older plans', async () => {
    const repo = await setup();
    expect(screen.getByLabelText('Part-time Teacher')).toBeInTheDocument();
    expect(screen.getByLabelText('School Counsellor')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add standard position types' })).toBeNull();

    // A plan made before they were standard.
    const year = (await repo.planningYears.list())[0]!;
    const older = (await repo.positionTypes.listByYear(year.id)).filter((p) => ['Part-time Teacher', 'School Counsellor'].includes(p.name));
    await repo.positionTypes.deleteMany(older.map((p) => p.id));
    fireEvent.click(screen.getByRole('link', { name: 'Overview' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Entitlement' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add standard position types' }));
    expect(await screen.findByLabelText('School Counsellor')).toBeInTheDocument();
    expect((await repo.positionTypes.listByYear(year.id)).find((p) => p.name === 'Part-time Teacher')).toMatchObject({
      category: 'other_teaching',
    });
  });
});
