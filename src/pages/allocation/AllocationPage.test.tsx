import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../App';
import { createDexieRepository } from '../../data/dexieRepository';
import { RepositoryProvider } from '../../data/RepositoryContext';

let n = 0;

async function setupWithSample(start: 'Staff' | 'Roles & placement' = 'Staff') {
  window.location.hash = '';
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  const repo = createDexieRepository(`allocation-ui-${n++}`);
  render(
    <RepositoryProvider repository={repo}>
      <App />
    </RepositoryProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /load fictional sample plan/i }));
  await screen.findByText('Morgan Pike');
  fireEvent.click(screen.getByRole('link', { name: start }));
  await screen.findByRole('heading', { name: start });
  return repo;
}

const panel = () => screen.getByText(/^Warnings \(/).closest('details')!;

describe('Staff (Part 1) and roles & placement (Part 2)', () => {
  it('lists staff in Part 1, with their placements and entitlement warnings', async () => {
    await setupWithSample();
    const row = screen.getByRole('link', { name: 'Gus Penrose' }).closest('tr')!;
    expect(within(row).getByText('1/2 Blue')).toBeInTheDocument();
    expect(within(row).getByText('RFF 2')).toBeInTheDocument();
    expect(within(panel()).getByText('RFF Teacher: allocated 0.7 FTE, 0.616 under the entitlement of 1.316')).toBeInTheDocument();
  });

  it('adds a staff member and allocates them only on free days', async () => {
    await setupWithSample();
    fireEvent.click(screen.getByRole('button', { name: 'Add staff member' }));
    const form = screen.getByRole('form', { name: 'Add staff member' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Pat Example' } });
    fireEvent.click(within(form).getByLabelText('Thu'));
    fireEvent.click(within(form).getByLabelText('Fri'));
    expect(within(form).getByText(/= 0.6 FTE/)).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Add staff member' }));

    fireEvent.click(await screen.findByRole('link', { name: 'Pat Example' }));
    await screen.findByRole('heading', { name: 'Pat Example' });
    fireEvent.click(screen.getByRole('button', { name: 'Add allocation' }));
    const allocForm = screen.getByRole('form', { name: 'Add allocation' });
    fireEvent.change(within(allocForm).getByLabelText('Role'), { target: { value: 'sample-2027-role-rff-1' } });

    // Pat works Mon–Wed; RFF 1 is held by Morgan on Mon–Wed (A) and Mon–Tue (B),
    // so only Wed in Week B is free.
    expect(within(allocForm).getByLabelText('Wed week B')).toBeChecked();
    expect(within(allocForm).getByLabelText('Mon week A')).toBeDisabled();
    expect(within(allocForm).getByLabelText('Thu week A')).toBeDisabled();
    fireEvent.click(within(allocForm).getByRole('button', { name: 'Allocate 0.1 FTE' }));

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Add allocation' })).not.toBeInTheDocument());
    const table = screen.getByRole('heading', { name: 'Allocations' }).parentElement!;
    expect(await within(table).findByText('Wed (B)')).toBeInTheDocument();
  });

  it('flags allocations left on days a person no longer works', async () => {
    await setupWithSample();
    fireEvent.click(screen.getByRole('link', { name: 'Noor Haddon' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit details' }));
    const form = screen.getByRole('form', { name: 'Edit Noor Haddon' });
    fireEvent.click(within(form).getByLabelText('Fri'));
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    const message = 'Noor Haddon is allocated to Learning & Support on Fri, but doesn\'t work then';
    expect(await within(panel()).findByText(message)).toBeInTheDocument();
    expect(screen.getAllByText(message)).toHaveLength(2); // panel and the staff page
  });

  it('shows Week A / Week B columns in the grid when someone works fortnightly', async () => {
    await setupWithSample('Roles & placement');
    fireEvent.click(screen.getByRole('link', { name: 'Staff grid' }));
    expect(await screen.findByText('Week A')).toBeInTheDocument();
    const row = screen.getByRole('link', { name: 'Morgan Pike' }).closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    expect(cells.map((c) => c.textContent)).toEqual([
      'RFF 1', 'RFF 1', 'RFF 1', '—', '—',
      'RFF 1', 'RFF 1', '—', '—', '—',
    ]);
  });

  it('adds a role and shows its unfilled days', async () => {
    await setupWithSample('Roles & placement');
    fireEvent.click(screen.getByRole('link', { name: 'By role' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add role' }));
    const form = screen.getByRole('form', { name: 'Add role' });
    fireEvent.change(within(form).getByLabelText('Role name'), { target: { value: 'QTSS 1' } });
    fireEvent.change(within(form).getByLabelText('Position type'), {
      target: { value: 'sample-2027-pt-qtss-teacher' },
    });
    fireEvent.click(within(form).getByLabelText('Wed'));
    fireEvent.click(within(form).getByLabelText('Thu'));
    fireEvent.click(within(form).getByLabelText('Fri'));
    fireEvent.click(within(form).getByRole('button', { name: 'Add role' }));
    const row = (await screen.findByRole('link', { name: 'QTSS 1' })).closest('tr')!;
    expect(within(row).getAllByText('Mon, Tue')).toHaveLength(2); // runs, and unfilled
  });

  it('imports staff from a CSV after mapping and preview', async () => {
    const repo = await setupWithSample();
    fireEvent.click(screen.getByRole('link', { name: 'Import CSV' }));
    const csv = [
      'Staff name,Type,Days worked',
      'Quinn Sample,TWT,Mon-Wed',
      'Avery Quill,Permanent,Mon-Fri',
      'Rory Sample,casual,Mon',
    ].join('\n');
    const file = new File([csv], 'staff.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } });

    expect(await screen.findByText('1 of 3 rows will be imported.')).toBeInTheDocument();
    expect(screen.getByText('Already in this plan')).toBeInTheDocument();
    expect(screen.getByText('Unknown employment type "casual"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 staff' }));

    expect(await screen.findByText(/Imported 1 staff member/)).toBeInTheDocument();
    const year = (await repo.planningYears.list())[0]!;
    const quinn = (await repo.staff.listByYear(year.id)).find((s) => s.name === 'Quinn Sample');
    expect(quinn).toMatchObject({ employmentType: 'twt' });
  });
});

describe('Finding where to add staff', () => {
  it('links to the Staff page from Match staff and the Overview steps', async () => {
    await setupWithSample();
    fireEvent.click(screen.getByRole('link', { name: 'Match staff' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Add staff' }));
    expect(await screen.findByRole('heading', { name: 'Staff' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Overview' }));
    const steps = await screen.findByRole('region', { name: 'Steps' });
    expect(within(steps).getByText('Add staff', { selector: 'strong' }).closest('li')).toHaveClass('done');
    expect(within(steps).getByText(/18 staff members/)).toBeInTheDocument();
  });

  it('sends old staff and role grid addresses to their new pages', async () => {
    await setupWithSample();
    window.location.hash = '#/allocation/role-grid';
    expect(await screen.findByLabelText('Staff to drag')).toBeInTheDocument();
    window.location.hash = '#/allocation/staff/sample-2027-staff-05';
    expect(await screen.findByRole('heading', { name: 'Eli Brookfield' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/staff/sample-2027-staff-05');
  });
});
