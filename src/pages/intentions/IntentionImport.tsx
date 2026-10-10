import Papa from 'papaparse';
import { useMemo, useState } from 'react';
import { formatFte } from '../../domain/fte';
import { describeGrades } from '../../domain/intentions';
import {
  INTENTION_FIELDS,
  INTENTION_TEMPLATE,
  guessIntentionMapping,
  parseIntentionRows,
  type IntentionMapping,
} from '../../domain/intentionImport';
import { EMPLOYMENT_TYPE_LABELS, LEAVE_TYPE_SHORT, WORK_PREFERENCE_LABELS, type StaffIntention } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { daysLabel, type PlanData } from '../allocation/shared';
import { ColumnSelect } from '../staff/StaffImport';

interface Parsed {
  fileName: string;
  headers: string[];
  rows: string[][];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** CSV import of intentions: choose a file, map columns, preview, then save. */
export function IntentionImport({ data, onDone }: { data: PlanData; onDone(count: number): void }) {
  const repo = useRepository();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<IntentionMapping | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const preview = useMemo(
    () => (parsed && mapping ? parseIntentionRows(parsed.rows, mapping, data.intentions.map((i) => i.name)) : []),
    [parsed, mapping, data.intentions],
  );
  const ready = preview.filter((r) => r.draft && !r.skipReason && r.errors.length === 0);

  const readFile = async (file: File) => {
    setFileError(null);
    const result = Papa.parse<string[]>(await file.text(), { skipEmptyLines: 'greedy' });
    const [headers, ...rows] = result.data;
    if (!headers || rows.length === 0) {
      setFileError('The file needs a header row and at least one row of staff.');
      setParsed(null);
      return;
    }
    setParsed({ fileName: file.name, headers, rows });
    setMapping(guessIntentionMapping(headers));
  };

  const doImport = async () => {
    // A row for someone who already has intentions replaces them.
    const records: StaffIntention[] = ready.map((r) => {
      const old = data.intentions.find((i) => norm(i.name) === norm(r.draft!.name));
      return {
        ...r.draft!,
        id: old?.id ?? crypto.randomUUID(),
        planningYearId: data.planningYear.id,
        staffId: old?.staffId,
      };
    });
    await repo.intentions.putMany(records);
    setParsed(null);
    setMapping(null);
    onDone(records.length);
  };

  return (
    <section>
      <h2>Import intentions from CSV</h2>
      <p className="muted small">
        The file is read in this browser only; nothing is uploaded. Importing saves the intentions; apply them to the plan
        afterwards.
      </p>
      <div className="templates">
        <a
          className="button-link secondary small"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(INTENTION_TEMPLATE.csv)}`}
          download={INTENTION_TEMPLATE.file}
        >
          Download template
        </a>
        <p className="muted small">
          Employment status is Permanent, TWT or Temporary; permanent FTE is only for Permanent and TWT. Work preference is
          Full time or Part time. Days are written like "Mon-Fri" or "Mon Tue Wed" (set Week A/B patterns by hand
          afterwards); leave days can be blank. Leave type is LSL, LWOP, Maternity or Paternity, and LWOP if blank. Grades
          are K or 1–6.
        </p>
      </div>
      <label className="field">
        CSV file{' '}
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Intentions CSV file"
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
            {INTENTION_FIELDS.map(([field, label]) => (
              <ColumnSelect
                key={field}
                label={label}
                value={mapping[field]}
                headers={parsed.headers}
                onChange={(v) => setMapping((m) => (m ? { ...m, [field]: v } : m))}
              />
            ))}
          </div>

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
                <th className="num">Permanent FTE</th>
                <th>Preference</th>
                <th>Preferred days</th>
                <th>Whole year leave</th>
                <th>Grades</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => {
                const d = r.draft;
                const status = r.errors.length
                  ? r.errors.join('; ')
                  : (r.skipReason ?? [r.replaces ? 'Replaces existing intentions' : 'Ready', ...r.notes].join('; '));
                return (
                  <tr key={r.line} className={r.errors.length ? 'row-error' : r.skipReason ? 'row-skip' : ''}>
                    <td className="num">{r.line}</td>
                    <td>{d?.name ?? ''}</td>
                    <td>{d ? EMPLOYMENT_TYPE_LABELS[d.employmentType] : ''}</td>
                    <td className="num">{d?.permanentMilliFte !== undefined ? formatFte(d.permanentMilliFte) : ''}</td>
                    <td>{d ? WORK_PREFERENCE_LABELS[d.workPreference] : ''}</td>
                    <td>{d ? daysLabel(d.preferredDays) : ''}</td>
                    <td>
                      {d && d.leaveDays.days.some(Boolean) ? `${daysLabel(d.leaveDays)} (${LEAVE_TYPE_SHORT[d.leaveType]})` : ''}
                    </td>
                    <td>{d ? describeGrades(d.gradePreferences) : ''}</td>
                    <td>{status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="actions">
            <button onClick={() => void doImport()} disabled={ready.length === 0}>
              Import {ready.length} intention{ready.length === 1 ? '' : 's'}
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
