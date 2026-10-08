import { useState } from 'react';
import { DayPatternEditor } from '../../components/DayPatternEditor';
import { validateLeave } from '../../domain/leave';
import { LEAVE_TYPES, LEAVE_TYPE_LABELS, type Leave, type LeaveType } from '../../domain/types';
import { useRepository } from '../../data/RepositoryContext';
import { byName, type PlanData } from '../allocation/shared';

export function LeaveForm({ data, existing, onDone }: { data: PlanData; existing?: Leave; onDone(saved?: Leave): void }) {
  const repo = useRepository();
  const staffList = [...data.staff].sort(byName);
  const [staffId, setStaffId] = useState(existing?.staffId ?? '');
  const staff = data.staff.find((s) => s.id === staffId);
  const [leaveType, setLeaveType] = useState<LeaveType>(existing?.leaveType ?? 'lsl');
  const [startDate, setStartDate] = useState(existing?.startDate ?? '');
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  const [days, setDays] = useState(existing?.daysAffected ?? null);
  // Until chosen, leave covers every day the person works.
  const daysAffected = days ?? staff?.workPattern ?? null;
  const errors = staff && daysAffected ? validateLeave({ startDate, endDate, daysAffected }, staff) : ['Choose a staff member'];

  const save = async () => {
    if (errors.length || !staff || !daysAffected) return;
    const leave: Leave = {
      id: existing?.id ?? crypto.randomUUID(),
      planningYearId: data.planningYear.id,
      staffId: staff.id,
      leaveType,
      startDate,
      endDate,
      daysAffected,
    };
    await repo.leave.put(leave);
    onDone(leave);
  };

  return (
    <form
      className="panel"
      aria-label={existing ? 'Edit leave' : 'Add leave'}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="form-grid">
        <label>
          Staff member{' '}
          <select
            value={staffId}
            disabled={!!existing}
            onChange={(e) => {
              setStaffId(e.target.value);
              setDays(null);
            }}
          >
            <option value="">Choose…</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Leave type{' '}
          <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {LEAVE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          First day <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          Last day <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      {staff && daysAffected && (
        <DayPatternEditor
          legend="Days on leave"
          value={daysAffected}
          onChange={setDays}
          allowed={staff.workPattern}
          allowModeSwitch
        />
      )}
      {staff && errors.length > 0 && (startDate || endDate) && (
        <ul className="field-error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="submit" disabled={errors.length > 0}>
          {existing ? 'Save leave' : 'Add leave'}
        </button>
        <button type="button" className="secondary" onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
