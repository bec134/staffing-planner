/**
 * Suggesting class structures (PLAN.md module 4), using Bec's rules:
 *
 * - The user sets the total number of classes and the students per grade.
 * - Guide (average) sizes: K 20, Year 1 22, Year 2 24, Years 3–6 30.
 * - Composites only as 1/2, 3/4 or 5/6. A composite's guide is the lower of
 *   its two grades' guides (so 1/2 uses 22).
 * - A class may go 1 or 2 over its guide rather than creating a composite.
 *
 * Every combination of straight and composite classes that adds up to the
 * total is scored, and the best few are offered. Scoring:
 * - going over guide + allowance is heavily penalised (a broken rule);
 * - each composite costs more than running classes up to 2 over;
 * - otherwise, classes closer to their guide score better.
 */
import { COMPOSITE_PAIRS, GRADE_LABELS, GRADES, type ClassRules, type Grade } from './types';

export type CompositeKey = '1/2' | '3/4' | '5/6';
export const COMPOSITE_KEYS: CompositeKey[] = COMPOSITE_PAIRS.map(([a, b]) => `${a}/${b}` as CompositeKey);

export const DEFAULT_GUIDE: Record<Grade, number> = { K: 20, '1': 22, '2': 24, '3': 30, '4': 30, '5': 30, '6': 30 };
export const DEFAULT_ALLOWANCE = 2;

export function defaultRules(planningYearId: string): ClassRules {
  return {
    id: `${planningYearId}-class-rules`,
    planningYearId,
    totalClasses: 0,
    guide: { ...DEFAULT_GUIDE },
    allowance: DEFAULT_ALLOWANCE,
    permittedComposites: [...COMPOSITE_KEYS],
  };
}

export type Enrolments = Record<Grade, number>;

export interface SuggestedClass {
  grades: Grade[];
  students: Partial<Record<Grade, number>>;
}

export interface Suggestion {
  classes: SuggestedClass[];
  /** Lower is better. */
  score: number;
  /** Rules this suggestion can't meet, in plain words. */
  issues: string[];
}

const BROKEN_RULE = 1000;
const COMPOSITE_COST = 50;

export const classSize = (c: { students: Partial<Record<Grade, number>> }) =>
  Object.values(c.students).reduce((s, n) => s + (n ?? 0), 0);

export const classGrades = (c: { students: Partial<Record<Grade, number>> }) =>
  GRADES.filter((g) => (c.students[g] ?? 0) > 0);

/** A class's guide: its grade's, or the lower of a composite's two. */
export function guideFor(grades: Grade[], rules: Pick<ClassRules, 'guide'>): number {
  return Math.min(...grades.map((g) => rules.guide[g]));
}

export function classLabel(grades: Grade[]): string {
  return grades.join('/');
}

/** Split `total` into `parts` near-equal whole numbers, largest first. */
export function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

function sizeCost(size: number, guide: number, allowance: number): number {
  const dev = size - guide;
  const over = dev - allowance;
  return (over > 0 ? over * BROKEN_RULE : 0) + dev * dev;
}

/** Cost of `n` students split evenly over `s` classes; Infinity if a class would be empty. */
function evenCost(n: number, s: number, guide: number, allowance: number): number {
  if (s === 0) return n === 0 ? 0 : Infinity;
  if (n < s) return Infinity;
  const q = Math.floor(n / s);
  const r = n % s;
  return r * sizeCost(q + 1, guide, allowance) + (s - r) * sizeCost(q, guide, allowance);
}

interface BandOption {
  classes: SuggestedClass[];
  score: number;
}

/** K on its own, or one of the pairs that may share composites. */
type Band = { grades: Grade[]; composite: boolean };

function bands(rules: ClassRules): Band[] {
  return [
    { grades: ['K'], composite: false },
    ...COMPOSITE_PAIRS.map(([a, b]) => ({
      grades: [a, b],
      composite: rules.permittedComposites.includes(`${a}/${b}`),
    })),
  ];
}

function straightClasses(grade: Grade, students: number, count: number): SuggestedClass[] {
  return splitEvenly(students, count).map((n) => ({ grades: [grade], students: { [grade]: n } }));
}

