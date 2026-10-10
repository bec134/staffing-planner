import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../App';
import { describePattern } from '../../domain/dayPattern';
import { createDexieRepository } from '../../data/dexieRepository';
import { RepositoryProvider } from '../../data/RepositoryContext';

let n = 0;
const Y = 'sample-2027';

async function setup() {
  window.location.hash = '';
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  const repo = createDexieRepository(`intentions-ui-${n++}`);
  render(
    <RepositoryProvider repository={repo}>
      <App />
    </RepositoryProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /load fictional sample plan/i }));
  await screen.findByText('Morgan Pike');
  fireEvent.click(screen.getByRole('link', { name: 'Staff intentions' }));
  await screen.findByTestId('intention-Kit Ashdown');
  return repo;
}

const row = (name: string) => screen.getByTestId(`intention-${name}`);

describe('Staff intentions', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows what applying would change, then applies it', async () => {
    const repo = await setup();
    expect(within(row('Eli Brookfield')).getByText('Up to date')).toBeInTheDocument();
    const kit = row('Kit Ashdown');
    expect(within(kit).getByText('Not applied')).toBeInTheDocument();
    expect(within(kit).getByText('Add whole-year Leave without pay (Thu, Fri) for the school year')).toBeInTheDocument();
    expect(screen.getByText(/Kit Ashdown's intentions aren't applied to the plan yet/)).toBeInTheDocument();

    fireEvent.click(within(kit).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(within(row('Kit Ashdown')).getByText('Up to date')).toBeInTheDocument());
    const leave = (await repo.leave.listByYear(Y)).filter((l) => l.staffId === `${Y}-staff-11`);
    expect(leave.map((l) => [l.leaveType, describePattern(l.daysAffected), l.startDate, l.endDate])).toContainEqual([
      'lwop',
      'Thu, Fri',
      '2027-01-28',
      '2027-12-17',
    ]);
    repo.close();
  });

  it('adds intentions by hand, warning when days and permanent FTE disagree', async () => {
    const repo = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add intentions' }));
    const form = screen.getByRole('form', { name: 'Intention' });
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: 'Quinn Example' } });
    fireEvent.change(within(form).getByLabelText(/^Employment status/), { target: { value: 'twt' } });
    fireEvent.change(within(form).getByLabelText(/^Permanent FTE/), { target: { value: '0.8' } });
    fireEvent.change(within(form).getByLabelText(/^Work preference/), { target: { value: 'part_time' } });
    const [preferred] = within(form).getAllByRole('group');
    for (const d of ['Thu', 'Fri']) fireEvent.click(within(preferred!).getByLabelText(d));
    expect(within(form).getByText('Preferred days (0.6) come to 0.6 FTE, not their permanent FTE of 0.8')).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText(/^Grade preference 1/), { target: { value: '3' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save intentions' }));

    const quinn = await screen.findByTestId('intention-Quinn Example');
    expect(within(quinn).getByText('Add as a new staff member (TWT, Mon, Tue, Wed)')).toBeInTheDocument();
    fireEvent.click(within(quinn).getByRole('button', { name: 'Apply' }));
    await waitFor(async () =>
      expect((await repo.staff.listByYear(Y)).find((s) => s.name === 'Quinn Example')).toMatchObject({ employmentType: 'twt' }),
    );
    await waitFor(() => expect(within(row('Quinn Example')).getByText('Up to date')).toBeInTheDocument());
    repo.close();
  });

  it('imports a CSV, replacing existing intentions by name', async () => {
    const repo = await setup();
    const csv = [
      'Name,Employment Status,Permanent FTE,Work Preference,Preferred days,Whole year leave days,Leave type,Grade Preference 1,Grade Preference 2,Grade Preference 3',
      'Kit Ashdown,Permanent,1.0,Full time,Mon-Fri,,,6,5,',
      'Wren Sample,Temporary,,Part time,Mon Tue,,,K,,',
      'Bad Row,Casual,,,Mon,,,,,',
    ].join('\n');
    fireEvent.change(screen.getByLabelText('Intentions CSV file'), {
      target: { files: [new File([csv], 'intentions.csv', { type: 'text/csv' })] },
    });
    expect(await screen.findByText('2 of 3 rows will be imported.')).toBeInTheDocument();
    expect(screen.getByText('Replaces existing intentions')).toBeInTheDocument();
    expect(screen.getByText('Unknown employment status "Casual"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 intentions' }));

    expect(await screen.findByText(/Imported 2 intention/)).toBeInTheDocument();
    // Kit now wants full time, which matches the plan; Wren is new.
    await waitFor(() => expect(within(row('Kit Ashdown')).getByText('Up to date')).toBeInTheDocument());
    expect(within(row('Kit Ashdown')).getByText('6, 5')).toBeInTheDocument();
    expect(within(await screen.findByTestId('intention-Wren Sample')).getByText('Not applied')).toBeInTheDocument();
    expect((await repo.intentions.listByYear(Y)).filter((i) => i.name === 'Kit Ashdown')).toHaveLength(1);
    // Not closed: the page is still reloading after the import.
  });

  it('shows grade preferences on Part 2 name tiles', async () => {
    await setup();
    fireEvent.click(screen.getByRole('link', { name: 'Roles & placement' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Role grid' }));
    const palette = await screen.findByLabelText('Staff to drag');
    const tile = within(palette).getByText('Jules Fernhill').closest('.tile')!;
    expect(within(tile as HTMLElement).getByText('Prefers K, 1, 2')).toBeInTheDocument();
    expect(screen.getByText('Jules Fernhill is placed on 3/4 Red, outside their grade preferences (K, 1, 2)')).toBeInTheDocument();
  });
});
