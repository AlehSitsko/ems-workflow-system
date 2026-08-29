import React, { useState, useRef, useMemo } from "react";
import {
  FaChevronDown, FaChevronRight, FaSearch, FaTh, FaPhone, FaUsers,
  FaClipboardList, FaCalendarAlt, FaBell, FaCog, FaAmbulance,
  FaUserMd, FaFileAlt, FaMoneyBillWave, FaShieldAlt, FaHistory,
  FaLightbulb, FaExclamationTriangle, FaInfoCircle, FaStar,
  FaKeyboard, FaUserCog, FaRoute, FaClipboardCheck, FaTruck,
  FaChartBar, FaTasks, FaLifeRing, FaRocket, FaDesktop, FaBalanceScale,
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
    id: "daily-workflow",
    icon: <FaRoute />,
    title: "Basic Daily Workflow",
    roles: ["admin", "supervisor", "dispatcher"],
    content: <DailyWorkflowSection />,
  },
  {
    id: "preferences",
    icon: <FaCog />,
    title: "User Preferences & Personal Settings",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <PreferencesSection />,
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
    id: "calendar",
    icon: <FaCalendarAlt />,
    title: "Calendar",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <CalendarSection />,
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
    title: "Calls History",
    roles: ["admin", "supervisor", "dispatcher"],
    content: <CallsSection />,
  },
  {
    id: "crew",
    icon: <FaCalendarAlt />,
    title: "Crew Planner",
    roles: ["admin", "supervisor", "dispatcher"],
    content: <CrewSection />,
  },
  {
    id: "crew-presets",
    icon: <FaClipboardCheck />,
    title: "Crew Presets",
    roles: ["admin", "supervisor", "dispatcher"],
    content: <CrewPresetsSection />,
  },
  {
    id: "vehicles",
    icon: <FaTruck />,
    title: "Vehicles",
    roles: ["admin", "supervisor", "dispatcher"],
    content: <VehiclesSection />,
  },
  {
    id: "employees",
    icon: <FaUsers />,
    title: "Employees & HR",
    roles: ["admin", "supervisor", "hr"],
    content: <EmployeesSection />,
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
    icon: <FaFileAlt />,
    title: "Compliance / Documents",
    roles: ["admin", "supervisor", "hr"],
    content: <ComplianceSection />,
  },
  {
    id: "notifications",
    icon: <FaBell />,
    title: "Notifications & Alerts",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <NotificationsSection />,
  },
  {
    id: "supervisor",
    icon: <FaChartBar />,
    title: "Supervisor Dashboard",
    roles: ["admin", "supervisor"],
    content: <SupervisorSection />,
  },
  {
    id: "users",
    icon: <FaUserCog />,
    title: "User Management",
    roles: ["admin"],
    content: <UserManagementSection />,
  },
  {
    id: "audit",
    icon: <FaHistory />,
    title: "Audit Log",
    roles: ["admin", "supervisor", "hr"],
    content: <AuditSection />,
  },
  {
    id: "data-safety",
    icon: <FaShieldAlt />,
    title: "Data Safety Notes",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <DataSafetySection />,
  },
  {
    id: "workflows",
    icon: <FaTasks />,
    title: "Common Workflows",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <CommonWorkflowsSection />,
  },
  {
    id: "troubleshooting",
    icon: <FaLifeRing />,
    title: "Troubleshooting",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <TroubleshootingSection />,
  },
  {
    id: "more-modules",
    icon: <FaClipboardList />,
    title: "More Modules",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <MoreModulesSection />,
  },
  {
    id: "desktop",
    icon: <FaDesktop />,
    title: "Desktop App (Windows)",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <DesktopSection />,
  },
  {
    id: "planned",
    icon: <FaRocket />,
    title: "Planned / Future Features",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <PlannedFeaturesSection />,
  },
  {
    id: "license",
    icon: <FaBalanceScale />,
    title: "License & Disclaimer",
    roles: ["admin", "supervisor", "dispatcher", "hr"],
    content: <LicenseSection />,
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

function Planned({ children }) {
  return (
    <div style={{ display: "flex", gap: 10, background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
      <FaRocket style={{ color: "#a78bfa", marginTop: 2, flexShrink: 0 }} />
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

// Compact workflow card used in the Common Workflows section.
function WorkflowCard({ title, steps }) {
  return (
    <div style={{ border: "1px solid var(--ems-border)", borderRadius: 10, padding: "14px 16px", marginBottom: 14, background: "var(--ems-bg-surface-2, rgba(255,255,255,0.03))" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ems-text-primary)", marginBottom: 10 }}>{title}</div>
      {steps.map((s, i) => <Step key={i} n={i + 1}>{s}</Step>)}
    </div>
  );
}

// ── Section content components ────────────────────────────────────────────────

function GettingStarted() {
  return (
    <>
      <p style={{ fontSize: 14, color: "var(--ems-text-secondary)", marginBottom: 12 }}>
        EMS Workflow System is an operational management platform for ambulance / EMS medical transport organizations. It helps dispatchers, supervisors, HR/admin staff, and managers organize calls, patients, crew units, vehicles, employee records, and dispatch workflow in one place.
      </p>
      <p style={{ fontSize: 14, color: "var(--ems-text-secondary)", marginBottom: 16 }}>
        It is not a replacement for CAD systems, EMR/clinical documentation systems, or billing software — it covers dispatch workflows, staff management, and operational continuity.
      </p>

      <Sub title="Typical Workflow">
        <Step n={1}>Start Taking Call.</Step>
        <Step n={2}>Search for the patient, or create a new one if none is found.</Step>
        <Step n={3}>Enter trip details — pickup, destination, service level, time.</Step>
        <Step n={4}>Save the call.</Step>
        <Step n={5}>Assign the call to a unit on the Dispatch Board.</Step>
        <Step n={6}>Track unit and call status as the trip progresses.</Step>
        <Step n={7}>Complete the call once transport is finished.</Step>
        <Step n={8}>Review call history and reports afterward.</Step>
        <Tip>See <strong>Basic Daily Workflow</strong> for a more detailed walk-through, and <strong>Common Workflows</strong> for short step-by-step cards for specific tasks.</Tip>
      </Sub>

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
        <Tip>Appearance (theme), time format, and notification preferences are all covered in <strong>User Preferences & Personal Settings</strong>.</Tip>
      </Sub>
    </>
  );
}

function DailyWorkflowSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>
        A practical run-through of what a dispatcher typically does during a shift, start to finish.
      </p>
      <Sub title="Daily Dispatcher Workflow">
        <Step n={1}>Open Dashboard or Dispatch Board to see today's active calls and units.</Step>
        <Step n={2}>Check today's active calls and units — open, assigned, and completed.</Step>
        <Step n={3}>Use Start Taking Call or + New Call to enter a new trip.</Step>
        <Step n={4}>Search for an existing patient before creating a new one.</Step>
        <Step n={5}>Review patient alerts, the dispatch comment, and transport instructions/contacts if the patient has any on file.</Step>
        <Step n={6}>Save the call.</Step>
        <Step n={7}>Assign or drag the call to a crew unit, depending on the current board mode.</Step>
        <Step n={8}>Update unit status as the trip progresses (En Route → On Scene → Transporting → At Destination).</Step>
        <Step n={9}>Watch for visual alerts — overdue calls, stuck units, delayed shifts — which flash red on the board.</Step>
        <Step n={10}>Complete the call once transport is finished.</Step>
        <Note>The exact interaction (drag-and-drop vs. clicking Assign) depends on where you are on the board — both accomplish the same thing: linking an open call to a unit.</Note>
      </Sub>
    </>
  );
}

function PreferencesSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>
        The system can be configured to your liking. Preferences are saved to your user account (not just this browser) and apply the next time you log in, from any device.
      </p>

      <Sub title="Theme / Appearance">
        <List items={[
          "Click your avatar (top right) → Dark mode / Light mode to toggle.",
          "Preference is saved to your account and restored on next login.",
        ]} />
      </Sub>

      <Sub title="Time Format">
        <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 8 }}>
          Time Format controls how time inputs and time displays appear across the system — it does not change how time is stored.
        </p>
        <List items={[
          "12-hour format — example: 2:30 PM.",
          "24-hour format — example: 14:30.",
          "Default is 12-hour.",
          "Change it from Settings (your avatar → Settings → Preferences).",
        ]} />
        <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 8 }}>Applies to every module that shows or asks for a time:</p>
        <List items={[
          "Call Form (pickup time, appointment time, return time)",
          "Dispatch Board (call cards, unit shift times, the New Call drawer, shift alerts)",
          "Crew Planner (unit start/end time)",
          "Calls History and call detail",
          "Payroll (where time-of-day values appear)",
        ]} />
        <Note>Changing this setting does not change stored call data — it only changes how time is displayed and entered in the interface. There is no separate 12h/24h switch inside individual forms; every time field follows this one setting.</Note>
      </Sub>

      <Sub title="Notifications & Dispatch Alerts">
        <List items={[
          "Browser Notifications — desktop alerts for important dispatch events, controlled by your browser's notification permission.",
          "Dispatch Visual Alerts — the red flashing/highlighting on overdue calls and stuck units on the Dispatch Board.",
        ]} />
        <Tip>Both are configured on the same Settings page. See <strong>Notifications & Alerts</strong> for the full breakdown of statuses and thresholds.</Tip>
      </Sub>

      <Sub title="Dispatch Board Panel Sizes">
        <List items={[
          "The left column width and bottom panel height on the Dispatch Board are also saved per user.",
          "Drag either divider to resize. Sizes save automatically when you release.",
          "Click ⊞ Reset layout in the board header to restore defaults.",
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

function CalendarSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>The Calendar is a read-only overview of what is scheduled and how ready each day is. It aggregates the same calls and crew shifts you work with on the Dispatch Board — it does not create separate records. Use it to see load, gaps, and upcoming conflicts at a glance, then jump into Dispatch to act.</p>

      <Sub title="Month view">
        <List items={[
          "Each day cell shows compact counts — calls, units, and unassigned calls — plus a readiness indicator.",
          "Readiness: Ready (all needed calls assigned, crews complete), Needs attention (unassigned calls, incomplete crews, missing pickup time), or Critical (e.g. an ALS call on a BLS unit).",
          "Small badges mark other events that day: 🎂 birthdays, 🎓 certification expirations, 🗒️ task due dates, 🚑 vehicle dates.",
          "Weekends are tinted and US federal holidays are marked. Use the arrows or Today to change month.",
        ]} />
        <Note>Everything is filtered by your role on the server. HR sees crew shifts, employee birthdays and certifications — never patient details, calls, or vehicles. Dispatchers see certifications as a fact only, without the employee's name.</Note>
      </Sub>

      <Sub title="Your calendar preferences">
        <List items={[
          "Open Settings to control what appears on your calendar: toggle each event source on/off, show/hide weekend highlighting and US holidays, choose the week start (Sunday or Monday), and pick comfortable or compact density.",
          "These are personal display preferences — they don't change what other users see or your actual permissions.",
        ]} />
      </Sub>

      <Sub title="Day Operations drawer">
        <Step n={1}>Click any day to open its drawer.</Step>
        <Step n={2}>Review the day summary, scheduled calls, crew units, and any detected issues.</Step>
        <Step n={3}>Click <strong>Open Day in Dispatch Board</strong> to work that date, or click a specific call/unit to open it directly on the board.</Step>
      </Sub>

      <Sub title="Planning, Live, and History">
        <List items={[
          "Opening a future date puts the Dispatch Board in Planning mode — you can add units and assign calls ahead of time, but live status changes are disabled.",
          "Today is Live mode — full operations.",
          "A past date is History mode — read-only.",
          "The board header shows the current mode and lets you step Previous day / Today / Next day.",
        ]} />
        <Tip>Planning assignments use the same records as live dispatch — nothing is duplicated, so a call you pre-assign is already assigned when its day becomes today.</Tip>
      </Sub>
    </>
  );
}

function DispatchSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>Dispatch Board is the main operational screen for assigning calls to units and tracking real-time transport progress. Crew planning and call dispatch are unified on one page.</p>

      <Sub title="Layout">
        <List items={[
          "Left panel — open calls list (Calls tab) and unassigned staff (Staff tab), plus a date selector and the + New Call / + Day Unit / + Night Unit buttons.",
          "Right panel — unit table (top) and selected unit detail (bottom).",
          "Active / Done / Cancelled / All filter tabs above the calls list.",
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

      <Sub title="Unit & Call Statuses">
        <List items={[
          "Unit status sequence: available → en_route → on_scene → transporting → at_destination, shown as Available / En Route / On Scene / Transporting / At Destination.",
          "out_of_service is a separate state a unit can be placed into at any time, and always returns to Available.",
          "Call status: new → assigned once linked to a unit → completed when the trip is done, or cancelled with a mandatory reason.",
          "Single-click a unit row to open the unit detail panel below.",
          "Double-click a unit row to advance to the next status in the sequence.",
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
          "Go to Settings (your avatar → Settings) to configure the thresholds — see Dispatch Visual Alerts in User Preferences.",
          "Default: call overdue after 0 extra minutes; unit stuck after 30 minutes.",
        ]} />
        <Warning>These are visual alerts only — no sound is played automatically. Enable Browser Notifications in Settings for background alerts when the tab isn't open.</Warning>
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

      <Sub title="Intake Workflow">
        <Step n={1}>Search for the patient first.</Step>
        <Step n={2}>If the patient exists, select them — the form pre-fills their data.</Step>
        <Step n={3}>Review the patient's alerts and dispatch comment (Risk Card).</Step>
        <Step n={4}>Fill in trip details — pickup, appointment time, service level.</Step>
        <Step n={5}>Enter the pickup and dropoff address.</Step>
        <Step n={6}>Select the service level (Stretcher / BLS / ALS / Emergency).</Step>
        <Step n={7}>Add caller info — name, callback number, caller type.</Step>
        <Step n={8}>Save the call.</Step>
        <Note>Required fields are marked with an asterisk (*).</Note>
      </Sub>

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

      <Sub title="Call Quality Score">
        <List items={[
          "A quality score reviews how complete the intake was — missing critical/optional fields are flagged.",
          "It helps supervisors review call intake completeness after the fact.",
        ]} />
        <Note>The quality score is not shown on the Dispatch Board because Dispatch Board focuses on live operations, not post-call review. See Supervisor Dashboard for quality reporting.</Note>
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
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>Patients store recurring operational information used during call intake and dispatch. This page is the central patient database.</p>
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
          "Edit tab: update any patient field, including dispatch comment and transport defaults (mobility level, transport/access instructions, preferred language, interpreter needed).",
          "Call History tab: all calls associated with this patient.",
          "Default Service Level: set per patient — pre-fills the Call Form.",
        ]} />
      </Sub>
      <Sub title="Dispatch Comment">
        <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 8 }}>Dispatch Comment is a short operational note for dispatchers — distinct from general/medical notes, kept short and practical. Examples:</p>
        <List items={[
          "Call daughter before pickup.",
          "Use side entrance.",
          "Patient needs extra time to get ready.",
          "Do not send wheelchair van.",
        ]} />
        <p style={{ fontSize: 13, color: "var(--ems-text-secondary)" }}>Shows on the patient's Overview tab, the Call Form Risk Card when the patient is selected, and the Dispatch Board call detail modal.</p>
      </Sub>
      <Sub title="Patient Alerts">
        <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 8 }}>Patient Alerts highlight important transport, safety, contact, facility, billing, or language information.</p>
        <List items={[
          "Severity: Info, Warning, Critical.",
          "Categories: Transport, Safety, Contact, Facility, Billing, Equipment, Behavior, Language, Other.",
          "Active alerts (not resolved, not expired) show as colored badges on the Dispatch Board call card, in the call detail modal, and on the Call Form Risk Card.",
          "Resolve an alert from the Alerts tab once it no longer applies — resolved alerts are hidden by default (toggle Show resolved to see them).",
        ]} />
        <Tip>Use Alerts for anything a crew needs to know before or during the trip — fall risk, aggressive pet on scene, gate code, oxygen requirement, etc.</Tip>
      </Sub>
      <Sub title="Archive / Restore">
        <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 8 }}>Patients are archived instead of permanently deleted, to protect call history and prevent orphan records.</p>
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

function CrewSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>Crew Planner is used to create daily crew units, assign employees, select vehicle/unit type, set shift times, and manage day and night units. Planning can be done from the Crew Planner page or directly on the Dispatch Board — both use the same data.</p>
      <Sub title="Creating a Crew Unit">
        <List items={[
          "Select a shift date.",
          "Click + Day Unit or + Night Unit.",
          "Set truck/vehicle, unit type (BLS / ALS / etc.), and start time.",
          "Select a shift duration (8 / 10 / 12 hours or custom) — the planned end time is computed automatically.",
          "Assign Driver (required), Medical, Assist 1, Assist 2.",
          "Certifications are validated: ALS units require a Paramedic in the Medical slot.",
        ]} />
        <Note>The system may warn about overlapping shifts on the same vehicle, or missing qualified staff for a slot — these are warnings you can review, not silent blocks (except minimum crew size, which is enforced).</Note>
      </Sub>
      <Sub title="Night Units">
        <List items={[
          "Night units have a start time, end time, and end date (for overnight).",
          "Use Make Night from an existing day unit to carry the same crew to a night shift.",
          "Choose to replace or keep an existing night crew when converting.",
        ]} />
      </Sub>
      <Sub title="Shift & Delay Alerts">
        <List items={[
          "Units approaching or past their planned end time are flagged with a near-end or overdue alert on the Crew Planner and Dispatch Board.",
          "These alerts also appear as bell notifications for admin, supervisor, and dispatcher roles.",
        ]} />
      </Sub>
      <Tip>Crew planning on the Dispatch Board is fully integrated — changes made there are immediately visible in the Crew Planner and vice versa. Crew Presets and the Vehicle Registry are covered in their own sections.</Tip>
    </>
  );
}

function CrewPresetsSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>Crew Presets speed up daily planning by saving a full crew configuration you can reapply later. Found inside Crew Planner.</p>
      <Sub title="Using Presets">
        <List items={[
          "Apply Existing Preset — select a saved preset from the dropdown to pre-fill all crew slots for the date.",
          "Save current crew as a new preset once a unit's crew configuration is set up the way you want to reuse it.",
          "Presets are shared across the team, not private to one user.",
        ]} />
        <Tip>Use presets for recurring shift patterns (e.g. the same weekday crew) instead of re-entering the same assignments every day.</Tip>
      </Sub>
    </>
  );
}

function VehiclesSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>Vehicle Registry stores the units/trucks used by Crew Planner and the Dispatch Board. Found inside Crew Planner as an expandable "Vehicle Registry" panel.</p>
      <Sub title="Managing Vehicles">
        <List items={[
          "Fields: unit name, unit number, unit type (BLS / ALS / BARI / CCT), and notes.",
          "Toggle a vehicle active/inactive instead of deleting it, to keep historical assignments intact.",
          "Delete removes a vehicle from the registry entirely.",
        ]} />
        <Note>Selecting a vehicle in the crew unit form auto-fills its unit type — this replaces free-text truck numbers with a consistent dropdown list.</Note>
      </Sub>
    </>
  );
}

function EmployeesSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>The Employees module manages all staff records, certifications, time entries, and HR documents used for scheduling, crew assignment, and compliance.</p>
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
      <Sub title="Browser Notifications">
        <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 8 }}>Browser notifications are desktop alerts for important dispatch events, delivered through your browser even when the tab isn't open. The status shown reflects your actual browser permission, not just a saved preference:</p>
        <List items={[
          "Not enabled — permission hasn't been requested yet. Click Enable notifications.",
          "Enabled — permission granted. Use Send test notification to confirm it works end-to-end.",
          "Blocked by browser — permission was denied. See the instruction below to re-allow it.",
          "Unsupported — this browser does not support notifications.",
          "Requires HTTPS / localhost — notifications need a secure context to work.",
          "Browser enabled / Push not configured — your browser granted permission, but the server has no push service configured yet. This is a server-side setup issue, not something fixable from this page.",
        ]} />
        <Tip>If notifications are blocked: click the lock icon near the browser address bar → Site settings → Notifications → Allow, then reload the page.</Tip>
      </Sub>
      <Sub title="Dispatch Visual Alerts">
        <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 8 }}>Dispatch Visual Alerts control when calls and units flash or highlight red on the Dispatch Board — this is separate from Browser Notifications.</p>
        <List items={[
          "Call overdue alert — minutes after pickup time before a call flashes red on the board. A value of 0 means it can highlight immediately once pickup time is exceeded.",
          "Unit stuck alert — minutes in the same status before the unit status flashes red. A value of 30 means a unit can be highlighted if its status hasn't changed for 30 minutes.",
        ]} />
      </Sub>
    </>
  );
}

function SupervisorSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>The Supervisor Dashboard reviews dispatcher performance and call intake quality across the team. Admin and Supervisor roles only.</p>
      <Sub title="Dispatcher Analytics Table">
        <List items={[
          "One row per dispatcher, with total calls taken.",
          "Average call quality score.",
          "Count of calls with missing critical fields, and missing optional fields.",
          "Count of calls that had missing information explained (an explanation was provided when a required field was skipped).",
        ]} />
        <Tip>Use this to spot dispatchers who may need a refresher on intake procedure, or fields that are frequently skipped.</Tip>
      </Sub>
      <Sub title="Punctuality & On-Time Performance">
        <List items={[
          "On-time performance over a date range, grouped by driver, crew, or dispatcher (dispatcher grouping is Admin / Supervisor only).",
          "Per group: pickups and appointments measured, how many were late, on-time %, and average / worst lateness in minutes — worst offenders first.",
          "\"Late\" means arriving more than the organisation's grace window after the scheduled time; set the grace under Organization settings.",
          "Exportable as CSV. A team-facing Crew Punctuality page (by driver / crew) also lives in the Operations menu so the whole crew can see who is running late.",
        ]} />
        <Note>Only completed trips that have both a scheduled and an actual time are scored.</Note>
      </Sub>
    </>
  );
}

function UserManagementSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>User Management creates and manages system user accounts. Admin role only.</p>
      <Sub title="Managing Users">
        <List items={[
          "Create, edit, activate, and deactivate user accounts.",
          "Assign a role: admin, supervisor, dispatcher, or hr.",
          "Link a user account to an employee record — this enables the Clock In/Out widget on that user's Dashboard.",
          "The users table shows the linked employee name, if any.",
        ]} />
        <Warning>Deactivating a user immediately blocks their login. Their historical records (calls, audit entries, etc.) are not affected.</Warning>
      </Sub>
    </>
  );
}

function AuditSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>The Audit Log records all significant system actions with full context. Accessible to Admin, Supervisor, and HR roles.</p>
      <Sub title="What is logged">
        <List items={[
          "Call status changes (assigned, completed, cancelled, reopened).",
          "Unit assignment and removal.",
          "Patient record edits, archive/restore, alert and contact changes.",
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

function DataSafetySection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>
        EMS Workflow System is designed to preserve operational history. Records that other data depends on — patients with existing calls, for example — are archived instead of permanently deleted, so nothing important becomes an orphan record.
      </p>
      <Sub title="Good Practices">
        <List items={[
          "Use Archive instead of Delete when it's offered (Patients, for example) — it hides the record from active use without breaking call history.",
          "Avoid entering real patient data in a demo or training environment.",
          "Take a database backup before running migrations or major updates.",
          "Browser notifications are controlled entirely by your browser's own permission system — the app cannot force them on.",
          "Admin, Supervisor, and HR can view the Audit Log; only Admin and Supervisor can edit lifecycle timestamps — treat those permissions carefully.",
        ]} />
      </Sub>
      <Note>Production authorization hardening (stronger session/token-based login, full permission review) is planned as a final phase.</Note>
    </>
  );
}

function CommonWorkflowsSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 16 }}>Short step-by-step cards for the most common tasks. See individual module sections above for full detail.</p>

      <WorkflowCard title="Create a new transport call" steps={[
        <>Click <strong>Start Taking Call</strong> or <strong>+ New Call</strong>.</>,
        "Search for the patient and select them, or continue as a new patient.",
        "Review the patient's alerts and dispatch comment, if any.",
        "Fill in trip details — pickup, destination, service level, time.",
        "Save the call.",
      ]} />

      <WorkflowCard title="Assign a call to a unit" steps={[
        "Open the Dispatch Board.",
        "Select the correct date.",
        "Find the unassigned call in the Open Calls list.",
        "Drag or assign the call to a unit.",
        "Update the unit's status as the trip progresses.",
      ]} />

      <WorkflowCard title="Create a day unit" steps={[
        "Open Crew Planner or the Dispatch Board.",
        <>Click <strong>+ Day Unit</strong>.</>,
        "Select the vehicle, unit type, crew, and shift start time.",
        "Save the unit.",
      ]} />

      <WorkflowCard title="Change your personal time format" steps={[
        "Open Settings (your avatar → Settings).",
        "Find Time Format under Preferences.",
        "Select 12-hour or 24-hour.",
        "Click Save.",
      ]} />

      <WorkflowCard title="Enable browser notifications" steps={[
        "Open Settings (your avatar → Settings).",
        "Click Enable notifications under Browser Notifications.",
        "Allow the permission prompt in your browser.",
        "Click Send test notification to confirm it worked.",
      ]} />
    </>
  );
}

