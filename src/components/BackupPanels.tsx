import { useState, type FormEvent } from 'react';
import { backupFileName, createBackup, decryptBackup, readBackup, type EncryptedBackup } from '../data/backup';
import type { PlanningYearSnapshot } from '../data/repository';
import { useRepository } from '../data/RepositoryContext';
import { formatDate } from '../domain/dates';
import type { Id } from '../domain/types';
import { downloadFile, todayIso } from './download';
import { usePlanningYear } from './PlanningYearContext';

const MIN_PASSWORD = 8;

/** Save the current plan as a backup file, optionally password-protected. */
export function BackupPanel({ planningYearId }: { planningYearId: Id }) {
  const repo = useRepository();
  const [protect, setProtect] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (protect && password.length < MIN_PASSWORD) {
      return setMessage({ ok: false, text: `Use a password of at least ${MIN_PASSWORD} characters.` });
    }
    if (protect && password !== confirmPassword) return setMessage({ ok: false, text: "The passwords don't match." });
    setBusy(true);
    setMessage(null);
    try {
      const snapshot = await repo.exportPlanningYear(planningYearId);
      if (!snapshot) return setMessage({ ok: false, text: 'That plan no longer exists.' });
      const text = await createBackup(snapshot, { password: protect ? password : undefined });
      const name = backupFileName(snapshot.planningYear.schoolName, snapshot.planningYear.year, todayIso(), protect);
      downloadFile(name, text, 'application/json');
      setMessage({ ok: true, text: `Saved ${name} to your downloads.` });
      setPassword('');
      setConfirmPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel no-print" onSubmit={(e) => void submit(e)} aria-label="Back up this plan">
      <h2>Back up this plan</h2>
      <p className="muted small">
        Saves the whole plan as a file you can restore later or on another computer. The file contains staff names, so
        keep it somewhere your department permits.
      </p>
      <label className="field">
        <input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} /> Protect with a password
      </label>
      {protect && (
        <>
          <div className="form-grid">
            <label>
              Password{' '}
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <label>
              Confirm password{' '}
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          </div>
          <p className="warning small">
            If the password is forgotten, the backup can't be opened. No one, including the app, can recover it.
          </p>
        </>
      )}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Download backup file'}
        </button>
      </div>
      {message && (
        <p className={message.ok ? 'ok' : 'warning'} role="status">
          {message.text}
        </p>
      )}
    </form>
  );
}

type Stage =
  | { step: 'choose' }
  | { step: 'password'; fileName: string; envelope: EncryptedBackup; exportedAt: string }
  | { step: 'confirm'; fileName: string; snapshot: PlanningYearSnapshot; exportedAt: string };

/** Restore a plan from a backup file (Bec: a clear option on the home page). */
export function RestorePanel() {
  const repo = useRepository();
  const { years, refresh, select } = usePlanningYear();
  const [stage, setStage] = useState<Stage>({ step: 'choose' });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStage({ step: 'choose' });
    setPassword('');
    setError(null);
  };

  const readFile = async (file: File) => {
    reset();
    setDone(null);
    const result = readBackup(await file.text());
    if (!result.ok) return setError(result.error);
    setStage(
      result.kind === 'encrypted'
        ? { step: 'password', fileName: file.name, envelope: result.envelope, exportedAt: result.exportedAt }
        : { step: 'confirm', fileName: file.name, snapshot: result.snapshot, exportedAt: result.exportedAt },
    );
  };

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    if (stage.step !== 'password') return;
    setBusy(true);
    const result = await decryptBackup(stage.envelope, password);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setError(null);
    setPassword('');
    setStage({ step: 'confirm', fileName: stage.fileName, snapshot: result.snapshot, exportedAt: stage.exportedAt });
  };

  const restore = async () => {
    if (stage.step !== 'confirm') return;
    setBusy(true);
    try {
      await repo.importPlanningYear(stage.snapshot);
      await refresh();
      select(stage.snapshot.planningYear.id);
      setDone(`Restored ${stage.snapshot.planningYear.schoolName} — ${stage.snapshot.planningYear.year}.`);
      reset();
    } catch {
      setError('The backup could not be restored. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  const existing = stage.step === 'confirm' ? years.find((y) => y.id === stage.snapshot.planningYear.id) : undefined;

  return (
    <section className="panel restore" aria-label="Restore from a backup file">
      <h2>Restore from a backup file</h2>
      <p className="muted small">
        Continue a previous session: choose a backup file saved from this app. It's read in this browser only; nothing is
        uploaded.
      </p>
      {stage.step === 'choose' && (
        <label className="field">
          Backup file{' '}
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Backup file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
              e.target.value = '';
            }}
          />
        </label>
      )}

      {stage.step === 'password' && (
        <form onSubmit={(e) => void unlock(e)} className="inline-form">
          <span>{stage.fileName} is password-protected.</span>
          <label>
            Password{' '}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
          </label>
          <button type="submit" disabled={busy || !password}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
          <button type="button" className="secondary" onClick={reset}>
            Cancel
          </button>
        </form>
      )}

      {stage.step === 'confirm' && (
        <>
          <p>
            <strong>
              {stage.snapshot.planningYear.schoolName} — {stage.snapshot.planningYear.year}
            </strong>
            {stage.exportedAt && `, backed up ${formatDate(stage.exportedAt.slice(0, 10))}`}:{' '}
            {stage.snapshot.staff.length} staff, {stage.snapshot.roles.length} roles, {stage.snapshot.leave.length} leave
            records.
          </p>
          {existing && (
            <p className="warning">
              This replaces the {existing.year} plan for {existing.schoolName} already in this browser. Changes made since
              the backup will be lost.
            </p>
          )}
          <div className="actions">
            <button onClick={() => void restore()} disabled={busy}>
              {existing ? 'Replace with backup' : 'Restore plan'}
            </button>
            <button className="secondary" onClick={reset}>
              Cancel
            </button>
          </div>
        </>
      )}

      {error && <p className="warning">{error}</p>}
      {done && (
        <p className="ok" role="status">
          {done}
        </p>
      )}
    </section>
  );
}
