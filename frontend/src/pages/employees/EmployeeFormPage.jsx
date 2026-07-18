import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaChevronLeft } from "react-icons/fa";

import { getEmployee, createEmployee, updateEmployee } from "../../api/employeesApi";
import { getDocuments, uploadDocument } from "../../api/documentsApi";
import { hasEmployeeAccess } from "../../api/authApi";
import { normalizeLicense, getCprWarning } from "../../utils/licenseUtils";
import { PageHeader, PageSection } from "../../components/ui/Page";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { useToast } from "../../components/ui/useToast";
import { useConfirm } from "../../components/ui/useConfirm";

const CERT_DOC_TYPES = { cpr: "cpr_cert", evoc: "evoc_cert", emt: "emt_cert", paramedic: "als_cert" };
const CERT_LABELS = { cpr: "CPR", evoc: "EVOC", emt: "EMT", paramedic: "Paramedic" };
const CERTS = ["cpr", "evoc", "emt", "paramedic"];

const emptyLicense = { hasLicense: false, licenseName: "", expirationDate: "" };

const EMPTY = {
  firstName: "", lastName: "", phone: "", email: "",
  employeeNumber: "", hireDate: "", dob: "",
  role: "EMT", status: "active", isActive: true, notes: "", kioskPin: "",
  cpr: { ...emptyLicense }, evoc: { ...emptyLicense }, emt: { ...emptyLicense }, paramedic: { ...emptyLicense },
};

/**
 * Create / edit an employee — the full-page form that replaces the old list
 * drawer, matching the Vehicle form-page pattern.
 *
 * Certification scans are handled here too: each held certification can carry a
 * scanned file (stored as an EmployeeDocument), and if a held cert has no scan
 * the save surfaces a dialog rather than silently leaving a gap.
 */
