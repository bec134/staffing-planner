import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { HelpLink } from '../../components/HelpLink';
import { usePlanningYear } from '../../components/PlanningYearContext';
import { usePlanData } from '../../data/usePlanData';
import { LeaveDetail } from './LeaveDetail';
import { LeaveList } from './LeaveList';
import { TermDates } from './TermDates';
import { Timeline } from './Timeline';
import { UncoveredList } from './UncoveredList';

export function LeavePage() {
  const { current, loading } = usePlanningYear();
  const data = usePlanData(current?.id);

  if (loading) return <p>Loading…</p>;
  if (!current) {
    return (
      <section>
        <h1>Leave cover</h1>
        <p>
          No plan yet. <Link to="/">Create a planning year or load the sample plan</Link> first.
        </p>
      </section>
    );
  }
  if (!data) return <p>Loading…</p>;

  return (
    <section>
      <h1>Leave cover</h1>
      <HelpLink topic="leave" />
      <nav className="tabs" aria-label="Leave views">
        <NavLink to="/leave" end>
          Leave
        </NavLink>
        <NavLink to="/leave/uncovered">Uncovered</NavLink>
        <NavLink to="/leave/timeline">Timeline</NavLink>
        <NavLink to="/leave/terms">Term dates</NavLink>
      </nav>
      <Routes>
        <Route index element={<LeaveList data={data} />} />
        <Route path="uncovered" element={<UncoveredList data={data} />} />
        <Route path="timeline" element={<Timeline data={data} />} />
        <Route path="terms" element={<TermDates key={data.planningYear.id} data={data} />} />
        <Route path=":id" element={<LeaveDetail data={data} />} />
      </Routes>
    </section>
  );
}
