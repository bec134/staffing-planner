import { buildSampleData } from '../data/sampleData';
import { REPORT_IDS, buildReports, type Report, type ReportCell } from './reports';

const set = buildReports(buildSampleData(), '2026-10-10');
const report = (id: Report['id']) => set.reports.find((r) => r.id === id)!;
const table = (id: Report['id'], title: string) => report(id).tables.find((t) => t.title.startsWith(title))!;
const rowNamed = (id: Report['id'], title: string, name: string) => table(id, title).rows.find((r) => r[0]!.text === name)!;
const texts = (row: ReportCell[]) => row.map((x) => x.text);

describe('reports', () => {
  it('builds every report, with short unique sheet names', () => {
    expect(set.reports.map((r) => r.id)).toEqual([...REPORT_IDS]);
    expect(set.heading).toBe('Wattle Creek Public School (fictional sample) · 2027 staffing plan');
    const sheets = set.reports.map((r) => r.sheet);
    expect(new Set(sheets).size).toBe(sheets.length);
    expect(sheets.every((s) => s.length <= 31 && !/[[\]:*?/\\]/.test(s))).toBe(true);
    // Every row is as wide as its columns, apart from group headings.
    for (const r of set.reports) {
      for (const t of r.tables) {
        for (const row of t.rows) {
          if (row.length === 1 && row[0]!.tone === 'heading') continue;
          expect(row).toHaveLength(t.columns.length);
        }
      }
    }
  });

  it('summarises entitlement against Part 1 matches, with warnings', () => {
    const rff = rowNamed('summary', 'Entitlement', 'RFF Teacher');
    expect(texts(rff)).toEqual(['RFF Teacher', '1.316', '0.7', '0.616']);
    expect(rff[3]!.tone).toBe('warn');
    expect(texts(rowNamed('summary', 'Entitlement', 'Total'))).toEqual(['Total', '14.884', '13.1', '1.784']);
    expect(table('summary', 'Warnings').rows.map((r) => r[0]!.text)).toContain(
      'RFF Teacher: allocated 0.7 FTE, 0.616 under the entitlement of 1.316',
    );
  });

  it('shows the Part 1 grid by day, coloured by employment type, with whole-year leave and backfills', () => {
    const grid = table('matching', 'Positions by day');
    // RFF Teacher 2 differs between weeks, so the grid shows Week A and B.
    expect(grid.columns).toEqual(['Position', 'Mon A', 'Tue A', 'Wed A', 'Thu A', 'Fri A', 'Mon B', 'Tue B', 'Wed B', 'Thu B', 'Fri B']);
    expect(grid.rows[0]).toEqual([{ text: 'Principal', tone: 'heading' }]);
    const ct2 = rowNamed('matching', 'Positions by day', 'Classroom Teacher 2');
    expect(ct2[1]).toEqual({ text: 'Harper Vale', tone: 'temporary' });
    const ct3 = rowNamed('matching', 'Positions by day', 'Classroom Teacher 3');
    expect(ct3[1]).toEqual({ text: 'Indi Calloway', tone: 'permanent' });
    expect(ct3[4]).toEqual({ text: 'Indi Calloway (LWOP)\nBackfill: Tara Quinlan', tone: 'leave' });
    const ct1 = rowNamed('matching', 'Positions by day', 'Classroom Teacher 1');
    expect(ct1[1]).toEqual({ text: 'Eli Brookfield (LWOP)\nNo backfill', tone: 'gap' });
    expect(table('matching', 'Nominated').rows).toEqual([]);
  });

  it('shows the Part 2 grid, with part-year leave dated, and placements by staff and role', () => {
    const red = rowNamed('placement', 'Roles by day', '3/4 Red');
    expect(red[1]!.text).toBe('Jules Fernhill (LSL, 27 Apr – 2 Jul 2027)\nCover: Sam Ridley, 27 Apr – 2 Jul 2027');
    expect(rowNamed('placement', 'Roles by day', 'Executive release')[1]).toEqual({ text: 'Unfilled', tone: 'gap' });
    expect(rowNamed('placement', 'By staff', 'Gus Penrose')[4]!.text).toBe('1/2 Blue: Thu, Fri\nRFF 2: Wed');
    expect(rowNamed('placement', 'By role', '1/2 Green')[4]!.text).toBe(
      'Indi Calloway: Mon, Tue, Wed, Thu, Fri\nTara Quinlan: Thu, Fri (cover for Indi Calloway)',
    );
  });

  it('lists leave with cover, gaps and backfills', () => {
    const jules = rowNamed('leave', 'Leave and cover', 'Jules Fernhill');
    expect(texts(jules).slice(1, 6)).toEqual([
      'Long Service Leave',
      '27 Apr – 2 Jul 2027',
      'Mon, Tue, Wed, Thu, Fri (1.0 FTE)',
      'Sam Ridley: 3/4 Red, Mon, Tue, Wed, 27 Apr – 2 Jul 2027',
      '3/4 Red: Thu, Fri, 27 Apr – 2 Jul 2027',
    ]);
    const indi = rowNamed('leave', 'Leave and cover', 'Indi Calloway');
    expect(indi[2]!.text).toMatch(/\(whole year\)$/);
    expect(indi[6]!.text).toBe('Tara Quinlan: Thu, Fri');
  });

  it('summarises classes and enrolments', () => {
    expect(texts(rowNamed('classes', 'Classes', '1/2 Blue'))).toEqual([
      '1/2 Blue',
      'Y1/Y2',
      'Year 1: 15\nYear 2: 8',
      '23',
      'Frankie Lowe: Mon, Tue, Wed\nGus Penrose: Thu, Fri',
    ]);
    expect(texts(rowNamed('classes', 'Classes', 'Total'))[3]).toBe('146');
    expect(texts(rowNamed('classes', 'Enrolments', 'Kindergarten'))).toEqual(['Kindergarten', '40', '40']);
  });

  it('lists staff with their substantive role and details for next year', () => {
    const kit = rowNamed('staff', 'Staff', 'Kit Ashdown');
    expect(kit.at(-1)).toEqual({ text: 'Up to date', tone: 'ok' });
    expect(table('staff', 'Staff').columns[4]).toBe('Substantive role');
    expect(rowNamed('staff', 'Staff', 'Lou Merriweather')[4]!.text).toBe('Teacher Librarian');
    expect(texts(rowNamed('staff', 'Staff', 'Eli Brookfield')).slice(6)).toEqual([
      '1.0',
      'Part time',
      'Wed, Thu, Fri',
      'Mon, Tue (LWOP)',
      'K, 1',
      'Up to date',
    ]);
  });
});
