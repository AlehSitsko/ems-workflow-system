import React from "react";
import { Link } from "react-router-dom";

const HomePage = ({ currentUser }) => {
  const modules = [
    {
      title: "Start Taking Call",
      description: "Quickly start a new EMS call intake record.",
      path: "/call-form",
      roles: ["admin", "supervisor", "dispatcher"],
      buttonText: "Start Taking Call",
      isPrimary: true,
    },
    {
      title: "Patients",
      description: "Search, review, and manage patient records.",
      path: "/patients",
      roles: ["admin", "supervisor", "dispatcher"],
      buttonText: "Open Patients",
      isPrimary: false,
    },
    {
      title: "Calls",
      description: "Review saved call records and call history.",
      path: "/calls",
      roles: ["admin", "supervisor", "dispatcher"],
      buttonText: "Open Calls",
      isPrimary: false,
    },
    {
      title: "Supervisor Dashboard",
      description:
        "Review dispatcher performance, call quality, and missing field analytics.",
      path: "/supervisor",
      roles: ["admin", "supervisor"],
      buttonText: "Open Supervisor",
      isPrimary: false,
    },
    {
      title: "Employees",
      description:
        "Manage employee records, certifications, HR information, and active status.",
      path: "/employees",
      roles: ["admin", "supervisor", "hr"],
      buttonText: "Open Employees",
      isPrimary: false,
    },
    {
      title: "Crew Planner",
      description:
        "Plan BLS, ALS, and assist units using employee eligibility checks.",
      path: "/crew-planner",
      roles: ["admin", "supervisor", "dispatcher", "hr"],
      buttonText: "Open Crew Planner",
      isPrimary: false,
    },
    {
      title: "Users",
      description:
        "Create and manage system user accounts, roles, and access status.",
      path: "/users",
      roles: ["admin"],
      buttonText: "Open Users",
      isPrimary: false,
    },
    {
      title: "User Manual",
      description: "Read workflow instructions and system usage notes.",
      path: "/manual",
      roles: ["admin", "supervisor", "dispatcher", "hr"],
      buttonText: "Open Manual",
      isPrimary: false,
    },
  ];

  const availableModules = modules.filter((module) =>
    module.roles.includes(currentUser?.role)
  );

  const primaryModules = availableModules.filter((module) => module.isPrimary);
  const secondaryModules = availableModules.filter((module) => !module.isPrimary);

  return (
    <div className="container mt-4 mb-5">
      <div className="mb-4">
        <h2 className="mb-1">Home</h2>

        <p className="text-muted mb-0">
          Welcome, {currentUser?.display_name}. Select an available module to
          continue.
        </p>
      </div>

      {availableModules.length === 0 ? (
        <div className="alert alert-warning">
          No modules are currently available for your role. Please contact an
          administrator.
        </div>
      ) : (
        <>
          {primaryModules.length > 0 && (
            <div className="mb-4">
              <h5 className="mb-3">Primary Actions</h5>

              <div className="row g-3">
                {primaryModules.map((module) => (
                  <div className="col-md-6 col-lg-4" key={module.path}>
                    <div className="card h-100 shadow-sm border-primary">
                      <div className="card-body d-flex flex-column">
                        <h5 className="card-title">{module.title}</h5>

                        <p className="card-text text-muted flex-grow-1">
                          {module.description}
                        </p>

                        <Link
                          to={module.path}
                          className="btn btn-primary mt-2"
                        >
                          {module.buttonText}
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {secondaryModules.length > 0 && (
            <div>
              <h5 className="mb-3">Modules</h5>

              <div className="row g-3">
                {secondaryModules.map((module) => (
                  <div className="col-md-6 col-lg-4" key={module.path}>
                    <div className="card h-100 shadow-sm">
                      <div className="card-body d-flex flex-column">
                        <h5 className="card-title">{module.title}</h5>

                        <p className="card-text text-muted flex-grow-1">
                          {module.description}
                        </p>

                        <Link
                          to={module.path}
                          className="btn btn-outline-primary mt-2"
                        >
                          {module.buttonText}
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default HomePage;