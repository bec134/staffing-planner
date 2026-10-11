import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { PlanningYearProvider } from './components/PlanningYearContext';
import { WarningsPanel } from './components/WarningsPanel';
import { AllocationPage } from './pages/allocation/AllocationPage';
import { ClassStructuresPage } from './pages/classes/ClassStructuresPage';
import { EntitlementPage } from './pages/entitlement/EntitlementPage';
import { LeavePage } from './pages/leave/LeavePage';
import { MatchingPage } from './pages/matching/MatchingPage';
import { OverviewPage } from './pages/OverviewPage';
import { HelpPage } from './pages/help/HelpPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { StaffPage } from './pages/staff/StaffPage';

/** Modules in the order they are used each year (Bec: staff are added in Part 1). */
export const MODULES = [
  { path: '/entitlement', label: 'Entitlement', phase: 2, part: 1 },
  { path: '/staff', label: 'Staff', phase: 3, part: 1 },
  { path: '/matching', label: 'Match staff', phase: 2, part: 1 },
  // Whole-year leave is backfilled in Part 1 (Bec), so leave lives there.
  { path: '/leave', label: 'Leave cover', phase: 4, part: 1 },
  { path: '/classes', label: 'Class structures', phase: 5, part: 2 },
  { path: '/allocation', label: 'Roles & placement', phase: 3, part: 2 },
  { path: '/reports', label: 'Export & reports', phase: 7, part: 0 },
] as const;

/** Menu groups (Bec): Part 1 matches staff to entitlement; Part 2 places them. */
const PARTS = [
  { part: 1, label: 'Part 1 · Entitlement' },
  { part: 2, label: 'Part 2 · Placement' },
  { part: 0, label: '' },
] as const;

export function App() {
  return (
    <HashRouter>
      <PlanningYearProvider>
        <div className="shell">
          <nav className="sidenav" aria-label="Main">
            <div className="brand">Staffing Planner</div>
            <ul>
              <li>
                <NavLink to="/" end>
                  Overview
                </NavLink>
              </li>
              {PARTS.map((g) => [
                g.label && (
                  <li key={`part-${g.part}`} className="nav-part">
                    {g.label}
                  </li>
                ),
                ...MODULES.filter((m) => m.part === g.part).map((m) => (
                  <li key={m.path}>
                    <NavLink to={m.path}>{m.label}</NavLink>
                  </li>
                )),
              ])}
              <li className="nav-help">
                <NavLink to="/help">Help</NavLink>
              </li>
            </ul>
            <p className="nav-note">Data stays in this browser. Nothing is sent to a server.</p>
          </nav>
          <main className="content">
            <WarningsPanel />
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/entitlement" element={<EntitlementPage />} />
              <Route path="/staff/*" element={<StaffPage />} />
              <Route path="/allocation/*" element={<AllocationPage />} />
              <Route path="/leave/*" element={<LeavePage />} />
              <Route path="/classes" element={<ClassStructuresPage />} />
              <Route path="/matching" element={<MatchingPage />} />
              {/* Staff intentions are now part of the staff form (Bec). */}
              <Route path="/intentions" element={<Navigate to="/staff" replace />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/help/*" element={<HelpPage />} />
              <Route path="*" element={<PlaceholderPage title="Not found" />} />
            </Routes>
          </main>
        </div>
      </PlanningYearProvider>
    </HashRouter>
  );
}
