import { useState } from 'react';
import { Link } from 'react-router-dom';
import { leaveLink } from '../../domain/flags';
import { formatFte, milliFteOf } from '../../domain/fte';
import { daysLabel, type PlanData } from '../allocation/shared';
import { LeaveForm } from './LeaveForm';
import { COVER_STATUS_LABELS, coverStatus, leaveDates, leaveTitle } from './leaveShared';

export function LeaveList({ data }: { data: PlanData }) {
  const [adding, setAdding] = useState(false);
  const leave = [...data.leave].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    <section>
      <div className="actions">{!adding && <button onClick={() => setAdding(true)}>Add leave</button>}</div>
      {adding && <LeaveForm data={data} onDone={() => setAdding(false)} />}
      {leave.length === 0 ? (
        <p className="muted">No leave recorded.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Leave</th>
              <th>Dates</th>
              <th>Days</th>
              <th className="num">FTE</th>
              <th>Cover</th>
            </tr>
          </thead>
          <tbody>
            {leave.map((l) => {
              const status = coverStatus(l, data);
              return (
                <tr key={l.id}>
                  <td>
                    <Link to={leaveLink(l.id)}>{leaveTitle(l, data)}</Link>
                  </td>
                  <td>{leaveDates(l)}</td>
                  <td>{daysLabel(l.daysAffected)}</td>
                  <td className="num">{formatFte(milliFteOf(l.daysAffected))}</td>
                  <td>
                    <span className={`status ${status}`}>{COVER_STATUS_LABELS[status]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
