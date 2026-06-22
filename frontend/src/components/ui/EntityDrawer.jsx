import { useEffect, useRef } from "react";

/**
 * EntityDrawer — стандартный right-side drawer для всей системы.
 *
 * Props:
 *   open                boolean
 *   onClose             () => void  — закрывает немедленно
 *   onCloseRequested    () => void  — вызывается при клике overlay / ✕ / Escape;
 *                                     если передан — caller решает, закрывать ли
 *                                     (например, показать confirm); если не передан —
 *                                     вызывается onClose напрямую
 *   title               string
 *   subtitle            string (optional)
 *   width               number (default 480)
 *   footer              ReactNode
 *   tabs                Array<{ key, label, content }> (optional)
 *   activeTab           string
 *   onTabChange         (key) => void
 *   loading             boolean
 *   children            ReactNode
 */
export default function EntityDrawer({
  open,
  onClose,
  onCloseRequested,
  title,
  subtitle,
  width = "50vw",
  footer,
  tabs,
  activeTab,
  onTabChange,
  loading = false,
  children,
}) {
  const drawerRef = useRef(null);
  const requestClose = onCloseRequested || onClose;

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") requestClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, requestClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);


  return (
    <>
      {/* Overlay */}
      <div
        onClick={requestClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1040,
          background: "var(--ems-overlay-bg, rgba(15,23,42,0.4))",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease",
        }}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: width,
          maxWidth: "100vw",
          zIndex: 1050,
          display: "flex",
          flexDirection: "column",
          background: "var(--ems-bg-surface)",
          borderLeft: "1px solid var(--ems-border)",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "1.1rem 1.25rem 0.9rem",
            borderBottom: "1px solid var(--ems-border)",
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 16,
                color: "var(--ems-text-primary)",
                lineHeight: 1.3,
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 12, color: "var(--ems-text-muted)", marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={requestClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: "var(--ems-text-muted)",
              lineHeight: 1,
              padding: "0 0 0 0.5rem",
              flexShrink: 0,
              marginTop: 2,
            }}
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>

        {/* Tabs (optional) */}
        {tabs && tabs.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "8px 16px",
              borderBottom: "1px solid var(--ems-border)",
              flexShrink: 0,
              overflowX: "auto",
              background: "var(--ems-bg-surface-2)",
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => onTabChange?.(tab.key)}
                style={{
                  background: activeTab === tab.key ? "#0d6efd" : "var(--ems-bg-surface)",
                  border: `1px solid ${activeTab === tab.key ? "#0d6efd" : "var(--ems-border)"}`,
                  borderRadius: 7,
                  color: activeTab === tab.key ? "#fff" : "var(--ems-text-secondary)",
                  fontWeight: activeTab === tab.key ? 700 : 500,
                  fontSize: 12,
                  padding: "5px 14px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.13s",
                  letterSpacing: 0.2,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.1rem 1.25rem",
            position: "relative",
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 120,
                color: "var(--ems-text-muted)",
                fontSize: 14,
              }}
            >
              Loading…
            </div>
          ) : (
            children
          )}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              flexShrink: 0,
              padding: "0.85rem 1.25rem",
              borderTop: "1px solid var(--ems-border)",
              background: "var(--ems-bg-surface)",
              display: "flex",
              gap: "0.5rem",
              justifyContent: "flex-end",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
