/**
 * Someone holding two substantive positions (Bec: e.g. Teacher 0.6 and
 * Assistant Principal - Curriculum & Instruction 0.2). Each has its own
 * FTE: the other roles' FTE is entered, and the main substantive role has
 * the rest of their days. They can only be matched to positions of each
 * role up to its FTE.
 */
import { union } from './dayPattern';
import { formatFte, milliFteOf, type MilliFte } from './fte';
import { freedBy, SUBSTANTIVE_ROLES, type EntitlementMatch, type EntitlementPosition, type Id, type PositionType, type Staff } from './types';

export interface SubstantiveShare {
  role: string;
  /** Undefined when the FTE hasn't been entered (no limit then). */
  milliFte?: MilliFte;
}

/** Each substantive role with its FTE, or undefined for someone with one role. */
export function substantiveShares(staff: Pick<Staff, 'currentRole' | 'otherRoles' | 'otherRoleMilliFte' | 'workPattern'>): SubstantiveShare[] | undefined {
  const others = (staff.otherRoles ?? []).filter((r) => r && r !== staff.currentRole);
  if (!others.length) return undefined;
  const shares = others.map((role) => ({ role, milliFte: staff.otherRoleMilliFte?.[role] }));
  const known = shares.every((s) => s.milliFte !== undefined);
  const rest = milliFteOf(staff.workPattern) - shares.reduce((sum, s) => sum + (s.milliFte ?? 0), 0);
  return [{ role: staff.currentRole, milliFte: known ? Math.max(0, rest) : undefined }, ...shares];
}

/** "Teacher 0.6; Assistant Principal - Curriculum & Instruction 0.2" */
export function describeShares(staff: Parameters<typeof substantiveShares>[0]): string {
  const shares = substantiveShares(staff);
  if (!shares) return staff.currentRole;
  return shares.map((s) => `${s.role || 'No role'}${s.milliFte !== undefined ? ` ${formatFte(s.milliFte)}` : ''}`).join('; ');
}

/** The substantive role a position type belongs to (non-executive types count as Teacher). */
export function roleOfType(type: PositionType | undefined): string {
  if (!type) return 'Teacher';
  const exact = SUBSTANTIVE_ROLES.find((r) => r.toLowerCase() === type.name.trim().toLowerCase());
  if (exact) return exact;
  return type.category === 'executive' ? type.name : 'Teacher';
}

/** Their own matches (not backfills, higher duties or second jobs) in positions of this role. */
function roleMatches(staffId: Id, role: string, matches: EntitlementMatch[], positions: EntitlementPosition[], types: PositionType[]) {
  const typeById = new Map(types.map((t) => [t.id, t]));
  const positionById = new Map(positions.map((p) => [p.id, p]));
  return matches.filter(
    (m) =>
      m.staffId === staffId &&
      !m.coveringLeaveId &&
      !freedBy(m) &&
      !m.aboveSubstantive &&
      roleOfType(typeById.get(positionById.get(m.roleId)?.positionTypeId ?? '')) === role,
  );
}

/** FTE matched to each of someone's substantive roles. */
export function matchedByRole(staff: Staff, matches: EntitlementMatch[], positions: EntitlementPosition[], types: PositionType[]) {
  return (substantiveShares(staff) ?? []).map((share) => ({
    ...share,
    matchedMilli: milliFteOf(union(roleMatches(staff.id, share.role, matches, positions, types).map((m) => m.days))),
  }));
}

/**
 * Split days someone is being matched to a position into those within the
 * FTE of their substantive role and those over it, which are higher duties
 * (Bec: Sarah's AP C&I is 0.2; anything more is higher duties). Only for
 * executive roles of someone holding two substantive positions with FTE
 * entered; otherwise undefined.
 */
export function splitBySubstantive(
  staff: Staff | undefined,
  positionId: Id,
  indices: number[],
  matches: EntitlementMatch[],
  positions: EntitlementPosition[],
  types: PositionType[],
): { within: number[]; over: number[]; role: string; milliFte: MilliFte } | undefined {
  if (!staff) return undefined;
  const type = types.find((t) => t.id === positions.find((p) => p.id === positionId)?.positionTypeId);
  if (type?.category !== 'executive') return undefined;
  const role = roleOfType(type);
  const share = substantiveShares(staff)?.find((s) => s.role === role);
  if (!share || share.milliFte === undefined) return undefined;
  const held = union(roleMatches(staff.id, role, matches, positions, types).map((m) => m.days));
  const within: number[] = [];
  const over: number[] = [];
  let used = held;
  for (const d of indices) {
    if (used.days[d]) continue;
    const next = union([used, { mode: 'fortnightly', days: Array.from({ length: 10 }, (_, i) => i === d) }]);
    if (milliFteOf(next) <= share.milliFte) {
      within.push(d);
      used = next;
    } else over.push(d);
  }
  return { within, over, role, milliFte: share.milliFte };
}

/** Matches to a substantive role beyond its FTE (e.g. after the FTE was lowered). */
export function overSubstantive(staff: Staff, matches: EntitlementMatch[], positions: EntitlementPosition[], types: PositionType[]) {
  return matchedByRole(staff, matches, positions, types).filter((r) => r.milliFte !== undefined && r.matchedMilli > r.milliFte);
}
