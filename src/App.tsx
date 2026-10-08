import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { PlanningYearProvider } from './components/PlanningYearContext';
import { EntitlementPage } from './pages/entitlement/EntitlementPage';
import { OverviewPage } from './pages/OverviewPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

/** Modules in build-priority order (PLAN.md "Scope and build priority"). */
export const MODULES = [
  { path: '/entitlement', label: 'Entitlement', phase: 2 },
  { path: '/allocation', label: 'Staff & allocation', phase: 3 },
  { path: '/leave', label: 'Leave cover', phase: 4 },
  { path: '/classes', label: 'Class structures', phase: 5 },
  { path: '/intentions', label: 'Staff intentions', phase: 6 },
  { path: '/reports', label: 'Export & reports', phase: 7 },
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
              {MODULES.map((m) => (
                <li key={m.path}>
                  <NavLink to={m.path}>{m.label}</NavLink>
                </li>
              ))}
            </ul>
            <p className="nav-note">Data stays in this browser. Nothing is sent to a server.</p>
          </nav>
          <main className="content">
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/entitlement" element={<EntitlementPage />} />
              {MODULES.filter((m) => m.path !== '/entitlement').map((m) => (
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
