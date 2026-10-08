import { formatRange } from '../../domain/dates';
import { coverGaps, leaveRange } from '../../domain/leave';
import { LEAVE_TYPE_LABELS, type Leave } from '../../domain/types';
import type { PlanData } from '../allocation/shared';

export const leaveTitle = (l: Leave, data: PlanData) =>
  `${data.staff.find((s) => s.id === l.staffId)?.name ?? 'Deleted staff member'} — ${LEAVE_TYPE_LABELS[l.leaveType]}`;

export const leaveDates = (l: Leave) => formatRange(leaveRange(l));

export type CoverStatus = 'covered' | 'partial' | 'uncovered' | 'nothing';

/** Whether the leave's vacated role days are covered. */
export function coverStatus(l: Leave, data: PlanData): CoverStatus {
  const gaps = coverGaps(l, data.allocations);
  const hasCover = data.allocations.some((a) => a.coveringLeaveId === l.id);
  const affectsRoles = data.allocations.some((a) => a.staffId === l.staffId && !a.coveringLeaveId);
  if (!affectsRoles && !hasCover) return 'nothing';
  if (gaps.length === 0) return 'covered';
  return hasCover ? 'partial' : 'uncovered';
}

export const COVER_STATUS_LABELS: Record<CoverStatus, string> = {
  covered: 'Fully covered',
  partial: 'Partly covered',
  uncovered: 'No cover',
  nothing: 'No roles affected',
};
