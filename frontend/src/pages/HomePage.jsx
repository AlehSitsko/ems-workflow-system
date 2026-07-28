import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { FaClock, FaPhoneAlt, FaArrowRight } from "react-icons/fa";

import { kioskStatus, kioskClockIn, kioskClockOut } from "../api/timeApi";
import { getTaskSummary } from "../api/tasksApi";
import { hasCallIntakeAccess, hasDispatchAccess } from "../api/authApi";
import { getNavigationItems } from "../config/routeMetadata";
import { resolveQuickLinkPaths, isWidgetHidden } from "../config/dashboardDefaults";
import { useAttentionCounts } from "../hooks/useAttentionCounts";
import { useUserSettings } from "../context/useUserSettings";
import { StatCard } from "../components/ui/Entity";
import { PageSection } from "../components/ui/Page";
import AttentionWidget from "../components/dashboard/AttentionWidget";
import TodayBoardWidget from "../components/dashboard/TodayBoardWidget";

const hasTaskAccess = (user) =>
  !!user && ["admin", "supervisor", "hr", "dispatcher"].includes(user.role);

/**
 * Task KPIs.
 *
 * Each tile links to the exact list it counted: the query mirrors the filter the
 * summary endpoint applied, and a backend test asserts the count and the list
 * agree. A number that opens a differently-filtered page is a lie about itself.
 */
function TaskSummaryWidget({ currentUser }) {
  const [summary, setSummary] = useState(null);
  const isManager = ["admin", "supervisor"].includes(currentUser?.role);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!hasTaskAccess(currentUser)) return;
    getTaskSummary(currentUser).then(setSummary).catch(() => setSummary(null));
  }, [currentUser]);

  if (!hasTaskAccess(currentUser) || !summary) return null;

  const cards = [
    { label: "My Open Tasks", value: summary.my_open, tone: "info", to: "/tasks?mine=1&open=1" },
    { label: "My Overdue Tasks", value: summary.my_overdue, tone: "danger", to: "/tasks?mine=1&overdue=1" },
    {
      label: "Tasks Due Today",
      value: summary.due_today,
      tone: "warning",
      to: `/tasks?mine=1&open=1&due_after=${today}&due_before=${today}`,
    },
  ];
  if (isManager) {
    cards.push(
      { label: "Unassigned Tasks", value: summary.unassigned_count, tone: "purple", to: "/tasks?unassigned=1&open=1" },
      { label: "Total Overdue", value: summary.total_overdue, tone: "danger", to: "/tasks?overdue=1" },
    );
  }

  return (
    <div className="stat-grid">
      {cards.map((c) => (
        <StatCard key={c.label} label={c.label} value={c.value} tone={c.tone} to={c.to} />
      ))}
    </div>
  );
}

