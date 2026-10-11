import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../App';
import { createDexieRepository } from '../../data/dexieRepository';
import { RepositoryProvider } from '../../data/RepositoryContext';

let n = 0;

async function setup(start: 'Leave cover' | 'Roles & placement' = 'Leave cover') {
  window.location.hash = '';
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  const repo = createDexieRepository(`leave-ui-${n++}`);
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
const GAP = "3/4 Red: no cover for Jules Fernhill's Long Service Leave on Thu, Fri, 27 Apr – 2 Jul 2027";

describe('Leave cover', () => {
  it('lists leave with cover status, and the uncovered view shows the gap', async () => {
    await setup();
    const lsl = screen.getByRole('link', { name: 'Jules Fernhill — Long Service Leave' }).closest('tr')!;
    expect(within(lsl).getByText('Partly covered')).toBeInTheDocument();
    const pat = screen.getByRole('link', { name: 'Kit Ashdown — Paternity Leave' }).closest('tr')!;
    expect(within(pat).getByText('Fully covered')).toBeInTheDocument();
    expect(within(panel()).getByText(GAP)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Uncovered' }));
    const row = (await screen.findByText('Thu, Fri')).closest('tr')!;
    expect(within(row).getByText('27 Apr – 2 Jul 2027')).toBeInTheDocument();
    expect(within(row).getByText('Jules Fernhill (Long Service Leave)')).toBeInTheDocument();
    // Whole-year leave not backfilled in Part 1 is listed too, matching the leave list.
    const eli = screen.getByText('Eli Brookfield (Leave without pay)').closest('tr')!;
    expect(eli).toHaveTextContent('Whole yearMon, TueClassroom Teacher 1');
    expect(within(eli).getByRole('link', { name: 'Backfill on Match staff' })).toHaveAttribute('href', '#/matching');
    // Indi's is backfilled (by Tara), so it isn't.
    expect(screen.queryByText('Indi Calloway (Leave without pay)')).not.toBeInTheDocument();
  });

  it('assigns cover for the remaining days and clears the gap', async () => {
    await setup();
    fireEvent.click(screen.getByRole('link', { name: 'Jules Fernhill — Long Service Leave' }));
    await screen.findByText('Not yet covered');
    fireEvent.click(screen.getByRole('button', { name: 'Add cover' }));
    const form = screen.getByRole('form', { name: 'Add cover' });
    // The only vacated role is preselected.
    expect(within(form).getByLabelText('Role to cover')).toHaveDisplayValue('3/4 Red');
    fireEvent.change(within(form).getByLabelText('Covered by'), { target: { value: 'sample-2027-staff-16' } });
    // Sam already covers Mon–Wed, so only Thu and Fri are offered.
    expect(within(form).getByLabelText('Mon')).toBeDisabled();
    expect(within(form).getByLabelText('Thu')).toBeChecked();
    fireEvent.click(within(form).getByRole('button', { name: 'Assign cover (0.4 FTE)' }));

    await waitFor(() => expect(screen.queryByText('Not yet covered')).not.toBeInTheDocument());
    expect(screen.getByText('Fully covered')).toBeInTheDocument();
    expect(within(panel()).queryByText(GAP)).not.toBeInTheDocument();
  });

  it('rejects cover outside the leave dates', async () => {
    await setup();
    fireEvent.click(screen.getByRole('link', { name: 'Jules Fernhill — Long Service Leave' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add cover' }));
    const form = screen.getByRole('form', { name: 'Add cover' });
    fireEvent.change(within(form).getByLabelText('Covered by'), { target: { value: 'sample-2027-staff-16' } });
    fireEvent.change(within(form).getByLabelText('To'), { target: { value: '2027-07-20' } });
    expect(within(form).getByText('Cover must fall within the leave dates')).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: /Assign cover/ })).toBeDisabled();
  });

  it('offers term quick picks for cover', async () => {
    await setup();
    fireEvent.click(screen.getByRole('link', { name: 'Jules Fernhill — Long Service Leave' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add cover' }));
    const form = screen.getByRole('form', { name: 'Add cover' });
    fireEvent.click(within(form).getByRole('button', { name: 'Term 2 (27 Apr – 2 Jul 2027)' }));
    expect(within(form).getByLabelText('From')).toHaveValue('2027-04-27');
  });

  it('records new leave, defaulting to the days the person works', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add leave' }));
    const form = screen.getByRole('form', { name: 'Add leave' });
    fireEvent.change(within(form).getByLabelText('Staff member'), { target: { value: 'sample-2027-staff-06' } });
    fireEvent.change(within(form).getByLabelText('Leave type'), { target: { value: 'maternity' } });
    fireEvent.change(within(form).getByLabelText('First day'), { target: { value: '2027-07-20' } });
    fireEvent.change(within(form).getByLabelText('Last day'), { target: { value: '2027-12-17' } });
    expect(within(form).getByLabelText('Mon')).toBeChecked();
    expect(within(form).getByLabelText('Thu')).toBeDisabled();
    fireEvent.click(within(form).getByRole('button', { name: 'Add leave' }));

    const row = (await screen.findByRole('link', { name: 'Frankie Lowe — Maternity Leave' })).closest('tr')!;
    expect(within(row).getByText('No cover')).toBeInTheDocument();
    expect(
      await within(panel()).findByText(
        "1/2 Blue: no cover for Frankie Lowe's Maternity Leave on Mon, Tue, Wed, 20 Jul – 17 Dec 2027",
      ),
    ).toBeInTheDocument();
  });

  it('shows the timeline of a position with leave, cover and gaps', async () => {
    await setup();
    fireEvent.click(screen.getByRole('link', { name: 'Timeline' }));
    const row = (await screen.findByRole('link', { name: '3/4 Red' })).closest('[role="row"]') as HTMLElement;
    expect(within(row).getByText('Jules Fernhill (Mon, Tue, Wed, Thu, Fri)')).toBeInTheDocument();
    expect(within(row).getByText('Long Service Leave (Mon, Tue, Wed, Thu, Fri)')).toBeInTheDocument();
    expect(within(row).getByText('Cover: Sam Ridley (Mon, Tue, Wed)')).toBeInTheDocument();
    expect(within(row).getByText('No cover: Thu, Fri')).toBeInTheDocument();
  });

  it('saves term dates', async () => {
    const repo = await setup();
    fireEvent.click(screen.getByRole('link', { name: 'Term dates' }));
    const end = await screen.findByLabelText('Term 4 end');
    fireEvent.change(end, { target: { value: '2027-12-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save term dates' }));
    expect(await screen.findByText('Term dates saved.')).toBeInTheDocument();
    const year = (await repo.planningYears.list())[0]!;
    expect(year.terms?.[3]).toEqual({ start: '2027-10-12', end: '2027-12-10' });
  });
});

describe('Weekly grid with leave', () => {
  it('shows the holder on leave with their cover, and the coverer with whose leave', async () => {
    await setup('Roles & placement');
    fireEvent.click(screen.getByRole('link', { name: 'Staff grid' }));
    const jules = (await screen.findByRole('link', { name: 'Jules Fernhill' })).closest('tr')!;
    const [mon, , , thu] = within(jules).getAllByRole('cell');
    expect(mon).toHaveTextContent('3/4 Red');
    expect(mon).toHaveTextContent('On LSL, 27 Apr – 2 Jul 2027');
    expect(mon).toHaveTextContent('Cover: Sam Ridley, 27 Apr – 2 Jul 2027');
    expect(thu).toHaveTextContent('No cover, 27 Apr – 2 Jul 2027');

    const sam = screen.getByRole('link', { name: 'Sam Ridley' }).closest('tr')!;
    const [samMon, , , samThu] = within(sam).getAllByRole('cell');
    expect(samMon).toHaveTextContent('3/4 Redcover for Jules Fernhill, 27 Apr – 2 Jul 2027');
    expect(samMon).toHaveTextContent('5/6 Goldcover for Kit Ashdown, 2 Aug – 13 Aug 2027');
    expect(samMon).not.toHaveClass('clash');
    expect(samThu).toHaveTextContent('5/6 Gold');

    // As at a date before the leave, Jules is just teaching and Sam is free.
    fireEvent.change(screen.getByLabelText('As at date'), { target: { value: '2027-03-01' } });
    expect(within(jules).getAllByRole('cell')[0]).toHaveTextContent(/^3\/4 Red$/);
    expect(within(sam).getAllByRole('cell')[0]).toHaveTextContent('unallocated');

    // During the leave: no dates, just who is where.
    fireEvent.change(screen.getByLabelText('As at date'), { target: { value: '2027-05-03' } });
    expect(within(jules).getAllByRole('cell')[0]).toHaveTextContent('3/4 RedOn LSLCover: Sam Ridley');
    expect(within(sam).getAllByRole('cell')[0]).toHaveTextContent('3/4 Redcover for Jules Fernhill');
  });

  it('shows whole-year part-week leave without pay, covered and uncovered', async () => {
    await setup('Roles & placement');
    fireEvent.click(screen.getByRole('link', { name: 'Staff grid' }));
    const indi = (await screen.findByRole('link', { name: 'Indi Calloway' })).closest('tr')!;
    const [iMon, , , iThu] = within(indi).getAllByRole('cell');
    expect(iMon).toHaveTextContent(/^1\/2 Green$/);
    expect(iThu).toHaveTextContent('1/2 GreenOn LWOP, 28 Jan – 17 Dec 2027Cover: Tara Quinlan, 28 Jan – 17 Dec 2027');

    const tara = screen.getByRole('link', { name: 'Tara Quinlan' }).closest('tr')!;
    expect(within(tara).getAllByRole('cell')[3]).toHaveTextContent('1/2 Greencover for Indi Calloway');

    const eli = screen.getByRole('link', { name: 'Eli Brookfield' }).closest('tr')!;
    const [eMon, , eWed] = within(eli).getAllByRole('cell');
    expect(eMon).toHaveTextContent('On LWOP, 28 Jan – 17 Dec 2027No cover, 28 Jan – 17 Dec 2027');
    expect(eWed).toHaveTextContent(/^K Blue$/);
    expect(
      within(panel()).getByText(
        // Whole-year leave is covered by backfilling it in Part 1 (Bec).
        "Classroom Teacher 1: Eli Brookfield's Leave without pay isn't backfilled on Mon, Tue",
      ),
    ).toBeInTheDocument();
  });
});
