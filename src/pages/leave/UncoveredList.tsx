import { Link } from 'react-router-dom';
import { formatRange } from '../../domain/dates';
import { describeDayIndices } from '../../domain/dayPattern';
import { leaveLink, roleLink } from '../../domain/flags';
import { coverGaps, coveredInPart1, part1Gaps } from '../../domain/leave';
import { schoolYear } from '../../domain/matching';
import { LEAVE_TYPE_LABELS, type Leave } from '../../domain/types';
import { lookups, type PlanData } from '../allocation/shared';

interface Row {
  leave: Leave;
  key: string;
  dates: string;
  sortDate: string;
  days: number[];
  where: { name: string; link: string };
  action: { label: string; link: string };
}

/**
 * Everything left uncovered by leave (Bec): whole-year leave not yet
 * backfilled in Part 1, and leave during the year without Part 2 cover.
 */
export function UncoveredList({ data }: { data: PlanData }) {
  const { staffById, roleById } = lookups(data);
  const year = schoolYear(data.planningYear);
  const rows: Row[] = data.leave
    .flatMap((l): Row[] =>
      coveredInPart1(l, year)
        ? part1Gaps(l, data.matches)
            .filter((g) => g.open.length)
            .map((g) => ({
              leave: l,
              key: `${l.id}-${g.positionId}`,
              dates: 'Whole year',
              sortDate: l.startDate,
              days: g.open,
              where: { name: data.positions.find((p) => p.id === g.positionId)?.name ?? 'Deleted position', link: '/matching' },
              action: { label: 'Backfill on Match staff', link: '/matching' },
            }))
        : coverGaps(l, data.allocations).map((g) => ({
            leave: l,
            key: `${l.id}-${g.roleId}-${g.days.join()}-${g.range.start}`,
            dates: formatRange(g.range),
            sortDate: g.range.start,
            days: g.days,
            where: { name: roleById.get(g.roleId)?.name ?? 'Deleted role', link: roleLink(g.roleId) },
            action: { label: 'Assign cover', link: leaveLink(l.id) },
          })),
    )
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate));

  if (rows.length === 0) return <p className="ok">All leave is covered: whole-year leave is backfilled, and other leave has cover.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Dates</th>
          <th>Days</th>
          <th>Position or role</th>
          <th>Vacated by</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.dates}</td>
            <td>{describeDayIndices(r.days)}</td>
            <td>
              <Link to={r.where.link}>{r.where.name}</Link>
            </td>
            <td>
              <Link to={leaveLink(r.leave.id)}>
                {staffById.get(r.leave.staffId)?.name ?? 'Deleted staff member'} ({LEAVE_TYPE_LABELS[r.leave.leaveType]})
              </Link>
            </td>
            <td>
              <Link to={r.action.link}>{r.action.label}</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
