import {
  classSize,
  defaultRules,
  describeIssues,
  guideFor,
  nameClasses,
  placementGaps,
  splitEvenly,
  suggestStructures,
  type Enrolments,
  type SuggestedClass,
} from './classStructure';
import type { ClassRules } from './types';

const rules = (totalClasses: number, extra: Partial<ClassRules> = {}): ClassRules => ({
  ...defaultRules('y'),
  totalClasses,
  ...extra,
});
const enrol = (k: number, y1: number, y2: number, y3: number, y4: number, y5: number, y6: number): Enrolments => ({
  K: k, '1': y1, '2': y2, '3': y3, '4': y4, '5': y5, '6': y6,
});
/** "K:20 | 1:22 | 1/2:10+12" style summary of a suggestion. */
const show = (classes: SuggestedClass[]) =>
  classes
    .map((c) =>
      c.grades.length > 1
        ? `${c.grades.join('/')}:${c.grades.map((g) => c.students[g]).join('+')}`
        : `${c.grades[0]}:${classSize(c)}`,
    )
    .join(' | ');

describe('helpers', () => {
  it('splits students evenly, largest first', () => {
    expect(splitEvenly(47, 2)).toEqual([24, 23]);
    expect(splitEvenly(60, 3)).toEqual([20, 20, 20]);
    expect(splitEvenly(5, 0)).toEqual([]);
  });

  it('uses the lower guide for a composite (Bec: 1/2 uses 22)', () => {
    const r = defaultRules('y');
    expect(guideFor(['1', '2'], r)).toBe(22);
    expect(guideFor(['3', '4'], r)).toBe(30);
    expect(guideFor(['K'], r)).toBe(20);
  });

  it('names classes KA, KB, 1A, 1/2A …', () => {
    expect(
      nameClasses([
        { grades: ['K'], students: { K: 20 } },
        { grades: ['K'], students: { K: 20 } },
        { grades: ['1', '2'], students: { '1': 10, '2': 12 } },
        { grades: ['3'], students: { '3': 30 } },
      ]),
    ).toEqual(['KA', 'KB', '1/2A', '3A']);
  });

  it('reports unplaced or over-placed students by grade', () => {
    const e = enrol(40, 0, 0, 0, 0, 0, 0);
    expect(placementGaps([{ students: { K: 20 } }, { students: { K: 18 } }], e)).toEqual({ K: 2 });
    expect(placementGaps([{ students: { K: 20 } }, { students: { K: 20 } }], e)).toEqual({});
  });

  it('explains classes over guide + 2', () => {
    expect(describeIssues([{ grades: ['3'], students: { '3': 33 } }], defaultRules('y'))).toEqual([
      'A Year 3 class has 33 students, 3 over the guide of 30 (limit 32)',
    ]);
    expect(describeIssues([{ grades: ['1', '2'], students: { '1': 12, '2': 13 } }], defaultRules('y'))).toEqual([
      'A 1/2 composite has 25 students, 3 over the guide of 22 (limit 24)',
    ]);
  });
});

