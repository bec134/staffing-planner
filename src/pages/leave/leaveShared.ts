import { formatRange } from '../../domain/dates';
import { coverStatus as domainCoverStatus, leaveRange } from '../../domain/leave';
import { schoolYear } from '../../domain/matching';
import { LEAVE_TYPE_LABELS, type Leave } from '../../domain/types';
import type { PlanData } from '../allocation/shared';

export const leaveTitle = (l: Leave, data: PlanData) =>
  `${data.staff.find((s) => s.id === l.staffId)?.name ?? 'Deleted staff member'} — ${LEAVE_TYPE_LABELS[l.leaveType]}`;

export const leaveDates = (l: Leave) => formatRange(leaveRange(l));

export type { CoverStatus } from '../../domain/leave';
export { COVER_STATUS_LABELS } from '../../domain/leave';

/** See `coverStatus` in domain/leave.ts. */
export const coverStatus = (l: Leave, data: PlanData) =>
  domainCoverStatus(l, data.allocations, data.matches, data.roles, schoolYear(data.planningYear));
