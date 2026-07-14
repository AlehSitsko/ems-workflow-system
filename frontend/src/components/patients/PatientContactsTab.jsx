import { FaAddressBook, FaPlus, FaEdit, FaTrash } from "react-icons/fa";

import { emptyContact } from "./patientConstants";

// Contacts tab: add/edit contact form plus the contact list. Extracted from
// PatientsPage.jsx (decomposition phase 3). Presentational — all state and
// handlers come from the usePatientContacts hook via props.
const PatientContactsTab = ({
  newContact,
  setNewContact,
  editingContactId,
  setEditingContactId,
  onAddContact,
  patientContacts,
  onEditContact,
  onDeleteContact,
}) => (
  <div>
    <form onSubmit={onAddContact} className="mb-4 patient-form-section">
      <div className="patient-form-section-header">
        <span className="patient-form-section-icon"><FaAddressBook /></span>
        <h5>{editingContactId ? "Edit Contact" : "Add Contact"}</h5>
      </div>
      <div className="row g-3">
        <div className="col-md-4">
          <label className="form-label">Name *</label>
          <input
            className="form-control"
            value={newContact.name}
            onChange={(e) => setNewContact(p => ({ ...p, name: e.target.value }))}
            required
          />
        </div>
        <div className="col-md-4">
          <label className="form-label">Relationship</label>
          <input
            className="form-control"
            value={newContact.relationship}
            onChange={(e) => setNewContact(p => ({ ...p, relationship: e.target.value }))}
            placeholder="Daughter, Case manager..."
          />
        </div>
        <div className="col-md-4">
          <label className="form-label">Phone</label>
          <input
            className="form-control"
            value={newContact.phone}
            onChange={(e) => setNewContact(p => ({ ...p, phone: e.target.value }))}
          />
        </div>
        <div className="col-md-6">
          <label className="form-label">Email</label>
          <input
            type="email"
            className="form-control"
            value={newContact.email}
            onChange={(e) => setNewContact(p => ({ ...p, email: e.target.value }))}
          />
        </div>
        <div className="col-md-6">
          <label className="form-label">Notes</label>
          <input
            className="form-control"
            value={newContact.notes}
            onChange={(e) => setNewContact(p => ({ ...p, notes: e.target.value }))}
            placeholder="Call before pickup..."
          />
        </div>
        <div className="col-md-6">
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              id="contact-primary"
              checked={newContact.is_primary}
              onChange={(e) => setNewContact(p => ({ ...p, is_primary: e.target.checked }))}
            />
            <label className="form-check-label" htmlFor="contact-primary">Primary contact</label>
          </div>
        </div>
        <div className="col-md-6">
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              id="contact-authorize"
              checked={newContact.can_authorize_transport}
              onChange={(e) => setNewContact(p => ({ ...p, can_authorize_transport: e.target.checked }))}
            />
            <label className="form-check-label" htmlFor="contact-authorize">Can authorize transport</label>
          </div>
        </div>
      </div>
      <div className="d-flex gap-2 mt-3">
        <button type="submit" className="btn btn-sm btn-primary">
          <FaPlus style={{ marginRight: 4 }} /> {editingContactId ? "Update Contact" : "Add Contact"}
        </button>
        {editingContactId && (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => { setEditingContactId(null); setNewContact(emptyContact); }}
          >
            Cancel
          </button>
        )}
      </div>
    </form>

    {patientContacts.length === 0 ? (
      <div className="empty-state">
        <FaAddressBook />
        <h5>No contacts</h5>
        <p>No contacts saved for this patient.</p>
      </div>
    ) : (
      <div className="patient-call-list">
        {patientContacts.map((c) => (
          <div className="patient-call-card" key={c.id}>
            <div>
              <div className="patient-call-date">
                {c.name} {c.is_primary && <span className="badge text-bg-primary" style={{ fontSize: 10 }}>Primary</span>}
              </div>
              <div className="patient-call-muted">{c.relationship || "—"}</div>
            </div>
            <div>
              <div className="patient-call-label">Phone</div>
              <div>{c.phone || "—"}</div>
            </div>
            <div>
              <div className="patient-call-label">Email</div>
              <div>{c.email || "—"}</div>
            </div>
            <div>
              <div className="patient-call-label">Can authorize</div>
              <div>{c.can_authorize_transport ? "Yes" : "No"}</div>
            </div>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => onEditContact(c)}>
                <FaEdit />
              </button>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDeleteContact(c.id)}>
                <FaTrash />
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default PatientContactsTab;