describe('suggestStructures', () => {
  it('fills straight classes at the guide when numbers allow', () => {
    const { suggestions } = suggestStructures(enrol(40, 44, 48, 60, 60, 60, 60), rules(14));
    expect(show(suggestions[0]!.classes)).toBe(
      'K:20 | K:20 | 1:22 | 1:22 | 2:24 | 2:24 | 3:30 | 3:30 | 4:30 | 4:30 | 5:30 | 5:30 | 6:30 | 6:30',
    );
    expect(suggestions[0]!.issues).toEqual([]);
  });

  it('goes 1–2 over the guide rather than creating a composite', () => {
    // Year 3: 32 students (2 over 30); Year 4: 31 (1 over). One class each beats a 3/4 composite.
    const { suggestions } = suggestStructures(enrol(20, 22, 24, 32, 31, 30, 30), rules(7));
    expect(show(suggestions[0]!.classes)).toBe('K:20 | 1:22 | 2:24 | 3:32 | 4:31 | 5:30 | 6:30');
    expect(suggestions[0]!.issues).toEqual([]);
  });

  it('creates a composite once a grade would go more than 2 over', () => {
    // Year 1: 30 and Year 2: 16 in two classes. Straight would put 30 in a Year 1 class (8 over).
    const { suggestions } = suggestStructures(enrol(40, 30, 16, 30, 0, 0, 0), rules(5));
    const best = show(suggestions[0]!.classes);
    expect(best).toMatch(/1\/2:/);
    expect(suggestions[0]!.issues).toEqual([]);
  });

  it('only uses 1/2, 3/4 and 5/6 composites, and only those permitted', () => {
    const { suggestions } = suggestStructures(enrol(10, 15, 15, 15, 15, 15, 15), rules(4));
    for (const s of suggestions) {
      for (const c of s.classes) {
        if (c.grades.length > 1) expect(['1/2', '3/4', '5/6']).toContain(c.grades.join('/'));
      }
    }
    const noComposites = suggestStructures(
      enrol(20, 22, 24, 30, 30, 30, 30),
      rules(7, { permittedComposites: [] }),
    );
    expect(noComposites.suggestions.every((s) => s.classes.every((c) => c.grades.length === 1))).toBe(true);
  });

  it('never puts Kindergarten in a composite', () => {
    const { suggestions } = suggestStructures(enrol(12, 10, 10, 10, 10, 10, 10), rules(4));
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      for (const c of s.classes) if (c.grades.includes('K')) expect(c.grades).toEqual(['K']);
    }
  });

  it('places every student exactly once and uses exactly the total number of classes', () => {
    const e = enrol(47, 50, 39, 61, 58, 66, 52);
    const { suggestions } = suggestStructures(e, rules(14));
    expect(suggestions.length).toBeGreaterThan(1);
    for (const s of suggestions) {
      expect(s.classes).toHaveLength(14);
      expect(placementGaps(s.classes, e)).toEqual({});
      expect(s.classes.every((c) => classSize(c) > 0)).toBe(true);
    }
  });

  it('offers distinct alternatives, best first', () => {
    const { suggestions } = suggestStructures(enrol(47, 50, 39, 61, 58, 66, 52), rules(14));
    const keys = suggestions.map((s) => show(s.classes));
    expect(new Set(keys).size).toBe(keys.length);
    expect(suggestions.map((s) => s.score)).toEqual([...suggestions.map((s) => s.score)].sort((a, b) => a - b));
  });

  it("explains rules that can't be met when there are too few classes", () => {
    const { suggestions } = suggestStructures(enrol(25, 0, 0, 0, 0, 0, 0), rules(1));
    expect(suggestions[0]!.issues).toEqual(['A Kindergarten class has 25 students, 5 over the guide of 20 (limit 22)']);
  });

  it('gives a reason when no structure is possible', () => {
    expect(suggestStructures(enrol(0, 0, 0, 0, 0, 0, 0), rules(5)).reason).toMatch(/students/);
    expect(suggestStructures(enrol(20, 20, 20, 20, 20, 20, 20), rules(0)).reason).toMatch(/total number of classes/);
    expect(suggestStructures(enrol(20, 20, 20, 20, 20, 20, 20), rules(3)).reason).toBe(
      'At least 4 classes are needed so that every grade has a class.',
    );
    expect(suggestStructures(enrol(2, 0, 0, 0, 0, 0, 0), rules(3)).reason).toBe('There are more classes than students.');
  });

  it('copes with a large school quickly', () => {
    const t = performance.now();
    const { suggestions } = suggestStructures(enrol(110, 120, 118, 140, 150, 145, 150), rules(34));
    expect(suggestions.length).toBeGreaterThan(0);
    expect(performance.now() - t).toBeLessThan(3000);
  });
});
