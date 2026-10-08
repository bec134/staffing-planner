import { describePattern } from './dayPattern';
import { STAFF_TEMPLATES, guessMapping, parseDaysText, parseEmploymentType, parseStaffRows, type StaffMapping } from './staffImport';

describe('parseDaysText', () => {
  it.each([
    ['Mon Tue Wed', 'Mon, Tue, Wed'],
    ['Mon, Wed', 'Mon, Wed'],
    ['monday-wednesday', 'Mon, Tue, Wed'],
    ['Mon–Fri', 'Mon, Tue, Wed, Thu, Fri'],
    ['Tues/Thurs', 'Tue, Thu'],
    ['Mon and Fri', 'Mon, Fri'],
    ['Wed to Fri', 'Wed, Thu, Fri'],
    ['Mon - Wed', 'Mon, Tue, Wed'],
  ])('reads %j', (input, expected) => {
    const week = parseDaysText(input)!;
    expect(describePattern({ mode: 'weekly', days: [...week, ...week] })).toBe(expected);
  });

  it.each(['', 'Sat', 'Fri-Mon', 'M', 'T'])('rejects %j', (input) => {
    expect(parseDaysText(input)).toBeNull();
  });
});

describe('parseEmploymentType', () => {
  it.each([
    ['Permanent', 'permanent'],
    ['perm', 'permanent'],
    ['TPT', 'tpt'],
    ['Temporary part-time', 'tpt'],
    ['Temp', 'temporary'],
    ['temporary', 'temporary'],
  ])('reads %j', (input, expected) => {
    expect(parseEmploymentType(input)).toBe(expected);
  });
  it('rejects unknown values', () => {
    expect(parseEmploymentType('casual')).toBeNull();
  });
});

describe('guessMapping', () => {
  it('finds a days text column', () => {
    expect(guessMapping(['Staff name', 'Employment type', 'Current role', 'Days worked'])).toEqual({
      name: 0,
      employmentType: 1,
      currentRole: 2,
      days: { kind: 'text', column: 3 },
      defaultEmploymentType: 'permanent',
    });
  });
  it('prefers per-weekday columns when all five exist', () => {
    const m = guessMapping(['Name', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    expect(m.days).toEqual({ kind: 'columns', columns: [1, 2, 3, 4, 5] });
    expect(m.employmentType).toBeNull();
  });
  it('leaves days unmapped when nothing matches', () => {
    expect(guessMapping(['Name']).days).toEqual({ kind: 'none' });
  });
});

describe('parseStaffRows', () => {
  const mapping: StaffMapping = {
    name: 0,
    employmentType: 1,
    currentRole: 2,
    days: { kind: 'text', column: 3 },
    defaultEmploymentType: 'temporary',
  };

  it('parses valid rows and applies the default employment type to blanks', () => {
    const rows = parseStaffRows(
      [
        ['Sample One', 'Permanent', 'Classroom Teacher', 'Mon-Fri'],
        ['Sample Two', '', 'RFF Teacher', 'Wed Thu'],
      ],
      mapping,
      [],
    );
    expect(rows[0]).toMatchObject({ line: 2, errors: [], draft: { name: 'Sample One', employmentType: 'permanent' } });
    expect(rows[1]!.draft!.employmentType).toBe('temporary');
    expect(describePattern(rows[1]!.draft!.workPattern)).toBe('Wed, Thu');
  });

  it('reports every problem in a row', () => {
    const [row] = parseStaffRows([['', 'casual', '', 'someday']], mapping, []);
    expect(row!.draft).toBeUndefined();
    expect(row!.errors).toEqual(['Name is blank', 'Unknown employment type "casual"', `Couldn't read days worked "someday"`]);
  });

  it('skips names already in the plan or repeated in the file', () => {
    const rows = parseStaffRows(
      [
        ['Existing Person', '', '', 'Mon'],
        ['New Person', '', '', 'Mon'],
        ['new person', '', '', 'Tue'],
      ],
      mapping,
      ['existing person'],
    );
    expect(rows.map((r) => r.skipReason)).toEqual(['Already in this plan', undefined, 'Repeated in this file']);
  });

  it('reads per-weekday yes/no columns', () => {
    const rows = parseStaffRows(
      [
        ['A Person', 'Y', 'y', '', 'x', 'N'],
        ['B Person', 'maybe', '', '', '', ''],
        ['C Person', '', '', '', '', ''],
      ],
      { ...mapping, employmentType: null, currentRole: null, days: { kind: 'columns', columns: [1, 2, 3, 4, 5] } },
      [],
    );
    expect(describePattern(rows[0]!.draft!.workPattern)).toBe('Mon, Tue, Thu');
    expect(rows[1]!.errors).toEqual([`Couldn't read "maybe" for Mon`]);
    expect(rows[2]!.errors).toEqual(['No days worked']);
  });

  it('defaults to full time when days are not mapped', () => {
    const [row] = parseStaffRows([['A Person']], { ...mapping, days: { kind: 'none' } }, []);
    expect(describePattern(row!.draft!.workPattern)).toBe('Mon, Tue, Wed, Thu, Fri');
  });
});

describe('staff templates', () => {
  it.each(STAFF_TEMPLATES.map((t) => [t.file, t.csv] as const))('%s maps and parses with no errors', (_file, csv) => {
    const [headers, ...rows] = csv.split('\r\n').map((line) => line.split(','));
    const mapping = guessMapping(headers!);
    expect(mapping.name).toBe(0);
    expect(mapping.employmentType).toBe(1);
    expect(mapping.currentRole).toBe(2);
    const parsed = parseStaffRows(rows, mapping, []);
    expect(parsed.every((r) => r.errors.length === 0 && r.draft && !r.skipReason)).toBe(true);
    expect(parsed.map((r) => [r.draft!.employmentType, describePattern(r.draft!.workPattern)])).toEqual([
      ['permanent', 'Mon, Tue, Wed, Thu, Fri'],
      ['tpt', 'Mon, Tue, Wed'],
      ['temporary', 'Thu, Fri'],
    ]);
  });
});
