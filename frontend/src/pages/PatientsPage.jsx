import React from "react";
import PatientsPageComponent from "../components/PatientsPage";

// Page wrapper for the Patients section.
// Keeps page-level layout separate from the actual patient search component.
function PatientsPage() {
  return (
    <div className="container mt-4">
      <PatientsPageComponent />
    </div>
  );
}

export default PatientsPage;