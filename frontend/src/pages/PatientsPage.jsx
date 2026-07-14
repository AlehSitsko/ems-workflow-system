import React, { useState } from "react";
import { useConfirm } from "../components/ui/useConfirm";
import { useToast } from "../components/ui/useToast";
import EntityDrawer from "../components/ui/EntityDrawer";
import { FaPlus } from "react-icons/fa";

import {
  createPatient,
  updatePatient,
  archivePatient,
  restorePatient,
} from "../api/patientsApi";

import { getPatientCalls } from "../api/callsApi";
import { useUserSettings } from "../context/useUserSettings";

import PatientToolbar from "../components/patients/PatientToolbar";
import PatientList from "../components/patients/PatientList";
import PatientOverviewTab from "../components/patients/PatientOverviewTab";
import PatientCallHistoryTab from "../components/patients/PatientCallHistoryTab";
import PatientAlertsTab from "../components/patients/PatientAlertsTab";
import PatientContactsTab from "../components/patients/PatientContactsTab";
import PatientEditTab from "../components/patients/PatientEditTab";
import { usePatients } from "../hooks/usePatients";
import { usePatientForm } from "../hooks/usePatientForm";
import { usePatientAlerts } from "../hooks/usePatientAlerts";
import { usePatientContacts } from "../hooks/usePatientContacts";

