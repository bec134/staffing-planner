import { useState } from 'react';
import { Link } from 'react-router-dom';
import { daysBetween, formatRange, intersectRange, yearRange } from '../../domain/dates';
import { describeDayIndices } from '../../domain/dayPattern';
import { leaveLink, roleLink } from '../../domain/flags';
import { allocationRange, coverGaps, leaveRange } from '../../domain/leave';
import { LEAVE_TYPE_LABELS, type DateRange } from '../../domain/types';
import { bySortOrder, daysLabel, lookups, type PlanData } from '../allocation/shared';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Bar {
  key: string;
  range: DateRange;
  kind: 'held' | 'leave' | 'cover' | 'gap';
  label: string;
  link?: string;
}

/** Each position across the year: who holds it, leave, cover and gaps. */
export function Timeline({ data }: { data: PlanData }) {
  const [showAll, setShowAll] = useState(false);
  const year = yearRange(data.planningYear.year);
  const span = daysBetween(year.start, year.end) + 1;
  const { staffById } = lookups(data);
  const name = (id: string) => staffById.get(id)?.name ?? 'Deleted staff member';

  const position = (r: DateRange) => {
    const clipped = intersectRange(r, year);
    if (!clipped) return null;
    const left = (daysBetween(year.start, clipped.start) / span) * 100;
    const width = ((daysBetween(clipped.start, clipped.end) + 1) / span) * 100;
    return { left: `${left}%`, width: `${Math.max(width, 0.6)}%` };
  };

  const rows = [...data.roles].sort(bySortOrder).flatMap((role) => {
    const own = data.allocations.filter((a) => a.roleId === role.id && !a.coveringLeaveId);
    const leaves = data.leave.filter((l) => own.some((a) => a.staffId === l.staffId));
    if (!showAll && leaves.length === 0) return [];
    const lanes: Bar[][] = own.map((a) => [
      { key: a.id, range: allocationRange(a), kind: 'held', label: `${name(a.staffId)} (${daysLabel(a.days)})` },
      ...leaves
        .filter((l) => l.staffId === a.staffId)
        .map((l): Bar => ({
          key: `${a.id}-${l.id}`,
          range: leaveRange(l),
          kind: 'leave',
          label: `${LEAVE_TYPE_LABELS[l.leaveType]} (${daysLabel(l.daysAffected)})`,
          link: leaveLink(l.id),
        })),
    ]);
    const covers = data.allocations.filter((a) => a.roleId === role.id && a.coveringLeaveId);
    for (const c of covers) {
      lanes.push([
        {
          key: c.id,
          range: allocationRange(c),
          kind: 'cover',
          label: `Cover: ${name(c.staffId)} (${daysLabel(c.days)})`,
          link: leaveLink(c.coveringLeaveId!),
        },
      ]);
    }
    const gaps = leaves.flatMap((l) => coverGaps(l, data.allocations).filter((g) => g.roleId === role.id));
    if (gaps.length) {
      lanes.push(
        gaps.map((g, i) => ({
          key: `gap-${i}`,
          range: g.range,
          kind: 'gap',
          label: `No cover: ${describeDayIndices(g.days)}`,
        })),
      );
    }
    return [{ role, lanes }];
  });

  return (
    <section>
      <label className="field">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show positions with
        no leave
      </label>
      {rows.length === 0 ? (
        <p className="muted">No positions are affected by leave.</p>
      ) : (
        <div className="timeline" role="table" aria-label={`Positions across ${data.planningYear.year}`}>
          <div className="tl-row tl-head" role="row">
            <div className="tl-label" role="columnheader">
              Position
            </div>
            <div className="tl-track" role="columnheader">
              {MONTHS.map((m, i) => (
                <span key={m} className="tl-month" style={{ left: `${(i / 12) * 100}%` }}>
                  {m}
                </span>
              ))}
            </div>
          </div>
          {rows.map(({ role, lanes }) => (
            <div className="tl-row" role="row" key={role.id}>
              <div className="tl-label" role="rowheader">
                <Link to={roleLink(role.id)}>{role.name}</Link>
              </div>
              <div className="tl-lanes" role="cell">
                {lanes.map((bars, i) => (
                  <div className="tl-track" key={i}>
                    {bars.map((b) => {
                      const pos = position(b.range);
                      if (!pos) return null;
                      const text = `${b.label}, ${formatRange(intersectRange(b.range, year)!)}`;
                      return (
                        <div key={b.key} className={`tl-bar ${b.kind}`} style={pos} title={text}>
                          {b.link ? <Link to={b.link}>{b.label}</Link> : b.label}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="legend small">
        <span className="tl-bar held">Holds the position</span> <span className="tl-bar leave">On leave</span>{' '}
        <span className="tl-bar cover">Cover</span> <span className="tl-bar gap">No cover</span>
      </p>
    </section>
  );
}
