import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../App';
import { FULL_TIME } from '../../domain/dayPattern';
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
  const repo = createDexieRepository(`role-grid-${n++}`);
  render(
    <RepositoryProvider repository={repo}>
      <App />
    </RepositoryProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /load fictional sample plan/i }));
  await screen.findByText('Morgan Pike');
  // Someone with no allocations yet, to drag around.
  await act(() =>
    repo.staff.put({
    id: 'free',
    planningYearId: Y,
    name: 'Fern Example',
    workPattern: FULL_TIME,
    currentRole: '',
    employmentType: 'temporary',
    preferences: '',
    }),
  );
  // A part-timer (Mon–Wed) and an empty class to fill.
  await act(async () => {
    await repo.staff.put({
      id: 'pt',
      planningYearId: Y,
      name: 'Pip Example',
      workPattern: { mode: 'weekly', days: [true, true, true, false, false, true, true, true, false, false] },
      currentRole: '',
      employmentType: 'twt',
      preferences: '',
    });
    await repo.roles.put({
      id: 'k-green',
      planningYearId: Y,
      name: 'K Green',
      positionTypeId: `${Y}-pt-classroom-teacher`,
      days: FULL_TIME,
      sortOrder: 99,
    });
  });
  fireEvent.click(screen.getByRole('link', { name: 'Roles & placement' }));
  fireEvent.click(await screen.findByRole('link', { name: 'Role grid' }));
  await screen.findByTestId('cell-K Blue-Mon');
  // The test people aren't matched in Part 1, so include everyone.
  fireEvent.click(screen.getByLabelText(/Show all staff/));
  return repo;
}

const cell = (role: string, day: string) => screen.getByTestId(`cell-${role}-${day}`);
const result = () => screen.getByRole('status', { name: 'Allocation result' });

/** A minimal DataTransfer for drag-and-drop events in jsdom. */
function dataTransfer() {
  const store: Record<string, string> = {};
  return {
    setData: (k: string, v: string) => {
      store[k] = v;
    },
    getData: (k: string) => store[k] ?? '',
    effectAllowed: 'move',
  };
}