function formatElapsed(clockInIso) {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(clockInIso).getTime()) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ClockWidget({ currentUser }) {
  const empId = currentUser?.employee_id || null;
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState(null);
  const [elapsed, setElapsed] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    if (!empId) return;
    kioskStatus(empId).then((s) => {
      setClockedIn(s.clocked_in);
      setClockInTime(s.clock_in);
    });
  }, [empId]);

  useEffect(() => {
    clearInterval(timerRef.current);
    if (clockedIn && clockInTime) {
      setElapsed(formatElapsed(clockInTime));
      timerRef.current = setInterval(() => setElapsed(formatElapsed(clockInTime)), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [clockedIn, clockInTime]);

  // Only staff linked to an employee record can clock in.
  if (!empId) return null;

  const handleClockIn = async () => {
    setLoading(true);
    setError("");
    try {
      await kioskClockIn(empId);
      setClockedIn(true);
      setClockInTime(new Date().toISOString());
    } catch (e) {
      setError(e.message || "Clock in failed");
    }
    setLoading(false);
  };

  const handleClockOut = async () => {
    setLoading(true);
    setError("");
    try {
      await kioskClockOut(empId);
      setClockedIn(false);
      setClockInTime(null);
      setElapsed("");
    } catch (e) {
      setError(e.message || "Clock out failed");
    }
    setLoading(false);
  };

  return (
    <div className={`clock-widget${clockedIn ? " on-shift" : ""}`}>
      <FaClock className="clock-widget-icon" aria-hidden="true" />
      {clockedIn ? (
        <>
          <div>
            <div className="clock-widget-label">Shift</div>
            <div className="clock-widget-elapsed">{elapsed}</div>
          </div>
          <button type="button" className="btn btn-sm btn-outline-danger" disabled={loading} onClick={handleClockOut}>
            {loading ? "…" : "Clock Out"}
          </button>
        </>
      ) : (
        <>
          <span className="clock-widget-idle">Not clocked in</span>
          <button type="button" className="btn btn-sm btn-success" disabled={loading} onClick={handleClockIn}>
            {loading ? "…" : "Clock In"}
          </button>
        </>
      )}
      {error && <span className="clock-widget-error" role="alert">{error}</span>}
    </div>
  );
}

/** One quick link. Fixed height so a row stays aligned. */
function QuickTile({ title, description, path, icon: Icon }) {
  return (
    <Link to={path} className="quick-tile">
      <span className="quick-tile-icon" aria-hidden="true"><Icon /></span>
      <span className="quick-tile-body">
        <span className="quick-tile-title">{title}</span>
        <span className="quick-tile-desc">{description}</span>
      </span>
    </Link>
  );
}

function QuickLinks({ currentUser, dashboardSettings }) {
  const allowed = getNavigationItems(currentUser);
  const wanted = resolveQuickLinkPaths(currentUser?.role, dashboardSettings);

  // Intersect with what this user may actually open, keeping the chosen order.
  // The intersection is also the security backstop: a stale saved path the user
  // may no longer open simply drops out rather than rendering a dead tile.
  const links = wanted
    .map((path) => allowed.find((item) => item.path === path))
    .filter(Boolean)
    .slice(0, 8);

  if (!links.length) return null;

  return (
    <PageSection title="Go to">
      <div className="quick-tile-grid">
        {links.map((item) => (
          <QuickTile
            key={item.path}
            title={item.title}
            description={item.subtitle}
            path={item.path}
            icon={item.icon}
          />
        ))}
      </div>
    </PageSection>
  );
}

/**
 * The dashboard answers one question: what do I need to do today?
 *
 * It used to answer a different one — "what pages exist?" — by rendering the
 * whole sidebar again as tiles. The sidebar already does that, and a catalogue
 * cannot tell anyone what is urgent. Every number below comes from an endpoint
 * that is already role-scoped server-side; nothing here is estimated, and a
 * widget with no data renders nothing rather than a zero.
 */
function HomePage({ currentUser }) {
  const { counts, loading: countsLoading } = useAttentionCounts(currentUser);
  const { settings } = useUserSettings();
  const dashboard = settings?.dashboard;
  const canTakeCalls = hasCallIntakeAccess(currentUser);
  const canSeeBoard = hasDispatchAccess(currentUser);

  return (
    <div className="dashboard-page">
      <section className="dashboard-welcome">
        <div className="dashboard-welcome-identity">
          <p className="dashboard-eyebrow">Welcome back</p>
          <h2 className="dashboard-welcome-name">{currentUser?.display_name || "User"}</h2>
          <p className="dashboard-welcome-date">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        <div className="dashboard-welcome-actions">
          {/* The header carries a compact version of this on every page; here it
              is the primary call to action, which is what a dashboard is for. */}
          {canTakeCalls && (
            <Link to="/call-form" className="btn dashboard-call-cta">
              <FaPhoneAlt aria-hidden="true" />
              Start Taking Call
            </Link>
          )}
          <ClockWidget currentUser={currentUser} />
        </div>
      </section>

      {/* "Needs attention" is the reason the dashboard exists — always shown. */}
      <AttentionWidget counts={counts} loading={countsLoading} />

      {canSeeBoard && !isWidgetHidden(dashboard, "todayBoard") && (
        <TodayBoardWidget currentUser={currentUser} />
      )}

      {!isWidgetHidden(dashboard, "tasks") && <TaskSummaryWidget currentUser={currentUser} />}

      {!isWidgetHidden(dashboard, "quickLinks") && (
        <QuickLinks currentUser={currentUser} dashboardSettings={dashboard} />
      )}
    </div>
  );
}

export default HomePage;
