import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { FaClock } from "react-icons/fa";

import { kioskStatus, kioskClockIn, kioskClockOut } from "../api/timeApi";
import { getTaskSummary } from "../api/tasksApi";
import { getNavigationGroups } from "../config/routeMetadata";
import { StatCard } from "../components/ui/Entity";
import { PageSection } from "../components/ui/Page";

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

/** One navigable destination. Fixed height so a row of tiles stays aligned. */
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

function HomePage({ currentUser }) {
  // Quick navigation is derived from the same route metadata the sidebar uses,
  // so a tile can never point somewhere the user is not allowed to go, and a new
  // route shows up here without being hand-copied (it previously was, and the
  // copy had drifted: Dispatch had lost its permission check entirely).
  const groups = getNavigationGroups(currentUser).filter((g) => g.title !== "Main");

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
        {/* No "Start Taking Call" here: the header already carries that CTA on
            every page, and two identical dominant buttons on one screen is a
            choice the user should not have to make. */}
        <ClockWidget currentUser={currentUser} />
      </section>

      <TaskSummaryWidget currentUser={currentUser} />

      {groups.map((group) => (
        <PageSection key={group.title} title={group.title}>
          <div className="quick-tile-grid">
            {group.items.map((item) => (
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
      ))}
    </div>
  );
}

export default HomePage;