/** Best ways to run one band (K, or a pair of grades) as exactly k classes. */
function bandOptions(band: Band, k: number, enrol: Enrolments, rules: ClassRules, keep = 3): BandOption[] {
  const { allowance } = rules;
  if (band.grades.length === 1) {
    const g = band.grades[0]!;
    const n = enrol[g];
    if (n === 0) return k === 0 ? [{ classes: [], score: 0 }] : [];
    if (k === 0 || k > n) return [];
    const classes = straightClasses(g, n, k);
    return [{ classes, score: classes.reduce((s, c) => s + sizeCost(classSize(c), rules.guide[g], allowance), 0) }];
  }

  const a = band.grades[0]!;
  const b = band.grades[1]!;
  const na = enrol[a];
  const nb = enrol[b];
  const options: BandOption[] = [];
  if (na + nb === 0) return k === 0 ? [{ classes: [], score: 0 }] : [];
  // Up to 3 composites per pair keeps the search small; more is never sensible.
  const maxComposites = band.composite ? Math.min(3, k) : 0;
  for (let c = 0; c <= maxComposites; c++) {
    for (let sa = 0; sa <= k - c; sa++) {
      const sb = k - c - sa;
      // Every grade with students needs a class; every class needs students.
      if ((na > 0 && sa === 0 && c === 0) || (nb > 0 && sb === 0 && c === 0)) continue;
      if ((na === 0 && sa > 0) || (nb === 0 && sb > 0)) continue;
      if (c > 0 && (na === 0 || nb === 0)) continue;
      const ga = rules.guide[a];
      const gb = rules.guide[b];
      const gc = Math.min(ga, gb);
      // Composites well past their limit are never worth considering.
      const maxInComposites = c * (gc + allowance + 10);
      let bestScore = Infinity;
      let bestX: [number, number] = [0, 0];
      // xa, xb: students of each grade placed in the composites.
      const xaMin = c === 0 ? 0 : sa === 0 ? na : c;
      const xaMax = c === 0 ? 0 : sa === 0 ? na : Math.min(na - sa, maxInComposites);
      const xbMin = c === 0 ? 0 : sb === 0 ? nb : c;
      const xbMax = c === 0 ? 0 : sb === 0 ? nb : Math.min(nb - sb, maxInComposites);
      for (let xa = xaMin; xa <= xaMax; xa++) {
        const costA = evenCost(na - xa, sa, ga, allowance);
        if (costA === Infinity) continue;
        for (let xb = xbMin; xb <= xbMax; xb++) {
          if (xa + xb > maxInComposites && c > 0 && !(sa === 0 && sb === 0)) break;
          const score =
            c * COMPOSITE_COST + costA + evenCost(nb - xb, sb, gb, allowance) + evenCost(xa + xb, c, gc, allowance);
          if (score < bestScore) {
            bestScore = score;
            bestX = [xa, xb];
          }
        }
      }
      let best: BandOption | null = null;
      if (bestScore < Infinity) {
        const [xa, xb] = bestX;
        const compA = splitEvenly(xa, c);
        // Pair the largest share of one grade with the smallest of the other.
        const compB = splitEvenly(xb, c).reverse();
        const composites: SuggestedClass[] = compA.map((n, i) => ({ grades: [a, b], students: { [a]: n, [b]: compB[i]! } }));
        best = {
          classes: [...straightClasses(a, na - xa, sa), ...composites, ...straightClasses(b, nb - xb, sb)],
          score: bestScore,
        };
      }
      if (best) options.push(best);
    }
  }
  return options.sort((x, y) => x.score - y.score).slice(0, keep);
}

const signature = (classes: SuggestedClass[]) =>
  classes.map((c) => GRADES.map((g) => c.students[g] ?? 0).join('.')).join('|');

