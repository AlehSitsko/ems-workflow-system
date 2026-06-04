import React from "react";
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
} from "react-icons/fa";

import {
  hasAdminAccess,
  hasCallIntakeAccess,
  hasCrewPlannerAccess,
  hasEmployeeAccess,
  hasPatientAccess,
  hasSupervisorAccess,
} from "../api/authApi";

const DashboardCard = ({
  title,
  description,
  path,
  buttonText,
  icon: Icon,
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
              title="Start Taking Call"
              description="Create a new EMS call record and document trip details."
              path="/call-form"
              buttonText="Start Call"
              icon={FaPhoneAlt}
              variant="primary"
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