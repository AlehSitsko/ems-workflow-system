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

// ── Clock widget ──────────────────────────────────────────────────────────────
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

  // Load status when employee is linked
  useEffect(() => {
    if (!empId) return;
    kioskStatus(empId).then((s) => {
      setClockedIn(s.clocked_in);
      setClockInTime(s.clock_in);
    });
  }, [empId]);

  // Live timer
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
    <div style={{ marginBottom: 24 }}>
      {error && (
        <div style={{ fontSize: 12, color: "#ea868f", marginBottom: 6, paddingLeft: 4 }}>{error}</div>
      )}
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      background: clockedIn ? "rgba(25,135,84,0.12)" : "rgba(110,168,254,0.08)",
      border: `1px solid ${clockedIn ? "rgba(25,135,84,0.35)" : "rgba(110,168,254,0.25)"}`,
      borderRadius: 12, padding: "10px 18px",
    }}>
      <FaClock style={{ color: clockedIn ? "#75b798" : "#6ea8fe", fontSize: 18, flexShrink: 0 }} />
      {clockedIn ? (
        <>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#6c757d", lineHeight: 1.2 }}>Shift in progress</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#75b798", letterSpacing: 1 }}>
              {elapsed}
            </div>
          </div>
          <button
            className="btn btn-sm btn-outline-danger"
            style={{ fontWeight: 600, padding: "6px 18px" }}
            disabled={loading}
            onClick={handleClockOut}
          >
            {loading ? "…" : "Clock Out"}
          </button>
        </>
      ) : (
        <>
          <div style={{ flex: 1, color: "#adb5bd", fontSize: 14 }}>Not clocked in</div>
          <button
            className="btn btn-sm btn-success"
            style={{ fontWeight: 600, padding: "6px 18px" }}
            disabled={loading}
            onClick={handleClockIn}
          >
            {loading ? "…" : "Clock In"}
          </button>
        </>
      )}
    </div>
    </div>
  );
}

const DashboardCard = ({
  title,
  description,
  path,
  buttonText,
  icon: Icon, // eslint-disable-line no-unused-vars
  variant = "light",
}) => {
  const isPrimary = variant === "primary";

  return (
    <div className="dashboard-card">
      <div className={`dashboard-card-icon ${isPrimary ? "primary" : ""}`}>
        <Icon />
      </div>

      <div className="dashboard-card-body">
        <h5>{title}</h5>

        <p>{description}</p>

        <Link
          to={path}
          className={`btn ${isPrimary ? "btn-danger" : "btn-outline-primary"}`}
        >
          {buttonText}
        </Link>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, helper }) => {
  return (
    <div className="dashboard-stat-card">
      <div className="dashboard-stat-value">{value}</div>
      <div className="dashboard-stat-label">{label}</div>
      <div className="dashboard-stat-helper">{helper}</div>
    </div>
  );
};

function HomePage({ currentUser }) {
  const canTakeCalls = hasCallIntakeAccess(currentUser);
  const canAccessPatients = hasPatientAccess(currentUser);
  const canAccessEmployees = hasEmployeeAccess(currentUser);
  const canAccessCrewPlanner = hasCrewPlannerAccess(currentUser);
  const canAccessSupervisor = hasSupervisorAccess(currentUser);
  const canAccessAdmin = hasAdminAccess(currentUser);

  return (
    <div className="dashboard-page">
      <ClockWidget currentUser={currentUser} />
      <div className="dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">Welcome back</p>

          <h2>
            {currentUser?.display_name || "User"}
          </h2>

          <p className="dashboard-hero-text">
            Use the dashboard to quickly access the tools available for your
            role.
          </p>
        </div>

        {canTakeCalls && (
          <Link to="/call-form" className="btn btn-danger dashboard-hero-button">
            <FaPhoneAlt />
            <span>Start Taking Call</span>
          </Link>
        )}
      </div>

      <div className="dashboard-stats-grid">
        <StatCard
          label="Dispatch Board"
          value="Live"
          helper="Assign calls to units and track status"
        />

        {canTakeCalls && (
          <>
            <StatCard
              label="Call Intake"
              value="Ready"
              helper="Start a new call from the dashboard or top bar"
            />

            <StatCard
              label="Today's Calls"
              value="Review"
              helper="Open call history to check saved records"
            />
          </>
        )}

        {canAccessCrewPlanner && (
          <StatCard
            label="Crew Planning"
            value="Active"
            helper="Review units and assignments for the day"
          />
        )}

        {canAccessEmployees && (
          <StatCard
            label="Staff Records"
            value="Available"
            helper="Manage employee information and certifications"
          />
        )}
      </div>

      {canTakeCalls && (
        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <div>
              <h4>Operations</h4>
              <p>Fast access to call-taking and patient workflow tools.</p>
            </div>
          </div>

          <div className="dashboard-grid">
            <DashboardCard
              title="Dispatch Board"
              description="Assign calls to units, track unit status, and manage active trips."
              path="/dispatch"
              buttonText="Open Dispatch"
              icon={FaTh}
              variant="primary"
            />

            <DashboardCard
              title="Start Taking Call"
              description="Create a new EMS call record and document trip details."
              path="/call-form"
              buttonText="Start Call"
              icon={FaPhoneAlt}
            />

            {canAccessPatients && (
              <>
                <DashboardCard
                  title="Patients"
                  description="Search, review, and manage patient records."
                  path="/patients"
                  buttonText="Open Patients"
                  icon={FaUserInjured}
                />

                <DashboardCard
                  title="Calls"
                  description="Review saved call records and call history."
                  path="/calls"
                  buttonText="Open Calls"
                  icon={FaClipboardList}
                />
              </>
            )}
          </div>
        </section>
      )}

      {(canAccessEmployees || canAccessCrewPlanner) && (
        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <div>
              <h4>Staff</h4>
              <p>Manage employees, certifications, and crew assignments.</p>
            </div>
          </div>

          <div className="dashboard-grid">
            {canAccessEmployees && (
              <DashboardCard
                title="Employees"
                description="Manage employee records, certifications, HR information, and active status."
                path="/employees"
                buttonText="Open Employees"
                icon={FaUsers}
              />
            )}

            {canAccessCrewPlanner && (
              <DashboardCard
                title="Crew Planner"
                description="Plan BLS, ALS, and assist units using employee eligibility checks."
                path="/crew-planner"
                buttonText="Open Crew Planner"
                icon={FaAmbulance}
              />
            )}
          </div>
        </section>
      )}

      {(canAccessSupervisor || canAccessAdmin) && (
        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <div>
              <h4>Management</h4>
              <p>Review analytics and manage system access.</p>
            </div>
          </div>

          <div className="dashboard-grid">
            {canAccessSupervisor && (
              <DashboardCard
                title="Supervisor Dashboard"
                description="Review dispatcher performance, call quality, and missing field analytics."
                path="/supervisor"
                buttonText="Open Supervisor"
                icon={FaChartBar}
              />
            )}

            {canAccessAdmin && (
              <DashboardCard
                title="Users"
                description="Create and manage system user accounts, roles, and access status."
                path="/users"
                buttonText="Open Users"
                icon={FaUserCog}
              />
            )}
          </div>
        </section>
      )}

      <section className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <h4>Help</h4>
            <p>System usage notes and workflow instructions.</p>
          </div>
        </div>

        <div className="dashboard-grid">
          <DashboardCard
            title="User Manual"
            description="Read workflow instructions and system usage notes."
            path="/manual"
            buttonText="Open Manual"
            icon={FaBookOpen}
          />
        </div>
      </section>
    </div>
  );
}

export default HomePage;