// Main patient management component.
const PatientsPage = () => {
  const confirm = useConfirm();
  const toast = useToast();
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";

  const [patientCalls, setPatientCalls] = useState([]);

  const {
    newPatient,
    editingPatientId,
    handleNewPatientChange,
    isPatientFormDirty,
    resetFormFields,
    loadPatientIntoForm,
  } = usePatientForm();

  const [selectedPatient, setSelectedPatient] = useState(null);
  const [drawerTab, setDrawerTab] = useState("overview"); // "overview" | "edit" | "history" | "alerts" | "contacts"
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Clear the open patient + its loaded call history (shared by search/show-all).
  const clearSelection = () => {
    setSelectedPatient(null);
    setPatientCalls([]);
  };

  const {
    searchName,
    setSearchName,
    searchDob,
    setSearchDob,
    patients,
    setPatients,
    paginationMeta,
    currentFilters,
    loadingMore,
    showArchived,
    hasSearched,
    setHasSearched,
    loadPatients,
    handleToggleShowArchived,
    handleSearch,
    handleShowAll,
  } = usePatients({ setLoading, setError, clearSelection });

  const {
    patientAlerts,
    showResolvedAlerts,
    setShowResolvedAlerts,
    newAlert,
    setNewAlert,
    loadPatientAlerts,
    handleAddAlert,
    handleResolveAlert,
    resetAlerts,
  } = usePatientAlerts({ selectedPatient, toast });

  const {
    patientContacts,
    newContact,
    setNewContact,
    editingContactId,
    setEditingContactId,
    loadPatientContacts,
    handleAddContact,
    handleEditContact,
    handleDeleteContact,
    resetContacts,
  } = usePatientContacts({ selectedPatient, toast, confirm });

  // Reset the add/edit patient form and close the drawer.
  const resetPatientForm = () => {
    resetFormFields();
    setDrawerOpen(false);
    setSelectedPatient(null);
    setPatientCalls([]);
    resetAlerts();
    resetContacts();
    setDrawerTab("overview");
  };

  // Open the drawer in add mode.
  const handleShowAddForm = () => {
    resetFormFields();
    setSelectedPatient(null);
    setError("");
    setDrawerTab("edit");
    setDrawerOpen(true);
  };

  // Close the patient drawer only after confirming unsaved changes.
  const closePatientFormSafely = async () => {
    if (loading) return;

    if (isPatientFormDirty()) {
      const shouldClose = await confirm({
        title: "Discard unsaved changes?",
        message: "All entered patient information will be lost.",
        variant: "warning",
        confirmLabel: "Discard",
      });
      if (!shouldClose) return;
    }

    resetPatientForm();
  };

  // Load call history for a selected patient.
  const loadPatientCalls = async (patientId) => {
    try {
      const calls = await getPatientCalls(patientId);
      setPatientCalls(calls);
    } catch (err) {
      console.error("Failed to load patient call history:", err);
      setPatientCalls([]);
    }
  };

  // Create a new patient or update an existing patient.
  const handleCreatePatient = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      let savedPatient;

      if (editingPatientId) {
        savedPatient = await updatePatient(editingPatientId, newPatient);
      } else {
        savedPatient = await createPatient(newPatient);
      }

      resetFormFields();
      setSelectedPatient(savedPatient);
      setHasSearched(true);

      await loadPatients(currentFilters, 1, false);
      await loadPatientCalls(savedPatient.id);
      await loadPatientAlerts(savedPatient.id);
      await loadPatientContacts(savedPatient.id);
    } catch (err) {
      // Offer to restore instead of creating a new record when the duplicate is archived.
      if (err.existingPatient?.is_archived) {
        const shouldRestore = await confirm({
          title: "Patient already exists (archived)",
          message: `${err.existingPatient.first_name} ${err.existingPatient.last_name} matches this name and DOB but is archived. Restore the existing record instead of creating a new one?`,
          variant: "warning",
          confirmLabel: "Restore existing patient",
        });
        if (shouldRestore) {
          try {
            const { patient } = await restorePatient(err.existingPatient.id);
            resetFormFields();
            setSelectedPatient(patient);
            setDrawerTab("overview");
            setHasSearched(true);
            await loadPatients(currentFilters, 1, false);
            await loadPatientCalls(patient.id);
            await loadPatientAlerts(patient.id);
            await loadPatientContacts(patient.id);
            toast.success("Patient restored");
          } catch (restoreErr) {
            setError(restoreErr.message || "Restore failed.");
          }
          return;
        }
      }
      setError(err.message || "Operation failed.");
    } finally {
      setLoading(false);
    }
  };

  // Archive a patient record (soft delete — history is preserved).
  const handleArchivePatient = async (id) => {
    const ok = await confirm({
      title: "Archive patient?",
      message: "The patient will be hidden from active search but call history stays intact. You can restore them later.",
      variant: "danger",
      confirmLabel: "Archive",
    });
    if (!ok) return;

    setError("");

    try {
      const { patient } = await archivePatient(id);
      await loadPatients(currentFilters, 1, false);

      if (selectedPatient?.id === id) {
        setSelectedPatient(patient);
      }

      if (editingPatientId === id) {
        resetPatientForm();
      }
      toast.success("Patient archived");
    } catch (err) {
      setError(err.message || "Archive failed.");
    }
  };

  // Restore a previously archived patient.
  const handleRestorePatient = async (id) => {
    setError("");
    try {
      const { patient } = await restorePatient(id);
      await loadPatients(currentFilters, 1, false);
      if (selectedPatient?.id === id) {
        setSelectedPatient(patient);
      }
      toast.success("Patient restored");
    } catch (err) {
      setError(err.message || "Restore failed.");
    }
  };

  // Open drawer in view mode for a patient.
  const handleSelectPatient = async (patient) => {
    setSelectedPatient(patient);
    setDrawerTab("overview");
    setDrawerOpen(true);
    await loadPatientCalls(patient.id);
    await loadPatientAlerts(patient.id);
    await loadPatientContacts(patient.id);
  };

  // Open drawer in edit mode for a patient.
  const handleEditPatient = async (patient) => {
    loadPatientIntoForm(patient);
    setSelectedPatient(patient);
    setDrawerTab("edit");
    setDrawerOpen(true);
    await loadPatientCalls(patient.id);
    await loadPatientAlerts(patient.id);
    await loadPatientContacts(patient.id);
  };

  // Update a patient's default service level inline from the list row.
  const handleServiceLevelChange = async (patient, newLevel) => {
    try {
      const updated = await updatePatient(patient.id, { ...patient, default_service_level: newLevel });
      setPatients(prev => prev.map(p => p.id === patient.id ? updated : p));
      toast.success("Service level updated");
    } catch {
      toast.error("Failed to update service level");
    }
  };

  // Clear search, results, selected patient, call history, and editing mode.
  const handleClear = () => {
    setSearchName("");
    setSearchDob("");
    setPatients([]);
    setPatientCalls([]);
    setError("");
    setHasSearched(false);
    setSelectedPatient(null);
    resetPatientForm();
  };

  return (
    <div className="page-stack">
      <PatientToolbar
        loading={loading}
        error={error}
        hasSearched={hasSearched}
        patientsCount={patients.length}
        searchName={searchName}
        setSearchName={setSearchName}
        searchDob={searchDob}
        setSearchDob={setSearchDob}
        showArchived={showArchived}
        onShowAddForm={handleShowAddForm}
        onSearch={handleSearch}
        onShowAll={handleShowAll}
        onClear={handleClear}
        onToggleShowArchived={handleToggleShowArchived}
      />

      {patients.length > 0 && (
        <PatientList
          patients={patients}
          paginationMeta={paginationMeta}
          patientCalls={patientCalls}
          selectedPatient={selectedPatient}
          loading={loading}
          loadingMore={loadingMore}
          onSelectPatient={handleSelectPatient}
          onEditPatient={handleEditPatient}
          onArchivePatient={handleArchivePatient}
          onRestorePatient={handleRestorePatient}
          onServiceLevelChange={handleServiceLevelChange}
          onLoadMore={() => loadPatients(currentFilters, paginationMeta.page + 1, true)}
        />
      )}

      <EntityDrawer
        open={drawerOpen}
        onClose={closePatientFormSafely}
        title={
          selectedPatient
            ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
            : "Add Patient"
        }
        subtitle={
          selectedPatient
            ? `DOB: ${selectedPatient.dob || "—"} · ${selectedPatient.default_service_level || "No Service"}`
            : "New patient record"
        }
        width="50vw"
        tabs={
          selectedPatient
            ? [
                { key: "overview", label: "Overview" },
                { key: "alerts", label: `Alerts${patientAlerts.filter(a => a.status === "active").length ? ` (${patientAlerts.filter(a => a.status === "active").length})` : ""}` },
                { key: "contacts", label: "Contacts" },
                { key: "edit", label: "Edit" },
                { key: "history", label: "Call History" },
              ]
            : undefined
        }
        activeTab={drawerTab}
        onTabChange={setDrawerTab}
        footer={
          drawerTab === "edit" ? (
            <>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={closePatientFormSafely}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="patient-drawer-form"
                className="btn btn-primary d-inline-flex align-items-center gap-2"
                disabled={loading}
              >
                <FaPlus />
                {loading ? "Saving..." : editingPatientId ? "Update Patient" : "Add Patient"}
              </button>
            </>
          ) : null
        }
      >
        {drawerTab === "overview" && selectedPatient && (
          <PatientOverviewTab
            selectedPatient={selectedPatient}
            patientAlerts={patientAlerts}
            onRestore={handleRestorePatient}
            onEdit={handleEditPatient}
            onArchive={handleArchivePatient}
          />
        )}

        {drawerTab === "history" && (
          <PatientCallHistoryTab patientCalls={patientCalls} timeFormat={timeFormat} />
        )}

        {drawerTab === "alerts" && selectedPatient && (
          <PatientAlertsTab
            newAlert={newAlert}
            setNewAlert={setNewAlert}
            onAddAlert={handleAddAlert}
            showResolvedAlerts={showResolvedAlerts}
            setShowResolvedAlerts={setShowResolvedAlerts}
            patientAlerts={patientAlerts}
            onResolveAlert={handleResolveAlert}
          />
        )}

        {drawerTab === "contacts" && selectedPatient && (
          <PatientContactsTab
            newContact={newContact}
            setNewContact={setNewContact}
            editingContactId={editingContactId}
            setEditingContactId={setEditingContactId}
            onAddContact={handleAddContact}
            patientContacts={patientContacts}
            onEditContact={handleEditContact}
            onDeleteContact={handleDeleteContact}
          />
        )}

        {drawerTab === "edit" && (
          <PatientEditTab
            error={error}
            newPatient={newPatient}
            onChange={handleNewPatientChange}
            onSubmit={handleCreatePatient}
            loading={loading}
          />
        )}
      </EntityDrawer>
    </div>
  );
};

export default PatientsPage;
