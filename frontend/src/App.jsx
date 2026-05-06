import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import CallFormPage from './pages/CallFormPage';
import PatientsPage from './pages/PatientsPage';
import UserManualPage from './pages/UserManualPage';
import EmployeesPage from './pages/EmployeesPage';
import CrewPlannerPage from './pages/CrewPlannerPage';

function App() {
  /*
    Adds Bootstrap active styling to the current navigation link.
  */
  const getNavLinkClass = ({ isActive }) =>
    `nav-link${isActive ? ' active fw-semibold' : ''}`;

  return (
    /*
      HashRouter is used instead of BrowserRouter because the app
      is deployed to GitHub Pages.

      GitHub Pages does not properly handle direct requests to
      client-side routes like /employees or /crew-planner.

      HashRouter keeps the route after the # symbol, for example:
      /#/employees

      This prevents 404 errors when:
      - refreshing the page
      - opening a route directly
      - sharing a direct link to a page
    */
    <HashRouter>
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
        <div className="container-fluid px-3">
          <span className="navbar-brand fw-bold">Call Taking Form</span>

          <div className="navbar-nav ms-3">
            <NavLink to="/" end className={getNavLinkClass}>
              Call Form
            </NavLink>

            <NavLink to="/patients" className={getNavLinkClass}>
              Patients
            </NavLink>

            <NavLink to="/manual" className={getNavLinkClass}>
              User Manual
            </NavLink>

            <NavLink to="/employees" className={getNavLinkClass}>
              Employees
            </NavLink>

            <NavLink to="/crew-planner" className={getNavLinkClass}>
              Crew Planner
            </NavLink>
          </div>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<CallFormPage />} />
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/manual" element={<UserManualPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/crew-planner" element={<CrewPlannerPage />} />
      </Routes>
    </HashRouter>
  );
}

export default App;