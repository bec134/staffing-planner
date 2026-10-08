import { useState } from 'react';
import { Link } from 'react-router-dom';
import { datesOverlap } from '../../domain/allocation';
import { containsDate, formatDate, formatRange, intersectRange } from '../../domain/dates';
import { FORTNIGHT_DAYS, WEEKDAYS, repeatsWeekly } from '../../domain/dayPattern';
import { staffLink } from '../../domain/flags';
import { allocationRange, coverGaps, leaveRange } from '../../domain/leave';
import { LEAVE_TYPE_SHORT, type Allocation, type DateRange, type Staff } from '../../domain/types';
import { byName, lookups, type PlanData } from './shared';

interface Line {
  text: string;
  kind?: 'leave' | 'cover' | 'gap';
}
interface Cell {
  lines: Line[];
  cls: string;
  title?: string;
}

/**
 * Staff × weekdays. Expands to Week A / Week B columns only when someone's
 * days differ between the two weeks. Leave shows on the holder's cell with
 * who is covering, and cover shows on the coverer's cell with whose leave.
 * Choosing an "as at" date shows only what applies on that day.
 */
export function WeeklyGrid({ data }: { data: PlanData }) {
  const [asAt, setAsAt] = useState('');
  const { roleById, staffById } = lookups(data);
  const name = (id: string) => staffById.get(id)?.name ?? 'Deleted staff member';
  const roleName = (id: string) => roleById.get(id)?.name ?? 'Deleted role';

  const fortnightly = [
    ...data.staff.map((s) => s.workPattern),
    ...data.roles.map((r) => r.days),
    ...data.allocations.map((a) => a.days),
    ...data.leave.map((l) => l.daysAffected),
  ].some((p) => !repeatsWeekly(p));
  const columns = fortnightly ? [...Array(FORTNIGHT_DAYS).keys()] : [...WEEKDAYS.keys()];
  const staff = [...data.staff].sort(byName);
  const activeRange = (r: DateRange) => !asAt || containsDate(r, asAt);
  // Whole-year view names the dates; the as-at view doesn't need them.
  const when = (r: DateRange) => (asAt ? '' : `, ${formatRange(r)}`);

  const cellFor = (s: Staff, indices: number[]): Cell => {
    const hits = (days: readonly boolean[]) => indices.some((d) => days[d]);
    const here = data.allocations.filter(
      (a) => a.staffId === s.id && hits(a.days.days) && activeRange(allocationRange(a)),
    );
    const works = hits(s.workPattern.days);
    if (here.length === 0) return { lines: [{ text: works ? 'unallocated' : '—' }], cls: works ? 'free' : 'off' };

    const lines: Line[] = [];
    let onLeave = false;
    let covering = false;
    let uncovered = false;
    for (const a of here) {
      if (a.coveringLeaveId) {
        covering = true;
        const leave = data.leave.find((l) => l.id === a.coveringLeaveId);
        lines.push({ text: roleName(a.roleId) });
        lines.push({
          kind: 'cover',
          text: `cover for ${leave ? name(leave.staffId) : 'deleted leave'}${when(allocationRange(a))}`,
        });
        continue;
      }
      lines.push({ text: roleName(a.roleId) });
      const leaves = data.leave.filter(
        (l) => l.staffId === s.id && hits(l.daysAffected.days) && hits(a.days.days) && activeRange(leaveRange(l)),
      );
      for (const l of leaves) {
        const range = intersectRange(leaveRange(l), allocationRange(a));
        if (!range) continue;
        onLeave = true;
        lines.push({ kind: 'leave', text: `On ${LEAVE_TYPE_SHORT[l.leaveType]}${when(range)}` });
        const covers = data.allocations.filter(
          (c) =>
            c.coveringLeaveId === l.id &&
            c.roleId === a.roleId &&
            hits(c.days.days) &&
            activeRange(allocationRange(c)),
        );
        for (const c of covers) lines.push({ kind: 'cover', text: `Cover: ${name(c.staffId)}${when(allocationRange(c))}` });
        const gaps = coverGaps(l, data.allocations).filter(
          (g) => g.roleId === a.roleId && g.days.some((d) => indices.includes(d)) && activeRange(g.range),
        );
        for (const g of gaps) {
          uncovered = true;
          lines.push({ kind: 'gap', text: `No cover${when(g.range)}` });
        }
      }
    }

    // A clash is two allocations on the same day whose dates overlap, or
    // work on a day the person doesn't work.
    const clash =
      here.some((a, i) =>
        here.slice(i + 1).some((b: Allocation) => datesOverlap(a, b) && indices.some((d) => a.days.days[d] && b.days.days[d])),
      ) || here.some((a) => indices.some((d) => a.days.days[d] && !s.workPattern.days[d]));
    const cls = clash ? 'clash' : uncovered ? 'gap' : onLeave ? 'onleave' : covering ? 'covering' : 'allocated';
    return { lines, cls, title: clash ? 'Conflict: see warnings' : undefined };
  };

  if (staff.length === 0) return <p className="muted">No staff yet.</p>;

  return (
    <section>
      <div className="inline-form">
        <label>
          As at{' '}
          <input type="date" value={asAt} onChange={(e) => setAsAt(e.target.value)} aria-label="As at date" />
        </label>
        {asAt ? (
          <button type="button" className="secondary" onClick={() => setAsAt('')}>
            Show whole year
          </button>
        ) : (
          <span className="muted small">Showing the whole year, with leave and cover dates.</span>
        )}
      </div>
      <p className="muted small">
        {asAt ? `As at ${formatDate(asAt)}. ` : ''}
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
                const cell = cellFor(s, fortnightly ? [i] : [i, i + WEEKDAYS.length]);
                return (
                  <td key={i} className={`cell ${cell.cls}`} title={cell.title}>
                    {cell.lines.map((l, j) => (
                      <div key={j} className={l.kind ? `line ${l.kind}` : 'line'}>
                        {l.text}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="legend small">
        <span className="cell allocated">Allocated</span> <span className="cell onleave">On leave, covered</span>{' '}
        <span className="cell gap">On leave, not covered</span> <span className="cell covering">Covering leave</span>{' '}
        <span className="cell free">Works, unallocated</span> <span className="cell off">Doesn't work</span>{' '}
        <span className="cell clash">Conflict</span>
      </p>
    </section>
  );
}