function TroubleshootingSection() {
  const items = [
    { problem: "Notifications are blocked", fix: "Click the lock icon near the browser's address bar → Site settings → Notifications → Allow, then reload the page." },
    { problem: "Times look different than expected", fix: "Go to Settings → Preferences → Time Format and choose 12-hour or 24-hour format." },
    { problem: "I cannot find an archived patient", fix: "Enable the Show archived toggle on the Patients page search bar." },
    { problem: "Dispatch Board does not show today's calls", fix: "Check the selected date at the top of the board, the status filter tabs (Open/Done/Cancelled/All), and confirm the call actually saved (check Calls history)." },
    { problem: "A unit or call is highlighted red", fix: "This is a Dispatch Visual Alert — check whether the call's pickup time has passed, or the unit's status hasn't changed recently. Thresholds are adjustable in Settings." },
  ];
  return (
    <>
      {items.map((it, i) => (
        <Sub key={i} title={it.problem}>
          <p style={{ fontSize: 13, color: "var(--ems-text-secondary)" }}>{it.fix}</p>
        </Sub>
      ))}
    </>
  );
}

function MoreModulesSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>Modules that support the core dispatch flow. Availability still follows your role.</p>

      <Sub title="Scheduling & Confirmation">
        <List items={[
          "Scheduling Inbox — calls saved without a trip date land here so they are never lost; schedule them onto a day from one place (oldest intake first).",
          "Recurring Trips — a standing order (e.g. dialysis three times a week) materializes ordinary calls a few weeks ahead; a call a human has touched is never rewritten.",
          "Confirmation Round — work tomorrow's trips as a call list: mark each Confirmed, No answer, or Declined (a declined trip is cancelled with the reason kept).",
        ]} />
      </Sub>

      <Sub title="Day Closeout">
        <List items={[
          "Review the day as it ended: loose ends (a call left assigned, a shift with no actual end time), a sign-off with your name, and a stored snapshot that stays true even if a call is edited later.",
          "Supervisors and admins close the day; dispatchers can read it; only an admin reopens.",
        ]} />
      </Sub>

      <Sub title="Leave, PTO & Tasks">
        <List items={[
          "Leave / Absence — staff request time off; HR approves or denies. Sensitive types (sick, medical, bereavement) show only as 'unavailable' to non-HR roles.",
          "PTO & Holidays — a real balance behind leave: monthly accrual, a per-org holiday calendar, and holiday/weekend-aware deductions. Over-drawing warns but never blocks.",
          "Tasks — assign work to staff (or everyone), with comments, an activity log, priorities and due dates; overdue/today tasks raise a sidebar badge.",
        ]} />
      </Sub>

      <Sub title="Time, Kiosk & Portal">
        <List items={[
          "Time tracking & the PIN kiosk — clock in/out at a shared wall kiosk by a 4-digit PIN, feeding the same time entries payroll uses.",
          "Employee Portal — a self-service area (My Schedule, My Tasks, My Leave, My Hours, My Documents) for the 'employee' login role, isolated from the operations app.",
          "Reports & Analytics — under Management: call volume and outcomes, fleet utilization, and staff hours, each with CSV export.",
        ]} />
      </Sub>
    </>
  );
}

