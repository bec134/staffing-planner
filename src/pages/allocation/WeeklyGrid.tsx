import { Link } from 'react-router-dom';
import { FORTNIGHT_DAYS, WEEKDAYS, repeatsWeekly } from '../../domain/dayPattern';
import { staffLink } from '../../domain/flags';
import { byName, lookups, type PlanData } from './shared';

/**
 * Staff × weekdays. Expands to Week A / Week B columns only when someone's
 * days differ between the two weeks.
 */
export function WeeklyGrid({ data }: { data: PlanData }) {
  const { roleById } = lookups(data);
  const fortnightly = [
    ...data.staff.map((s) => s.workPattern),
    ...data.roles.map((r) => r.days),
    ...data.allocations.map((a) => a.days),
  ].some((p) => !repeatsWeekly(p));
  const columns = fortnightly ? [...Array(FORTNIGHT_DAYS).keys()] : [...WEEKDAYS.keys()];
  const staff = [...data.staff].sort(byName);

  if (staff.length === 0) return <p className="muted">No staff yet.</p>;

  return (
    <section>
      <p className="muted small">
        {fortnightly
          ? 'Showing Week A and Week B because some patterns differ between the two weeks.'
          : 'Everyone works the same days each week.'}
      </p>
      <table className="grid">
        <thead>
          {fortnightly && (
            <tr>
              <th />
              <th colSpan={5}>Week A</th>
              <th colSpan={5}>Week B</th>
            </tr>
          )}
          <tr>
            <th>Staff member</th>
            {columns.map((i) => (
              <th key={i}>{WEEKDAYS[i % WEEKDAYS.length]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <th scope="row">
                <Link to={staffLink(s.id)}>{s.name}</Link>
              </th>
              {columns.map((i) => {
                // In the weekly view, a column stands for that day in both weeks.
                const indices = fortnightly ? [i] : [i, i + WEEKDAYS.length];
                const works = indices.some((d) => s.workPattern.days[d]);
                const here = data.allocations.filter((a) => a.staffId === s.id && indices.some((d) => a.days.days[d]));
                const clash = here.length > 1 || (here.length > 0 && !indices.every((d) => s.workPattern.days[d]));
                const label = here.map((a) => roleById.get(a.roleId)?.name ?? 'Deleted role').join(' + ');
                const cls = clash ? 'cell clash' : here.length ? 'cell allocated' : works ? 'cell free' : 'cell off';
                return (
                  <td key={i} className={cls} title={clash ? 'Conflict: see warnings' : undefined}>
                    {here.length ? label : works ? 'unallocated' : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="legend small">
        <span className="cell allocated">Allocated</span> <span className="cell free">Works, unallocated</span>{' '}
        <span className="cell off">Doesn't work</span> <span className="cell clash">Conflict</span>
      </p>
    </section>
  );
}
