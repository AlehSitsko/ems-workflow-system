import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  FaAmbulance,
  FaClipboardList,
  FaPhoneAlt,
  FaUserInjured,
  FaUsers,
  FaBookOpen,
  FaChartBar,
  FaUserCog,
  FaTh,
  FaClock,
  FaMoneyBillWave,
  FaShieldAlt,
  FaHistory,
  FaTasks,
} from "react-icons/fa";

import {
  hasAdminAccess,
  hasCallIntakeAccess,
  hasCrewPlannerAccess,
  hasEmployeeAccess,
  hasPatientAccess,
  hasSupervisorAccess,
} from "../api/authApi";
import { kioskStatus, kioskClockIn, kioskClockOut } from "../api/timeApi";
import { getTaskSummary } from "../api/tasksApi";

const hasTaskAccess = (user) =>
  user && ["admin", "supervisor", "hr", "dispatcher"].includes(user.role);

function TaskSummaryWidget({ currentUser }) {
  const [summary, setSummary] = useState(null);
  const isManager = ["admin", "supervisor"].includes(currentUser?.role);

  useEffect(() => {
    if (!hasTaskAccess(currentUser)) return;
    getTaskSummary(currentUser).then(setSummary).catch(() => setSummary(null));
  }, [currentUser]);

  if (!hasTaskAccess(currentUser) || !summary) return null;

  const cards = [
    { label: "My Open Tasks", value: summary.my_open, color: "#0d6efd", filter: "" },
    { label: "My Overdue Tasks", value: summary.my_overdue, color: "#dc3545", filter: "overdue=1" },
    { label: "Tasks Due Today", value: summary.due_today, color: "#f59e0b", filter: "" },
  ];
  if (isManager) {
    cards.push(
      { label: "Unassigned Tasks", value: summary.unassigned_count, color: "#6f42c1", filter: "" },
      { label: "Total Overdue", value: summary.total_overdue, color: "#dc3545", filter: "overdue=1" },
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.65rem" }}>
      {cards.map((c) => (
        <Link
          key={c.label}
          to="/tasks"
          style={{
            textDecoration: "none",
            padding: "0.75rem 1rem",
            borderRadius: 12,
            border: `1px solid ${c.color}30`,
            background: `${c.color}10`,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
          <div style={{ fontSize: 12, color: "var(--ems-text-muted)", fontWeight: 600 }}>{c.label}</div>
        </Link>
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
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      background: clockedIn ? "rgba(25,135,84,0.1)" : "var(--ems-bg-surface-2)",
      border: `1px solid ${clockedIn ? "rgba(25,135,84,0.3)" : "var(--ems-border)"}`,
      borderRadius: 12, padding: "8px 16px", flexShrink: 0,
    }}>
      <FaClock style={{ color: clockedIn ? "#75b798" : "var(--ems-text-muted)", fontSize: 15, flexShrink: 0 }} />
      {clockedIn ? (
        <>
          <div>
            <div style={{ fontSize: 10, color: "var(--ems-text-muted)", lineHeight: 1.2, textTransform: "uppercase", fontWeight: 700 }}>Shift</div>
            <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "#75b798", letterSpacing: 0.5 }}>
              {elapsed}
            </div>
          </div>
          <button className="btn btn-sm btn-outline-danger" style={{ fontWeight: 600 }} disabled={loading} onClick={handleClockOut}>
            {loading ? "…" : "Clock Out"}
          </button>
        </>
      ) : (
        <>
          <span style={{ color: "var(--ems-text-muted)", fontSize: 13 }}>Not clocked in</span>
          <button className="btn btn-sm btn-success" style={{ fontWeight: 600 }} disabled={loading} onClick={handleClockIn}>
            {loading ? "…" : "Clock In"}
          </button>
        </>
      )}
      {error && <span style={{ fontSize: 11, color: "#ea868f" }}>{error}</span>}
    </div>
  );
}

function QuickTile({ title, description, path, icon: Icon, accent = "#0d6efd", primary = false }) {
  return (
    <Link
      to={path}
      style={{
        display: "flex",
        gap: 14,
        padding: "16px 18px",
        borderRadius: 16,
        background: primary ? accent : "var(--ems-bg-surface)",
        border: `1px solid ${primary ? "transparent" : "var(--ems-border)"}`,
        boxShadow: primary
          ? `0 8px 20px ${accent}44`
          : "0 2px 8px var(--ems-shadow-subtle)",
        textDecoration: "none",
        transition: "transform 0.13s ease, box-shadow 0.13s ease",
        cursor: "pointer",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = primary ? `0 14px 28px ${accent}55` : "0 8px 20px var(--ems-shadow)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = primary ? `0 8px 20px ${accent}44` : "0 2px 8px var(--ems-shadow-subtle)"; }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: primary ? "rgba(255,255,255,0.2)" : `${accent}18`,
        color: primary ? "#fff" : accent, fontSize: 17,
      }}>
        <Icon />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: primary ? "#fff" : "var(--ems-text-primary)", marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: primary ? "rgba(255,255,255,0.75)" : "var(--ems-text-muted)", lineHeight: 1.4 }}>
          {description}
        </div>
      </div>
    </Link>
  );
}

