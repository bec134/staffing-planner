/**
 * Excel export (Phase 7): one sheet per report, the same tables as the
 * printed reports, with grid cells coloured like the app. Read-only for
 * reviewers; changes made in Excel are not imported back (use a backup).
 *
 * exceljs is loaded only when a workbook is built, so it doesn't slow the
 * rest of the app down.
 */
import type { Fill, Worksheet } from 'exceljs';
import { printedLine, type ReportSet, type ReportTable, type Tone } from '../domain/reports';

/** Cell colours (ARGB), matching the app's tiles. */
const FILLS: Partial<Record<Tone, string>> = {
  permanent: 'FFDBE9FB',
  twt: 'FFE7DCF7',
  temporary: 'FFFDECCC',
  leave: 'FFE3E5E8',
  cover: 'FFCFE9D8',
  gap: 'FFFBE4E4',
  off: 'FFF3F4F6',
  ok: 'FFE3F3E8',
  warn: 'FFFFF4E0',
  heading: 'FFEDF2F7',
  total: 'FFEDF2F7',
};
const HEADER_FILL = 'FF1F3A5F';

const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

function addTable(ws: Worksheet, t: ReportTable) {
  const width = t.columns.length;
  ws.addRow([]);
  const title = ws.addRow([t.title]);
  title.font = { bold: true, size: 12 };
  if (t.note) ws.addRow([t.note]).font = { italic: true, color: { argb: 'FF5F6B7A' } };
  if (!t.rows.length) {
    ws.addRow([t.empty ?? 'None.']).font = { italic: true };
    return;
  }
  const header = ws.addRow(t.columns);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solid(HEADER_FILL);
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  for (const cells of t.rows) {
    const isHeading = cells.length === 1 && cells[0]!.tone === 'heading';
    const row = ws.addRow(cells.map((x) => x.text));
    if (isHeading) {
      ws.mergeCells(row.number, 1, row.number, width);
      row.getCell(1).font = { bold: true };
      row.getCell(1).fill = solid(FILLS.heading!);
      continue;
    }
    cells.forEach((x, i) => {
      const cell = row.getCell(i + 1);
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD6DADD' } } };
      const fill = x.tone && FILLS[x.tone];
      if (fill) cell.fill = solid(fill);
      if (x.tone === 'total') cell.font = { bold: true };
      if (x.tone === 'leave') cell.font = { color: { argb: 'FF5F6B7A' } };
    });
  }
}

/**
 * Column widths from the longest line in each column, within limits. Grid
 * columns stay narrow (text wraps) so a week fits across the page.
 */
function sizeColumns(ws: Worksheet, tables: ReportTable[]) {
  const widths: number[] = [];
  for (const t of tables) {
    const rows = [t.columns, ...t.rows.filter((r) => !(r.length === 1 && r[0]!.tone === 'heading')).map((r) => r.map((x) => x.text))];
    for (const texts of rows) {
      texts.forEach((text, i) => {
        const longest = Math.max(...text.split('\n').map((l) => l.length)) + 2;
        const width = i === 0 ? Math.min(longest, 40) : t.grid ? Math.min(Math.max(longest, 14), 22) : Math.min(longest, 45);
        widths[i] = Math.max(widths[i] ?? 10, width);
      });
    }
  }
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

/** Row heights for wrapped text, since Excel doesn't always grow rows itself. */
function sizeRows(ws: Worksheet) {
  ws.eachRow((row) => {
    let lines = 1;
    row.eachCell((cell) => {
      if (typeof cell.value !== 'string' || !cell.alignment?.wrapText || cell.isMerged) return;
      const width = Math.max(1, (ws.getColumn(cell.col).width ?? 10) - 1);
      const needed = cell.value.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / width)), 0);
      lines = Math.max(lines, needed);
    });
    if (lines > 1) row.height = 15 * lines;
  });
}

/** Build the workbook as bytes. */
export async function buildWorkbook(set: ReportSet): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Staffing Planner';
  wb.created = new Date(`${set.printedOn}T00:00:00`);
  for (const r of set.reports) {
    const ws = wb.addWorksheet(r.sheet, {
      pageSetup: {
        paperSize: 9, // A4
        orientation: r.landscape ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });
    ws.addRow([r.title]).font = { bold: true, size: 14 };
    ws.addRow([`${set.heading} · ${printedLine(set)}`]).font = { color: { argb: 'FF5F6B7A' } };
    for (const t of r.tables) addTable(ws, t);
    sizeColumns(ws, r.tables);
    sizeRows(ws);
  }
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
