// UserManual component
// This page serves as a structured SOP (Standard Operating Procedure)
// for dispatchers using the Call Taking Form application.

const UserManual = () => {
  return (
    <div className="card shadow-sm my-3">
      <div className="card-body">

        {/* ===================== TITLE ===================== */}
        <h2 className="h4 mb-3">
          Call Taking Form – User Guide (Standard Operating Procedure)
        </h2>

        {/* ===================== PURPOSE ===================== */}
        <p>
          <strong>Purpose:</strong> This application is designed to ensure that every call
          is handled in a structured, consistent, and complete way, reducing missing
          information and operational errors.
        </p>

        {/* ===================== CORE PRINCIPLE ===================== */}
        <h3 className="h5 mt-4">1. Core Principle</h3>
        <p>
          Every call should follow this order:
          <br />
          <strong>
            Caller → Patient → Trip → Pickup → Destination → Time → Transport →
            Return Ride → Confirmation
          </strong>
        </p>

        {/* ===================== CALL START ===================== */}
        <h3 className="h5 mt-4">2. How to Start the Call</h3>
        <p>
          <strong>
            “Welcome Ambulance, this is [your name]. How can I help you?”
          </strong>
        </p>

        {/* ===================== CALLER ===================== */}
        <h3 className="h5 mt-4">3. Caller Information</h3>
        <ul>
          <li>Caller name</li>
          <li>Callback number</li>
          <li>Caller type (Facility / Family / Other)</li>
        </ul>

        {/* ===================== PATIENT ===================== */}
        <h3 className="h5 mt-4">4. Patient Information</h3>
        <ul>
          <li>First name</li>
          <li>Last name</li>
          <li>Date of Birth (critical for identification)</li>
        </ul>

        <p>
          Always confirm spelling:
          <br />
          <strong>“Can you spell the last name?”</strong>
        </p>

        {/* ===================== PATIENT PAGE ===================== */}
        <h3 className="h5 mt-4">5. Using the Patients Page</h3>

        <p>
          The Patients Page allows you to search and review patient records before
          entering data into the Call Taking Form.
        </p>

        <ul>
          <li>Search by Last Name and/or Date of Birth</li>
          <li>Use <strong>Show All</strong> to display all available patients</li>
          <li>Click <strong>Select</strong> to preview patient information</li>
        </ul>

        <p>
          <strong>Current Status:</strong> Uses test data (mock mode)
        </p>

        <p>
          <strong>Future:</strong> Will automatically fill Call Form fields
        </p>

        {/* ===================== TRIP ===================== */}
        <h3 className="h5 mt-4">6. Trip Type</h3>
        <ul>
          <li>One-way or round trip</li>
          <li>Appointment / discharge / transfer</li>
          <li>Return ride required?</li>
          <li>Will Call return?</li>
        </ul>

        {/* ===================== PICKUP ===================== */}
        <h3 className="h5 mt-4">7. Pickup Location</h3>
        <ul>
          <li>Address</li>
          <li>Facility name</li>
          <li>Room / unit</li>
          <li>Entrance</li>
          <li>Release contact</li>
        </ul>

        {/* ===================== DESTINATION ===================== */}
        <h3 className="h5 mt-4">8. Destination</h3>
        <ul>
          <li>Address</li>
          <li>Facility / doctor office</li>
          <li>Department / suite</li>
        </ul>

        {/* ===================== TIME ===================== */}
        <h3 className="h5 mt-4">9. Date and Time</h3>
        <ul>
          <li>Date of trip</li>
          <li>Pickup time</li>
          <li>Appointment time</li>
          <li>Return time (if known)</li>
        </ul>

        {/* ===================== TRANSPORT ===================== */}
        <h3 className="h5 mt-4">10. Transport Needs</h3>
        <ul>
          <li>Wheelchair / Stretcher / Ambulatory</li>
          <li>Oxygen required?</li>
          <li>Assistance needed?</li>
          <li>Stairs?</li>
        </ul>

        {/* ===================== RETURN RIDE ===================== */}
        <h3 className="h5 mt-4">11. Return Ride Logic</h3>
        <ul>
          <li>Select Return Ride if round trip</li>
          <li>System auto-fills reverse route</li>
          <li>You can edit manually if needed</li>
          <li>Use <strong>Sync Return Addresses</strong> if needed</li>
        </ul>

        {/* ===================== PRICE ===================== */}
        <h3 className="h5 mt-4">12. Pricing (Optional)</h3>
        <ul>
          <li>Private pay?</li>
          <li>Need quote?</li>
          <li>Fixed price?</li>
        </ul>

        {/* ===================== CONFIRMATION ===================== */}
        <h3 className="h5 mt-4">13. Call Confirmation (MANDATORY)</h3>
        <p>
          Always confirm:
          <br />
          <strong>“Is everything correct?”</strong>
        </p>

        {/* ===================== FINAL ===================== */}
        <h3 className="h5 mt-4">14. Final Instruction</h3>
        <p>
          <strong>
            “If anything changes — time, address, or patient condition —
            please call us back immediately.”
          </strong>
        </p>

        {/* ===================== COMMON MISTAKES ===================== */}
        <h3 className="h5 mt-4">15. Common Mistakes</h3>
        <ul>
          <li>Missing callback number</li>
          <li>Wrong name spelling</li>
          <li>Mixing pickup and appointment time</li>
          <li>Missing room / entrance</li>
          <li>Forgetting return ride</li>
          <li>Skipping confirmation</li>
        </ul>

        {/* ===================== MENTAL MODEL ===================== */}
        <h3 className="h5 mt-4">16. Simple Mental Model</h3>
        <p>
          <strong>
            Who → Patient → From → To → When → How → Special → Confirm
          </strong>
        </p>

        {/* ===================== SYSTEM NOTE ===================== */}
        <h3 className="h5 mt-4">17. System Role</h3>
        <p>
          This system is a <strong>support tool</strong>, not a replacement for
          primary EMS software.
        </p>

      </div>
    </div>
  );
};

export default UserManual;