function HomePage({ currentUser }) {
  const canTakeCalls = hasCallIntakeAccess(currentUser);
  const canAccessPatients = hasPatientAccess(currentUser);
  const canAccessEmployees = hasEmployeeAccess(currentUser);
  const canAccessCrewPlanner = hasCrewPlannerAccess(currentUser);
  const canAccessSupervisor = hasSupervisorAccess(currentUser);
  const canAccessAdmin = hasAdminAccess(currentUser);
  const canAccessTasks = hasTaskAccess(currentUser);

  return (
    <div className="dashboard-page">

      {/* Hero row */}
      <div className="dashboard-hero" style={{ alignItems: "center", gap: "1rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="dashboard-eyebrow">Welcome back</p>
          <h2 style={{ margin: 0 }}>{currentUser?.display_name || "User"}</h2>
          <p className="dashboard-hero-text" style={{ marginTop: 4 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        <ClockWidget currentUser={currentUser} />

        {canTakeCalls && (
          <Link to="/call-form" className="btn btn-danger dashboard-hero-button">
            <FaPhoneAlt />
            <span>Start Taking Call</span>
          </Link>
        )}
      </div>

      <TaskSummaryWidget currentUser={currentUser} />

      {/* Quick access tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.85rem" }}>

        <QuickTile
          title="Dispatch Board"
          description="Assign calls to units and track status"
          path="/dispatch"
          icon={FaTh}
          accent="#dc3545"
          primary
        />

        {canTakeCalls && (
          <QuickTile
            title="Call Form"
            description="Create a new EMS call record"
            path="/call-form"
            icon={FaPhoneAlt}
            accent="#0d6efd"
          />
        )}

        {canAccessPatients && (
          <QuickTile
            title="Patients"
            description="Search and manage patient records"
            path="/patients"
            icon={FaUserInjured}
            accent="#0d6efd"
          />
        )}

        {canTakeCalls && (
          <QuickTile
            title="Calls"
            description="Review saved call history"
            path="/calls"
            icon={FaClipboardList}
            accent="#0d6efd"
          />
        )}

        {canAccessTasks && (
          <QuickTile
            title="Tasks"
            description="Assign and track staff follow-up work"
            path="/tasks"
            icon={FaTasks}
            accent="#198754"
          />
        )}

        {canAccessEmployees && (
          <QuickTile
            title="Employees"
            description="Manage employee records and certifications"
            path="/employees"
            icon={FaUsers}
            accent="#198754"
          />
        )}

        {canAccessCrewPlanner && (
          <QuickTile
            title="Crew Planner"
            description="Plan unit assignments for the day"
            path="/crew-planner"
            icon={FaAmbulance}
            accent="#198754"
          />
        )}

        {canAccessEmployees && (
          <QuickTile
            title="Payroll"
            description="Manage pay periods and export payroll"
            path="/payroll"
            icon={FaMoneyBillWave}
            accent="#198754"
          />
        )}

        {canAccessEmployees && (
          <QuickTile
            title="Compliance"
            description="Track certifications and compliance status"
            path="/compliance"
            icon={FaShieldAlt}
            accent="#198754"
          />
        )}

        {canAccessSupervisor && (
          <QuickTile
            title="Supervisor Dashboard"
            description="Review performance and call quality analytics"
            path="/supervisor"
            icon={FaChartBar}
            accent="#6f42c1"
          />
        )}

        {canAccessAdmin && (
          <QuickTile
            title="Users"
            description="Manage system user accounts and roles"
            path="/users"
            icon={FaUserCog}
            accent="#6f42c1"
          />
        )}

        {canAccessAdmin && (
          <QuickTile
            title="Audit Log"
            description="View system activity and event history"
            path="/audit"
            icon={FaHistory}
            accent="#6f42c1"
          />
        )}

      </div>

      {/* Help link */}
      <div style={{ textAlign: "center", paddingTop: 4 }}>
        <Link to="/manual" style={{ fontSize: 13, color: "var(--ems-text-muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <FaBookOpen style={{ fontSize: 12 }} /> User Manual
        </Link>
      </div>
    </div>
  );
}

export default HomePage;
