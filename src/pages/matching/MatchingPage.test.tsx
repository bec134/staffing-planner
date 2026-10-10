import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../App';
import { FULL_TIME, describePattern, weekdays } from '../../domain/dayPattern';
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
  const repo = createDexieRepository(`matching-ui-${n++}`);
  render(
    <RepositoryProvider repository={repo}>
      <App />
    </RepositoryProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /load fictional sample plan/i }));
  await screen.findByText('Morgan Pike');
  // One permanent teacher more than the entitlement needs.
  await act(() =>
    repo.staff.put({
      id: 'quinn',
      planningYearId: Y,
      name: 'Quinn Example',
      workPattern: FULL_TIME,
      currentRole: 'Classroom Teacher',
      employmentType: 'permanent',
      preferences: '',
    }),
  );
  fireEvent.click(screen.getByRole('link', { name: 'Match staff' }));
  await screen.findByTestId('match-cell-Classroom Teacher 1-Mon');
  return repo;
}

const cell = (position: string, day: string) => screen.getByTestId(`match-cell-${position}-${day}`);
const tileOf = (el: HTMLElement, name: string) => within(el).getByText(name).closest('.tile')!;
const panel = () => screen.getByText(/^Warnings \(/).closest('details')!;

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

describe('Part 1: Match staff', () => {
  it('colours tiles by employment type and greys out whole-year leave for everyone', async () => {
    await setup();
    expect(tileOf(cell('Classroom Teacher 2', 'Mon'), 'Harper Vale')).toHaveClass('emp-temporary');
    expect(tileOf(cell('Classroom Teacher 3', 'Mon'), 'Indi Calloway')).toHaveClass('emp-permanent', 'holder');
    // Indi's whole-year LWOP (Thu–Fri) greyed, with Tara (TWT) as the backfill.
    expect(tileOf(cell('Classroom Teacher 3', 'Thu'), 'Indi Calloway')).toHaveClass('on-leave');
    const tara = tileOf(cell('Classroom Teacher 3', 'Thu'), 'Tara Quinlan');
    expect(tara).toHaveClass('cover', 'emp-twt');
    expect(tara).toHaveTextContent('backfill');
    // Term 2 LSL is part-year, so it isn't shown in Part 1.
    expect(tileOf(cell('Classroom Teacher 4', 'Mon'), 'Jules Fernhill')).toHaveClass('holder');
  });

  it('groups the staff list permanent, TWT, then temporary', async () => {
    await setup();
    const headings = within(screen.getByLabelText('Staff to drag'))
      .getAllByText(/^(Permanent|TWT|Temporary)$/)
      .map((h) => h.textContent);
    expect(headings).toEqual(['Permanent', 'TWT', 'Temporary']);
  });

  it('backfills whole-year leave with a surplus teacher, then nominates the rest for transfer', async () => {
    await setup();
    const unmatched = screen.getByRole('heading', { name: 'Not yet matched' }).closest('section')!;
    expect(within(unmatched).getByText('Quinn Example').closest('tr')).toHaveTextContent('1.0 FTE');

    // Eli is on whole-year LWOP Mon–Tue: backfill those days with Quinn.
    for (const day of ['Mon', 'Tue']) {
      const dt = dataTransfer();
      fireEvent.dragStart(screen.getByText('Quinn Example', { selector: '.palette-tile' }), { dataTransfer: dt });
      fireEvent.drop(cell('Classroom Teacher 1', day), { dataTransfer: dt });
      expect(await within(cell('Classroom Teacher 1', day)).findByText('Quinn Example')).toBeInTheDocument();
    }
    expect(tileOf(cell('Classroom Teacher 1', 'Mon'), 'Quinn Example')).toHaveClass('cover');
    await waitFor(() => expect(within(unmatched).getByText('Quinn Example').closest('tr')).toHaveTextContent('0.6 FTE'));
    expect(
      await within(panel()).findByText(/Quinn Example \(Permanent\) has 0.6 FTE not matched to the entitlement \(Wed, Thu, Fri\)/),
    ).toBeInTheDocument();

    fireEvent.click(within(unmatched).getByRole('button', { name: 'Nominate for transfer' }));
    fireEvent.change(within(unmatched).getByLabelText('Notes'), { target: { value: 'Surplus 0.6' } });
    const vi_confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(within(unmatched).getByRole('button', { name: 'Confirm nomination' }));
    expect(await screen.findByRole('heading', { name: 'Nominated for transfer' })).toBeInTheDocument();
    expect(screen.getByLabelText('Transfer notes for Quinn Example')).toHaveValue('Surplus 0.6');
    await waitFor(() => expect(within(panel()).queryByText(/Quinn Example \(Permanent\)/)).not.toBeInTheDocument());
    // Nominating removes their matches, so the backfill days are open again.
    expect(within(cell('Classroom Teacher 1', 'Mon')).queryByText('Quinn Example')).not.toBeInTheDocument();
    vi_confirm.mockRestore();
  });

  it('creates positions from the entitlement for a new plan', async () => {
    window.location.hash = '';
    const repo = createDexieRepository(`matching-ui-${n++}`);
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
    fireEvent.change(await screen.findByLabelText('Total entitlement'), { target: { value: '2.4' } });
    fireEvent.change(screen.getByLabelText('Classroom Teacher'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('RFF Teacher'), { target: { value: '0.4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save entitlement' }));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('link', { name: 'Match staff' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create positions from entitlement' }));
    expect(await screen.findByTestId('match-cell-Classroom Teacher 2-Fri')).toBeInTheDocument();
    expect(screen.getByTestId('match-cell-RFF Teacher 1-Tue')).toBeInTheDocument();
    expect(screen.getByTestId('match-cell-RFF Teacher 1-Wed')).toHaveClass('off');
  });

  it('moves a group of positions up or down, e.g. Deputy Principal above Classroom Teacher', async () => {
    const repo = await setup();
    const headings = () =>
      [...document.querySelectorAll('.role-grid tr.group-row th')].map((th) => th.childNodes[0]!.textContent);
    expect(headings().slice(0, 3)).toEqual(['Principal', 'Classroom Teacher', 'Assistant Principal']);
    // Assistant Principal, then AP C&I, sit between them; three moves up.
    for (const position of [3, 2, 1]) {
      fireEvent.click(screen.getByRole('button', { name: 'Move Deputy Principal up' }));
      await waitFor(() => expect(headings().indexOf('Deputy Principal')).toBe(position));
    }
    expect(headings().slice(0, 3)).toEqual(['Principal', 'Deputy Principal', 'Classroom Teacher']);
    expect(screen.getByRole('button', { name: 'Move Principal up' })).toBeDisabled();
    const types = (await repo.positionTypes.listByYear(Y)).sort((a, b) => a.sortOrder - b.sortOrder);
    expect(types.slice(0, 3).map((t) => t.name)).toEqual(['Principal', 'Deputy Principal', 'Classroom Teacher']);
  });
});

describe('Changing the days a position runs', () => {
  it('moves the matched person with it, after asking', async () => {
    window.location.hash = '';
    const repo = createDexieRepository(`matching-days-${n++}`);
    render(
      <RepositoryProvider repository={repo}>
        <App />
      </RepositoryProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /load fictional sample plan/i }));
    await screen.findByText('Morgan Pike');
    // Pat works Mon, Thu and Fri, and is matched to Executive Release Teacher 1 on Monday.
    const exec = (await repo.positions.listByYear(Y)).find((p) => p.name === 'Executive Release Teacher 1')!;
    await act(async () => {
      await repo.staff.put({
        id: 'pat',
        planningYearId: Y,
        name: 'Pat Example',
        workPattern: weekdays('Mon', 'Thu', 'Fri'),
        currentRole: 'Teacher',
        employmentType: 'permanent',
        preferences: '',
      });
      await repo.matches.put({ id: 'pat-m', planningYearId: Y, staffId: 'pat', roleId: exec.id, days: weekdays('Mon') });
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('link', { name: 'Match staff' }));
    await screen.findByTestId('match-cell-Executive Release Teacher 1-Mon');

    fireEvent.click(screen.getByText(/^Positions \(/));
    const row = screen.getByText('Executive Release Teacher 1', { selector: 'td' }).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('form', { name: 'Edit Executive Release Teacher 1' });
    fireEvent.click(within(form).getByLabelText('Mon'));
    fireEvent.click(within(form).getByLabelText('Thu'));
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Pat Example moves from Mon to Thu')));
    await waitFor(async () => expect(describePattern((await repo.matches.get('pat-m'))!.days)).toBe('Thu'));
    expect(await within(cell('Executive Release Teacher 1', 'Thu')).findByText('Pat Example')).toBeInTheDocument();
  });
});

describe('Splitting a position', () => {
  it('splits a 1.0 position into 0.4 + 0.4 + 0.2, with the matched person following their days', async () => {
    const repo = await setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByText(/^Positions \(/));
    const row = screen.getByText('Classroom Teacher 5', { selector: 'td' }).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Split' }));
    const form = screen.getByRole('group', { name: 'Split Classroom Teacher 5' });
    fireEvent.click(within(form).getByRole('button', { name: 'Add a part' }));
    const part = (n: number) => within(form).getByRole('group', { name: `Part ${n}` });
    // Part 1 keeps Mon, Tue; part 2 gets Wed, Thu; part 3 gets Fri.
    for (const day of ['Wed', 'Thu', 'Fri']) fireEvent.click(within(part(1)).getByLabelText(day));
    for (const day of ['Wed', 'Thu']) fireEvent.click(within(part(2)).getByLabelText(day));
    fireEvent.click(within(part(3)).getByLabelText('Fri'));
    expect(within(form).getByRole('status', { name: 'Split check' })).toHaveTextContent('Parts add up to 1.0 of 1.0 FTE.');
    fireEvent.click(within(form).getByRole('button', { name: 'Split position' }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Kit Ashdown: Fri moves to Classroom Teacher 8')));
    await waitFor(async () => {
      const positions = (await repo.positions.listByYear(Y)).filter((p) => /^Classroom Teacher [578]$/.test(p.name));
      expect(positions.map((p) => [p.name, describePattern(p.days)]).sort()).toEqual([
        ['Classroom Teacher 5', 'Mon, Tue'],
        ['Classroom Teacher 7', 'Wed, Thu'],
        ['Classroom Teacher 8', 'Fri'],
      ]);
    });
    expect(await within(await screen.findByTestId('match-cell-Classroom Teacher 8-Fri')).findByText('Kit Ashdown')).toBeInTheDocument();
  });
});
