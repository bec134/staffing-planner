import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../App';
import { createDexieRepository } from '../../data/dexieRepository';
import { RepositoryProvider } from '../../data/RepositoryContext';

let n = 0;

async function setup(withSample: boolean) {
  window.location.hash = '';
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  const repo = createDexieRepository(`classes-ui-${n++}`);
  render(
    <RepositoryProvider repository={repo}>
      <App />
    </RepositoryProvider>,
  );
  if (withSample) {
    fireEvent.click(await screen.findByRole('button', { name: /load fictional sample plan/i }));
    await screen.findByText('Morgan Pike');
  } else {
    const form = await screen.findByRole('form', { name: 'New planning year' });
    fireEvent.change(within(form).getByLabelText('Year'), { target: { value: '2028' } });
    fireEvent.change(within(form).getByLabelText('School name'), { target: { value: 'Test School' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create planning year' }));
    await screen.findByRole('heading', { name: /Test School — 2028/ });
  }
  fireEvent.click(screen.getByRole('link', { name: 'Class structures' }));
  await screen.findByLabelText('Total number of classes');
  return repo;
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const enter = (total: string, counts: string[]) => {
  type('Total number of classes', total);
  ['Kindergarten', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6'].forEach((g, i) =>
    type(`${g} students`, counts[i]!),
  );
};

describe('Class structures', () => {
  it('suggests structures, steps through options, accepts one and creates class roles', async () => {
    const repo = await setup(false);
    enter('7', ['20', '22', '24', '32', '31', '30', '30']);
    expect(screen.getByText('189')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Suggest class structures' }));

    const panel = (await screen.findByRole('heading', { name: /Option 1 of/ })).closest('section')!;
    expect(within(panel).getByText('7 classes, no composites.')).toBeInTheDocument();
    // Year 3 at 32 is 2 over the guide, which is allowed.
    const y3 = within(panel).getByText('3A').closest('tr')!;
    expect(within(y3).getByText('2 over guide')).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Show another option' }));
    expect(screen.getByRole('heading', { name: /Option 2 of/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous option' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept this structure' }));

    const accepted = (await screen.findByRole('heading', { name: 'Accepted class structure' })).closest('section')!;
    expect(await within(accepted).findByLabelText('Name of class KA')).toBeInTheDocument();
    fireEvent.click(within(accepted).getByRole('button', { name: 'Create class roles (7)' }));
    expect(await within(accepted).findByText('7 class role(s) created.')).toBeInTheDocument();

    const year = (await repo.planningYears.list())[0]!;
    const roles = await repo.roles.listByYear(year.id);
    expect(roles.map((r) => r.name).sort()).toEqual(['1A', '2A', '3A', '4A', '5A', '6A', 'KA']);
  });

  it("explains when there aren't enough classes", async () => {
    await setup(false);
    enter('3', ['20', '22', '24', '30', '30', '30', '30']);
    fireEvent.click(screen.getByRole('button', { name: 'Suggest class structures' }));
    expect(await screen.findByText('At least 4 classes are needed so that every grade has a class.')).toBeInTheDocument();
  });

  it('lets the accepted structure be edited, checks placement and renames the linked role', async () => {
    const repo = await setup(true);
    const accepted = (await screen.findByRole('heading', { name: 'Accepted class structure' })).closest('section')!;
    // Sample classes are already linked to roles.
    expect(within(accepted).getByRole('button', { name: 'Create class roles' })).toBeDisabled();

    fireEvent.change(within(accepted).getByLabelText('Year 1 students in 1/2 Green'), { target: { value: '14' } });
    expect(within(accepted).getByRole('status', { name: 'Placement check' })).toHaveTextContent(
      'Year 1: 1 student not in a class',
    );
    fireEvent.change(within(accepted).getByLabelText('Year 1 students in 1/2 Green'), { target: { value: '15' } });
    expect(within(accepted).queryByRole('status', { name: 'Placement check' })).not.toBeInTheDocument();

    fireEvent.change(within(accepted).getByLabelText('Name of class K Blue'), { target: { value: 'K Teal' } });
    fireEvent.click(within(accepted).getByRole('button', { name: 'Save changes' }));
    expect(await within(accepted).findByText('Class structure saved.')).toBeInTheDocument();
    await waitFor(async () =>
      expect((await repo.roles.get('sample-2027-role-k-blue'))?.name).toBe('K Teal'),
    );
  });

  it('adds and removes classes by hand', async () => {
    await setup(true);
    const accepted = (await screen.findByRole('heading', { name: 'Accepted class structure' })).closest('section')!;
    fireEvent.change(within(accepted).getByLabelText('Add a class'), { target: { value: '3/4' } });
    fireEvent.click(within(accepted).getByRole('button', { name: 'Add class' }));
    expect(within(accepted).getByLabelText('Name of class 3/4A')).toBeInTheDocument();
    expect(within(accepted).getByLabelText('Year 3 students in 3/4A')).toHaveValue('0');
  });

  it('offers suggestions for the sample enrolments', async () => {
    await setup(true);
    expect(screen.getByLabelText('Total number of classes')).toHaveValue('6');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest class structures' }));
    const panel = (await screen.findByRole('heading', { name: /Option 1 of/ })).closest('section')!;
    expect(within(panel).getByText(/6 classes/)).toBeInTheDocument();
  });
});
