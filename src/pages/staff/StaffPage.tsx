import { useMemo } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { HelpLink } from '../../components/HelpLink';
import { usePlanningYear } from '../../components/PlanningYearContext';
import { computeFlags, flagInputFrom } from '../../domain/flags';
import { usePlanData } from '../../data/usePlanData';
import { StaffDetail } from './StaffDetail';
import { StaffImport } from './StaffImport';
import { StaffList } from './StaffList';

/** Part 1 (Bec): add staff, by hand or from CSV, before matching them. */
export function StaffPage() {
  const { current, loading } = usePlanningYear();
  const data = usePlanData(current?.id);
  const flags = useMemo(() => (data ? computeFlags(flagInputFrom(data)) : []), [data]);

  if (loading) return <p>Loading…</p>;
  if (!current) {
    return (
      <section>
        <h1>Staff</h1>
        <p>
          No plan yet. <Link to="/">Create a planning year, restore a backup or load the sample plan</Link> first.
        </p>
      </section>
    );
  }
  if (!data) return <p>Loading…</p>;

  return (
    <section>
      <h1>Staff</h1>
      <HelpLink topic="staff" />
      <nav className="tabs" aria-label="Staff views">
        <NavLink to="/staff" end>
          All staff
        </NavLink>
        <NavLink to="/staff/import">Import CSV</NavLink>
      </nav>
      <Routes>
        <Route index element={<StaffList data={data} flags={flags} />} />
        <Route path="import" element={<StaffImport data={data} />} />
        <Route path=":id" element={<StaffDetail data={data} flags={flags} />} />
      </Routes>
    </section>
  );
}