export default function EmployeeFormPage({ currentUser }) {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  // The create route (/employees/new) carries no :employeeId param, so an
  // undefined id means "new"; only a real id is an edit.
  const isEdit = Boolean(employeeId) && employeeId !== "new";
  const canEdit = hasEmployeeAccess(currentUser);

  const [form, setForm] = useState(EMPTY);
  const [baseline, setBaseline] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // Cert scans: new files to upload, and any scan already on file.
  const [certFiles, setCertFiles] = useState({ cpr: null, evoc: null, emt: null, paramedic: null });
  const [certScans, setCertScans] = useState({});
  const [scanDialogMissing, setScanDialogMissing] = useState(null);

  const backHref = "/employees";

  useEffect(() => {
    if (!isEdit || !canEdit) { setLoading(false); return undefined; }
    let cancelled = false;
    getEmployee(employeeId)
      .then((emp) => {
        if (cancelled) return;
        const loaded = {
          ...EMPTY,
          ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, emp[k] ?? EMPTY[k]])),
          isActive: Boolean(emp.isActive),
          cpr: normalizeLicense(emp.cpr), evoc: normalizeLicense(emp.evoc),
          emt: normalizeLicense(emp.emt), paramedic: normalizeLicense(emp.paramedic),
        };
        setForm(loaded);
        setBaseline(loaded);
        // Show which certs already have a scanned document on file.
        getDocuments(employeeId, currentUser).then((docs) => {
          const scans = {};
          Object.entries(CERT_DOC_TYPES).forEach(([cert, docType]) => {
            const found = docs.find((d) => d.doc_type === docType && d.file_name);
            scans[cert] = found ? { id: found.id, file_name: found.file_name } : null;
          });
          if (!cancelled) setCertScans(scans);
        }).catch(() => { if (!cancelled) setCertScans({}); });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) setNotFound(true);
        else setError(err.message || "Failed to load employee");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId, isEdit, canEdit, currentUser]);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline)
      || Object.values(certFiles).some(Boolean),
    [form, baseline, certFiles],
  );

  // Leaving with unsaved edits should be a decision, not an accident.
  const savedCleanRef = useRef(false);
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const setLicense = (cert, patch) =>
    setForm((prev) => ({ ...prev, [cert]: { ...prev[cert], ...patch } }));

  const leave = async () => {
    if (dirty && !savedCleanRef.current) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        message: "This employee has unsaved edits.",
        variant: "warning",
        confirmLabel: "Discard",
      });
      if (!ok) return;
    }
    navigate(backHref);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First Name and Last Name are required.");
      return;
    }

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      employeeNumber: form.employeeNumber.trim(),
      hireDate: form.hireDate,
      dob: form.dob,
      role: form.role,
      status: form.status,
      isActive: form.isActive,
      notes: form.notes.trim(),
      kioskPin: form.kioskPin.trim(),
      cpr: normalizeLicense(form.cpr),
      evoc: normalizeLicense(form.evoc),
      emt: normalizeLicense(form.emt),
      paramedic: normalizeLicense(form.paramedic),
    };

    // CPR is required by business rule; warn but let the user proceed.
    const cprWarning = getCprWarning(payload);
    if (cprWarning) {
      const ok = await confirm({
        title: "CPR certification warning",
        message: `${cprWarning}. CPR is expected for all employees. Save this record anyway?`,
        variant: "warning",
        confirmLabel: "Save anyway",
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      const saved = isEdit
        ? await updateEmployee(employeeId, payload)
        : await createEmployee(payload);
      const savedId = saved.id;

      // Upload any newly-selected scans against the saved record.
      for (const [cert, file] of Object.entries(certFiles)) {
        if (!file) continue;
        const fd = new FormData();
        fd.append("doc_type", CERT_DOC_TYPES[cert]);
        fd.append("title", `${CERT_LABELS[cert]} Certification Scan`);
        fd.append("file", file);
        try {
          await uploadDocument(savedId, fd, currentUser);
        } catch (uploadErr) {
          // A failed scan upload shouldn't lose the saved record.
          console.error(`Failed to upload ${cert} scan:`, uploadErr);
        }
      }

      // Held certifications with neither a new file nor an existing scan.
      const missing = CERTS.filter((cert) =>
        payload[cert]?.hasLicense && !certFiles[cert] && !certScans[cert]);

      toast.success(isEdit ? "Employee updated" : "Employee added");
      savedCleanRef.current = true;

      if (missing.length > 0) {
        setScanDialogMissing({ id: savedId, certs: missing });
        setSaving(false);
        return;
      }
      navigate(`/employees/${savedId}`);
    } catch (err) {
      setError(err.message || "Failed to save employee.");
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <EmptyState
        variant="forbidden"
        title="Not available"
        description="Managing employees requires an admin, supervisor or HR role."
      />
    );
  }
  if (loading) return <p className="text-muted">Loading…</p>;
  if (notFound) {
    return <EmptyState variant="empty" title="Employee not found" description="It may have been removed." />;
  }

  return (
    <form onSubmit={submit}>
      <button type="button" className="workspace-back" onClick={leave}>
        <FaChevronLeft aria-hidden="true" /> Employees
      </button>

      <PageHeader
        title={isEdit ? `Edit ${baseline.firstName} ${baseline.lastName}`.trim() : "Add employee"}
        description={isEdit
          ? "Update the employee record and certifications."
          : "Create an employee record. Time & pay and documents are managed on the employee's workspace."}
        actions={(
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={leave} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || (isEdit && !dirty)}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add employee"}
            </button>
          </>
        )}
      />

      {error && <div className="mb-3"><ErrorState title="Could not save" message={error} /></div>}

      <PageSection title="Basic information">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label" htmlFor="e-first">First name *</label>
            <input id="e-first" className="form-control" required value={form.firstName}
                   onChange={(e) => set({ firstName: e.target.value })} />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="e-last">Last name *</label>
            <input id="e-last" className="form-control" required value={form.lastName}
                   onChange={(e) => set({ lastName: e.target.value })} />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="e-phone">Phone</label>
            <input id="e-phone" className="form-control" value={form.phone}
                   onChange={(e) => set({ phone: e.target.value })} />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="e-email">Email</label>
            <input id="e-email" type="email" className="form-control" value={form.email}
                   onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="e-number">Employee number</label>
            <input id="e-number" className="form-control" value={form.employeeNumber}
                   onChange={(e) => set({ employeeNumber: e.target.value })} />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="e-hire">Hire date</label>
            <input id="e-hire" type="date" className="form-control" value={form.hireDate}
                   onChange={(e) => set({ hireDate: e.target.value })} />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="e-dob">Date of birth</label>
            <input id="e-dob" type="date" className="form-control" value={form.dob}
                   onChange={(e) => set({ dob: e.target.value })} />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="e-role">Role</label>
            <select id="e-role" className="form-select" value={form.role}
                    onChange={(e) => set({ role: e.target.value })}>
              {["EMT", "Paramedic", "Assist", "Dispatcher", "Driver", "Supervisor", "Manager", "HR"]
                .map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="e-status">Employee status</label>
            <select id="e-status" className="form-select" value={form.status}
                    onChange={(e) => set({ status: e.target.value })}>
              {["active", "vacation", "sick", "suspended", "terminated"]
                .map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div className="col-md-4 d-flex align-items-end">
            <div className="form-check mb-2">
              <input id="e-active" type="checkbox" className="form-check-input"
                     checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
              <label className="form-check-label" htmlFor="e-active">Active employee</label>
            </div>
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="e-pin">Kiosk PIN</label>
            <input id="e-pin" className="form-control" maxLength={6} value={form.kioskPin}
                   placeholder="4–6 digits" onChange={(e) => set({ kioskPin: e.target.value })} />
            <div className="form-text">Used for Kiosk clock in/out</div>
          </div>
          <div className="col-12">
            <label className="form-label" htmlFor="e-notes">Notes</label>
            <textarea id="e-notes" className="form-control" rows={3} value={form.notes}
                      onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
      </PageSection>

      <PageSection title="Licenses / certifications">
        <div className="employee-license-form-grid">
          {CERTS.map((cert) => {
            const lic = form[cert];
            return (
              <div className="employee-license-form-card" key={cert}>
                <div className="employee-license-form-header">
                  <h6>{cert.toUpperCase()}</h6>
                  {cert === "cpr" && <span className="badge text-bg-warning">Required</span>}
                </div>

                <div className="form-check mb-0">
                  <input id={`${cert}-has`} type="checkbox" className="form-check-input"
                         checked={lic.hasLicense}
                         onChange={(e) => setLicense(cert, { hasLicense: e.target.checked })} />
                  <label className="form-check-label" htmlFor={`${cert}-has`}>
                    Has {cert.toUpperCase()}
                  </label>
                </div>

                {lic.hasLicense && (
                  <div className="employee-license-extra-fields">
                    <div className="mt-3">
                      <label className="form-label" htmlFor={`${cert}-name`}>Certification name</label>
                      <input id={`${cert}-name`} className="form-control" value={lic.licenseName}
                             placeholder={`e.g. ${cert.toUpperCase()} Certification`}
                             onChange={(e) => setLicense(cert, { licenseName: e.target.value })} />
                    </div>
                    <div className="mt-3">
                      <label className="form-label" htmlFor={`${cert}-exp`}>Expiration date</label>
                      <input id={`${cert}-exp`} type="date" className="form-control" value={lic.expirationDate}
                             onChange={(e) => setLicense(cert, { expirationDate: e.target.value })} />
                    </div>
                    <div className="mt-3">
                      <label className="form-label d-flex align-items-center gap-2">
                        Scan / photo
                        {certScans[cert] ? (
                          <span className="cert-scan-note tone-ok">✓ Attached</span>
                        ) : certFiles[cert] ? (
                          <span className="cert-scan-note tone-ready">Ready to upload</span>
                        ) : (
                          <span className="cert-scan-note tone-missing">⚠ No scan</span>
                        )}
                      </label>
                      {certScans[cert] && !certFiles[cert] && (
                        <div className="cert-scan-existing">📎 {certScans[cert].file_name}</div>
                      )}
                      <input type="file" accept="image/*,application/pdf" className="form-control form-control-sm"
                             onChange={(e) => setCertFiles((prev) => ({ ...prev, [cert]: e.target.files?.[0] || null }))} />
                      {certFiles[cert] && <div className="cert-scan-filename">{certFiles[cert].name}</div>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PageSection>

      {scanDialogMissing && (
        <div className="command-overlay" role="presentation">
          <div className="command-panel cert-scan-dialog" role="dialog" aria-modal="true" aria-label="Certification scans missing">
            <div className="cert-scan-dialog-body">
              <h5 className="cert-scan-dialog-title">Certification scans missing</h5>
              <p>The employee record was saved, but these certifications have no scan attached:</p>
              <ul className="cert-scan-dialog-list">
                {scanDialogMissing.certs.map((cert) => <li key={cert}>{CERT_LABELS[cert]}</li>)}
              </ul>
              <p className="text-muted mb-0">Attach the scans now, or add them later from the employee's Documents tab.</p>
            </div>
            <div className="cert-scan-dialog-actions">
              <button type="button" className="btn btn-warning btn-sm"
                      onClick={() => setScanDialogMissing(null)}>
                Attach now
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm"
                      onClick={() => navigate(`/employees/${scanDialogMissing.id}`)}>
                Add later
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
