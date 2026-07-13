import { useState } from "react";

import {
  getPatientContacts,
  createPatientContact,
  updatePatientContact,
  deletePatientContact,
} from "../api/patientsApi";
import { emptyContact } from "../components/patients/patientConstants";

// Patient-contacts slice of PatientsPage (decomposition phase 2). Owns the
// contact list, the new/edit-contact form, and the edit target id. Behavior is
// unchanged — same load/add/edit/delete flows. `selectedPatient`, `toast`, and
// `confirm` are passed in so the hook reads current state and prompts exactly as
// the inline closures did.
export function usePatientContacts({ selectedPatient, toast, confirm }) {
  const [patientContacts, setPatientContacts] = useState([]);
  const [newContact, setNewContact] = useState(emptyContact);
  const [editingContactId, setEditingContactId] = useState(null);

  const loadPatientContacts = async (patientId) => {
    try {
      const contacts = await getPatientContacts(patientId);
      setPatientContacts(contacts);
    } catch {
      setPatientContacts([]);
    }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!selectedPatient) return;
    try {
      if (editingContactId) {
        await updatePatientContact(selectedPatient.id, editingContactId, newContact);
      } else {
        await createPatientContact(selectedPatient.id, newContact);
      }
      setNewContact(emptyContact);
      setEditingContactId(null);
      await loadPatientContacts(selectedPatient.id);
      toast.success(editingContactId ? "Contact updated" : "Contact added");
    } catch (err) {
      toast.error(err.message || "Failed to save contact");
    }
  };

  const handleEditContact = (contact) => {
    setEditingContactId(contact.id);
    setNewContact({
      name: contact.name || "",
      relationship: contact.relationship || "",
      phone: contact.phone || "",
      email: contact.email || "",
      is_primary: contact.is_primary || false,
      can_authorize_transport: contact.can_authorize_transport || false,
      notes: contact.notes || "",
    });
  };

  const handleDeleteContact = async (contactId) => {
    if (!selectedPatient) return;
    const ok = await confirm({
      title: "Delete contact?",
      message: "This contact will be permanently removed.",
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await deletePatientContact(selectedPatient.id, contactId);
      await loadPatientContacts(selectedPatient.id);
      toast.success("Contact deleted");
    } catch (err) {
      toast.error(err.message || "Failed to delete contact");
    }
  };

  // Matches the old resetPatientForm, which only cleared the loaded list.
  const resetContacts = () => setPatientContacts([]);

  return {
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
  };
}
