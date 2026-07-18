import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaPen, FaArchive, FaTrashRestore, FaUserInjured } from "react-icons/fa";

import EntityWorkspace from "../../components/workspace/EntityWorkspace";
import { PageSection } from "../../components/ui/Page";
import { EntityField, ActivityTimeline, OverflowMenu } from "../../components/ui/Entity";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States";
import StatusBadge from "../../components/ui/StatusBadge";
import { ServiceLevelBadge } from "../../components/taxonomy/TaxonomyBadges";
import PatientContactsTab from "../../components/patients/PatientContactsTab";
import PatientAlertsTab from "../../components/patients/PatientAlertsTab";
import PatientCallHistoryTab from "../../components/patients/PatientCallHistoryTab";
import { usePatientAlerts } from "../../hooks/usePatientAlerts";
import { usePatientContacts } from "../../hooks/usePatientContacts";
import { useToast } from "../../components/ui/useToast";
import { useConfirm } from "../../components/ui/useConfirm";
import { useUserSettings } from "../../context/useUserSettings";
import { hasPatientAccess } from "../../api/authApi";
import { getPatient, archivePatient, restorePatient } from "../../api/patientsApi";
import { getPatientCalls } from "../../api/callsApi";
import { getAuditLog } from "../../api/auditApi";
import { formatDateTime } from "../../utils/dateDisplay";

const ALERT_TONE = { critical: "danger", warning: "warning", info: "info" };

const AUDIT_LABEL = {
  "patient.created": "Patient record created",
  "patient.updated": "Patient details updated",
  "patient.archived": "Patient archived",
  "patient.restored": "Patient restored",
  "patient.dispatch_comment.updated": "Dispatch note updated",
  "patient.alert.created": "Alert raised",
  "patient.alert.updated": "Alert resolved",
};

const yesNo = (v) => (v ? "Yes" : "No");

/**
 * Patient Workspace.
 *
 * Every tab is backed by a real endpoint. Contacts, Alerts and Call history
 * reuse the existing tab components (and their hooks) so behaviour matches the
 * old drawer exactly; Overview and Transport are read views of the patient
 * record, and Activity comes from the patient audit log. Editing opens the
 * dedicated patient form page.
 */
