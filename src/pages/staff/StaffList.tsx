import { useState } from 'react';
import { Link } from 'react-router-dom';
import { staffBusyDays } from '../../domain/allocation';
import { subtract } from '../../domain/dayPattern';
import type { Flag } from '../../domain/flags';
import { staffLink } from '../../domain/flags';
import { formatFte, milliFteOf } from '../../domain/fte';
import { describeShares } from '../../domain/substantive';
import { describeGrades, intentionForStaff } from '../../domain/intentions';
import { EMPLOYMENT_TYPE_LABELS } from '../../domain/types';
import { PendingDetails } from './PendingDetails';
import { StaffForm } from './StaffForm';
import { byName, daysLabel, lookups, type PlanData } from '../allocation/shared';

export function StaffList({ data, flags }: { data: PlanData; flags: Flag[] }) {
  const [adding, setAdding] = useState(false);
  const { roleById } = lookups(data);
  const staff = [...data.staff].sort(byName);

  return (
    <section>
      <PendingDetails data={data} />
      <div className="actions">
        {!adding && <button onClick={() => setAdding(true)}>Add staff member</button>}
        <Link to="/staff/import" className="button-link secondary">
          Import from CSV
        </Link>
      </div>
      {adding && (
        <StaffForm data={data} onDone={() => setAdding(false)} />
      )}
      {staff.length === 0 ? (
        <p className="muted">No staff yet. Add them one at a time or import a CSV.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Employment</th>
              <th>Substantive role</th>
              <th>Days worked</th>
              <th className="num">FTE</th>
              <th>Grades</th>
              <th>Allocated to</th>
              <th>Unallocated days</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const allocations = data.allocations.filter((a) => a.staffId === s.id);
              const unallocated = subtract(s.workPattern, staffBusyDays(s.id, data.allocations));
              const warnings = flags.filter((f) => f.link === staffLink(s.id)).length;
              return (
                <tr key={s.id}>
                  <td>
                    <Link to={staffLink(s.id)}>{s.name}</Link>
                    {s.nominatedForTransfer && (
                      <span className="badge warn" title={s.transferNotes || 'Nominated for transfer'}>
                        transfer
                      </span>
                    )}
                    {warnings > 0 && (
                      <span className="badge warn" title={`${warnings} warning(s)`}>
                        ⚠ {warnings}
                      </span>
                    )}
                  </td>
                  <td>{EMPLOYMENT_TYPE_LABELS[s.employmentType]}</td>
                  <td>
                    {describeShares(s) || <span className="muted">—</span>}
                  </td>
                  <td>{daysLabel(s.workPattern)}</td>
                  <td className="num">{formatFte(milliFteOf(s.workPattern))}</td>
                  <td>{describeGrades(intentionForStaff(s, data.intentions)?.gradePreferences ?? []) || <span className="muted">—</span>}</td>
                  <td>
                    {allocations.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      allocations.map((a) => (
                        <div key={a.id}>
                          {roleById.get(a.roleId)?.name ?? 'Deleted role'}{' '}
                          <span className="muted small">({daysLabel(a.days)})</span>
                        </div>
                      ))
                    )}
                  </td>
                  <td>{daysLabel(unallocated) === 'none' ? <span className="muted">—</span> : daysLabel(unallocated)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
