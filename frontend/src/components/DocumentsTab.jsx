import { useEffect, useState, useRef } from "react";
import {
  FaFileAlt, FaTrash, FaDownload, FaEdit, FaCheck, FaTimes,
  FaPlus, FaEye, FaSpinner,
} from "react-icons/fa";
import {
  getDocuments, uploadDocument, updateDocument, deleteDocument, fetchDocumentBlob,
} from "../api/documentsApi";

const DOC_TYPES = [
  "drivers_license", "cdl", "ems_license", "evoc_cert", "bls_cert",
  "als_cert", "physical_exam", "employment_contract", "offer_letter",
  "background_check", "insurance_card", "other",
];

const DOC_LABELS = {
  drivers_license: "Driver's License",
  cdl: "CDL",
  ems_license: "EMS License",
  evoc_cert: "EVOC Cert",
  bls_cert: "BLS Cert",
  als_cert: "ALS Cert",
  physical_exam: "Physical Exam",
  employment_contract: "Employment Contract",
  offer_letter: "Offer Letter",
  background_check: "Background Check",
  insurance_card: "Insurance Card",
  other: "Other",
};

const STATUS_BADGE = {
  expired: { label: "Expired", cls: "badge bg-dark" },
  critical: { label: "Expiring Soon", cls: "badge bg-danger" },
  warning: { label: "Expiring", cls: "badge bg-warning text-dark" },
  ok: { label: "Valid", cls: "badge bg-success" },
  none: { label: "No Expiry", cls: "badge bg-secondary" },
};

const EMPTY_FORM = {
  doc_type: "other",
  title: "",
  document_number: "",
  issuing_body: "",
  issued_date: "",
  expiry_date: "",
  notes: "",
  file: null,
};

