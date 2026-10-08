import type { Id, PositionCategory, PositionType } from './types';

/** Position types supplied by Bec; used for entitlement and as allocatable roles. */
export const DEFAULT_POSITION_TYPES: readonly { name: string; category: PositionCategory }[] = [
  { name: 'Principal', category: 'executive' },
  { name: 'Classroom Teacher', category: 'class_teacher' },
  { name: 'Assistant Principal', category: 'executive' },
  { name: 'Assistant Principal - Curriculum & Instruction', category: 'executive' },
  { name: 'Deputy Principal', category: 'executive' },
  { name: 'Teacher Librarian', category: 'other_teaching' },
  { name: 'RFF Teacher', category: 'other_teaching' },
  { name: 'Executive Release Teacher', category: 'other_teaching' },
  { name: 'QTSS Teacher', category: 'other_teaching' },
  { name: 'Learning & Support Teacher', category: 'other_teaching' },
  { name: 'EaLD Teacher', category: 'other_teaching' },
];

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Stable ID for a default position type within a planning year. */
export const defaultPositionTypeId = (planningYearId: Id, name: string) => `${planningYearId}-pt-${slug(name)}`;

export function defaultPositionTypes(planningYearId: Id): PositionType[] {
  return DEFAULT_POSITION_TYPES.map((pt, i) => ({
    id: defaultPositionTypeId(planningYearId, pt.name),
    planningYearId,
    name: pt.name,
    category: pt.category,
    sortOrder: i,
  }));
}

/** Move one position type up or down, renumbering sortOrder 0..n-1. */
export function movePositionType(types: PositionType[], id: Id, direction: -1 | 1): PositionType[] {
  const ordered = [...types].sort((a, b) => a.sortOrder - b.sortOrder);
  const from = ordered.findIndex((p) => p.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ordered.length) return ordered;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved!);
  return ordered.map((p, i) => ({ ...p, sortOrder: i }));
}

/** Returns an error message, or null if the name is acceptable. */
export function validatePositionTypeName(name: string, others: PositionType[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name';
  if (others.some((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    return 'A position type with this name already exists';
  }
  return null;
}
