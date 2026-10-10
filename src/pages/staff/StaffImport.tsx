import Papa from 'papaparse';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatFte } from '../../domain/fte';
import { checkIntention, describeGrades, intentionForStaff, planSaveStaff, staffForIntention } from '../../domain/intentions';
import { schoolYear } from '../../domain/matching';
import {
  STAFF_IMPORT_FIELDS,
  STAFF_TEMPLATE,
  guessStaffImportMapping,
  parseStaffRows,
  type ColumnIndex,
  type StaffImportMapping,
} from '../../domain/staffImport';
import { EMPLOYMENT_TYPE_LABELS, LEAVE_TYPE_SHORT, WORK_PREFERENCE_LABELS } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { saveStaffPlans } from '../../data/saveStaffPlans';
import { daysLabel, type PlanData } from '../allocation/shared';

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

/**
 * Staff CSV import (Bec): one file with everyone's details for next year.
 * Choose a file, match columns, preview what each row will add or change,
 * then import. Someone already in the plan (same name) is updated.
 */
export function StaffImport({ data }: { data: PlanData }) {
  const repo = useRepository();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<StaffImportMapping | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  const preview = useMemo(() => {
    if (!parsed || !mapping) return [];
    const ctx = {
      planningYearId: data.planningYear.id,
      year: schoolYear(data.planningYear),
      staff: data.staff,
      leave: data.leave,
      allocations: data.allocations,
      matches: data.matches,
    };
    return parseStaffRows(parsed.rows, mapping, data.staff.map((s) => s.name)).map((row) => {
      if (!row.draft || row.skipReason || row.errors.length) return { row };
      const staff = staffForIntention({ ...row.draft, id: '', planningYearId: '' }, data.staff);
      // A blank role keeps the role someone already has.
      const draft = { ...row.draft, substantiveRole: row.draft.substantiveRole || staff?.currentRole || '' };
      const check = checkIntention({ ...draft, id: '', planningYearId: '' });
      if (check.errors.length) return { row: { ...row, errors: check.errors } };
      const plan = planSaveStaff(
        draft,
        ctx,
        { staff, intention: staff ? intentionForStaff(staff, data.intentions) : undefined },
        () => crypto.randomUUID(),
      );
      return { row, plan, warnings: check.warnings };
    });
  }, [parsed, mapping, data]);
  const ready = preview.filter((p) => p.plan);

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
    setMapping(guessStaffImportMapping(headers));
  };

  const doImport = async () => {
    await saveStaffPlans(
      repo,
      ready.map((p) => p.plan!),
    );
    setImported(ready.length);
    setParsed(null);
    setMapping(null);
  };

  return (
    <section>
      <h2>Import staff from CSV</h2>
      <p className="muted small">
        The file is read in this browser only; nothing is uploaded. Save a spreadsheet as CSV with a header row first.
      </p>
      <div className="templates">
        <a
          className="button-link secondary small"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(STAFF_TEMPLATE.csv)}`}
          download={STAFF_TEMPLATE.file}
        >
          Download template
        </a>
        <p className="muted small">
          One row per person. Employment status is Permanent, TWT or Temporary; permanent FTE is only for Permanent and
          TWT. Substantive role is Principal, Deputy Principal, Assistant Principal, Assistant Principal - Curriculum &amp;
          Instruction, Teacher, Teacher Librarian or School Counsellor. Work preference is Full time or Part time. Days are
          written like "Mon-Fri" or "Mon Tue Wed" (set Week A/B patterns by hand afterwards); leave days can be blank.
          Leave type is LSL, LWOP, Maternity or Paternity, and LWOP if blank. Grades are K or 1–6. Someone already in the
          plan is updated.
        </p>
      </div>
      {imported !== null && (
        <p className="ok" role="status">
          Imported {imported} staff member{imported === 1 ? '' : 's'}. <Link to="/staff">View staff</Link>
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
            {STAFF_IMPORT_FIELDS.map(([field, label]) => (
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
                <th>Substantive role</th>
                <th>Preference</th>
                <th>Preferred days</th>
                <th>Whole year leave</th>
                <th>Grades</th>
                <th>What happens</th>
              </tr>
            </thead>
            <tbody>
              {preview.map(({ row: r, plan, warnings }) => {
                const d = r.draft;
                const status = r.errors.length
                  ? r.errors.join('; ')
                  : r.skipReason
                    ? r.skipReason
                    : [
                        plan!.changes.length ? plan!.changes.join('; ') : 'No change',
                        ...r.notes,
                        ...(warnings ?? []),
                      ].join('; ');
                return (
                  <tr key={r.line} className={r.errors.length ? 'row-error' : r.skipReason ? 'row-skip' : ''}>
                    <td className="num">{r.line}</td>
                    <td>{d?.name ?? ''}</td>
                    <td>{d ? EMPLOYMENT_TYPE_LABELS[d.employmentType] : ''}</td>
                    <td className="num">{d?.permanentMilliFte !== undefined ? formatFte(d.permanentMilliFte) : ''}</td>
                    <td>{plan?.staff.currentRole ?? d?.substantiveRole ?? ''}</td>
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
