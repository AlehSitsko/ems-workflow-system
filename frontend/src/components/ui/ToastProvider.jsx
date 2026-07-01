import { useState, useCallback, useRef } from "react";
import { ToastContext } from "./useToast";

let _nextId = 0;

const ICONS = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

const COLORS = {
  success: { bg: "#198754", border: "#157347" },
  error:   { bg: "#dc3545", border: "#b02a37" },
  warning: { bg: "#f59e0b", border: "#d97706" },
  info:    { bg: "#0d6efd", border: "#0a58ca" },
};

function Toast({ toast, onRemove }) {
  const { bg, border } = COLORS[toast.type] || COLORS.info;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.6rem",
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: "0.65rem 0.9rem",
        color: "#fff",
        fontSize: 14,
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        minWidth: 240,
        maxWidth: 360,
        animation: "ems-toast-in 0.2s ease",
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>
        {ICONS[toast.type] || ICONS.info}
      </span>
      <div style={{ flex: 1, lineHeight: 1.4 }}>
        {toast.title && (
          <div style={{ fontWeight: 600, marginBottom: toast.message ? 2 : 0 }}>
            {toast.title}
          </div>
        )}
        {toast.message && <div style={{ opacity: 0.92 }}>{toast.message}</div>}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        style={{
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.75)",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: "0 0 0 4px",
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const remove = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ type = "info", title, message, duration = 4000 }) => {
      const id = ++_nextId;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      if (duration > 0) {
        timers.current[id] = setTimeout(() => remove(id), duration);
      }
    },
    [remove]
  );

  // Convenience shortcuts
  toast.success = (title, message, opts) => toast({ type: "success", title, message, ...opts });
  toast.error   = (title, message, opts) => toast({ type: "error",   title, message, ...opts });
  toast.warning = (title, message, opts) => toast({ type: "warning", title, message, ...opts });
  toast.info    = (title, message, opts) => toast({ type: "info",    title, message, ...opts });

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          alignItems: "flex-end",
        }}
      >
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onRemove={remove} />
        ))}
      </div>
      <style>{`
        @keyframes ems-toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
