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
    const repo = await setup();
    expect(tileOf(cell('Classroom Teacher 2', 'Mon'), 'Harper Vale')).toHaveClass('emp-temporary');
    expect(tileOf(cell('Classroom Teacher 3', 'Mon'), 'Indi Calloway')).toHaveClass('emp-permanent', 'holder');
    // Indi's whole-year LWOP (Thu–Fri) greyed, with Tara (TWT) as the backfill.
    expect(tileOf(cell('Classroom Teacher 3', 'Thu'), 'Indi Calloway')).toHaveClass('on-leave');
    const tara = tileOf(cell('Classroom Teacher 3', 'Thu'), 'Tara Quinlan');
    expect(tara).toHaveClass('cover', 'emp-twt');
    expect(tara).toHaveTextContent('backfill');
    // Term 2 LSL is part-year, so it isn't shown in Part 1.
    expect(tileOf(cell('Classroom Teacher 4', 'Mon'), 'Jules Fernhill')).toHaveClass('holder');
    repo.close();
  });

  it('groups the staff list permanent, TWT, then temporary', async () => {
    const repo = await setup();
    const headings = within(screen.getByLabelText('Staff to drag'))
      .getAllByText(/^(Permanent|TWT|Temporary)$/)
      .map((h) => h.textContent);
    expect(headings).toEqual(['Permanent', 'TWT', 'Temporary']);
    repo.close();
  });

  it('backfills whole-year leave with a surplus teacher, then nominates the rest for transfer', async () => {
    const repo = await setup();
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
    repo.close();
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
    repo.close();
  });
});
