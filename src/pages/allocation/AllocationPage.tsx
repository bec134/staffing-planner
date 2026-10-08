import { useMemo } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { usePlanningYear } from '../../components/PlanningYearContext';
import { computeFlags } from '../../domain/flags';
import { usePlanData } from '../../data/usePlanData';
import { RoleDetail } from './RoleDetail';
import { RoleList } from './RoleList';
import { StaffDetail } from './StaffDetail';
import { StaffImport } from './StaffImport';
import { StaffList } from './StaffList';
import { WeeklyGrid } from './WeeklyGrid';

export function AllocationPage() {
  const { current, loading } = usePlanningYear();
  const data = usePlanData(current?.id);
  const flags = useMemo(
    () =>
      data
        ? computeFlags({
            entitlement: data.entitlements[0],
            positionTypes: data.positionTypes,
            roles: data.roles,
            staff: data.staff,
            allocations: data.allocations,
          })
        : [],
    [data],
  );

  if (loading) return <p>Loading…</p>;
  if (!current) {
    return (
      <section>
        <h1>Staff &amp; allocation</h1>
        <p>
          No plan yet. <Link to="/">Create a planning year or load the sample plan</Link> first.
        </p>
      </section>
    );
  }
  if (!data) return <p>Loading…</p>;

  return (
    <section>
      <h1>Staff &amp; allocation</h1>
      <nav className="tabs" aria-label="Staff and allocation views">
        <NavLink to="/allocation" end>
          By staff
        </NavLink>
        <NavLink to="/allocation/roles">By role</NavLink>
        <NavLink to="/allocation/grid">Weekly grid</NavLink>
        <NavLink to="/allocation/import">Import CSV</NavLink>
      </nav>
      <Routes>
        <Route index element={<StaffList data={data} flags={flags} />} />
        <Route path="staff/:id" element={<StaffDetail data={data} flags={flags} />} />
        <Route path="roles" element={<RoleList data={data} />} />
        <Route path="roles/:id" element={<RoleDetail data={data} />} />
        <Route path="grid" element={<WeeklyGrid data={data} />} />
        <Route path="import" element={<StaffImport data={data} />} />
      </Routes>
    </section>
  );
}
