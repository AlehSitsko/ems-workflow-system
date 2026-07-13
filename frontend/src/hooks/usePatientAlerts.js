import { useState } from "react";

import {
  getPatientAlerts,
  createPatientAlert,
  resolvePatientAlert,
} from "../api/patientsApi";
import { emptyAlert } from "../components/patients/patientConstants";

// Patient-alerts slice of PatientsPage (decomposition phase 2). Owns the alert
// list, the "show resolved" toggle, and the new-alert form. Behavior is
// unchanged — the same load/add/resolve flows, just lifted out of the page.
// `selectedPatient` and `toast` are passed in so the hook reads the currently
// open patient exactly as the inline closures did.
export function usePatientAlerts({ selectedPatient, toast }) {
  const [patientAlerts, setPatientAlerts] = useState([]);
  const [showResolvedAlerts, setShowResolvedAlerts] = useState(false);
  const [newAlert, setNewAlert] = useState(emptyAlert);

  const loadPatientAlerts = async (patientId) => {
    try {
      const alerts = await getPatientAlerts(patientId, { showAll: true });
      setPatientAlerts(alerts);
    } catch {
      setPatientAlerts([]);
    }
  };

  const handleAddAlert = async (e) => {
    e.preventDefault();
    if (!selectedPatient) return;
    try {
      await createPatientAlert(selectedPatient.id, {
        ...newAlert,
        expires_at: newAlert.expires_at || null,
      });
      setNewAlert(emptyAlert);
      await loadPatientAlerts(selectedPatient.id);
      toast.success("Alert added");
    } catch (err) {
      toast.error(err.message || "Failed to add alert");
    }
  };

  const handleResolveAlert = async (alertId) => {
    if (!selectedPatient) return;
    try {
      await resolvePatientAlert(selectedPatient.id, alertId);
      await loadPatientAlerts(selectedPatient.id);
      toast.success("Alert resolved");
    } catch (err) {
      toast.error(err.message || "Failed to resolve alert");
    }
  };

  // Matches the old resetPatientForm, which only cleared the loaded list.
  const resetAlerts = () => setPatientAlerts([]);

  return {
    patientAlerts,
    showResolvedAlerts,
    setShowResolvedAlerts,
    newAlert,
    setNewAlert,
    loadPatientAlerts,
    handleAddAlert,
    handleResolveAlert,
    resetAlerts,
  };
}