export default function PatientWorkspacePage({ currentUser }) {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";

  const canView = hasPatientAccess(currentUser);

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [tabData, setTabData] = useState({ calls: null, activity: null });
  const [tabState, setTabState] = useState({});

  const alerts = usePatientAlerts({ selectedPatient: patient, toast });
  const contacts = usePatientContacts({ selectedPatient: patient, toast, confirm });

  const loadPatient = useCallback(() => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    return getPatient(patientId)
      .then(setPatient)
      .catch((err) => {
        if (err.status === 404) setNotFound(true);
        else setError(err.message || "Failed to load patient");
      })
      .finally(() => setLoading(false));
  }, [patientId]);

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    loadPatient();
  }, [loadPatient, canView]);

  // Alerts drive a safety cue in the header, so they load with the patient.
  // Contacts load once too, for the Contacts tab.
  useEffect(() => {
    if (!patient) return;
    alerts.loadPatientAlerts(patient.id);
    contacts.loadPatientContacts(patient.id);
    // The hooks are recreated each render; run this only when the patient id
    // changes, exactly as the drawer did on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id]);

  const loadTab = useCallback((key, loader) => {
    setTabState((s) => (s[key] === "loading" ? s : { ...s, [key]: "loading" }));
    loader()
      .then((data) => {
        setTabData((d) => ({ ...d, [key]: data }));
        setTabState((s) => ({ ...s, [key]: "ready" }));
      })
      .catch((err) => setTabState((s) => ({ ...s, [key]: err.message || "Failed to load" })));
  }, []);

  useEffect(() => {
    if (!patient) return;
    if (tabData.calls === null && tabState.calls === undefined) {
      loadTab("calls", () => getPatientCalls(patient.id));
    }
    if (tabData.activity === null && tabState.activity === undefined) {
      loadTab("activity", () => getAuditLog(
        { entity_type: "patient", entity_id: patient.id, per_page: 50 },
        { "X-User-Role": currentUser?.role || "", "X-User-Id": String(currentUser?.id || "") },
      ).then((d) => d.entries || d.items || (Array.isArray(d) ? d : [])));
    }
  }, [patient, currentUser, loadTab, tabData, tabState]);

  const handleEdit = () => navigate(`/patients/${patient.id}/edit`);

  const handleArchive = async () => {
    const ok = await confirm({
      title: `Archive ${patient.first_name} ${patient.last_name}?`,
      message: "The patient is hidden from the active list but keeps their call history.",
      variant: "warning",
      confirmLabel: "Archive",
    });
    if (!ok) return;
    try {
      await archivePatient(patient.id, "Archived from the patient workspace");
      toast.success("Patient archived");
      loadPatient();
    } catch (err) {
      toast.error("Could not archive patient", err.message);
    }
  };

  const handleRestore = async () => {
    try {
      await restorePatient(patient.id);
      toast.success("Patient restored");
      loadPatient();
    } catch (err) {
      toast.error("Could not restore patient", err.message);
    }
  };

  const activeAlerts = useMemo(
    () => (alerts.patientAlerts || []).filter((a) => a.status === "active"),
    [alerts.patientAlerts],
  );

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "transport", label: "Transport Profile" },
    { key: "contacts", label: "Contacts" },
    {
      key: "alerts",
      label: activeAlerts.length ? `Alerts (${activeAlerts.length})` : "Alerts",
    },
    { key: "calls", label: "Call History" },
    { key: "activity", label: "Activity" },
  ];

  const overflowItems = patient
    ? [patient.is_archived
        ? { label: "Restore patient", icon: <FaTrashRestore />, onClick: handleRestore }
        : { label: "Archive patient", icon: <FaArchive />, danger: true, onClick: handleArchive }]
    : [];

  const fullName = patient ? `${patient.first_name || ""} ${patient.last_name || ""}`.trim() : "Patient";
  const address = patient
    ? [patient.address, [patient.city, patient.state, patient.zip_code].filter(Boolean).join(" ")]
        .filter(Boolean).join(", ")
    : "";

  const renderTab = (activeTab) => {
    if (!patient) return null;

    if (activeTab === "overview") {
      return (
        <div className="workspace-grid">
          {patient.dispatch_comment && (
            <PageSection title="Dispatch note">
              <p className="mb-0">{patient.dispatch_comment}</p>
            </PageSection>
          )}
          <PageSection title="Identity">
            <EntityField label="Name" value={fullName} />
            <EntityField label="Date of birth" value={patient.dob || null} />
            <EntityField label="Gender" value={patient.gender || null} />
            <EntityField label="Phone" value={patient.phone || null} />
            <EntityField label="Secondary phone" value={patient.secondary_phone || null} />
            <EntityField label="Address" value={address || null} />
            <EntityField label="Preferred language" value={patient.preferred_language || null} />
          </PageSection>
          <PageSection title="Insurance">
            <EntityField label="Insurance" value={patient.insurance || null} />
            <EntityField label="Member ID" value={patient.member_id || null} />
            <EntityField label="Policy number" value={patient.policy_number || null} />
            <EntityField label="Requires auth" value={yesNo(patient.requires_auth)} />
            <EntityField label="Copay required" value={yesNo(patient.copay_required)} />
          </PageSection>
          <PageSection title="Facility">
            <EntityField label="Facility" value={patient.facility_name || null} />
            <EntityField label="Room" value={patient.room_number || null} />
            <EntityField
              label="Emergency contact"
              value={[patient.emergency_contact_name, patient.emergency_contact_phone].filter(Boolean).join(" ") || null}
            />
            <EntityField label="Notes" value={patient.notes || null} />
          </PageSection>
        </div>
      );
    }

    if (activeTab === "transport") {
      return (
        <PageSection title="Transport profile" description="Defaults applied when starting a call for this patient.">
          <div className="workspace-grid">
            <div>
              <EntityField label="Default service level" value={patient.default_service_level ? <ServiceLevelBadge value={patient.default_service_level} /> : null} />
              <EntityField label="Default mobility" value={patient.default_mobility_level || null} />
              <EntityField label="Weight" value={patient.weight || null} />
            </div>
            <div>
              <EntityField label="Oxygen required" value={yesNo(patient.oxygen_required)} />
              <EntityField label="Stairs" value={yesNo(patient.stairs)} />
              <EntityField label="Requires interpreter" value={yesNo(patient.requires_interpreter)} />
            </div>
          </div>
          <EntityField label="Special equipment" value={patient.special_equipment_notes || null} />
          <EntityField label="Transport instructions" value={patient.transport_instructions || null} />
          <EntityField label="Access instructions" value={patient.access_instructions || null} />
        </PageSection>
      );
    }

    if (activeTab === "contacts") {
      return (
        <PageSection title="Contacts">
          <PatientContactsTab
            newContact={contacts.newContact}
            setNewContact={contacts.setNewContact}
            editingContactId={contacts.editingContactId}
            setEditingContactId={contacts.setEditingContactId}
            onAddContact={contacts.handleAddContact}
            patientContacts={contacts.patientContacts}
            onEditContact={contacts.handleEditContact}
            onDeleteContact={contacts.handleDeleteContact}
          />
        </PageSection>
      );
    }

    if (activeTab === "alerts") {
      return (
        <PageSection title="Alerts">
          <PatientAlertsTab
            newAlert={alerts.newAlert}
            setNewAlert={alerts.setNewAlert}
            onAddAlert={alerts.handleAddAlert}
            showResolvedAlerts={alerts.showResolvedAlerts}
            setShowResolvedAlerts={alerts.setShowResolvedAlerts}
            patientAlerts={alerts.patientAlerts}
            onResolveAlert={alerts.handleResolveAlert}
          />
        </PageSection>
      );
    }

    if (activeTab === "calls") {
      const state = tabState.calls;
      if (state === "loading" || state === undefined) return <LoadingSkeleton rows={3} label="Loading calls" />;
      if (state && state !== "ready") {
        return <ErrorState message={state} onRetry={() => loadTab("calls", () => getPatientCalls(patient.id))} />;
      }
      return (
        <PageSection title="Call history">
          <PatientCallHistoryTab patientCalls={tabData.calls || []} timeFormat={timeFormat} />
        </PageSection>
      );
    }

    if (activeTab === "activity") {
      const state = tabState.activity;
      if (state === "loading" || state === undefined) return <LoadingSkeleton rows={3} label="Loading activity" />;
      const entries = (tabData.activity || []).map((e) => ({
        id: e.id,
        title: AUDIT_LABEL[e.action] || e.action,
        timestamp: formatDateTime(e.timestamp, timeFormat),
        actor: e.user_name,
        tone: e.action === "patient.created" ? "success"
          : e.action === "patient.archived" ? "warning"
          : e.action.includes("alert") ? "info" : "info",
        icon: <FaUserInjured />,
      }));
      return (
        <PageSection title="Recent activity" description="Recorded changes to this patient record.">
          <ActivityTimeline entries={entries} emptyLabel="No recorded activity for this patient yet." />
        </PageSection>
      );
    }

    return null;
  };

  return (
    <EntityWorkspace
      backTo="/patients"
      backLabel="Patients"
      title={fullName}
      subtitle={patient ? (patient.dob ? `DOB ${patient.dob}` : "Patient") : null}
      badges={patient && (
        <>
          {patient.default_service_level && <ServiceLevelBadge value={patient.default_service_level} />}
          {patient.is_sensitive && <StatusBadge tone="warning" label="Sensitive" />}
          {patient.is_archived && <StatusBadge tone="neutral" label="Archived" />}
          {activeAlerts.length > 0 && (
            <StatusBadge tone={ALERT_TONE[activeAlerts[0].severity] || "danger"} label={`${activeAlerts.length} active alert${activeAlerts.length === 1 ? "" : "s"}`} />
          )}
        </>
      )}
      actions={patient && (
        <>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleEdit}>
            <FaPen aria-hidden="true" /> Edit
          </button>
          <OverflowMenu items={overflowItems} label="Patient actions" />
        </>
      )}
      tabs={tabs}
      loading={loading}
      error={error}
      notFound={notFound}
      canView={canView}
    >
      {renderTab}
    </EntityWorkspace>
  );
}