export default function DocumentsTab({ employeeId, currentUser }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const fileRef = useRef();

  const canEdit = ["admin", "supervisor", "hr"].includes(currentUser?.role);

  const [preview, setPreview] = useState(null); // { doc, blobUrl, mimeType } | null
  const [previewLoading, setPreviewLoading] = useState(false);

  // Release blob URL when preview closes
  function closePreview() {
    if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl);
    setPreview(null);
  }

  async function openPreview(doc) {
    setPreviewLoading(true);
    try {
      const { url, mimeType } = await fetchDocumentBlob(doc.id, currentUser);
      setPreview({ doc, blobUrl: url, mimeType });
    } catch {
      setError("Failed to load file for preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDownload(doc) {
    try {
      const { url } = await fetchDocumentBlob(doc.id, currentUser);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name || `document_${doc.id}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setError("Failed to download file");
    }
  }

  useEffect(() => {
    load();
  }, [employeeId]);

  // Revoke blob URL on unmount to prevent memory leak
  const previewRef = useRef(null);
  previewRef.current = preview;
  useEffect(() => {
    return () => { if (previewRef.current?.blobUrl) URL.revokeObjectURL(previewRef.current.blobUrl); };
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getDocuments(employeeId, currentUser);
      setDocs(data);
    } catch {
      setError("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(doc) {
    setForm({
      doc_type: doc.doc_type,
      title: doc.title,
      document_number: doc.document_number || "",
      issuing_body: doc.issuing_body || "",
      issued_date: doc.issued_date || "",
      expiry_date: doc.expiry_date || "",
      notes: doc.notes || "",
      file: null,
    });
    setEditId(doc.id);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editId) {
        const { file: _file, ...rest } = form;
        await updateDocument(editId, rest, currentUser);
      } else {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => {
          if (k === "file") { if (v) fd.append("file", v); }
          else if (v !== null && v !== "") fd.append(k, v);
        });
        await uploadDocument(employeeId, fd, currentUser);
      }
      await load();
      cancelForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    try {
      await deleteDocument(doc.id, currentUser);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch {
      setError("Failed to delete document");
    }
  }

  return (
    <div style={{ padding: "16px 20px", color: "#e9ecef", background: "#0d1117", minHeight: "100%" }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0" style={{ color: "#c9d1d9" }}>Documents</h6>
        {canEdit && (
          <button className="btn btn-sm btn-primary" onClick={openNew}>
            <FaPlus style={{ marginRight: 4 }} />Add Document
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-danger py-1 px-2 mb-3" style={{ fontSize: 13 }}>{error}</div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 p-3 rounded"
          style={{ background: "#161b22", border: "1px solid #2a3347" }}
        >
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label" style={{ color: "#8b949e", fontSize: 12 }}>Type</label>
              <select
                className="form-select form-select-sm"
                value={form.doc_type}
                onChange={(e) => setForm((f) => ({ ...f, doc_type: e.target.value }))}
                style={{ background: "#0d1117", color: "#e9ecef", borderColor: "#2a3347" }}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{DOC_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label" style={{ color: "#8b949e", fontSize: 12 }}>Title *</label>
              <input
                className="form-control form-control-sm"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                style={{ background: "#0d1117", color: "#e9ecef", borderColor: "#2a3347" }}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" style={{ color: "#8b949e", fontSize: 12 }}>Document #</label>
              <input
                className="form-control form-control-sm"
                value={form.document_number}
                onChange={(e) => setForm((f) => ({ ...f, document_number: e.target.value }))}
                style={{ background: "#0d1117", color: "#e9ecef", borderColor: "#2a3347" }}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" style={{ color: "#8b949e", fontSize: 12 }}>Issuing Body</label>
              <input
                className="form-control form-control-sm"
                value={form.issuing_body}
                onChange={(e) => setForm((f) => ({ ...f, issuing_body: e.target.value }))}
                style={{ background: "#0d1117", color: "#e9ecef", borderColor: "#2a3347" }}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" style={{ color: "#8b949e", fontSize: 12 }}>Issue Date</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={form.issued_date}
                onChange={(e) => setForm((f) => ({ ...f, issued_date: e.target.value }))}
                style={{ background: "#0d1117", color: "#e9ecef", borderColor: "#2a3347", colorScheme: "dark" }}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" style={{ color: "#8b949e", fontSize: 12 }}>Expiry Date</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={form.expiry_date}
                onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))}
                style={{ background: "#0d1117", color: "#e9ecef", borderColor: "#2a3347", colorScheme: "dark" }}
              />
            </div>
            {!editId && (
              <div className="col-md-4">
                <label className="form-label" style={{ color: "#8b949e", fontSize: 12 }}>File (PDF/Image/DOCX)</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  className="form-control form-control-sm"
                  onChange={(e) => setForm((f) => ({ ...f, file: e.target.files[0] || null }))}
                  style={{ background: "#0d1117", color: "#e9ecef", borderColor: "#2a3347" }}
                />
              </div>
            )}
            <div className="col-12">
              <label className="form-label" style={{ color: "#8b949e", fontSize: 12 }}>Notes</label>
              <textarea
                className="form-control form-control-sm"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                style={{ background: "#0d1117", color: "#e9ecef", borderColor: "#2a3347" }}
              />
            </div>
          </div>
          <div className="d-flex gap-2 mt-3">
            <button type="submit" className="btn btn-sm btn-success" disabled={saving}>
              <FaCheck style={{ marginRight: 4 }} />{saving ? "Saving…" : editId ? "Save Changes" : "Upload"}
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={cancelForm} disabled={saving}>
              <FaTimes style={{ marginRight: 4 }} />Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ color: "#8b949e", fontSize: 13 }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div style={{ color: "#8b949e", fontSize: 13 }}>No documents on file.</div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {docs.map((doc) => {
            const badge = STATUS_BADGE[doc.expiry_status] || STATUS_BADGE.none;
            return (
              <div
                key={doc.id}
                className="d-flex align-items-start gap-3 p-3 rounded"
                style={{ background: "#161b22", border: "1px solid #2a3347" }}
              >
                <FaFileAlt style={{ color: "#58a6ff", marginTop: 3, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span style={{ fontWeight: 600, color: "#c9d1d9" }}>{doc.title}</span>
                    <span className="badge bg-secondary" style={{ fontSize: 10 }}>
                      {DOC_LABELS[doc.doc_type] || doc.doc_type}
                    </span>
                    <span className={badge.cls} style={{ fontSize: 10 }}>{badge.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#8b949e", marginTop: 3 }}>
                    {doc.document_number && <span className="me-3">#{doc.document_number}</span>}
                    {doc.issuing_body && <span className="me-3">{doc.issuing_body}</span>}
                    {doc.issued_date && <span className="me-3">Issued: {doc.issued_date}</span>}
                    {doc.expiry_date && <span>Expires: {doc.expiry_date}</span>}
                  </div>
                  {doc.notes && (
                    <div style={{ fontSize: 12, color: "#6e7681", marginTop: 2 }}>{doc.notes}</div>
                  )}
                </div>
                <div className="d-flex gap-1 flex-shrink-0">
                  {doc.has_file && (
                    <>
                      <button
                        className="btn btn-sm btn-outline-info"
                        style={{ fontSize: 11 }}
                        onClick={() => openPreview(doc)}
                        disabled={previewLoading}
                        title="Preview"
                      >
                        {previewLoading ? <FaSpinner style={{ animation: "spin 1s linear infinite" }} /> : <FaEye />}
                      </button>
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        style={{ fontSize: 11 }}
                        onClick={() => handleDownload(doc)}
                        title="Download"
                      >
                        <FaDownload />
                      </button>
                    </>
                  )}
                  {canEdit && (
                    <>
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        style={{ fontSize: 11 }}
                        onClick={() => openEdit(doc)}
                        title="Edit metadata"
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        style={{ fontSize: 11 }}
                        onClick={() => handleDelete(doc)}
                        title="Delete"
                      >
                        <FaTrash />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── File Preview Modal ── */}
      {preview && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            background: "rgba(0,0,0,0.85)",
            display: "flex", flexDirection: "column",
          }}
          onClick={closePreview}
        >
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 16px", background: "#161b22", borderBottom: "1px solid #2a3347",
              flexShrink: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <FaFileAlt style={{ color: "#58a6ff" }} />
              <span style={{ color: "#c9d1d9", fontWeight: 600 }}>{preview.doc.title}</span>
              {preview.doc.file_name && (
                <span style={{ color: "#8b949e", fontSize: 12 }}>{preview.doc.file_name}</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => handleDownload(preview.doc)}
                title="Download"
              >
                <FaDownload style={{ marginRight: 4 }} />Download
              </button>
              <button className="btn btn-sm btn-outline-secondary" onClick={closePreview}>
                <FaTimes />
              </button>
            </div>
          </div>

          <div
            style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            {preview.mimeType.startsWith("image/") ? (
              <img
                src={preview.blobUrl}
                alt={preview.doc.title}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 4 }}
              />
            ) : preview.mimeType === "application/pdf" ? (
              <iframe
                src={preview.blobUrl}
                title={preview.doc.title}
                style={{ width: "100%", height: "100%", border: "none", borderRadius: 4, background: "#fff" }}
              />
            ) : (
              <div style={{ textAlign: "center", color: "#8b949e" }}>
                <FaFileAlt style={{ fontSize: 48, marginBottom: 16, color: "#58a6ff" }} />
                <p>This file type cannot be previewed in the browser.</p>
                <button className="btn btn-primary" onClick={() => handleDownload(preview.doc)}>
                  <FaDownload style={{ marginRight: 6 }} />Download to view
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
