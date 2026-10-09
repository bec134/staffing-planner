import { describePattern } from './dayPattern';
import {
  INTENTION_TEMPLATE,
  guessIntentionMapping,
  parseGrade,
  parseIntentionRows,
  parseLeaveType,
  parseWorkPreference,
  type IntentionMapping,
} from './intentionImport';

const HEADERS = INTENTION_TEMPLATE.csv.split('\r\n')[0]!.split(',');
const mapping = guessIntentionMapping(HEADERS);
const row = (cells: Partial<Record<keyof IntentionMapping, string>>) => {
  const out = Array<string>(HEADERS.length).fill('');
  for (const [field, value] of Object.entries(cells)) out[mapping[field as keyof IntentionMapping]!] = value!;
  return out;
};

describe('intention CSV parsing', () => {
  it('guesses every column of the template', () => {
    expect(mapping).toEqual({
      name: 0,
      employmentType: 1,
      permanentFte: 2,
      workPreference: 3,
      preferredDays: 4,
      leaveDays: 5,
      leaveType: 6,
      grade1: 7,
      grade2: 8,
      grade3: 9,
    });
  });

  it('reads the template rows with no errors', () => {
    const [, ...lines] = INTENTION_TEMPLATE.csv.split('\r\n');
    const rows = parseIntentionRows(lines.map((l) => l.split(',')), mapping, []);
    expect(rows.every((r) => r.errors.length === 0 && r.draft)).toBe(true);
    expect(
      rows.map((r) => [
        r.draft!.employmentType,
        r.draft!.permanentMilliFte,
        r.draft!.workPreference,
        describePattern(r.draft!.preferredDays),
        describePattern(r.draft!.leaveDays),
        r.draft!.gradePreferences.join(''),
      ]),
    ).toEqual([
      ['permanent', 1000, 'full_time', 'Mon, Tue, Wed, Thu, Fri', 'none', 'K12'],
      ['permanent', 1000, 'part_time', 'Mon, Tue, Wed', 'Thu, Fri', '34'],
      ['twt', 600, 'part_time', 'Mon, Tue, Wed', 'none', '56'],
      ['temporary', undefined, 'part_time', 'Thu, Fri', 'none', '21K'],
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

  it('fills a blank full-time row with every day not on leave, and infers a blank preference', () => {
    const [full, inferred] = parseIntentionRows(
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
    const rows = parseIntentionRows(
      [
        row({ name: '', employmentType: 'Casual', preferredDays: 'Funday', grade1: 'Year 9', leaveType: 'Holiday' }),
        row({ name: 'Kit Ashdown', employmentType: 'Temporary', permanentFte: '1.0', preferredDays: 'Mon' }),
        row({ name: 'kit ashdown', employmentType: 'Temporary', preferredDays: 'Tue' }),
      ],
      mapping,
      ['Kit Ashdown'],
    );
    expect(rows[0]!.errors).toEqual([
      'Name is blank',
      'Unknown employment status "Casual"',
      'Unknown leave type "Holiday"',
      'Couldn\'t read preferred days "Funday"',
      'Unknown grade "Year 9" (use K or 1–6)',
    ]);
    expect(rows[1]).toMatchObject({ replaces: true, notes: ['Permanent FTE ignored for temporary staff'] });
    expect(rows[1]!.draft!.permanentMilliFte).toBeUndefined();
    expect(rows[2]!.skipReason).toBe('Repeated in this file');
  });
});
