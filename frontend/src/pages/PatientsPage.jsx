import React from "react";
import { useNavigate } from "react-router-dom";
import { useConfirm } from "../components/ui/useConfirm";
import { useToast } from "../components/ui/useToast";

import { archivePatient, restorePatient, updatePatient } from "../api/patientsApi";

import PatientToolbar from "../components/patients/PatientToolbar";
import PatientList from "../components/patients/PatientList";
import { usePatients } from "../hooks/usePatients";

/**
 * Patients search + list. Viewing and editing happen on the workspace
 * (/patients/:id) and the form page (/patients/new, /patients/:id/edit); a row
 * opens the workspace, Add and Edit navigate to the form.
 */
const PatientsPage = () => {
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const {
    searchName, setSearchName,
    searchDob, setSearchDob,
    patients, setPatients,
    paginationMeta, currentFilters, loadingMore, showArchived, hasSearched,
    setHasSearched, loadPatients, handleToggleShowArchived, handleSearch, handleShowAll,
  } = usePatients({ setLoading, setError, clearSelection: () => {} });

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
      await archivePatient(id);
      await loadPatients(currentFilters, 1, false);
      toast.success("Patient archived");
    } catch (err) {
      setError(err.message || "Archive failed.");
    }
  };

  const handleRestorePatient = async (id) => {
    setError("");
    try {
      await restorePatient(id);
      await loadPatients(currentFilters, 1, false);
      toast.success("Patient restored");
    } catch (err) {
      setError(err.message || "Restore failed.");
    }
  };

  // Update a patient's default service level inline from the list row.
  const handleServiceLevelChange = async (patient, newLevel) => {
    try {
      const updated = await updatePatient(patient.id, { ...patient, default_service_level: newLevel });
      setPatients((prev) => prev.map((p) => (p.id === patient.id ? updated : p)));
      toast.success("Service level updated");
    } catch {
      toast.error("Failed to update service level");
    }
  };

  const handleClear = () => {
    setSearchName("");
    setSearchDob("");
    setPatients([]);
    setError("");
    setHasSearched(false);
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
        onShowAddForm={() => navigate("/patients/new")}
        onSearch={handleSearch}
        onShowAll={handleShowAll}
        onClear={handleClear}
        onToggleShowArchived={handleToggleShowArchived}
      />

      {patients.length > 0 && (
        <PatientList
          patients={patients}
          paginationMeta={paginationMeta}
          patientCalls={[]}
          selectedPatient={null}
          loading={loading}
          loadingMore={loadingMore}
          onSelectPatient={(patient) => navigate(`/patients/${patient.id}`)}
          onEditPatient={(patient) => navigate(`/patients/${patient.id}/edit`)}
          onArchivePatient={handleArchivePatient}
          onRestorePatient={handleRestorePatient}
          onServiceLevelChange={handleServiceLevelChange}
          onLoadMore={() => loadPatients(currentFilters, paginationMeta.page + 1, true)}
        />
      )}
    </div>
  );
};

export default PatientsPage;
