import { Link } from 'react-router-dom';
import { formatRange } from '../../domain/dates';
import { describeDayIndices } from '../../domain/dayPattern';
import { leaveLink, roleLink } from '../../domain/flags';
import { coverGaps } from '../../domain/leave';
import { LEAVE_TYPE_LABELS } from '../../domain/types';
import { lookups, type PlanData } from '../allocation/shared';

/** Every position left uncovered by leave, by date range and day. */
export function UncoveredList({ data }: { data: PlanData }) {
  const { staffById, roleById } = lookups(data);
  const rows = data.leave
    .flatMap((l) => coverGaps(l, data.allocations).map((g) => ({ leave: l, gap: g })))
    .sort((a, b) => a.gap.range.start.localeCompare(b.gap.range.start));

  if (rows.length === 0) return <p className="ok">Every position vacated by leave is covered.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Dates</th>
          <th>Days</th>
          <th>Role</th>
          <th>Vacated by</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map(({ leave, gap }) => (
          <tr key={`${leave.id}-${gap.roleId}-${gap.days.join()}-${gap.range.start}`}>
            <td>{formatRange(gap.range)}</td>
            <td>{describeDayIndices(gap.days)}</td>
            <td>
              <Link to={roleLink(gap.roleId)}>{roleById.get(gap.roleId)?.name ?? 'Deleted role'}</Link>
            </td>
            <td>
              {staffById.get(leave.staffId)?.name ?? 'Deleted staff member'} ({LEAVE_TYPE_LABELS[leave.leaveType]})
            </td>
            <td>
              <Link to={leaveLink(leave.id)}>Assign cover</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
