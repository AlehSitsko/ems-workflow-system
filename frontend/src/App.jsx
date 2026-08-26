import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createHashRouter, RouterProvider, Outlet, Navigate } from "react-router-dom";

import "./App.css";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./components/ui/ToastProvider";
import { ConfirmProvider } from "./components/ui/ConfirmDialog";
import { UserSettingsProvider } from "./context/UserSettingsContext";

import AppShell from "./components/layout/AppShell";
import PortalLayout from "./components/portal/PortalLayout";

import HomePage from "./pages/HomePage";
import CallFormPage from "./pages/CallFormPage";
import CallsPage from "./pages/CallsPage";
import SupervisorDashboardPage from "./pages/SupervisorDashboardPage";
import ReportsPage from "./pages/ReportsPage";
import CrewPunctualityPage from "./pages/CrewPunctualityPage";
import LoginPage from "./pages/LoginPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import PlatformConsolePage from "./pages/platform/PlatformConsolePage";
import UserManagementPage from "./pages/UserManagementPage";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";
import KioskPage from "./pages/KioskPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import NotificationsListener from "./components/NotificationsListener";
import PayrollPage from "./pages/PayrollPage";
import ComplianceDashboardPage from "./pages/ComplianceDashboardPage";
import AuditLogPage from "./pages/AuditLogPage";

