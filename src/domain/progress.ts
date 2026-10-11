/**
 * The yearly steps shown on the Overview page (Bec), with a tick when each
 * is done, so it's clear where to start and what's next.
 */
import { unfilledDays } from './allocation';
import { dayIndices } from './dayPattern';
import { formatFte } from './fte';
import { checkIntention, planApplyIntention } from './intentions';
import { coverStatus } from './leave';
import { matchStatus, schoolYear } from './matching';
import type { PlanningYearSnapshot } from '../data/repository';

export interface PlanStep {
  id: string;
  title: string;
  /** Where things stand, in a few words. */
  detail: string;
  /** Undefined for steps that are never "finished" (such as backing up). */
  done?: boolean;
  path: string;
  action: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function planSteps(d: PlanningYearSnapshot): PlanStep[] {
  const year = schoolYear(d.planningYear);
  const entitlement = d.entitlements[0]?.totalMilliFte ?? 0;

  const ctx = { planningYearId: d.planningYear.id, year, staff: d.staff, leave: d.leave, allocations: d.allocations, matches: d.matches };
  const pending = d.intentions.filter((i) => {
    if (checkIntention(i).errors.length) return true;
    return planApplyIntention(i, ctx, () => 'progress').changes.length > 0;
  }).length;

  const unmatched = d.staff.filter(
    (s) => !s.nominatedForTransfer && s.employmentType !== 'temporary' && dayIndices(matchStatus(s, d.matches).unmatched).length > 0,
  ).length;
  const unlinkedClasses = d.classStructures.filter((c) => !c.roleId).length;
  const unfilledRoles = d.roles.filter((r) => dayIndices(unfilledDays(r, d.allocations)).length > 0).length;
  const gaps = d.leave.filter((l) => ['partial', 'uncovered'].includes(coverStatus(l, d.allocations, d.matches, year))).length;

  return [
    {
      id: 'entitlement',
      title: 'Enter the entitlement',
      detail: entitlement > 0 ? `${formatFte(entitlement)} FTE entered` : 'Not entered yet',
      done: entitlement > 0,
      path: '/entitlement',
      action: 'Enter entitlement',
    },
    {
      id: 'staff',
      title: 'Add staff and their plans for next year',
      detail: d.staff.length
        ? `${plural(d.staff.length, 'staff member')}${pending ? `; ${pending} with details not yet applied` : ''}`
        : 'No staff yet: add them by hand or import a CSV file',
      done: d.staff.length > 0 && pending === 0,
      path: '/staff',
      action: 'Add staff',
    },
    {
      id: 'matching',
      title: 'Part 1: match staff to the entitlement',
      detail: !d.positions.length
        ? 'Positions not created yet'
        : unmatched
          ? `${plural(unmatched, 'permanent or TWT staff member')} not fully matched`
          : 'Permanent and TWT staff all matched',
      done: d.positions.length > 0 && d.staff.length > 0 && unmatched === 0,
      path: '/matching',
      action: 'Match staff to positions',
    },
    {
      id: 'leave',
      title: 'Part 1: backfill leave',
      detail: !d.leave.length ? 'No leave recorded' : gaps ? `${plural(gaps, 'leave record')} not fully covered` : 'All leave covered',
      done: gaps === 0,
      path: '/leave',
      action: 'Assign cover',
    },
    {
      id: 'classes',
      title: 'Part 2: set the class structure',
      detail: !d.classStructures.length
        ? 'No class structure accepted yet'
        : unlinkedClasses
          ? `${plural(unlinkedClasses, 'class', 'classes')} without a class role yet`
          : `${plural(d.classStructures.length, 'class', 'classes')}`,
      done: d.classStructures.length > 0 && unlinkedClasses === 0,
      path: '/classes',
      action: 'Set classes',
    },
    {
      id: 'placement',
      title: 'Part 2: place staff in classes and roles',
      detail: !d.roles.length ? 'No roles yet' : unfilledRoles ? `${plural(unfilledRoles, 'role')} with unfilled days` : 'Every role is filled',
      done: d.roles.length > 0 && unfilledRoles === 0,
      path: '/allocation',
      action: 'Place staff',
    },
    {
      id: 'reports',
      title: 'Share reports and save a backup',
      detail: 'Print or export reports for your team; back up regularly',
      path: '/reports',
      action: 'Reports & backup',
    },
  ];
}
