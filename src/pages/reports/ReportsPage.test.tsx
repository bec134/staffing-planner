import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../App';
import { createBackup } from '../../data/backup';
import { createDexieRepository } from '../../data/dexieRepository';
import { RepositoryProvider } from '../../data/RepositoryContext';
import { buildSampleData } from '../../data/sampleData';

let n = 0;
const Y = 'sample-2027';

function renderApp() {
  window.location.hash = '';
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  const repo = createDexieRepository(`reports-ui-${n++}`);
  render(
    <RepositoryProvider repository={repo}>
      <App />
    </RepositoryProvider>,
  );
  return repo;
}

const downloads: { name: string; blob: Blob }[] = [];
beforeEach(() => {
  downloads.length = 0;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  URL.createObjectURL = vi.fn((blob: Blob) => {
    downloads.push({ name: '', blob });
    return `blob:${downloads.length}`;
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads[downloads.length - 1]!.name = this.download;
  });
});

const backupFile = (text: string, name = 'plan.backup.json') => new File([text], name, { type: 'application/json' });

describe('Export & reports', () => {
  it('shows the chosen reports and downloads an Excel workbook', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /load fictional sample plan/i }));
    await screen.findByText('Morgan Pike');
    fireEvent.click(screen.getByRole('link', { name: 'Export & reports' }));

    const part1 = await screen.findByRole('article', { name: 'Part 1 · Entitlement matching' });
    expect(within(part1).getAllByText('Backfill: Tara Quinlan')).toHaveLength(4); // Thu and Fri, both weeks
    fireEvent.click(screen.getByRole('checkbox', { name: 'Class structure summary' }));
    expect(screen.queryByRole('article', { name: 'Class structure summary' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Download Excel workbook' }));
    await waitFor(() => expect(downloads.map((d) => d.name)).toEqual([
      expect.stringMatching(/^wattle-creek-public-school-2027-staffing-reports-\d{4}-\d\d-\d\d\.xlsx$/),
    ]));
    expect(downloads[0]!.blob.size).toBeGreaterThan(1000);
  });

  it('downloads a backup file', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /load fictional sample plan/i }));
    await screen.findByText('Morgan Pike');
    const panel = screen.getByRole('form', { name: 'Back up this plan' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Download backup file' }));
    await within(panel).findByText(/Saved .*\.backup\.json to your downloads/);
    const text = await downloads[0]!.blob.text();
    expect(JSON.parse(text)).toMatchObject({ format: 'nsw-staffing-planner-backup', encrypted: false });
  });
});

describe('Restore from a backup file (home page)', () => {
  it('restores a plan into an empty browser', async () => {
    const repo = renderApp();
    const restore = await screen.findByRole('region', { name: 'Restore from a backup file' });
    const text = await createBackup(buildSampleData(), { now: '2026-10-01T09:00:00.000Z' });
    fireEvent.change(within(restore).getByLabelText('Backup file'), { target: { files: [backupFile(text)] } });
    expect(await within(restore).findByText(/backed up 1 Oct 2026/)).toBeInTheDocument();
    fireEvent.click(within(restore).getByRole('button', { name: 'Restore plan' }));

    expect(await within(restore).findByText(/Restored Wattle Creek Public School/)).toBeInTheDocument();
    expect(await screen.findByText('Morgan Pike')).toBeInTheDocument();
    expect(await repo.intentions.listByYear(Y)).toHaveLength(buildSampleData().intentions.length);
  });

  it('asks for the password of a protected backup, and warns before replacing a plan', async () => {
    const repo = renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /load fictional sample plan/i }));
    await screen.findByText('Morgan Pike');
    // A backup with one staff member fewer.
    const sample = buildSampleData();
    const text = await createBackup(
      { ...sample, staff: sample.staff.filter((s) => s.name !== 'Morgan Pike') },
      { password: 'correct horse', iterations: 1000 },
    );
    const restore = screen.getByRole('region', { name: 'Restore from a backup file' });
    fireEvent.change(within(restore).getByLabelText('Backup file'), { target: { files: [backupFile(text)] } });

    fireEvent.change(await within(restore).findByLabelText(/^Password/), { target: { value: 'nope' } });
    fireEvent.click(within(restore).getByRole('button', { name: 'Unlock' }));
    expect(await within(restore).findByText('Wrong password, or the file is damaged.')).toBeInTheDocument();

    fireEvent.change(within(restore).getByLabelText(/^Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(restore).getByRole('button', { name: 'Unlock' }));
    expect(await within(restore).findByText(/This replaces the 2027 plan/)).toBeInTheDocument();
    fireEvent.click(within(restore).getByRole('button', { name: 'Replace with backup' }));

    await within(restore).findByText(/Restored Wattle Creek/);
    await waitFor(async () => expect((await repo.staff.listByYear(Y)).some((s) => s.name === 'Morgan Pike')).toBe(false));
  });

  it('rejects a file that is not a backup', async () => {
    renderApp();
    const restore = await screen.findByRole('region', { name: 'Restore from a backup file' });
    fireEvent.change(within(restore).getByLabelText('Backup file'), { target: { files: [backupFile('{"hello":1}')] } });
    expect(await within(restore).findByText("This isn't a Staffing Planner backup file.")).toBeInTheDocument();
  });
});
