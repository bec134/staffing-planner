/**
 * Backup files (Phase 7): a whole plan as JSON, to restore it later or move
 * it to another device. Optionally protected with a password (Bec): the
 * plan is encrypted in the browser with AES-GCM, using a key derived from
 * the password with PBKDF2. A forgotten password can't be recovered.
 *
 * Restoring treats the file as untrusted: its shape is checked before
 * anything is saved.
 */
import type { PlanningYearSnapshot } from './repository';

export const BACKUP_FORMAT = 'nsw-staffing-planner-backup';
const VERSION = 1;
/** OWASP's current recommendation for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;

interface PlainBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  encrypted: false;
  data: PlanningYearSnapshot;
}

export interface EncryptedBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  encrypted: true;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  ciphertext: string;
}

const TABLES = [
  'positionTypes',
  'entitlements',
  'staff',
  'roles',
  'leave',
  'allocations',
  'classStructures',
  'enrolments',
  'classRules',
  'positions',
  'matches',
  'intentions',
] as const satisfies readonly Exclude<keyof PlanningYearSnapshot, 'planningYear'>[];

function toBase64(bytes: Uint8Array): string {
  // In chunks: spreading a large array into one call can overflow the stack.
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** The backup file's text, encrypted when a password is given. */
export async function createBackup(
  snapshot: PlanningYearSnapshot,
  options: { password?: string; now?: string; iterations?: number } = {},
): Promise<string> {
  const exportedAt = options.now ?? new Date().toISOString();
  if (!options.password) {
    const plain: PlainBackup = { format: BACKUP_FORMAT, version: VERSION, exportedAt, encrypted: false, data: snapshot };
    return JSON.stringify(plain, null, 1);
  }
  const iterations = options.iterations ?? PBKDF2_ITERATIONS;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(options.password, salt, iterations);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(snapshot))),
  );
  const envelope: EncryptedBackup = {
    format: BACKUP_FORMAT,
    version: VERSION,
    exportedAt,
    encrypted: true,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    ciphertext: toBase64(ciphertext),
  };
  return JSON.stringify(envelope);
}

export type ReadResult =
  | { ok: true; kind: 'plain'; snapshot: PlanningYearSnapshot; exportedAt: string }
  | { ok: true; kind: 'encrypted'; envelope: EncryptedBackup; exportedAt: string }
  | { ok: false; error: string };

const NOT_A_BACKUP = "This isn't a Staffing Planner backup file.";

/** Read a backup file's text. Encrypted files then need `decryptBackup`. */
export function readBackup(text: string): ReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: NOT_A_BACKUP };
  }
  if (!isObject(parsed) || parsed.format !== BACKUP_FORMAT) return { ok: false, error: NOT_A_BACKUP };
  if (typeof parsed.version !== 'number' || parsed.version > VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of the app. Reload the page and try again.' };
  }
  const exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '';
  if (parsed.encrypted === true) {
    const e = parsed as unknown as EncryptedBackup;
    const valid =
      isObject(e.kdf) &&
      typeof e.kdf.salt === 'string' &&
      typeof e.kdf.iterations === 'number' &&
      e.kdf.iterations > 0 &&
      isObject(e.cipher) &&
      typeof e.cipher.iv === 'string' &&
      typeof e.ciphertext === 'string';
    return valid ? { ok: true, kind: 'encrypted', envelope: e, exportedAt } : { ok: false, error: 'The backup file is damaged.' };
  }
  const checked = checkSnapshot(parsed.data);
  return typeof checked === 'string' ? { ok: false, error: checked } : { ok: true, kind: 'plain', snapshot: checked, exportedAt };
}

/** Decrypt a password-protected backup. */
export async function decryptBackup(
  envelope: EncryptedBackup,
  password: string,
): Promise<{ ok: true; snapshot: PlanningYearSnapshot } | { ok: false; error: string }> {
  let text: string;
  try {
    const key = await deriveKey(password, fromBase64(envelope.kdf.salt), envelope.kdf.iterations);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.cipher.iv) as BufferSource },
      key,
      fromBase64(envelope.ciphertext) as BufferSource,
    );
    text = new TextDecoder().decode(plain);
  } catch {
    return { ok: false, error: 'Wrong password, or the file is damaged.' };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The backup file is damaged.' };
  }
  const checked = checkSnapshot(data);
  return typeof checked === 'string' ? { ok: false, error: checked } : { ok: true, snapshot: checked };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Check a snapshot's shape: a planning year, and lists of records that all
 * belong to it. Lists missing from older backups become empty. Returns the
 * snapshot, or what's wrong with it.
 */
export function checkSnapshot(data: unknown): PlanningYearSnapshot | string {
  const damaged = (why: string) => `The backup file is damaged (${why}).`;
  if (!isObject(data)) return damaged('no plan');
  const py = data.planningYear;
  if (!isObject(py) || typeof py.id !== 'string' || !py.id || typeof py.year !== 'number' || typeof py.schoolName !== 'string') {
    return damaged('planning year');
  }
  const out: Record<string, unknown> = { planningYear: py };
  for (const name of TABLES) {
    const list = data[name] ?? [];
    if (!Array.isArray(list)) return damaged(name);
    for (const r of list) {
      if (!isObject(r) || typeof r.id !== 'string' || r.planningYearId !== py.id) return damaged(name);
    }
    out[name] = list;
  }
  // Staff saved before TPT was renamed TWT.
  out.staff = (out.staff as Record<string, unknown>[]).map((s) => (s.employmentType === 'tpt' ? { ...s, employmentType: 'twt' } : s));
  return out as unknown as PlanningYearSnapshot;
}

/** "wattle-creek-public-school-2027" */
export const fileStem = (schoolName: string, year: number) =>
  `${schoolName.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan'}-${year}`;

/** Backup file names end in .backup.json, which .gitignore blocks. */
export const backupFileName = (schoolName: string, year: number, today: string, encrypted: boolean) =>
  `${fileStem(schoolName, year)}-${today}${encrypted ? '-protected' : ''}.backup.json`;
