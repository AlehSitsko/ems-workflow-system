export default function WarningModal({ warning, onConfirm, onCancel }) {
  if (!warning) return null;
  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,0.65)" }} tabIndex={-1}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-warning" style={{ background: "var(--ems-board-bg-header)" }}>
          <div className="modal-header border-warning">
            <h5 className="modal-title text-warning">⚠ Compatibility Warning</h5>
          </div>
          <div className="modal-body" style={{ color: "var(--ems-board-text)" }}>
            <p>{warning.message}</p>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>Assign anyway?</p>
          </div>
          <div className="modal-footer border-0">
            <button className="btn btn-outline-secondary" onClick={onCancel}>Cancel</button>
            <button className="btn btn-warning text-dark" onClick={onConfirm}>Assign Anyway</button>
          </div>
        </div>
      </div>
    </div>
  );
}
