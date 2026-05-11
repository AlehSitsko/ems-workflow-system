import React from "react";
import { Link } from "react-router-dom";

const HomePage = ({ currentUser }) => {
  const modules = [
    {
      title: "Call Form",
      description: "Create a new EMS call record and document trip details.",
      path: "/call-form",
      roles: ["admin", "supervisor", "dispatcher"],
      buttonText: "Open Call Form",
    },
    {
      title: "Patients",
      description: "Search, review, and manage patient records.",
      path: "/patients",
      roles: ["admin", "supervisor", "dispatcher"],
      buttonText: "Open Patients",
    },
    {
      title: "Calls",
      description: "Review saved call records and call history.",
      path: "/calls",
      roles: ["admin", "supervisor", "dispatcher"],
      buttonText: "Open Calls",
    },
    {
      title: "Supervisor Dashboard",
      description:
        "Review dispatcher performance, call quality, and missing field analytics.",
      path: "/supervisor",
      roles: ["admin", "supervisor"],
      buttonText: "Open Supervisor",
    },
    {
      title: "Employees",
      description:
        "Manage employee records, certifications, and active status.",
      path: "/employees",
      roles: ["admin", "supervisor"],
      buttonText: "Open Employees",
    },
    {
      title: "Users",
      description:
        "Create and manage system user accounts, roles, and access status.",
      path: "/users",
      roles: ["admin"],
      buttonText: "Open Users",
    },
    {
      title: "Crew Planner",
      description:
        "Plan BLS, ALS, and assist units using employee eligibility checks.",
      path: "/crew-planner",
      roles: ["admin", "supervisor", "dispatcher"],
      buttonText: "Open Crew Planner",
    },
    {
      title: "User Manual",
      description: "Read workflow instructions and system usage notes.",
      path: "/manual",
      roles: ["admin", "supervisor", "dispatcher"],
      buttonText: "Open Manual",
    },
  ];

  const availableModules = modules.filter((module) =>
    module.roles.includes(currentUser?.role)
  );

  return (
    <div className="container mt-4 mb-5">
      <div className="mb-4">
        <h2 className="mb-1">Home</h2>

        <p className="text-muted mb-0">
          Welcome, {currentUser?.display_name}. Select an available module to
          continue.
        </p>
      </div>

      <div className="row g-3">
        {availableModules.map((module) => (
          <div className="col-md-6 col-lg-4" key={module.path}>
            <div className="card h-100 shadow-sm">
              <div className="card-body d-flex flex-column">
                <h5 className="card-title">{module.title}</h5>

                <p className="card-text text-muted flex-grow-1">
                  {module.description}
                </p>

                <Link to={module.path} className="btn btn-primary mt-2">
                  {module.buttonText}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HomePage;