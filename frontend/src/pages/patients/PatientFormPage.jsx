import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaChevronLeft } from "react-icons/fa";

import { getPatient, createPatient, updatePatient, restorePatient } from "../../api/patientsApi";
import { hasPatientAccess } from "../../api/authApi";
import { usePatientForm } from "../../hooks/usePatientForm";
import PatientEditTab from "../../components/patients/PatientEditTab";
import { PageHeader } from "../../components/ui/Page";
import { EmptyState } from "../../components/ui/States";
import { useToast } from "../../components/ui/useToast";
import { useConfirm } from "../../components/ui/useConfirm";

/**
 * Create / edit a patient — the full-page form that replaces the list edit
 * drawer, matching the Vehicle and Employee form pages. Reuses usePatientForm
 * and PatientEditTab (the same field markup the drawer used), so behaviour is
 * unchanged; only the container is a page.
 */
export default function PatientFormPage({ currentUser }) {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  // The create route (/patients/new) carries no :patientId, so an undefined id
  // means "new"; only a real id is an edit.
  const isEdit = Boolean(patientId) && patientId !== "new";
  const canEdit = hasPatientAccess(currentUser);

  const {
    newPatient, handleNewPatientChange, isPatientFormDirty,
    resetFormFields, loadPatientIntoForm, editingPatientId,
  } = usePatientForm();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [savedClean, setSavedClean] = useState(false);

  useEffect(() => {
    if (!isEdit || !canEdit) { resetFormFields(); setLoading(false); return undefined; }
    let cancelled = false;
    getPatient(patientId)
      .then((p) => { if (!cancelled) loadPatientIntoForm(p); })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) setNotFound(true);
        else setError(err.message || "Failed to load patient");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // loadPatientIntoForm / resetFormFields are stable enough for this one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, isEdit, canEdit]);

  const dirty = isPatientFormDirty();

  // Warn on reload/close with unsaved edits.
  useEffect(() => {
    if (!dirty || savedClean) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, savedClean]);

  const leave = async () => {
    if (dirty && !savedClean) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        message: "This patient has unsaved edits.",
        variant: "warning",
        confirmLabel: "Discard",
      });
      if (!ok) return;
    }
    navigate("/patients");
  };

  const goToWorkspace = (id) => { setSavedClean(true); navigate(`/patients/${id}`); };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!newPatient.first_name.trim() || !newPatient.last_name.trim()) {
      setError("First and last name are required.");
      return;
    }
    setSaving(true);
    try {
      const saved = isEdit
        ? await updatePatient(editingPatientId ?? patientId, newPatient)
        : await createPatient(newPatient);
      toast.success(isEdit ? "Patient updated" : "Patient added");
      goToWorkspace(saved.id);
    } catch (err) {
      // A duplicate that is archived: offer to restore the existing record
      // rather than create a second one — same rule as the old drawer.
      if (err.existingPatient?.is_archived) {
        const ok = await confirm({
          title: "Patient already exists (archived)",
          message: `${err.existingPatient.first_name} ${err.existingPatient.last_name} matches this name and DOB but is archived. Restore the existing record instead of creating a new one?`,
          variant: "warning",
          confirmLabel: "Restore existing patient",
        });
        if (ok) {
          try {
            const { patient } = await restorePatient(err.existingPatient.id);
            toast.success("Patient restored");
            goToWorkspace(patient.id);
            return;
          } catch (restoreErr) {
            setError(restoreErr.message || "Restore failed.");
          }
        }
      } else {
        setError(err.message || "Operation failed.");
      }
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <EmptyState
        variant="forbidden"
        title="Not available"
        description="Managing patients requires an operational role."
      />
    );
  }
  if (loading) return <p className="text-muted">Loading…</p>;
  if (notFound) {
    return <EmptyState variant="empty" title="Patient not found" description="It may have been removed." />;
  }

  return (
    <div>
      <button type="button" className="workspace-back" onClick={leave}>
        <FaChevronLeft aria-hidden="true" /> Patients
      </button>

      <PageHeader
        title={isEdit ? `Edit ${newPatient.first_name} ${newPatient.last_name}`.trim() : "Add patient"}
        description={isEdit
          ? "Update the patient record. Alerts, contacts and call history live on the workspace."
          : "Create a patient record. Alerts and contacts can be added on the workspace after saving."}
        actions={(
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={leave} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="patient-drawer-form" className="btn btn-primary" disabled={saving || (isEdit && !dirty)}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add patient"}
            </button>
          </>
        )}
      />

      <PatientEditTab
        error={error}
        newPatient={newPatient}
        onChange={handleNewPatientChange}
        onSubmit={submit}
        loading={saving}
      />
    </div>
  );
}
