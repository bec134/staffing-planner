import { describePattern } from './dayPattern';
import {
  STAFF_TEMPLATE,
  guessStaffImportMapping,
  parseGrade,
  parseStaffRows,
  parseLeaveType,
  parseSubstantiveRole,
  parseDaysText,
  parseEmploymentType,
  parseWorkPreference,
  type StaffImportMapping,
} from './staffImport';


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
    ['TWT', 'twt'],
    ['Temporary Workforce Transition', 'twt'],
    ['TPT', 'twt'],
    ['Temp', 'temporary'],
    ['temporary', 'temporary'],
  ])('reads %j', (input, expected) => {
    expect(parseEmploymentType(input)).toBe(expected);
  });
  it('rejects unknown values', () => {
    expect(parseEmploymentType('casual')).toBeNull();
  });
});

const HEADERS = STAFF_TEMPLATE.csv.split('\r\n')[0]!.split(',');
const mapping = guessStaffImportMapping(HEADERS);
const row = (cells: Partial<Record<keyof StaffImportMapping, string>>) => {
  const out = Array<string>(HEADERS.length).fill('');
  for (const [field, value] of Object.entries(cells)) out[mapping[field as keyof StaffImportMapping]!] = value!;
  return out;
};

describe('staff CSV parsing', () => {
  it('guesses every column of the template', () => {
    expect(mapping).toEqual({
      name: 0,
      employmentType: 1,
      permanentFte: 2,
      substantiveRole: 3,
      workPreference: 4,
      preferredDays: 5,
      leaveDays: 6,
      leaveType: 7,
      grade1: 8,
      grade2: 9,
      grade3: 10,
    });
  });

  it('reads the template rows with no errors', () => {
    const [, ...lines] = STAFF_TEMPLATE.csv.split('\r\n');
    const rows = parseStaffRows(lines.map((l) => l.split(',')), mapping, []);
    expect(rows.every((r) => r.errors.length === 0 && r.draft)).toBe(true);
    expect(
      rows.map((r) => [
        r.draft!.employmentType,
        r.draft!.permanentMilliFte,
        r.draft!.workPreference,
        describePattern(r.draft!.preferredDays),
        describePattern(r.draft!.leaveDays),
        r.draft!.gradePreferences.join(''),
        r.draft!.substantiveRole,
      ]),
    ).toEqual([
      ['permanent', 1000, 'full_time', 'Mon, Tue, Wed, Thu, Fri', 'none', 'K12', 'Teacher'],
      ['permanent', 1000, 'part_time', 'Mon, Tue, Wed', 'Thu, Fri', '34', 'Teacher'],
      ['twt', 600, 'part_time', 'Mon, Tue, Wed', 'none', '', 'Teacher Librarian'],
      ['temporary', undefined, 'part_time', 'Thu, Fri', 'none', '21K', 'Teacher'],
    ]);
  });

  it('understands common spellings', () => {
    expect(['Full time', 'full-time', 'FT', 'Part time', 'PT'].map(parseWorkPreference)).toEqual([
      'full_time',
      'full_time',
      'full_time',
      'part_time',
      'part_time',
    ]);
    expect(['LSL', 'Leave without pay', 'maternity leave', 'Paternity', 'holiday'].map(parseLeaveType)).toEqual([
      'lsl',
      'lwop',
      'maternity',
      'paternity',
      null,
    ]);
    expect(['K', 'Kindergarten', 'Year 1', 'Yr 2', 'Y3', '6', '7'].map(parseGrade)).toEqual(['K', 'K', '1', '2', '3', '6', null]);
  });

  it('reads substantive roles, with common short forms', () => {
    expect(
      ['Principal', 'DP', 'AP', 'AP C&I', 'assistant principal - curriculum & instruction', 'Classroom Teacher', 'teacher', 'TL', 'School Counselor', 'Cleaner'].map(
        parseSubstantiveRole,
      ),
    ).toEqual([
      'Principal',
      'Deputy Principal',
      'Assistant Principal',
      'Assistant Principal - Curriculum & Instruction',
      'Assistant Principal - Curriculum & Instruction',
      'Teacher',
      'Teacher',
      'Teacher Librarian',
      'School Counsellor',
      null,
    ]);
  });

  it('fills a blank full-time row with every day not on leave, and infers a blank preference', () => {
    const [full, inferred] = parseStaffRows(
      [
        row({ name: 'A', employmentType: 'Permanent', workPreference: 'Full time', leaveDays: 'Fri' }),
        row({ name: 'B', employmentType: 'Temporary', preferredDays: 'Mon-Fri' }),
      ],
      mapping,
      [],
    );
    expect(describePattern(full!.draft!.preferredDays)).toBe('Mon, Tue, Wed, Thu');
    expect(inferred!.draft!.workPreference).toBe('full_time');
  });

  it('reports errors, ignores permanent FTE for temporaries, and marks replacements and repeats', () => {
    const rows = parseStaffRows(
      [
        row({ name: '', employmentType: 'Casual', substantiveRole: 'Janitor', preferredDays: 'Funday', grade1: 'Year 9', leaveType: 'Holiday' }),
        row({ name: 'Kit Ashdown', employmentType: 'Temporary', permanentFte: '1.0', preferredDays: 'Mon' }),
        row({ name: 'kit ashdown', employmentType: 'Temporary', preferredDays: 'Tue' }),
      ],
      mapping,
      ['Kit Ashdown'],
    );
    expect(rows[0]!.errors).toEqual([
      'Name is blank',
      'Unknown employment status "Casual"',
      'Unknown substantive role "Janitor"',
      'Unknown leave type "Holiday"',
      'Couldn\'t read preferred days "Funday"',
      'Unknown grade "Year 9" (use K or 1–6)',
    ]);
    expect(rows[1]).toMatchObject({ existing: true, notes: ['Permanent FTE ignored for temporary staff'] });
    expect(rows[1]!.draft!.permanentMilliFte).toBeUndefined();
    expect(rows[2]!.skipReason).toBe('Repeated in this file');
  });
});
