import Papa from 'papaparse';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { WEEKDAYS } from '../../domain/dayPattern';
import { STAFF_TEMPLATES, guessMapping, parseStaffRows, type ColumnIndex, type StaffMapping } from '../../domain/staffImport';
import { EMPLOYMENT_TYPE_LABELS, type EmploymentType, type Staff } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { daysLabel, type PlanData } from './shared';

interface Parsed {
  fileName: string;
  headers: string[];
  rows: string[][];
}

export function ColumnSelect({ label, value, headers, onChange }: {
  label: string;
  value: ColumnIndex;
  headers: string[];
  onChange(v: ColumnIndex): void;
}) {
  return (
    <label>
      {label}{' '}
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">(not in file)</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

/** CSV import: choose a file, map columns, preview, then import. */
export function StaffImport({ data }: { data: PlanData }) {
  const repo = useRepository();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<StaffMapping | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  const preview = useMemo(
    () => (parsed && mapping ? parseStaffRows(parsed.rows, mapping, data.staff.map((s) => s.name)) : []),
    [parsed, mapping, data.staff],
  );
  const ready = preview.filter((r) => r.draft && !r.skipReason && r.errors.length === 0);

  const readFile = async (file: File) => {
    setImported(null);
    setFileError(null);
    const result = Papa.parse<string[]>(await file.text(), { skipEmptyLines: 'greedy' });
    const [headers, ...rows] = result.data;
    if (!headers || rows.length === 0) {
      setFileError('The file needs a header row and at least one row of staff.');
      setParsed(null);
      return;
    }
    setParsed({ fileName: file.name, headers, rows });
    setMapping(guessMapping(headers));
  };

  const doImport = async () => {
    const staff: Staff[] = ready.map((r) => ({
      ...r.draft!,
      id: crypto.randomUUID(),
      planningYearId: data.planningYear.id,
      preferences: '',
    }));
    await repo.staff.putMany(staff);
    setImported(staff.length);
    setParsed(null);
    setMapping(null);
  };

  const set = <K extends keyof StaffMapping>(key: K) => (value: StaffMapping[K]) =>
    setMapping((m) => (m ? { ...m, [key]: value } : m));

  return (
    <section>
      <h2>Import staff from CSV</h2>
      <p className="muted small">
        The file is read in this browser only; nothing is uploaded. Save a spreadsheet as CSV with a header row first.
      </p>
      <div className="templates">
        <strong>Templates:</strong>{' '}
        {STAFF_TEMPLATES.map((t) => (
          <a
            key={t.file}
            className="button-link secondary small"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(t.csv)}`}
            download={t.file}
          >
            {t.label}
          </a>
        ))}
        <p className="muted small">
          Fill in a template in Excel or Google Sheets, replacing the example rows, and save it as CSV. Employment type
          is Permanent, TWT or Temporary. Days can be written like "Mon-Fri" or "Mon Tue Wed".
        </p>
      </div>
      {imported !== null && (
        <p className="ok" role="status">
          Imported {imported} staff member{imported === 1 ? '' : 's'}. <Link to="/allocation">View staff</Link>
        </p>
      )}
      <label className="field">
        CSV file{' '}
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = '';
          }}
        />
      </label>
      {fileError && <p className="warning">{fileError}</p>}

      {parsed && mapping && (
        <>
          <h3>Match columns ({parsed.fileName})</h3>
          <div className="form-grid">
            <ColumnSelect label="Name" value={mapping.name} headers={parsed.headers} onChange={set('name')} />
            <ColumnSelect
              label="Employment type"
              value={mapping.employmentType}
              headers={parsed.headers}
              onChange={set('employmentType')}
            />
            <ColumnSelect label="Current role" value={mapping.currentRole} headers={parsed.headers} onChange={set('currentRole')} />
            <label>
              When employment type is blank or missing{' '}
              <select
                value={mapping.defaultEmploymentType}
                onChange={(e) => set('defaultEmploymentType')(e.target.value as EmploymentType)}
              >
                {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset>
            <legend>Days worked</legend>
            <div className="mode-switch">
              {(
                [
                  ['text', 'One column, e.g. "Mon Tue Wed"'],
                  ['columns', 'A yes/no column for each weekday'],
                  ['none', 'Not in file (everyone full time; adjust afterwards)'],
                ] as const
              ).map(([kind, label]) => (
                <label key={kind}>
                  <input
                    type="radio"
                    name="days-kind"
                    checked={mapping.days.kind === kind}
                    onChange={() =>
                      set('days')(
                        kind === 'text'
                          ? { kind, column: null }
                          : kind === 'columns'
                            ? { kind, columns: [null, null, null, null, null] }
                            : { kind },
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            {mapping.days.kind === 'text' && (
              <ColumnSelect
                label="Days column"
                value={mapping.days.column}
                headers={parsed.headers}
                onChange={(column) => set('days')({ kind: 'text', column })}
              />
            )}
            {mapping.days.kind === 'columns' && (
              <div className="form-grid">
                {WEEKDAYS.map((d, i) => (
                  <ColumnSelect
                    key={d}
                    label={d}
                    value={mapping.days.kind === 'columns' ? (mapping.days.columns[i] ?? null) : null}
                    headers={parsed.headers}
                    onChange={(c) => {
                      if (mapping.days.kind !== 'columns') return;
                      const columns = [...mapping.days.columns];
                      columns[i] = c;
                      set('days')({ kind: 'columns', columns });
                    }}
                  />
                ))}
              </div>
            )}
            <p className="muted small">Fortnightly (Week A/B) patterns can be set on each staff member after import.</p>
          </fieldset>

          <h3>Preview</h3>
          <p>
            {ready.length} of {preview.length} rows will be imported.
          </p>
          <table>
            <thead>
              <tr>
                <th className="num">Line</th>
                <th>Name</th>
                <th>Employment</th>
                <th>Current role</th>
                <th>Days</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => (
                <tr key={r.line} className={r.errors.length ? 'row-error' : r.skipReason ? 'row-skip' : ''}>
                  <td className="num">{r.line}</td>
                  <td>{r.draft?.name ?? ''}</td>
                  <td>{r.draft ? EMPLOYMENT_TYPE_LABELS[r.draft.employmentType] : ''}</td>
                  <td>{r.draft?.currentRole ?? ''}</td>
                  <td>{r.draft ? daysLabel(r.draft.workPattern) : ''}</td>
                  <td>{r.errors.length ? r.errors.join('; ') : (r.skipReason ?? 'Ready')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            <button onClick={() => void doImport()} disabled={ready.length === 0}>
              Import {ready.length} staff
            </button>
            <button
              className="secondary"
              onClick={() => {
                setParsed(null);
                setMapping(null);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}
