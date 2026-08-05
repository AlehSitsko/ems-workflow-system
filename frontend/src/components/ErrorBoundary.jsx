import { Component } from "react";

/**
 * Top-level error boundary.
 *
 * Without one, any uncaught render error unmounts the whole React tree and the
 * user is left staring at a blank page with no way back — especially bad in the
 * desktop build, where there is no address bar to retype. This catches the error,
 * keeps the shell alive, and offers a reload plus copyable (PHI-free) technical
 * detail for a bug report.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept for a future diagnostics sink (desktop log file). Intentionally not
    // sent anywhere in the web build. An error stack is not PHI.
    this.componentStack = info?.componentStack || "";
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const detail = `${error?.name || "Error"}: ${error?.message || String(error)}\n${
      error?.stack || ""
    }`.trim();

    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "var(--color-bg, #f8f9fa)",
          color: "var(--color-text, #1b1f24)",
        }}
      >
        <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.4rem", marginBottom: ".5rem" }}>Something went wrong</h1>
          <p style={{ marginBottom: "1.25rem", opacity: 0.85 }}>
            The application hit an unexpected error. Your data is safe. Reloading
            usually fixes it; if it keeps happening, copy the details below for a
            bug report.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: ".55rem 1.1rem",
              fontWeight: 600,
              cursor: "pointer",
              borderRadius: 8,
              border: "1px solid var(--color-primary, #0d6efd)",
              background: "var(--color-primary, #0d6efd)",
              color: "#fff",
            }}
          >
            Reload the app
          </button>
          <details style={{ marginTop: "1.5rem", textAlign: "left" }}>
            <summary style={{ cursor: "pointer" }}>Technical details</summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: ".8rem",
                marginTop: ".5rem",
                padding: ".75rem",
                borderRadius: 6,
                background: "var(--color-surface-muted, #eceff2)",
                maxHeight: 240,
                overflow: "auto",
              }}
            >
              {detail}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
