import React, { useState, useRef, useMemo } from "react";
import {
  FaChevronDown, FaChevronRight, FaSearch, FaTh, FaPhone, FaUsers,
  FaClipboardList, FaCalendarAlt, FaBell, FaCog, FaAmbulance,
  FaUserMd, FaFileAlt, FaMoneyBillWave, FaShieldAlt, FaHistory,
  FaLightbulb, FaExclamationTriangle, FaInfoCircle, FaStar,
  FaKeyboard, FaUserCog,
} from "react-icons/fa";

// ── Data ─────────────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: "getting-started",
    icon: <FaStar />,
    title: "Getting Started",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <GettingStarted />,
  },
  {
    id: "dashboard",
    icon: <FaTh />,
    title: "Dashboard",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <DashboardSection />,
  },
  {
    id: "dispatch",
    icon: <FaAmbulance />,
    title: "Dispatch Board",
    roles: ["admin", "supervisor", "dispatcher"],
    content: <DispatchSection />,
  },
  {
    id: "call-form",
    icon: <FaPhone />,
    title: "Call Taking Form",
    roles: ["admin", "supervisor", "dispatcher"],
    content: <CallFormSection />,
  },
  {
    id: "patients",
    icon: <FaUserMd />,
    title: "Patients",
    roles: ["admin", "supervisor", "dispatcher"],
    content: <PatientsSection />,
  },
  {
    id: "calls",
    icon: <FaClipboardList />,
    title: "Calls",
    roles: ["admin", "supervisor", "dispatcher"],
    content: <CallsSection />,
  },
  {
    id: "employees",
    icon: <FaUsers />,
    title: "Employees & HR",
    roles: ["admin", "supervisor", "hr"],
    content: <EmployeesSection />,
  },
  {
    id: "crew",
    icon: <FaCalendarAlt />,
    title: "Crew Planner",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <CrewSection />,
  },
  {
    id: "payroll",
    icon: <FaMoneyBillWave />,
    title: "Payroll",
    roles: ["admin", "supervisor", "hr"],
    content: <PayrollSection />,
  },
  {
    id: "compliance",
    icon: <FaShieldAlt />,
    title: "Compliance Dashboard",
    roles: ["admin", "supervisor", "hr"],
    content: <ComplianceSection />,
  },
  {
    id: "notifications",
    icon: <FaBell />,
    title: "Notifications & Settings",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <NotificationsSection />,
  },
  {
    id: "audit",
    icon: <FaHistory />,
    title: "Audit Log",
    roles: ["admin", "supervisor"],
    content: <AuditSection />,
  },
  {
    id: "shortcuts",
    icon: <FaKeyboard />,
    title: "Quick Reference",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <ShortcutsSection />,
  },
];

// ── Callout helpers ───────────────────────────────────────────────────────────

