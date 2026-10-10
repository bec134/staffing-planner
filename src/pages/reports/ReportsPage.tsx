import { useState } from 'react';
import { HelpLink } from '../../components/HelpLink';
import { Link } from 'react-router-dom';
import { BackupPanel } from '../../components/BackupPanels';
import { downloadFile, todayIso } from '../../components/download';
import { usePlanningYear } from '../../components/PlanningYearContext';
import { fileStem } from '../../data/backup';
import { usePlanData } from '../../data/usePlanData';
import { buildReports, printedLine, type Report, type ReportId, type ReportSet, type ReportTable } from '../../domain/reports';
import type { PlanData } from '../allocation/shared';

/** Export & reports (Phase 7): print/PDF and Excel, plus backups. */
export function ReportsPage() {
  const { current, loading } = usePlanningYear();
  const data = usePlanData(current?.id);
  if (loading) return <p>Loading…</p>;
  if (!current) {
    return (
      <section>
        <h1>Export &amp; reports</h1>
        <p>
          No plan yet. <Link to="/">Create a planning year, restore a backup or load the sample plan</Link> first.
        </p>
      </section>
    );
  }
  if (!data) return <p>Loading…</p>;
  return <Reports data={data} />;
}

function Reports({ data }: { data: PlanData }) {
  const set = buildReports(data, todayIso());
  const [chosen, setChosen] = useState<Set<ReportId>>(() => new Set(set.reports.map((r) => r.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown: ReportSet = { ...set, reports: set.reports.filter((r) => chosen.has(r.id)) };

  const toggle = (id: ReportId, on: boolean) =>
    setChosen((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const downloadExcel = async () => {
    setBusy(true);
    setError(null);
    try {
      const { buildWorkbook } = await import('../../data/excelExport');
      const bytes = await buildWorkbook(shown);
      downloadFile(
        `${fileStem(data.planningYear.schoolName, data.planningYear.year)}-staffing-reports-${set.printedOn}.xlsx`,
        bytes,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } catch {
      setError('The Excel file could not be made. Try again, or use Print / Save as PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="no-print">
        <h1>Export &amp; reports</h1>
        <HelpLink topic="reports" />
        <p className="muted">
          Choose reports to print, save as PDF or download as an Excel workbook (one sheet per report, grids coloured as in
          the app). Exported files contain staff names, so keep them somewhere your department permits.
        </p>
        <fieldset className="report-choice">
          <legend>Reports</legend>
          {set.reports.map((r) => (
            <label key={r.id}>
              <input type="checkbox" checked={chosen.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} /> {r.title}
            </label>
          ))}
        </fieldset>
        <div className="actions">
          <button onClick={() => window.print()} disabled={!shown.reports.length}>
            Print / Save as PDF
          </button>
          <button className="secondary" onClick={() => void downloadExcel()} disabled={busy || !shown.reports.length}>
            {busy ? 'Building…' : 'Download Excel workbook'}
          </button>
        </div>
        <p className="muted small">
          To make a PDF, choose <strong>Save as PDF</strong> as the printer in the print dialog. Grids print landscape.
        </p>
        {error && <p className="warning">{error}</p>}
      </div>

      <div className="reports">
        {shown.reports.map((r) => (
          <ReportView key={r.id} set={set} report={r} />
        ))}
      </div>

      <BackupPanel planningYearId={data.planningYear.id} />
    </section>
  );
}

export function ReportView({ set, report }: { set: ReportSet; report: Report }) {
  return (
    <article className={`report${report.landscape ? ' landscape' : ''}`} aria-label={report.title}>
      <header className="report-header">
        <h2>{report.title}</h2>
        <p className="muted small">
          {set.heading} · {printedLine(set)}
        </p>
      </header>
      {report.tables.map((t) => (
        <ReportTableView key={t.title} table={t} />
      ))}
    </article>
  );
}

function ReportTableView({ table }: { table: ReportTable }) {
  return (
    <section className="report-section">
      <h3>{table.title}</h3>
      {table.note && <p className="muted small">{table.note}</p>}
      {table.rows.length === 0 ? (
        <p className="muted">{table.empty ?? 'None.'}</p>
      ) : (
        <table className={`report-table${table.grid ? ' grid-report' : ''}`}>
          <thead>
            <tr>
              {table.columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) =>
              row.length === 1 && row[0]!.tone === 'heading' ? (
                <tr key={i} className="group">
                  <th colSpan={table.columns.length}>{row[0]!.text}</th>
                </tr>
              ) : (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className={cell.tone ? `tone-${cell.tone}` : undefined}>
                      {cell.text.split('\n').map((line, k) => (
                        <div key={k}>{line}</div>
                      ))}
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