function DesktopSection() {
  return (
    <>
      <p style={{ fontSize: 14, color: "var(--ems-text-secondary)", marginBottom: 12 }}>
        EMS Workflow System also ships as a standalone <strong>Windows desktop app</strong> — the same application as the web version, packaged so it runs entirely on one computer with a local database. No Python, Node, Docker, or internet connection is required.
      </p>

      <Sub title="First run">
        <List items={[
          "The database starts empty — the app asks you to create the first local administrator account. No demo data is added.",
          "After that, sign in normally. Tick 'Remember me' to stay signed in across restarts; leave it off to sign in each launch.",
        ]} />
      </Sub>

      <Sub title="Works offline">
        <List items={[
          "Everything runs locally, so the app works with no internet.",
          "Features that need the internet (browser push notifications, external calendar sync, breach-corpus password checks) are simply inert offline — they never block the app.",
        ]} />
      </Sub>

      <Sub title="Your data & backups">
        <List items={[
          "Your database, uploads, logs and backups live in your Windows user profile (%APPDATA%), outside the install folder — so they survive updating or reinstalling the app.",
          "File → Open data folder opens that location in Explorer.",
          "File → Create backup / Export backup to folder makes a timestamped, validated copy; the app also auto-backs-up before any launch that might migrate the database.",
          "File → Restore from backup validates the chosen file, snapshots your current database first, then restarts on the restored copy — so a restore is itself reversible.",
        ]} />
        <Warning>Uninstalling does not delete your data folder. To remove your data, delete it yourself from the data folder above.</Warning>
      </Sub>

      <Sub title="Good to know">
        <List items={[
          "Only one copy runs at a time (a single-instance lock protects the database file).",
          "Help → About shows the app, Electron and Chromium versions, your data-folder path, and the license.",
          "The build is unsigned, so on first launch Windows SmartScreen may warn — choose 'More info' → 'Run anyway'.",
        ]} />
      </Sub>
    </>
  );
}

function LicenseSection() {
  return (
    <>
      <Sub title="License">
        <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", lineHeight: 1.6, marginBottom: 10 }}>
          EMS Workflow System is released under the <strong>MIT License</strong> (© 2026 Aleh Sitsko). You are free to use, copy, modify, and distribute it, provided the copyright and license notice are retained. The software is provided <strong>“as is”, without warranty of any kind</strong>.
        </p>
      </Sub>
      <Sub title="Disclaimer">
        <Warning>
          <strong>Not for clinical or production use.</strong> This is a portfolio project and must not be used to manage real patients or store real patient data (PHI). It is not a clinical ePCR, does not implement NEMSIS or HIPAA-grade safeguards, and carries no warranty or fitness for medical operations.
        </Warning>
      </Sub>
    </>
  );
}

function PlannedFeaturesSection() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ems-text-secondary)", marginBottom: 14 }}>Most features once listed here have shipped. What remains below is deliberately deferred — it needs an external service or is a research problem — not overlooked.</p>
      <Sub title="Deferred (external dependency / research)">
        <Planned>Two-way Google / Outlook calendar sync — needs an OAuth integration and a separate privacy policy before any data could cross the boundary. One-way ICS export of manual events is available today.</Planned>
        <Planned>Route optimization — automatic trip routing and sequencing is a research problem (a routing engine plus constraints), not a near-term build.</Planned>
      </Sub>
      <Sub title="Now available (previously listed as planned)">
        <List items={[
          "Assignment conflict detection — crew and vehicle double-booking by overlapping time, surfaced on the Dispatch Board and Calendar.",
          "Day / Operations timeline — per-trip planned-vs-actual milestones, plus a Day Closeout sign-off.",
          "Reports & Analytics — call volume and outcome mix, fleet utilization, and staff hours, with CSV export.",
          "Recurring trips, a Scheduling Inbox for undated calls, and a Confirmation Round for tomorrow's trips.",
          "Session-cookie authentication with CSRF, a password policy, per-device session revocation, and a full role/permission review.",
        ]} />
      </Sub>
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
                ["Crew Planner / Vehicles / Presets", "✓", "✓", "✓", "—"],
                ["Payroll", "✓", "✓", "—", "✓"],
                ["Compliance", "✓", "✓", "—", "✓"],
                ["Supervisor Dashboard", "✓", "✓", "—", "—"],
                ["Audit Log", "✓", "✓", "—", "✓"],
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
            <p style={{ fontSize: 13, color: "var(--ems-text-muted)" }}>Your guide to using EMS Workflow System. New here? Start with Getting Started below. Click any section to expand.</p>
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
