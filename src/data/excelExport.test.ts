import ExcelJS from 'exceljs';
import { buildReports } from '../domain/reports';
import { buildWorkbook } from './excelExport';
import { buildSampleData } from './sampleData';

describe('Excel export', () => {
  it('writes one coloured sheet per report that Excel can read back', async () => {
    const set = buildReports(buildSampleData(), '2026-10-10');
    const bytes = await buildWorkbook(set);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);

    expect(wb.worksheets.map((w) => w.name)).toEqual(set.reports.map((r) => r.sheet));
    const part1 = wb.getWorksheet('Part 1 matching')!;
    expect(part1.getCell('A1').value).toBe('Part 1 · Entitlement matching');
    expect(part1.pageSetup.orientation).toBe('landscape');

    // Find Indi's backfilled Thursday and check its text and grey fill.
    let found = false;
    part1.eachRow((row) => {
      if (row.getCell(1).value !== 'Classroom Teacher 3') return;
      const thu = row.getCell(5);
      expect(thu.value).toBe('Indi Calloway (LWOP)\nBackfill: Tara Quinlan');
      expect((thu.fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFE3E5E8');
      expect((row.getCell(2).fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFDBE9FB');
      found = true;
    });
    expect(found).toBe(true);
  });
});