describe('Role grid', () => {
  it('greys the holder on leave and shows cover in colour', async () => {
    const repo = await setup();
    const thu = cell('1/2 Green', 'Thu');
    expect(within(thu).getByText('Indi Calloway').closest('.tile')).toHaveClass('on-leave');
    expect(within(thu).getByText('LWOP')).toBeInTheDocument();
    expect(within(thu).getByText('Tara Quinlan').closest('.tile')).toHaveClass('cover');
    expect(within(cell('1/2 Green', 'Mon')).getByText('Indi Calloway').closest('.tile')).toHaveClass('holder');
    expect(within(cell('K Blue', 'Mon')).getByText('Eli Brookfield').closest('.tile')).toHaveClass('on-leave');
    // Term 2 LSL: shown in colour with the leave dates, not greyed for the whole year.
    const jules = within(cell('3/4 Red', 'Mon')).getByText('Jules Fernhill').closest('.tile')!;
    expect(jules).toHaveClass('part-year');
    expect(jules).toHaveTextContent('LSL 27 Apr – 2 Jul 2027');
    repo.close();
  });

  it('assigns by choosing a name, updating the allocation, and removes with ×', async () => {
    const repo = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Choose someone for Executive release on Mon' }));
    const picker = screen.getByLabelText('Assign to Executive release on Mon');
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', 'Fern Example', 'Pip Example']);
    fireEvent.change(picker, { target: { value: 'free' } });

    expect(await within(cell('Executive release', 'Mon')).findByText('Fern Example')).toBeInTheDocument();
    expect(result()).toHaveTextContent('Fern Example → Executive release on Mon');
    const allocs = (await repo.allocations.listByYear(Y)).filter((a) => a.staffId === 'free');
    expect(allocs).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Fern Example from Executive release on Mon' }));
    await waitFor(() => expect(within(cell('Executive release', 'Mon')).queryByText('Fern Example')).not.toBeInTheDocument());
    expect((await repo.allocations.listByYear(Y)).some((a) => a.staffId === 'free')).toBe(false);
    repo.close();
  });

  it('assigns cover when choosing someone for a day the holder is on leave', async () => {
    const repo = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Choose someone for K Blue on Mon' }));
    fireEvent.change(screen.getByLabelText('Assign to K Blue on Mon'), { target: { value: 'free' } });
    const tile = (await within(cell('K Blue', 'Mon')).findByText('Fern Example')).closest('.tile')!;
    expect(tile).toHaveClass('cover');
    expect(result()).toHaveTextContent('Fern Example → K Blue on Mon as cover');
    const cover = (await repo.allocations.listByYear(Y)).find((a) => a.staffId === 'free')!;
    expect(cover).toMatchObject({ coveringLeaveId: `${Y}-leave-04`, startDate: '2027-01-28', endDate: '2027-12-17' });
    repo.close();
  });

  it('allocates by dragging a name from the staff list, and moves a tile by dragging it', async () => {
    const repo = await setup();
    const dt = dataTransfer();
    const source = screen.getByText('Fern Example', { selector: '.palette-tile' });
    fireEvent.dragStart(source, { dataTransfer: dt });
    fireEvent.dragOver(cell('Executive release', 'Tue'), { dataTransfer: dt });
    fireEvent.drop(cell('Executive release', 'Tue'), { dataTransfer: dt });
    const tile = await within(cell('Executive release', 'Tue')).findByText('Fern Example');

    const dt2 = dataTransfer();
    fireEvent.dragStart(tile.closest('.tile')!, { dataTransfer: dt2 });
    fireEvent.drop(cell('Executive release', 'Mon'), { dataTransfer: dt2 });
    expect(await within(cell('Executive release', 'Mon')).findByText('Fern Example')).toBeInTheDocument();
    await waitFor(() => expect(within(cell('Executive release', 'Tue')).queryByText('Fern Example')).not.toBeInTheDocument());
    expect(result()).toHaveTextContent('Moved: Fern Example → Executive release on Mon');
    repo.close();
  });

  it('explains why a drop is refused', async () => {
    const repo = await setup();
    const dt = dataTransfer();
    fireEvent.dragStart(screen.getByText('Fern Example', { selector: '.palette-tile' }), { dataTransfer: dt });
    fireEvent.drop(cell('K Gold', 'Mon'), { dataTransfer: dt });
    expect(await screen.findByText('K Gold is already held by Harper Vale on Mon')).toBeInTheDocument();
    repo.close();
  });

  it('offers to add a day to someone’s days worked', async () => {
    const repo = await setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const dt = dataTransfer();
    fireEvent.dragStart(screen.getByText('Noor Haddon', { selector: '.palette-tile' }), { dataTransfer: dt });
    fireEvent.drop(cell('Learning & Support', 'Wed'), { dataTransfer: dt });
    expect(await within(cell('Learning & Support', 'Wed')).findByText('Noor Haddon')).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledWith("Noor Haddon doesn't work Wed. Add Wed to their days worked?");
    const noor = await repo.staff.get(`${Y}-staff-14`);
    expect(noor!.workPattern.days.slice(0, 5)).toEqual([false, false, true, true, true]);
    confirm.mockRestore();
    repo.close();
  });

  it('fills the whole week when a full-time teacher is dropped on a class, and × removes single days', async () => {
    const repo = await setup();
    const dt = dataTransfer();
    fireEvent.dragStart(screen.getByText('Fern Example', { selector: '.palette-tile' }), { dataTransfer: dt });
    fireEvent.drop(cell('K Green', 'Wed'), { dataTransfer: dt });
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
      expect(await within(cell('K Green', day)).findByText('Fern Example')).toBeInTheDocument();
    }
    expect(result()).toHaveTextContent('Fern Example → K Green on Mon, Tue, Wed, Thu, Fri');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Fern Example from K Green on Fri' }));
    await waitFor(() => expect(within(cell('K Green', 'Fri')).queryByText('Fern Example')).not.toBeInTheDocument());
    const [alloc] = (await repo.allocations.listByYear(Y)).filter((a) => a.staffId === 'free');
    expect(alloc!.days.days.slice(0, 5)).toEqual([true, true, true, true, false]);
    repo.close();
  });

  it('fills every free day when a name is dropped on the role name', async () => {
    const repo = await setup();
    const dt = dataTransfer();
    fireEvent.dragStart(screen.getByText('Fern Example', { selector: '.palette-tile' }), { dataTransfer: dt });
    fireEvent.drop(screen.getByTestId('role-Executive release'), { dataTransfer: dt });
    expect(await within(cell('Executive release', 'Mon')).findByText('Fern Example')).toBeInTheDocument();
    expect(within(cell('Executive release', 'Tue')).getByText('Fern Example')).toBeInTheDocument();
    repo.close();
  });

  it('places a part-timer on just the day dropped, even on a class', async () => {
    const repo = await setup();
    const dt = dataTransfer();
    fireEvent.dragStart(screen.getByText('Pip Example', { selector: '.palette-tile' }), { dataTransfer: dt });
    fireEvent.drop(cell('K Green', 'Tue'), { dataTransfer: dt });
    expect(await within(cell('K Green', 'Tue')).findByText('Pip Example')).toBeInTheDocument();
    expect(within(cell('K Green', 'Mon')).queryByText('Pip Example')).not.toBeInTheDocument();
    repo.close();
  });

  it('offers only staff matched in Part 1 unless asked to show everyone', async () => {
    const repo = await setup();
    const palette = () => screen.getByLabelText('Staff to drag');
    expect(within(palette()).getByText('Fern Example')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Show all staff/));
    expect(within(palette()).queryByText('Fern Example')).not.toBeInTheDocument();
    expect(within(palette()).queryByText('Sam Ridley')).not.toBeInTheDocument(); // part-year cover only, not matched
    expect(within(palette()).getByText('Tara Quinlan')).toBeInTheDocument(); // matched as a backfill
    repo.close();
  });
});
