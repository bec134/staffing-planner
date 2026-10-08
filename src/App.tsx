import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { PlanningYearProvider } from './components/PlanningYearContext';
import { WarningsPanel } from './components/WarningsPanel';
import { AllocationPage } from './pages/allocation/AllocationPage';
import { ClassStructuresPage } from './pages/classes/ClassStructuresPage';
import { EntitlementPage } from './pages/entitlement/EntitlementPage';
import { LeavePage } from './pages/leave/LeavePage';
import { MatchingPage } from './pages/matching/MatchingPage';
import { OverviewPage } from './pages/OverviewPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

/** Modules in build-priority order (PLAN.md "Scope and build priority"). */
export const MODULES = [
  { path: '/entitlement', label: 'Entitlement', phase: 2, part: 1 },
  { path: '/matching', label: 'Match staff', phase: 2, part: 1 },
  { path: '/classes', label: 'Class structures', phase: 5, part: 2 },
  { path: '/allocation', label: 'Staff & allocation', phase: 3, part: 2 },
  { path: '/leave', label: 'Leave cover', phase: 4, part: 2 },
  { path: '/intentions', label: 'Staff intentions', phase: 6, part: 0 },
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
            </ul>
            <p className="nav-note">Data stays in this browser. Nothing is sent to a server.</p>
          </nav>
          <main className="content">
            <WarningsPanel />
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/entitlement" element={<EntitlementPage />} />
              <Route path="/allocation/*" element={<AllocationPage />} />
              <Route path="/leave/*" element={<LeavePage />} />
              <Route path="/classes" element={<ClassStructuresPage />} />
              <Route path="/matching" element={<MatchingPage />} />
              {MODULES.filter((m) => !['/entitlement', '/allocation', '/leave', '/classes', '/matching'].includes(m.path)).map((m) => (
                <Route key={m.path} path={m.path} element={<PlaceholderPage title={m.label} phase={m.phase} />} />
              ))}
              <Route path="*" element={<PlaceholderPage title="Not found" />} />
            </Routes>
          </main>
        </div>
      </PlanningYearProvider>
    </HashRouter>
  );
}