/** Rules a set of classes breaks, in plain words. */
export function describeIssues(classes: SuggestedClass[], rules: Pick<ClassRules, 'guide' | 'allowance'>): string[] {
  const issues: string[] = [];
  for (const c of classes) {
    const grades = classGrades(c);
    if (!grades.length) continue;
    const guide = guideFor(grades, rules);
    const size = classSize(c);
    if (size > guide + rules.allowance) {
      const label = grades.length > 1 ? `A ${classLabel(grades)} composite` : `A ${GRADE_LABELS[grades[0]!]} class`;
      issues.push(`${label} has ${size} students, ${size - guide} over the guide of ${guide} (limit ${guide + rules.allowance})`);
    }
  }
  return [...new Set(issues)];
}

/**
 * Suggested structures for exactly `rules.totalClasses` classes, best first.
 * Returns an empty list with a reason when no structure is possible.
 */
export function suggestStructures(
  enrol: Enrolments,
  rules: ClassRules,
  limit = 10,
): { suggestions: Suggestion[]; reason?: string } {
  const total = rules.totalClasses;
  const students = GRADES.reduce((s, g) => s + enrol[g], 0);
  if (students === 0) return { suggestions: [], reason: 'Enter the number of students in each grade.' };
  if (total <= 0) return { suggestions: [], reason: 'Enter the total number of classes.' };

  const bs = bands(rules);
  const minimum = bs.reduce((s, b) => {
    const needed = b.grades.filter((g) => enrol[g] > 0).length;
    return s + (b.composite ? Math.min(needed, 1) : needed);
  }, 0);
  if (total < minimum) {
    return { suggestions: [], reason: `At least ${minimum} classes are needed so that every grade has a class.` };
  }
  if (total > students) return { suggestions: [], reason: 'There are more classes than students.' };

  const table = bs.map((b) => Array.from({ length: total + 1 }, (_, k) => bandOptions(b, k, enrol, rules)));
  // Score every way of sharing the classes between the bands first, and only
  // build class lists for the best few.
  const candidates: { score: number; parts: BandOption[] }[] = [];
  const walk = (i: number, left: number, picked: BandOption[][]) => {
    if (i === bs.length - 1) {
      const last = table[i]![left]!;
      if (!last.length) return;
      const all = [...picked, last];
      // Best choice in every band, plus each band's runners-up for variety.
      const best = all.map((o) => o[0]!);
      const bestScore = best.reduce((s, o) => s + o.score, 0);
      candidates.push({ score: bestScore, parts: best });
      all.forEach((opts, j) =>
        opts.slice(1).forEach((alt) =>
          candidates.push({ score: bestScore - best[j]!.score + alt.score, parts: best.map((o, m) => (m === j ? alt : o)) }),
        ),
      );
      return;
    }
    for (let k = 0; k <= left; k++) {
      const opts = table[i]![k]!;
      if (opts.length) walk(i + 1, left - k, [...picked, opts]);
    }
  };
  walk(0, total, []);

  candidates.sort((x, y) => x.score - y.score);
  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];
  for (const c of candidates) {
    if (suggestions.length >= limit) break;
    const classes = c.parts.flatMap((o) => o.classes);
    const key = signature(classes);
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ classes, score: c.score, issues: describeIssues(classes, rules) });
  }
  return suggestions.length
    ? { suggestions }
    : { suggestions: [], reason: 'No structure fits these numbers. Check the total number of classes.' };
}

/** Default names: KA, KB, 1A, 1/2A … */
export function nameClasses(classes: SuggestedClass[]): string[] {
  const counts = new Map<string, number>();
  return classes.map((c) => {
    const label = classLabel(classGrades(c).length ? classGrades(c) : c.grades);
    const n = counts.get(label) ?? 0;
    counts.set(label, n + 1);
    return `${label}${String.fromCharCode(65 + n)}`;
  });
}

/** Students placed in classes vs enrolled, per grade (positive = unplaced). */
export function placementGaps(
  classes: { students: Partial<Record<Grade, number>> }[],
  enrol: Enrolments,
): Partial<Record<Grade, number>> {
  const gaps: Partial<Record<Grade, number>> = {};
  for (const g of GRADES) {
    const placed = classes.reduce((s, c) => s + (c.students[g] ?? 0), 0);
    if (placed !== enrol[g]) gaps[g] = enrol[g] - placed;
  }
  return gaps;
}