function Tip({ children }) {
  return (
    <div style={{ display: "flex", gap: 10, background: "rgba(110,168,254,0.08)", border: "1px solid rgba(110,168,254,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
      <FaLightbulb style={{ color: "#6ea8fe", marginTop: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: "var(--ems-text-secondary)", lineHeight: 1.55 }}>{children}</span>
    </div>
  );
}

function Warning({ children }) {
  return (
    <div style={{ display: "flex", gap: 10, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
      <FaExclamationTriangle style={{ color: "#f87171", marginTop: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: "var(--ems-text-secondary)", lineHeight: 1.55 }}>{children}</span>
    </div>
  );
}

function Note({ children }) {
  return (
    <div style={{ display: "flex", gap: 10, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
      <FaInfoCircle style={{ color: "#34d399", marginTop: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: "var(--ems-text-secondary)", lineHeight: 1.55 }}>{children}</span>
    </div>
  );
}

function Step({ n, children }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#0d6efd", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{n}</div>
      <div style={{ fontSize: 13, color: "var(--ems-text-secondary)", lineHeight: 1.55, flex: 1 }}>{children}</div>
    </div>
  );
}

function Sub({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ems-text-primary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
      {children}
    </div>
  );
}

function List({ items }) {
  return (
    <ul style={{ paddingLeft: 18, margin: "0 0 10px", color: "var(--ems-text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

function KBD({ children }) {
  return (
    <kbd style={{ background: "var(--ems-bg-surface-2, #1e293b)", border: "1px solid var(--ems-border)", borderRadius: 4, padding: "1px 7px", fontSize: 11, color: "var(--ems-text-primary)", fontFamily: "monospace" }}>{children}</kbd>
  );
}

// ── Section content components ────────────────────────────────────────────────

function GettingStarted() {
  return (
    <>
      <p style={{ fontSize: 14, color: "var(--ems-text-secondary)", marginBottom: 16 }}>
        EMS Workflow System is an operational support platform for EMS and medical transport organizations. It is not a replacement for CAD systems, EMR, or billing software — it covers dispatch workflows, staff management, and operational continuity.
      </p>
      <Sub title="Login & Roles">
        <List items={[
          "Navigate to the app URL and enter your username and password.",
          "Your role determines which modules are visible in the sidebar.",
          "Dispatcher → Dispatch Board, Call Form, Patients, Calls, Crew Planner.",
          "HR → Employees, Crew Planner, Payroll, Compliance.",
          "Admin / Supervisor → full access to all modules.",
        ]} />
        <Note>Login is rate-limited: 10 attempts per minute per IP address. After multiple failures, wait 60 seconds before trying again.</Note>
      </Sub>
      <Sub title="Navigation">
        <List items={[
          "Sidebar on the left — click any module to open it.",
          "Topbar shows current page title and quick actions.",
          "Click your avatar (top right) to access Settings, Dark/Light mode, and Log out.",
          "Bell icon shows unread notifications.",
        ]} />
      </Sub>
      <Sub title="Theme">
        <List items={[
          "Click your avatar → Dark mode / Light mode to toggle.",
          "Preference is saved to your account and restored on next login.",
        ]} />
      </Sub>
    </>
  );
}

function DashboardSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>The Dashboard is the role-aware landing page — it shows only the modules available to your role.</p>
      <Sub title="Clock Widget">
        <List items={[
          "Visible only if your user account is linked to an employee record (set by Admin in User Management).",
          "Click Clock In to start a shift. The live timer shows elapsed time.",
          "Click Clock Out to end the shift. Duration is recorded and available in Payroll.",
        ]} />
        <Tip>If you don't see the Clock widget, ask your admin to link your user account to your employee record.</Tip>
      </Sub>
      <Sub title="Module Tiles">
        <List items={[
          "Colored tiles provide quick access to available modules.",
          "Tiles are organized by section: Operations, Staff, Management, Administration.",
        ]} />
      </Sub>
      <Sub title="Start Taking Call Button">
        <List items={[
          "Red button in the top bar — always available for dispatcher and higher roles.",
          "Navigates directly to the Call Taking Form.",
        ]} />
      </Sub>
    </>
  );
}

function DispatchSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>The Dispatch Board is the live operational interface — crew planning and call dispatch are unified on one page.</p>

      <Sub title="Layout">
        <List items={[
          "Left panel — open calls list (Calls tab) and unassigned staff (Staff tab).",
          "Right panel — unit table (top) and selected unit detail (bottom).",
          "Drag the vertical divider to resize the left panel. Size is saved to your settings.",
          "Drag the horizontal divider between the unit table and unit detail to resize. Saved to your settings.",
          "Click ⊞ Reset layout in the header to restore default panel sizes.",
        ]} />
      </Sub>

      <Sub title="Adding Units (Crew Planning)">
        <Step n={1}>Click <strong>+ Day Unit</strong> or <strong>+ Night Unit</strong> in the board header.</Step>
        <Step n={2}>Select truck number, unit type (BLS / ALS / Stretcher / Emergency), and start time.</Step>
        <Step n={3}>Assign Driver and Medical from the employee dropdown. Optionally add Assist slots.</Step>
        <Step n={4}>Click <strong>Save Unit</strong>. The unit appears in the table immediately.</Step>
        <Warning>BLS units require minimum 2 crew. BLS-4 and BLS-6 require 4. Saving below minimum is blocked.</Warning>
        <Tip>Use the Staff tab in the left panel to see which employees are not yet assigned to any unit for this date.</Tip>
      </Sub>

      <Sub title="Assigning Calls to Units">
        <List items={[
          "Drag an open call card from the left panel and drop it onto a unit row.",
          "A confirmation appears if the service level mismatches the unit type (e.g. ALS call on BLS unit).",
          "You can override the mismatch warning — the call still assigns.",
          "The call disappears from Open Calls and appears in the unit's ASSIGNED CALLS column.",
        ]} />
        <Note>The patient queue sub-row under each unit shows assigned calls sorted by pickup time. This is derived live from actual assignments — not manual entry.</Note>
      </Sub>

      <Sub title="Unit Status Tracking">
        <List items={[
          "Single-click a unit row to open the unit detail panel below.",
          "Double-click a unit row to advance to the next status in the sequence.",
          "Status sequence: Available → En Route → On Scene → Transporting → At Destination.",
          "Out of Service button always returns the unit to Available.",
          "Status buttons in the detail panel can also be clicked directly.",
        ]} />
        <Tip>Each status change automatically timestamps the active call (e.g. En Route sets dispatched_at). Timestamps are write-once — repeated clicks do not overwrite.</Tip>
      </Sub>

      <Sub title="Completing & Reopening Calls">
        <List items={[
          "In the unit detail panel, click Done on an assigned call to mark it as completed.",
          "Completed calls move to the Completed section within the unit panel.",
          "In the left panel Done tab, click Reopen on any completed call to restore it to Assigned.",
        ]} />
      </Sub>

      <Sub title="Manual Priority Queue">
        <List items={[
          "In the unit detail panel, use ⚡ to move a call to the top of the queue immediately.",
          "Use ▲ / ▼ to reorder calls within the unit.",
          "When manual priority is active, a banner appears: ⚡ Manual priority active.",
          "Click Reset to time order to return to automatic pickup-time sorting.",
        ]} />
      </Sub>

      <Sub title="Overdue & Stuck Alerts">
        <List items={[
          "A call flashes red when its pickup time has passed and the unit is not yet On Scene or beyond.",
          "A unit status cell flashes red when the unit has not changed status for longer than your configured threshold.",
          "Go to Settings (your avatar → Settings) to configure the thresholds.",
          "Default: call overdue after 0 extra minutes; unit stuck after 30 minutes.",
        ]} />
        <Warning>These are visual alerts only — no sound or push notification is sent by default. Enable browser push notifications in Settings for background alerts.</Warning>
      </Sub>

      <Sub title="Creating & Editing Calls from the Board">
        <List items={[
          "Click + New Call (blue button in left panel) to create a call without leaving the board.",
          "Search for an existing patient or create a new one inline.",
          "Pickup address auto-fills from the patient's record if available.",
          "Click the edit icon (✏) on any assigned call to open it in edit mode.",
        ]} />
      </Sub>

      <Sub title="Cancelling a Call">
        <List items={[
          "Open the call detail modal (click the call card).",
          "Click Cancel Call in the modal footer.",
          "A cancellation reason is mandatory — the call cannot be cancelled without one.",
          "Cancelled calls appear in the Cancelled tab of the left panel.",
        ]} />
      </Sub>

      <Sub title="Patient Alert Badges">
        <List items={[
          "A call card shows a small severity badge (critical / warning) when its patient has an active alert, plus a note icon when a dispatch comment is set.",
          "Only the highest-severity active alert and its count are shown on the card — this keeps the board scannable.",
          "Open the call detail modal to see full alert details (category, title, description) and the patient's dispatch comment in the Patient Alerts section.",
        ]} />
        <Note>Quality score is intentionally not shown on the Dispatch Board — it belongs to post-trip review, not live dispatch decisions.</Note>
      </Sub>
    </>
  );
}

function CallFormSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>The Call Taking Form supports two intake workflows: Guided (default) and Classic. Both produce the same call record.</p>

      <Sub title="Standard Operating Procedure — Call Order">
        <div style={{ background: "var(--ems-bg-surface-2, rgba(255,255,255,0.04))", borderRadius: 8, padding: "10px 16px", marginBottom: 12, fontWeight: 700, fontSize: 14, color: "#6ea8fe", letterSpacing: 0.3 }}>
          Caller → Patient → Trip → Pickup → Destination → Time → Transport → Return Ride → Confirmation
        </div>
        <Step n={1}><strong>Greet the caller:</strong> "Welcome Ambulance, this is [your name]. How can I help you?"</Step>
        <Step n={2}><strong>Caller info:</strong> name, callback number, caller type (Facility / Family / Other).</Step>
        <Step n={3}><strong>Patient:</strong> First name, last name, date of birth. Always confirm spelling — "Can you spell the last name?"</Step>
        <Step n={4}><strong>Trip type:</strong> Appointment / discharge / transfer. Round trip? Will Call return?</Step>
        <Step n={5}><strong>Pickup:</strong> Address, facility name, room/unit, entrance, release contact.</Step>
        <Step n={6}><strong>Destination:</strong> Address, facility or doctor office, department/suite.</Step>
        <Step n={7}><strong>Time:</strong> Date of trip, pickup time, appointment time, return time if known.</Step>
        <Step n={8}><strong>Transport needs:</strong> Wheelchair / Stretcher / Ambulatory. Oxygen? Assistance? Stairs?</Step>
        <Step n={9}><strong>Return ride:</strong> If round trip — system auto-fills reverse route. Edit if needed.</Step>
        <Step n={10}><strong>Confirm:</strong> Read back key details. "Is everything correct?"</Step>
        <Step n={11}><strong>Close:</strong> "If anything changes — time, address, or patient condition — please call us back immediately."</Step>
      </Sub>

      <Sub title="Guided Mode (default)">
        <List items={[
          "Step-by-step workflow: Patient lookup → Trip details → Review.",
          "Each step validates before advancing.",
          "Emergency warning appears at Trip and Review steps for Emergency service level.",
          "Call quality review before saving.",
        ]} />
      </Sub>

      <Sub title="Classic Mode">
        <List items={[
          "All fields on one page — faster for experienced dispatchers.",
          "Switch to Classic using the toggle at the top of the form.",
          "Price calculator is available in both modes.",
        ]} />
      </Sub>

      <Sub title="Patient Search & Duplicate Prevention">
        <List items={[
          "Search by last name, date of birth, or phone number.",
          "If a match is found, select it — the form pre-fills patient data.",
          "If no match, create a new patient directly from the form.",
          "The system checks for duplicates before creating (same name + DOB), including archived patients — restore instead of creating a new record when offered.",
        ]} />
        <Warning>Never create a duplicate patient. Always search first. Duplicates cause reporting errors and complicate the call history.</Warning>
      </Sub>

      <Sub title="Patient Risk Card">
        <List items={[
          "Appears once a patient is selected — shows the patient's name, DOB, default service level, any active alert badges, and their dispatch note.",
          "Click Use last trip as template to prefill pickup address, dropoff address, and service level from the patient's most recent completed call.",
          "The template does not copy date, time, status, or unit assignment — only route and service level.",
        ]} />
        <Tip>Check the Risk Card before confirming trip details — a critical alert (e.g. fall risk, aggressive pet, oxygen required) can change what the crew needs to bring.</Tip>
      </Sub>

      <Sub title="Return Ride">
        <List items={[
          "Enable Return Ride toggle to create a paired return trip.",
          "Addresses are automatically reversed.",
          "Set return pickup time (or use Will Call if time is unknown).",
          "Return ride is created as a separate, fully independent call record.",
          "Return calls cannot have their own return (no chain duplicates).",
        ]} />
      </Sub>

      <Sub title="Common Mistakes to Avoid">
        <List items={[
          "Missing callback number — always get it even if the caller says they won't be available.",
          "Wrong name spelling — always confirm letter by letter for new patients.",
          "Mixing pickup time and appointment time — pickup is when we arrive; appointment is when they need to be there.",
          "Missing room or entrance — required for facility pickups.",
          "Forgetting return ride — confirm explicitly: 'Will you need a return trip?'",
          "Skipping confirmation — never save without reading back the key details.",
        ]} />
      </Sub>
    </>
  );
}

function PatientsSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>The Patients page is the central patient database. Search and manage patient records here.</p>
      <Sub title="Searching">
        <List items={[
          "Search by last name, date of birth, or phone number.",
          "Results update as you type.",
          "Click Show All to display all patients (paginated).",
          "Show archived toggle — includes archived patients in search results, marked with an Archived badge and muted styling.",
        ]} />
      </Sub>
      <Sub title="Patient Record">
        <List items={[
          "Click a patient card to open the detail drawer.",
          "Overview tab: contact info, address, transport defaults, and — if present — the active alert badges and dispatch note at the top.",
          "Alerts tab: add and resolve patient alerts (category, severity, title, description, optional expiry).",
          "Contacts tab: add, edit, and remove emergency/authorized contacts (relationship, phone, email, primary flag, can-authorize-transport flag).",
          "Edit tab: update any patient field, including dispatch comment and transport defaults.",
          "Call History tab: all calls associated with this patient.",
          "Default Service Level: set per patient — pre-fills the Call Form.",
        ]} />
      </Sub>
      <Sub title="Dispatch Comment">
        <List items={[
          "A short, practical note for dispatchers — e.g. 'Call daughter before pickup' or 'Use side entrance'.",
          "Distinct from general/medical notes — kept short and operational.",
          "Shows on the patient's Overview tab, the Call Form Risk Card when the patient is selected, and the Dispatch Board call detail modal.",
        ]} />
      </Sub>
      <Sub title="Patient Alerts">
        <List items={[
          "Categories: transport, safety, contact, facility, billing, equipment, behavior, language, other.",
          "Severity: info, warning, critical.",
          "Active alerts (not resolved, not expired) show as colored badges on the Dispatch Board call card, in the call detail modal, and on the Call Form Risk Card.",
          "Resolve an alert from the Alerts tab once it no longer applies — resolved alerts are hidden by default (toggle Show resolved to see them).",
        ]} />
        <Tip>Use Alerts for anything a crew needs to know before or during the trip — fall risk, aggressive pet on scene, gate code, oxygen requirement, etc.</Tip>
      </Sub>
      <Sub title="Archiving Patients">
        <List items={[
          "Click Archive on a patient card (with a confirmation prompt) instead of a permanent delete.",
          "Archived patients are hidden from default search but their call history stays intact — calls keep showing the patient's name.",
          "Click Restore on an archived patient (visible with Show archived enabled) to bring them back into active search.",
          "Creating a new patient that matches an existing archived patient's first name + last name + DOB offers to restore the existing record instead of creating a duplicate.",
        ]} />
        <Warning>Archiving is the standard way to remove a patient from active use. There is no hard-delete option in the UI — this protects call history integrity.</Warning>
      </Sub>
    </>
  );
}

function CallsSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>The Calls page shows all call records. Use it to review, edit, and manage calls post-intake.</p>
      <Sub title="Filtering">
        <List items={[
          "Filter by date range, status (new / assigned / completed / cancelled), and service level.",
          "Results are paginated — use Next / Previous to navigate.",
        ]} />
      </Sub>
      <Sub title="Call Detail Drawer">
        <List items={[
          "Click a call card to open the detail drawer.",
          "Summary tab: patient, trip details, caller info, dispatch timeline.",
          "Edit tab (Supervisor / Admin): edit any call field including lifecycle timestamps.",
          "Changes are logged to the Audit Log with a list of changed fields.",
        ]} />
      </Sub>
      <Sub title="Return Ride from Edit Tab">
        <List items={[
          "In the Edit tab, click Add Return Ride to create a paired return trip from an existing call.",
          "Use Will Call option if the return time is unknown at intake.",
        ]} />
      </Sub>
      <Sub title="Dispatch Timeline">
        <List items={[
          "The Summary tab shows a vertical timeline: Received → Dispatched → On Scene → Transporting → At Destination → Completed.",
          "Timestamps are set automatically by unit status changes on the Dispatch Board.",
          "Supervisors and admins can edit timestamps manually from the Edit tab.",
        ]} />
      </Sub>
    </>
  );
}

function EmployeesSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>The Employees module manages all staff records, certifications, time entries, and HR documents.</p>
      <Sub title="Employee Cards">
        <List items={[
          "Each card shows name, employee number, role, status, certifications, and positions.",
          "Certification badges are color-coded: green (active), amber (expiring), grey (expired/none).",
          "Click a card to open the full employee drawer.",
        ]} />
      </Sub>
      <Sub title="Employee Drawer Tabs">
        <List items={[
          "Profile — contact info, hire date, role, status, notes, kiosk PIN.",
          "Time & Pay — clock history, manual time entry, pay config (hourly rate, OT rules).",
          "Documents — upload, view, and manage HR documents with expiry tracking.",
        ]} />
      </Sub>
      <Sub title="HR Documents">
        <List items={[
          "Supported file types: PDF, JPG, PNG, WEBP, DOCX (up to 10 MB).",
          "Document types: Driver's License, CDL, EMS License, EVOC, BLS/ALS Cert, Physical, Contract, etc.",
          "Expiry colors: green (90+ days), yellow (30–90 days), red (≤14 days), dark (expired), grey (no expiry).",
          "Preview PDF and images in-app. Download to disk.",
          "Edit document metadata after upload. Delete with file cleanup.",
        ]} />
        <Tip>Set expiry dates on all certifications. The system will trigger notifications before they expire and flag them in the Compliance Dashboard.</Tip>
      </Sub>
      <Sub title="Kiosk PIN">
        <List items={[
          "Set a numeric PIN in the employee Profile tab.",
          "The PIN allows the employee to clock in/out at the Kiosk without a full login.",
          "If no PIN is set, the employee is shown by name only — no PIN confirmation step.",
        ]} />
      </Sub>
    </>
  );
}

function CrewSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>Crew planning can be done from the Crew Planner page or directly on the Dispatch Board. Both use the same data.</p>
      <Sub title="Creating a Crew Unit">
        <List items={[
          "Select a shift date.",
          "Click + Day Unit or + Night Unit.",
          "Set truck number, unit type, start time.",
          "Assign Driver (required), Medical, Assist 1, Assist 2.",
          "Certifications are validated: ALS units require a Paramedic in the Medical slot.",
        ]} />
      </Sub>
      <Sub title="Night Units">
        <List items={[
          "Night units have a start time, end time, and end date (for overnight).",
          "Use Make Night from an existing day unit to carry the same crew to a night shift.",
          "Choose to replace or keep an existing night crew when converting.",
        ]} />
      </Sub>
      <Sub title="Crew Presets">
        <List items={[
          "Save a crew configuration as a preset for fast daily planning.",
          "Apply a preset to pre-fill all crew slots for a date.",
          "Edit presets from the Crew Presets section.",
        ]} />
      </Sub>
      <Tip>Crew planning on the Dispatch Board is fully integrated — changes made there are immediately visible in the Crew Planner and vice versa.</Tip>
    </>
  );
}

function PayrollSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>Payroll periods aggregate employee time entries into pay summaries with FLSA overtime calculation.</p>
      <Sub title="Pay Period Workflow">
        <Step n={1}>Create a pay period (start date, end date, type: weekly / bi-weekly / monthly).</Step>
        <Step n={2}>Status: <strong>Open</strong> — time entries can still be edited.</Step>
        <Step n={3}>Status: <strong>Review</strong> — totals are calculated and visible. Time entries locked.</Step>
        <Step n={4}>Status: <strong>Approved</strong> — ready for export.</Step>
        <Step n={5}>Status: <strong>Exported</strong> — CSV downloaded. Final state.</Step>
      </Sub>
      <Sub title="Overtime Calculation">
        <List items={[
          "FLSA weekly overtime: hours over 40 per ISO week are calculated at the overtime rate.",
          "Regular and OT hours are shown separately per employee.",
          "Pay is calculated using the hourly rate set in the employee's Pay Config.",
        ]} />
      </Sub>
      <Sub title="Export Formats">
        <List items={[
          "Generic CSV — name, hours, pay totals.",
          "Gusto CSV — Employee ID / Name / Hours / Amount / Type.",
          "ADP CSV — Co Code / Batch ID / File # / Reg hours / OT hours.",
        ]} />
        <Note>Export is available when the period is in Approved or Exported status.</Note>
      </Sub>
    </>
  );
}

function ComplianceSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>The Compliance Dashboard shows the status of all HR documents across all employees in a single grid.</p>
      <Sub title="Grid View">
        <List items={[
          "Rows = employees. Columns = document types (12 types).",
          "Cell colors: green (ok), yellow (expiring), red (critical / ≤14 days), dark (expired), grey (missing).",
          "Click any cell to open the employee's Documents tab.",
        ]} />
      </Sub>
      <Sub title="Filtering">
        <List items={[
          "Toggle 'Show only expired and critical' to hide compliant rows.",
          "CSV export of the full compliance grid.",
        ]} />
      </Sub>
      <Sub title="Certification Scan">
        <List items={[
          "Upload a certificate image — the system extracts certification type and expiry date automatically.",
          "Review extracted data before saving to the employee record.",
        ]} />
        <Tip>Use certification scan to speed up document entry — especially for batch uploads after a training event.</Tip>
      </Sub>
    </>
  );
}

function NotificationsSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>Notifications alert you to operational events in real time. All settings on this page are saved per user account and apply across sessions.</p>
      <Sub title="Time Format">
        <List items={[
          "Set once in Settings — 12-hour (2:30 PM) or 24-hour (14:30). Default is 12-hour.",
          "Applies everywhere a time is entered or shown: Call Form, Dispatch Board (including the New Call drawer), Crew Planner, Calls history, and call detail.",
          "There is no separate 12h/24h switch inside any individual form — the format always follows your Settings preference.",
        ]} />
      </Sub>
      <Sub title="Notification Bell">
        <List items={[
          "Bell icon in the topbar shows unread count (capped at 99+).",
          "Click the bell to open the notification dropdown.",
          "Click a notification to mark it as read.",
          "Mark All Read clears the unread count.",
          "Notifications are polled every 10 seconds.",
        ]} />
      </Sub>
      <Sub title="Notification Types">
        <List items={[
          "call_new_today — new call created for today's date.",
          "call_unassigned_soon — call pickup < 30 minutes away and not yet assigned.",
          "call_als_on_bls — ALS call assigned to a BLS unit.",
          "unit_stuck_status — unit in same status beyond your configured threshold.",
          "unit_understaffed — unit created with no crew assigned.",
          "cert_expiring — employee certification expiring soon.",
          "doc_expiring — HR document expiry approaching (90/60/30/14/7 day thresholds).",
          "employee_added — new employee added to the system.",
        ]} />
        <Note>Only notification types relevant to your role are shown. Dispatchers do not receive cert or HR notifications.</Note>
      </Sub>
      <Sub title="Push Notifications">
        <List items={[
          "Background dispatch alerts delivered through your browser, even when the tab isn't open.",
          "Status reflects your actual browser permission, not just a saved preference: Unsupported, Requires HTTPS, not enabled yet, Blocked, or Enabled.",
          "Click Enable notifications to grant permission for the first time.",
          "If Blocked, the panel explains how to re-allow notifications from your browser's site settings (lock icon near the address bar).",
          "Once enabled, click Send test notification to confirm delivery end-to-end.",
        ]} />
      </Sub>
      <Sub title="Dispatch Visual Alerts">
        <List items={[
          "Separate from Push Notifications — controls the red flashing/highlighting on the Dispatch Board itself, not a browser alert.",
          "Call overdue alert — minutes after pickup time before a call flashes red on the board.",
          "Unit stuck alert — minutes in the same status before the unit status flashes red.",
        ]} />
      </Sub>
      <Sub title="Panel Sizes">
        <List items={[
          "Dispatch Board panel sizes (left column width, bottom panel height) are also saved per user.",
          "Drag either divider to resize. Sizes save automatically when you release.",
          "Click ⊞ Reset layout in the board header to restore defaults.",
        ]} />
      </Sub>
    </>
  );
}

function AuditSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>The Audit Log records all significant system actions with full context. Accessible to Admin and Supervisor roles.</p>
      <Sub title="What is logged">
        <List items={[
          "Call status changes (assigned, completed, cancelled, reopened).",
          "Unit assignment and removal.",
          "Patient record edits.",
          "Manual time entry creation and deletion.",
          "HR document uploads and deletions.",
          "Timestamp edits on call records.",
        ]} />
      </Sub>
      <Sub title="Filtering">
        <List items={[
          "Filter by entity type: call / unit / patient / time / document.",
          "Filter by user (who performed the action).",
          "Filter by date range.",
        ]} />
      </Sub>
      <Note>The Audit Log is append-only — entries cannot be deleted or modified. It is the authoritative record of all operational actions in the system.</Note>
    </>
  );
}

function ShortcutsSection() {
  return (
    <>
      <Sub title="Dispatch Board — Quick Actions">
        <div style={{ display: "grid", gap: 8 }}>
          {[
            ["Double-click unit row", "Advance unit to next status"],
            ["Single-click unit row", "Open unit detail panel"],
            ["Drag call → unit row", "Assign call to unit"],
            ["⚡ button on call", "Set as top priority for unit"],
            ["▲ / ▼ on call", "Reorder call in unit queue"],
            ["⊞ Reset layout", "Restore default panel sizes"],
          ].map(([key, val]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <KBD>{key}</KBD>
              <span style={{ fontSize: 13, color: "var(--ems-text-secondary)" }}>{val}</span>
            </div>
          ))}
        </div>
      </Sub>
      <Sub title="Status Sequence">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 12 }}>
          {["Available", "En Route", "On Scene", "Transporting", "At Destination"].map((s, i, arr) => (
            <React.Fragment key={s}>
              <span style={{ background: "var(--ems-bg-surface-2, rgba(255,255,255,0.06))", border: "1px solid var(--ems-border)", borderRadius: 6, padding: "3px 10px", fontSize: 12, color: "var(--ems-text-primary)" }}>{s}</span>
              {i < arr.length - 1 && <span style={{ color: "#6ea8fe", fontSize: 11 }}>→</span>}
            </React.Fragment>
          ))}
        </div>
        <Note>Out of Service always returns to Available, regardless of current status.</Note>
      </Sub>
      <Sub title="Lifecycle Timestamps — Auto-Set">
        <div style={{ display: "grid", gap: 6 }}>
          {[
            ["En Route", "dispatched_at"],
            ["On Scene", "arrived_pickup_at"],
            ["Transporting", "patient_loaded_at"],
            ["At Destination", "arrived_dest_at"],
            ["Done (complete)", "completed_at"],
          ].map(([status, field]) => (
            <div key={field} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#6ea8fe", minWidth: 120 }}>{status}</span>
              <span style={{ fontSize: 12, color: "var(--ems-text-muted)", fontFamily: "monospace" }}>→ {field}</span>
            </div>
          ))}
        </div>
        <Tip>Timestamps are write-once — navigating back to a previous status does not overwrite an already-set timestamp.</Tip>
      </Sub>
      <Sub title="Role Access Summary">
        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 12, width: "100%", borderCollapse: "collapse", color: "var(--ems-text-secondary)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--ems-border)" }}>
                {["Module", "Admin", "Supervisor", "Dispatcher", "HR"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: "var(--ems-text-primary)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Dispatch Board", "✓", "✓", "✓", "—"],
                ["Call Form", "✓", "✓", "✓", "—"],
                ["Patients / Calls", "✓", "✓", "✓", "—"],
                ["Employees", "✓", "✓", "—", "✓"],
                ["Crew Planner", "✓", "✓", "✓", "✓"],
                ["Payroll", "✓", "✓", "—", "✓"],
                ["Compliance", "✓", "✓", "—", "✓"],
                ["Audit Log", "✓", "✓", "—", "—"],
                ["User Management", "✓", "—", "—", "—"],
                ["Kiosk / Clock", "✓", "✓", "✓", "✓"],
              ].map(([mod, ...vals]) => (
                <tr key={mod} style={{ borderBottom: "1px solid var(--ems-border)" }}>
                  <td style={{ padding: "5px 10px", fontWeight: 600 }}>{mod}</td>
                  {vals.map((v, i) => (
                    <td key={i} style={{ padding: "5px 10px", color: v === "✓" ? "#34d399" : "#6c757d", textAlign: "center" }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sub>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UserManualPage({ currentUser }) {
  const [openIds, setOpenIds] = useState(new Set(["getting-started"]));
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(false);
  const sectionRefs = useRef({});
  const role = currentUser?.role || "dispatcher";

  const filtered = useMemo(() => {
    let list = roleFilter
      ? SECTIONS.filter((s) => s.roles.includes(role))
      : SECTIONS;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q));
    }
    return list;
  }, [search, roleFilter, role]);

  const toggle = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const scrollTo = (id) => {
    setOpenIds((prev) => new Set([...prev, id]));
    setTimeout(() => {
      sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--ems-bg-base)" }}>

      {/* ── Sidebar ToC ── */}
      <aside style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid var(--ems-border)",
        display: "flex",
        flexDirection: "column",
        background: "var(--ems-bg-surface)",
        overflow: "hidden",
        position: "sticky",
        top: 0,
        height: "100vh",
        alignSelf: "flex-start",
      }}>
        {/* Search */}
        <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid var(--ems-border)", flexShrink: 0 }}>
          <div style={{ position: "relative" }}>
            <FaSearch style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--ems-text-muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sections…"
              style={{ width: "100%", paddingLeft: 28, paddingRight: 8, paddingTop: 6, paddingBottom: 6, fontSize: 12, background: "var(--ems-bg-surface-2, rgba(255,255,255,0.05))", border: "1px solid var(--ems-border)", borderRadius: 7, color: "var(--ems-text-primary)", outline: "none" }}
            />
          </div>
        </div>

        {/* Role filter toggle */}
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--ems-border)", flexShrink: 0 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--ems-text-secondary)" }}>
            <input type="checkbox" checked={roleFilter} onChange={(e) => setRoleFilter(e.target.checked)} style={{ cursor: "pointer" }} />
            <FaUserCog style={{ fontSize: 11 }} />
            My role only ({role})
          </label>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {filtered.map((s) => {
            const isOpen = openIds.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  width: "100%",
                  padding: "7px 14px",
                  background: isOpen ? "rgba(13,110,253,0.12)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  color: isOpen ? "#6ea8fe" : "var(--ems-text-secondary)",
                  fontWeight: isOpen ? 600 : 400,
                  textAlign: "left",
                  transition: "all 0.1s",
                }}
              >
                <span style={{ fontSize: 11, opacity: 0.7 }}>{s.icon}</span>
                {s.title}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: "16px 14px", fontSize: 12, color: "var(--ems-text-muted)" }}>No sections match.</div>
          )}
        </nav>
      </aside>

      {/* ── Content ── */}
      <main style={{ flex: 1, padding: "24px 32px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>

          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--ems-text-primary)", marginBottom: 4 }}>User Manual</h2>
            <p style={{ fontSize: 13, color: "var(--ems-text-muted)" }}>EMS Workflow System — operational guide for all roles. Click any section to expand.</p>
          </div>

          {filtered.map((s) => {
            const isOpen = openIds.has(s.id);
            return (
              <div
                key={s.id}
                ref={(el) => (sectionRefs.current[s.id] = el)}
                style={{
                  marginBottom: 10,
                  border: "1px solid var(--ems-border)",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "var(--ems-bg-surface)",
                }}
              >
                {/* Section header */}
                <button
                  onClick={() => toggle(s.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "14px 18px",
                    background: isOpen ? "rgba(13,110,253,0.08)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.15s",
                  }}
                >
                  <span style={{ fontSize: 16, color: isOpen ? "#6ea8fe" : "var(--ems-text-muted)", flexShrink: 0 }}>{s.icon}</span>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: isOpen ? "var(--ems-text-primary)" : "var(--ems-text-secondary)" }}>{s.title}</span>
                  {!s.roles.includes(role) && (
                    <span style={{ fontSize: 10, padding: "2px 7px", background: "rgba(100,100,100,0.15)", borderRadius: 4, color: "var(--ems-text-muted)", marginRight: 8 }}>
                      not your role
                    </span>
                  )}
                  {isOpen ? <FaChevronDown style={{ fontSize: 11, color: "var(--ems-text-muted)" }} /> : <FaChevronRight style={{ fontSize: 11, color: "var(--ems-text-muted)" }} />}
                </button>

                {/* Section body */}
                {isOpen && (
                  <div style={{ padding: "16px 20px 20px", borderTop: "1px solid var(--ems-border)" }}>
                    {s.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
