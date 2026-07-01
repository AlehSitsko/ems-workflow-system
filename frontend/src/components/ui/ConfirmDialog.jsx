import { useState, useCallback } from "react";
import { ConfirmContext } from "./useConfirm";

const VARIANTS = {
  danger:  { confirmClass: "btn btn-danger",   icon: "⚠" },
  warning: { confirmClass: "btn btn-warning",  icon: "⚠" },
  info:    { confirmClass: "btn btn-primary",  icon: "ℹ" },
};

function Dialog({ opts, onConfirm, onCancel }) {
  const variant = VARIANTS[opts.variant] || VARIANTS.danger;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ems-overlay-bg, rgba(15,23,42,0.5))",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: "var(--ems-bg-surface)",
          border: "1px solid var(--ems-border)",
          borderRadius: 14,
          padding: "1.75rem",
          maxWidth: 420,
          width: "90%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "1.25rem" }}>
          <span style={{ fontSize: 22, lineHeight: 1, marginTop: 1 }}>{variant.icon}</span>
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 16,
                color: "var(--ems-text-primary)",
                marginBottom: opts.message ? 6 : 0,
              }}
            >
              {opts.title || "Are you sure?"}
            </div>
            {opts.message && (
              <div style={{ fontSize: 14, color: "var(--ems-text-muted)", lineHeight: 1.5 }}>
                {opts.message}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button className="btn btn-sm btn-outline-secondary" onClick={onCancel}>
            {opts.cancelLabel || "Cancel"}
          </button>
          <button className={`btn btn-sm ${variant.confirmClass}`} onClick={onConfirm} autoFocus>
            {opts.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setState({
        opts: typeof opts === "string" ? { title: opts } : opts,
        resolve,
      });
    });
  }, []);

  const handleConfirm = () => {
    state?.resolve(true);
    setState(null);
  };

  const handleCancel = () => {
    state?.resolve(false);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Dialog opts={state.opts} onConfirm={handleConfirm} onCancel={handleCancel} />
      )}
    </ConfirmContext.Provider>
  );
}