// Lazy-loaded: the heaviest pages, split into their own chunks so the initial
// bundle stays smaller. AppLayout/sidebar render immediately either way —
// only the page content area shows the fallback while the chunk loads.
const LeaveReviewPage = lazy(() => import("./pages/LeaveReviewPage"));
const SchedulingInboxPage = lazy(() => import("./pages/SchedulingInboxPage"));
const CallWorkspacePage = lazy(() => import("./pages/calls/CallWorkspacePage"));
const ConfirmationRoundPage = lazy(() => import("./pages/calls/ConfirmationRoundPage"));
const DayCloseoutPage = lazy(() => import("./pages/operations/DayCloseoutPage"));
const PortalPage = lazy(() => import("./pages/portal/PortalPage"));
const DayTimelinePage = lazy(() => import("./pages/operations/DayTimelinePage"));
const RecurringTripsPage = lazy(() => import("./pages/calls/RecurringTripsPage"));
const PatientsPage = lazy(() => import("./pages/PatientsPage"));
const PatientWorkspacePage = lazy(() => import("./pages/patients/PatientWorkspacePage"));
const PatientFormPage = lazy(() => import("./pages/patients/PatientFormPage"));
const UserManualPage = lazy(() => import("./pages/UserManualPage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const EmployeeWorkspacePage = lazy(() => import("./pages/employees/EmployeeWorkspacePage"));
const EmployeeFormPage = lazy(() => import("./pages/employees/EmployeeFormPage"));
const CrewPlannerPage = lazy(() => import("./pages/CrewPlannerPage"));
const DispatchBoardPage = lazy(() => import("./pages/DispatchBoardPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const VehiclesListPage = lazy(() => import("./pages/fleet/VehiclesListPage"));
const VehicleWorkspacePage = lazy(() => import("./pages/fleet/VehicleWorkspacePage"));
const VehicleFormPage = lazy(() => import("./pages/fleet/VehicleFormPage"));

function PageFallback() {
  return <div className="page-stack"><p className="text-muted">Loading...</p></div>;
}

import {
  getCurrentUser,
  fetchCurrentUser,
  saveCurrentUser,
  logoutUser,
  clearLocalSession,
  hasSupervisorAccess,
  hasPatientAccess,
  hasEmployeeAccess,
  hasLeaveReviewAccess,
  hasCrewPlannerAccess,
  hasAdminAccess,
  hasDispatchAccess,
  hasFleetAccess,
  isEmployeePortalUser,
} from "./api/authApi";
import { onSessionExpired, resetSessionExpiry } from "./api/sessionExpiry";

// The route guards live at module scope (stable component identities) and read the
// signed-in user + logout handler from this context, which App provides. They used to
// be redefined inside App on every render — the source of the useMemo dependency
// warning, and a define-a-component-in-render anti-pattern that would churn the router.
const GuardContext = createContext({ currentUser: null, onLogout: () => {} });

// Wrap protected pages inside the shared application layout. An employee has no
// operational surface, so they never render the ops shell — they are sent to their
// portal instead. Every ops route bounces a non-matching role to /home, so this one
// check catches employees for the whole ops app.
function ProtectedLayout({ children }) {
  const { currentUser, onLogout } = useContext(GuardContext);
  if (!currentUser) return <Navigate to="/login" replace />;
  if (isEmployeePortalUser(currentUser)) return <Navigate to="/portal" replace />;
  return <AppShell currentUser={currentUser} onLogout={onLogout}>{children}</AppShell>;
}

// The employee self-service portal — its own shell, gated to the employee role.
function PortalRoute({ children }) {
  const { currentUser, onLogout } = useContext(GuardContext);
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!isEmployeePortalUser(currentUser)) return <Navigate to="/home" replace />;
  return <PortalLayout currentUser={currentUser} onLogout={onLogout}>{children}</PortalLayout>;
}

// Prevent logged-in users from staying on the login page; route by role.
function LoginRoute({ children }) {
  const { currentUser } = useContext(GuardContext);
  if (currentUser) {
    return <Navigate to={isEmployeePortalUser(currentUser) ? "/portal" : "/home"} replace />;
  }
  return children;
}

// A protected ops page: require a session, apply an access predicate, then render
// inside the ops shell. Every specific guard below is this with its own predicate.
function OpsGuard({ allow, children }) {
  const { currentUser, onLogout } = useContext(GuardContext);
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!allow(currentUser)) return <Navigate to="/home" replace />;
  return <AppShell currentUser={currentUser} onLogout={onLogout}>{children}</AppShell>;
}

// Patient/call pages.
function PatientRoute({ children }) {
  return <OpsGuard allow={hasPatientAccess}>{children}</OpsGuard>;
}
// Employee-record pages.
function EmployeeRoute({ children }) {
  return <OpsGuard allow={hasEmployeeAccess}>{children}</OpsGuard>;
}
// Leave review: HR and admin decide, a supervisor gets the read-only overview.
function LeaveRoute({ children }) {
  return <OpsGuard allow={hasLeaveReviewAccess}>{children}</OpsGuard>;
}
// Crew planning pages.
function CrewPlannerRoute({ children }) {
  return <OpsGuard allow={hasCrewPlannerAccess}>{children}</OpsGuard>;
}
// Dispatch board — not accessible to HR.
function DispatchRoute({ children }) {
  return <OpsGuard allow={hasDispatchAccess}>{children}</OpsGuard>;
}
// Fleet pages. Dispatchers get read-only visibility; HR has no reason to see the fleet.
function FleetRoute({ children }) {
  return <OpsGuard allow={hasFleetAccess}>{children}</OpsGuard>;
}
// Supervisor-level pages.
function SupervisorRoute({ children }) {
  return <OpsGuard allow={hasSupervisorAccess}>{children}</OpsGuard>;
}
// Tasks — visible to admin/supervisor/hr/dispatcher, each scoped to their own tasks server-side.
function TasksRoute({ children }) {
  return <OpsGuard allow={(u) => ["admin", "supervisor", "hr", "dispatcher"].includes(u.role)}>{children}</OpsGuard>;
}
// Admin-only pages.
function AdminRoute({ children }) {
  return <OpsGuard allow={hasAdminAccess}>{children}</OpsGuard>;
}

function App() {
  // The cached user gives the shell something to render immediately; the
  // session cookie is the actual identity, so it is confirmed with the server
  // below. A cached entry that no longer has a session behind it is discarded.
  const [currentUser, setCurrentUser] = useState(getCurrentUser());

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser().then((user) => {
      if (cancelled) return;
      if (user) {
        saveCurrentUser(user);
        setCurrentUser(user);
      } else {
        // No live session — clear the cache so the UI cannot show a signed-in
        // shell whose every request would come back 401.
        logoutUser();
        setCurrentUser(null);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // A 401 from the API means the session was revoked server-side (account
  // disabled/deleted or role changed): drop the local session so the router
  // sends this tab to /login immediately, instead of on the next navigation.
  useEffect(() => {
    onSessionExpired(() => {
      clearLocalSession();
      setCurrentUser(null);
    });
  }, []);

  // Save logged-in user in application state. Stable identity (setCurrentUser and the
  // imports it calls never change), so the router memo and guardValue don't churn.
  const handleLogin = useCallback((user) => {
    // Re-arm the expiry watch so a future revocation of this new session fires.
    resetSessionExpiry();
    setCurrentUser(user);
  }, []);

  // End the session server-side (the cookie is HttpOnly, so only the server can
  // clear it), then drop local state.
  const handleLogout = useCallback(async () => {
    await logoutUser();
    setCurrentUser(null);
  }, []);

  // The value the module-scope route guards read (see GuardContext). Memoised so the
  // Provider does not hand consumers a new object every render, and so it changes in
  // step with the router (both rebuild only when currentUser changes).
  const guardValue = useMemo(() => ({ currentUser, onLogout: handleLogout }), [currentUser, handleLogout]);

  // A data router (createHashRouter) rather than the <HashRouter> component, so
  // pages can use useBlocker to guard sidebar navigation against unsaved edits.
  // Rebuilt only when the signed-in user changes (login/logout already remount),
  // so ordinary navigation keeps one stable router instance.
  const router = useMemo(() => createHashRouter([
    {
      // Root layout: one Suspense boundary for every lazy page.
      element: <Suspense fallback={<PageFallback />}><Outlet /></Suspense>,
      children: [
        { path: "/", element: <Navigate to="/home" replace /> },

        // Kiosk — no auth required, but pass currentUser for the Back button.
        { path: "/kiosk", element: <KioskPage currentUser={currentUser} /> },

        // Invite acceptance — public; the invitee has no account/session yet.
        { path: "/accept-invite", element: <AcceptInvitePage /> },

        { path: "/login", element: <LoginRoute><LoginPage onLogin={handleLogin} /></LoginRoute> },

        { path: "/portal", element: <PortalRoute><PortalPage currentUser={currentUser} /></PortalRoute> },

        { path: "/home", element: <ProtectedLayout><HomePage currentUser={currentUser} /></ProtectedLayout> },
        { path: "/call-form", element: <PatientRoute><CallFormPage /></PatientRoute> },
        { path: "/patients", element: <PatientRoute><PatientsPage /></PatientRoute> },

        // "new" and ":patientId/edit" precede ":patientId", or the workspace
        // route swallows them and looks up a patient named "new".
        { path: "/patients/new", element: <PatientRoute><PatientFormPage currentUser={currentUser} /></PatientRoute> },
        { path: "/patients/:patientId/edit", element: <PatientRoute><PatientFormPage currentUser={currentUser} /></PatientRoute> },
        { path: "/patients/:patientId", element: <PatientRoute><PatientWorkspacePage currentUser={currentUser} /></PatientRoute> },

        { path: "/calls", element: <PatientRoute><CallsPage currentUser={currentUser} /></PatientRoute> },
        { path: "/supervisor", element: <SupervisorRoute><SupervisorDashboardPage /></SupervisorRoute> },
        { path: "/reports", element: <SupervisorRoute><ReportsPage /></SupervisorRoute> },
        { path: "/crew-punctuality", element: <DispatchRoute><CrewPunctualityPage /></DispatchRoute> },
        { path: "/manual", element: <ProtectedLayout><UserManualPage currentUser={currentUser} /></ProtectedLayout> },

        { path: "/employees", element: <EmployeeRoute><EmployeesPage /></EmployeeRoute> },
        { path: "/leave", element: <LeaveRoute><LeaveReviewPage currentUser={currentUser} /></LeaveRoute> },
        // "new" and ":employeeId/edit" must precede ":employeeId".
        { path: "/employees/new", element: <EmployeeRoute><EmployeeFormPage currentUser={currentUser} /></EmployeeRoute> },
        { path: "/employees/:employeeId/edit", element: <EmployeeRoute><EmployeeFormPage currentUser={currentUser} /></EmployeeRoute> },
        { path: "/employees/:employeeId", element: <EmployeeRoute><EmployeeWorkspacePage currentUser={currentUser} /></EmployeeRoute> },

        { path: "/users", element: <AdminRoute><UserManagementPage /></AdminRoute> },
        { path: "/crew-planner", element: <CrewPlannerRoute><CrewPlannerPage /></CrewPlannerRoute> },
        { path: "/dispatch", element: <DispatchRoute><DispatchBoardPage /></DispatchRoute> },
        { path: "/scheduling-inbox", element: <DispatchRoute><SchedulingInboxPage currentUser={currentUser} /></DispatchRoute> },
        { path: "/recurring-trips", element: <DispatchRoute><RecurringTripsPage /></DispatchRoute> },
        { path: "/day-closeout", element: <DispatchRoute><DayCloseoutPage currentUser={currentUser} /></DispatchRoute> },
        { path: "/operations/days/:date", element: <DispatchRoute><DayTimelinePage /></DispatchRoute> },
        { path: "/confirmation-round", element: <DispatchRoute><ConfirmationRoundPage currentUser={currentUser} /></DispatchRoute> },
        { path: "/calls/:callId", element: <DispatchRoute><CallWorkspacePage currentUser={currentUser} /></DispatchRoute> },
        { path: "/notifications", element: <ProtectedLayout><NotificationSettingsPage currentUser={currentUser} /></ProtectedLayout> },
        { path: "/payroll", element: <EmployeeRoute><PayrollPage /></EmployeeRoute> },
        { path: "/compliance", element: <EmployeeRoute><ComplianceDashboardPage currentUser={currentUser} /></EmployeeRoute> },
        { path: "/audit", element: <EmployeeRoute><AuditLogPage currentUser={currentUser} /></EmployeeRoute> },
        { path: "/tasks", element: <TasksRoute><TasksPage currentUser={currentUser} /></TasksRoute> },
        // Deep link straight to a task (shareable / bookmarkable) — opens its drawer.
        { path: "/tasks/:taskId", element: <TasksRoute><TasksPage currentUser={currentUser} /></TasksRoute> },

        { path: "/fleet/vehicles", element: <FleetRoute><VehiclesListPage currentUser={currentUser} /></FleetRoute> },
        // "new" must precede ":vehicleId".
        { path: "/fleet/vehicles/new", element: <FleetRoute><VehicleFormPage currentUser={currentUser} /></FleetRoute> },
        { path: "/fleet/vehicles/:vehicleId/edit", element: <FleetRoute><VehicleFormPage currentUser={currentUser} /></FleetRoute> },
        { path: "/fleet/vehicles/:vehicleId", element: <FleetRoute><VehicleWorkspacePage currentUser={currentUser} /></FleetRoute> },

        { path: "/calendar", element: <ProtectedLayout><CalendarPage currentUser={currentUser} /></ProtectedLayout> },

        { path: "*", element: <Navigate to="/home" replace /> },
      ],
    },
  ]), [currentUser, handleLogin]);

  // An expired password locks the whole app: the server refuses every other API
  // call, so there is nothing to render behind the router until it is rotated.
  const onPasswordChanged = (updated) => {
    saveCurrentUser(updated);
    setCurrentUser(updated);
  };

  return (
    <ThemeProvider>
    <ToastProvider>
    <ConfirmProvider>
    <UserSettingsProvider currentUser={currentUser}>
      {currentUser && currentUser.passwordExpired ? (
        <ChangePasswordPage user={currentUser} onChanged={onPasswordChanged} onLogout={handleLogout} />
      ) : currentUser && currentUser.is_platform_admin ? (
        // A platform super-admin belongs to no org and has no ops app — they get
        // the cross-org console instead of the router.
        <PlatformConsolePage currentUser={currentUser} onLogout={handleLogout} />
      ) : (
        <>
          {/* App-wide realtime notification engine (visual + sound). Mounted only
              when signed in, so its SSE connects with a session (mounting while
              logged out would open an unauthenticated stream that never recovers). */}
          {currentUser && <NotificationsListener currentUser={currentUser} />}
          <GuardContext.Provider value={guardValue}>
            <RouterProvider router={router} />
          </GuardContext.Provider>
        </>
      )}
    </UserSettingsProvider>
    </ConfirmProvider>
    </ToastProvider>
    </ThemeProvider>
  );
}

export default App;