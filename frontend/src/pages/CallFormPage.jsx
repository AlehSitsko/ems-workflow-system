import React, { useRef } from 'react';

// Import the main call intake form component
import CallForm from '../components/CallForm';

// Import the price calculator component
import PriceCalculator from '../components/PriceCalculator';

// Import the export/print action buttons component
import ExportButtons from '../components/ExportButtons';

function CallFormPage() {
  // Create a ref to access methods exposed by the CallForm component
  const callFormRef = useRef();

  // Create a ref to access methods exposed by the PriceCalculator component
  const priceCalculatorRef = useRef();

  // Clear both the form and the calculator at the same time
  const handleClearAll = () => {
    // Clear the main call form if the ref is available
    if (callFormRef.current) {
      callFormRef.current.clearForm();
    }

    // Clear the price calculator if the ref is available
    if (priceCalculatorRef.current) {
      priceCalculatorRef.current.clearCalculator();
    }
  };

  return (
    // Main page container with top margin
    <div className="container mt-4">
      {/* Informational block shown at the top of the page */}
      <div className="alert alert-info mb-4">
        {/* Section title */}
        <h5 className="mb-2">Welcome to the Call Taking Form</h5>

        {/* General explanation of what this page is for */}
        <p className="mb-2">
          This page is the main entry point for the application. Use the navigation
          buttons at the top of the page to move between sections such as Call Form,
          Patients, User Manual, Employees, and Crew Planner.
        </p>

        {/* Short note about future modular expansion */}
        <p className="mb-2">
          Future updates and new modules will also be added through the top navigation,
          so please use the menu above to access all available tools.
        </p>

        {/* Quick usage checklist for dispatchers or staff */}
        <ul className="mb-0">
          <li>
            Select <strong>Caller Type</strong> first.
          </li>
          <li>
            Enter <strong>Patient Information</strong> clearly and completely.
          </li>
          <li>
            Fill in <strong>Pickup and Drop-off Addresses</strong>.
          </li>
          <li>
            Set the <strong>Date of Call</strong>, <strong>Date of Trip</strong>, and{' '}
            <strong>Pickup Time</strong>.
          </li>
          <li>
            Choose the correct <strong>Service Level</strong>.
          </li>
          <li>
            Use <strong>Return Ride</strong> when needed.
          </li>
          <li>
            Review the information before printing or exporting.
          </li>
        </ul>
      </div>

      {/* Wrapper used for printable page content */}
      <div className="print-wrapper">
        {/* Main call form with ref for external clear/reset access */}
        <CallForm ref={callFormRef} />

        {/* Price calculator with ref for external clear/reset access */}
        <PriceCalculator ref={priceCalculatorRef} />

        {/* Export/print buttons that also receive the shared clear-all handler */}
        <ExportButtons onClearAll={handleClearAll} />
      </div>
    </div>
  );
}

export default CallFormPage;