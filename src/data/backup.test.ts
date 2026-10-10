import { backupFileName, checkSnapshot, createBackup, decryptBackup, readBackup } from './backup';
import { buildSampleData } from './sampleData';

const sample = buildSampleData('2026-01-01T00:00:00.000Z');
// Fewer iterations keep the tests quick; real backups use the full count.
const FAST = { iterations: 1000, now: '2026-10-10T00:00:00.000Z' };

describe('backup files', () => {
  it('round-trips a plan without a password', async () => {
    const text = await createBackup(sample, FAST);
    const read = readBackup(text);
    expect(read).toMatchObject({ ok: true, kind: 'plain', exportedAt: '2026-10-10T00:00:00.000Z' });
    expect(read.ok && read.kind === 'plain' && read.snapshot).toEqual(sample);
  });

  it('encrypts with a password, so names are not readable and the wrong password fails', async () => {
    const text = await createBackup(sample, { ...FAST, password: 'correct horse' });
    expect(text).not.toContain('Morgan Pike');
    expect(text).not.toContain('Wattle Creek');
    const read = readBackup(text);
    if (!read.ok || read.kind !== 'encrypted') throw new Error('expected an encrypted backup');
    expect(await decryptBackup(read.envelope, 'wrong')).toEqual({ ok: false, error: 'Wrong password, or the file is damaged.' });
    expect(await decryptBackup(read.envelope, 'correct horse')).toEqual({ ok: true, snapshot: sample });
  });

  it('handles a large plan', async () => {
    const big = { ...sample, staff: Array.from({ length: 3000 }, (_, i) => ({ ...sample.staff[0]!, id: `s${i}`, name: `Person ${i}` })) };
    const read = readBackup(await createBackup(big, { ...FAST, password: 'pw' }));
    if (!read.ok || read.kind !== 'encrypted') throw new Error('expected an encrypted backup');
    const back = await decryptBackup(read.envelope, 'pw');
    expect(back.ok && back.snapshot.staff).toHaveLength(3000);
  });

  it('uses a fresh salt and IV each time', async () => {
    const a = JSON.parse(await createBackup(sample, { ...FAST, password: 'pw' }));
    const b = JSON.parse(await createBackup(sample, { ...FAST, password: 'pw' }));
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('rejects files that are not backups, or are damaged', () => {
    expect(readBackup('not json')).toEqual({ ok: false, error: "This isn't a Staffing Planner backup file." });
    expect(readBackup('{"name":"x"}')).toEqual({ ok: false, error: "This isn't a Staffing Planner backup file." });
    const newer = JSON.stringify({ format: 'nsw-staffing-planner-backup', version: 99, data: sample });
    expect(readBackup(newer).ok).toBe(false);
    expect(checkSnapshot({ ...sample, staff: 'oops' })).toBe('The backup file is damaged (staff).');
    expect(checkSnapshot({ ...sample, staff: [{ ...sample.staff[0], planningYearId: 'other' }] })).toBe(
      'The backup file is damaged (staff).',
    );
    expect(checkSnapshot({ ...sample, planningYear: { id: 'x' } })).toBe('The backup file is damaged (planning year).');
  });

  it('fills in lists missing from older backups, and renames TPT to TWT', () => {
    const { intentions: _i, positions: _p, ...older } = sample;
    const staff = [{ ...sample.staff[0]!, employmentType: 'tpt' }];
    const checked = checkSnapshot({ ...older, staff });
    if (typeof checked === 'string') throw new Error(checked);
    expect(checked.intentions).toEqual([]);
    expect(checked.positions).toEqual([]);
    expect(checked.staff[0]!.employmentType).toBe('twt');
  });

  it('names files so .gitignore blocks them', () => {
    expect(backupFileName('Wattle Creek Public School (fictional sample)', 2027, '2026-10-10', false)).toBe(
      'wattle-creek-public-school-2027-2026-10-10.backup.json',
    );
    expect(backupFileName('', 2027, '2026-10-10', true)).toBe('plan-2027-2026-10-10-protected.backup.json');
  });
});
