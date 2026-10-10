import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { HelpLink } from '../../components/HelpLink';
import { usePlanningYear } from '../../components/PlanningYearContext';
import { usePlanData } from '../../data/usePlanData';
import { RoleDetail } from './RoleDetail';
import { RoleGrid } from './RoleGrid';
import { RoleList } from './RoleList';
import { WeeklyGrid } from './WeeklyGrid';

export function AllocationPage() {
  const { current, loading } = usePlanningYear();
  const data = usePlanData(current?.id);

  if (loading) return <p>Loading…</p>;
  if (!current) {
    return (
      <section>
        <h1>Roles &amp; placement</h1>
        <p>
          No plan yet. <Link to="/">Create a planning year or load the sample plan</Link> first.
        </p>
      </section>
    );
  }
  if (!data) return <p>Loading…</p>;

  return (
    <section>
      <h1>Roles &amp; placement</h1>
      <HelpLink topic="allocation" />
      <p className="muted">
        Part 2: place staff in classes and roles, by day. Staff are added on the <Link to="/staff">Staff</Link> page.
      </p>
      <nav className="tabs" aria-label="Placement views">
        <NavLink to="/allocation" end>
          Role grid
        </NavLink>
        <NavLink to="/allocation/roles">By role</NavLink>
        <NavLink to="/allocation/grid">Staff grid</NavLink>
      </nav>
      <Routes>
        <Route index element={<RoleGrid data={data} />} />
        <Route path="roles" element={<RoleList data={data} />} />
        <Route path="roles/:id" element={<RoleDetail data={data} />} />
        <Route path="grid" element={<WeeklyGrid data={data} />} />
        {/* Old addresses: staff moved to Part 1, and the role grid is now the first tab. */}
        <Route path="role-grid" element={<Navigate to="/allocation" replace />} />
        <Route path="staff/:id" element={<StaffRedirect />} />
        <Route path="import" element={<Navigate to="/staff/import" replace />} />
      </Routes>
    </section>
  );
}

function StaffRedirect() {
  const { id } = useParams();
  return <Navigate to={`/staff/${id}`} replace />;
}
