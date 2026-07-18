import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaSearch, FaArrowRight, FaUserInjured, FaTruck, FaUsers,
} from "react-icons/fa";

import { getNavigationGroups } from "../../config/routeMetadata";
import {
  hasPatientAccess, hasFleetAccess, hasEmployeeAccess,
} from "../../api/authApi";
import { getPatients } from "../../api/patientsApi";
import { getVehicles } from "../../api/vehiclesApi";
import { getEmployees } from "../../api/employeesApi";

/**
 * Global search / command palette.
 *
 * Two things a person actually does from a header search: jump to a page, or
 * find a specific record. Both are backed by real data here — the navigation
 * list is the same permission-filtered route metadata the sidebar uses, and the
 * record groups call the real list/search APIs. There is no faked result set:
 * a source the user cannot access is not searched, and a source without a
 * free-text search (calls, tasks) is deliberately absent rather than faked.
 *
 * Destinations are only ever real routes: patients, vehicles and employees all
 * deep-link to their workspaces.
 */

const MIN_QUERY = 2;
const PER_GROUP = 6;

export default function CommandPalette({ currentUser }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [records, setRecords] = useState({ patients: [], vehicles: [], employees: [] });
  const [loading, setLoading] = useState(false);

  const inputRef = useRef(null);
  // Small reference datasets (fleet, roster) are fetched once per open and
  // filtered client-side; patients are large, so they use the server search.
  const cacheRef = useRef({ vehicles: null, employees: null });

  const canPatients = hasPatientAccess(currentUser);
  const canFleet = hasFleetAccess(currentUser);
  const canEmployees = hasEmployeeAccess(currentUser);

  // ── Open / close ──────────────────────────────────────────────────────────
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setRecords({ patients: [], vehicles: [], employees: [] });
    setActiveIndex(0);
  }, []);

  // Global shortcut: Cmd/Ctrl+K toggles the palette from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      // Focus the field and lock body scroll while the overlay is up.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { clearTimeout(t); document.body.style.overflow = prev; };
    }
    return undefined;
  }, [open]);

  // ── Navigation results (synchronous, permission-filtered) ───────────────────
  const navItems = useMemo(() => {
    const groups = getNavigationGroups(currentUser);
    const flat = groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.title })));
    const q = query.trim().toLowerCase();
    const matched = q
      ? flat.filter((it) => it.title.toLowerCase().includes(q) || it.group.toLowerCase().includes(q))
      : flat;
    return matched.slice(0, q ? PER_GROUP : flat.length).map((it) => ({
      key: `nav:${it.path}`,
      title: it.title,
      subtitle: it.group,
      icon: it.icon ? <it.icon /> : <FaArrowRight />,
      run: () => navigate(it.path),
    }));
  }, [currentUser, query, navigate]);

  // ── Record results (real APIs, debounced) ───────────────────────────────────
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < MIN_QUERY) {
      setRecords({ patients: [], vehicles: [], employees: [] });
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const next = { patients: [], vehicles: [], employees: [] };
      const lower = q.toLowerCase();

      try {
        await Promise.all([
          canPatients
            ? getPatients({ name: q }, 1, PER_GROUP)
                .then((d) => { next.patients = d.items || []; })
                .catch(() => {})
            : null,
          canFleet
            ? (cacheRef.current.vehicles
                ? Promise.resolve(cacheRef.current.vehicles)
                : getVehicles().then((d) => {
                    cacheRef.current.vehicles = Array.isArray(d) ? d : [];
                    return cacheRef.current.vehicles;
                  }).catch(() => []))
                .then((list) => {
                  next.vehicles = (list || []).filter((v) =>
                    [v.unitName, v.unitNumber, v.unitType]
                      .some((f) => String(f || "").toLowerCase().includes(lower))
                  ).slice(0, PER_GROUP);
                })
            : null,
          canEmployees
            ? (cacheRef.current.employees
                ? Promise.resolve(cacheRef.current.employees)
                : getEmployees().then((d) => {
                    cacheRef.current.employees = Array.isArray(d) ? d : [];
                    return cacheRef.current.employees;
                  }).catch(() => []))
                .then((list) => {
                  next.employees = (list || []).filter((emp) =>
                    [emp.firstName, emp.lastName, emp.employeeNumber]
                      .some((f) => String(f || "").toLowerCase().includes(lower))
                  ).slice(0, PER_GROUP);
                })
            : null,
        ]);
      } finally {
        if (!cancelled) { setRecords(next); setLoading(false); }
      }
    }, 220);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, open, canPatients, canFleet, canEmployees]);

  // ── Flatten all visible results for keyboard navigation ─────────────────────
  const groups = useMemo(() => {
    const out = [];
    if (navItems.length) out.push({ label: "Go to", items: navItems });

    if (records.patients.length) {
      out.push({
        label: "Patients",
        items: records.patients.map((p) => ({
          key: `patient:${p.id}`,
          title: `${p.first_name} ${p.last_name}`,
          subtitle: p.dob ? `DOB ${p.dob}` : "Patient",
          icon: <FaUserInjured />,
          run: () => navigate(`/patients/${p.id}`),
        })),
      });
    }

    if (records.vehicles.length) {
      out.push({
        label: "Vehicles",
        items: records.vehicles.map((v) => ({
          key: `vehicle:${v.id}`,
          title: v.unitName || `Unit ${v.unitNumber}`,
          subtitle: [v.unitNumber && `Unit ${v.unitNumber}`, v.unitType].filter(Boolean).join(" · ") || "Vehicle",
          icon: <FaTruck />,
          run: () => navigate(`/fleet/vehicles/${v.id}`),
        })),
      });
    }

    if (records.employees.length) {
      out.push({
        label: "Employees",
        items: records.employees.map((emp) => ({
          key: `employee:${emp.id}`,
          title: `${emp.firstName} ${emp.lastName}`,
          subtitle: emp.employeeNumber ? `#${emp.employeeNumber}` : "Employee",
          icon: <FaUsers />,
          run: () => navigate(`/employees/${emp.id}`),
        })),
      });
    }
    return out;
  }, [navItems, records, navigate]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Keep the active index in range as results change.
  useEffect(() => { setActiveIndex(0); }, [query]);
  useEffect(() => {
    if (activeIndex >= flatItems.length) setActiveIndex(Math.max(0, flatItems.length - 1));
  }, [flatItems.length, activeIndex]);

  const select = useCallback((item) => {
    if (!item) return;
    item.run();
    close();
  }, [close]);

  const onInputKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(flatItems[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const shortcutHint = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘K" : "Ctrl K";
  const q = query.trim();
  const noResults = q.length >= MIN_QUERY && !loading && flatItems.length === 0;

  return (
    <>
      <button
        type="button"
        className="command-trigger"
        onClick={() => setOpen(true)}
        aria-label="Search and commands"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <FaSearch aria-hidden="true" />
        <span className="command-trigger-label">Search…</span>
        <kbd className="command-trigger-kbd">{shortcutHint}</kbd>
      </button>

      {open && (
        <div className="command-overlay" role="presentation" onMouseDown={close}>
          <div
            className="command-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Search and commands"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="command-input-row">
              <FaSearch className="command-input-icon" aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                className="command-input"
                placeholder="Search pages, patients, vehicles, employees…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                role="combobox"
                aria-expanded="true"
                aria-controls="command-listbox"
                aria-autocomplete="list"
              />
              {loading && <span className="command-spinner" aria-label="Searching" />}
            </div>

            <div className="command-results" id="command-listbox" role="listbox">
              {groups.map((group) => (
                <div key={group.label} className="command-group">
                  <div className="command-group-label">{group.label}</div>
                  {group.items.map((item) => {
                    const index = flatItems.indexOf(item);
                    const active = index === activeIndex;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`command-item${active ? " active" : ""}`}
                        onMouseMove={() => setActiveIndex(index)}
                        onClick={() => select(item)}
                      >
                        <span className="command-item-icon" aria-hidden="true">{item.icon}</span>
                        <span className="command-item-text">
                          <span className="command-item-title">{item.title}</span>
                          <span className="command-item-subtitle">{item.subtitle}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {noResults && (
                <div className="command-empty">No matches for &ldquo;{q}&rdquo;.</div>
              )}
              {q.length > 0 && q.length < MIN_QUERY && (
                <div className="command-empty">Keep typing to search records…</div>
              )}
            </div>

            <div className="command-footer">
              <span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
              <span><kbd>↵</kbd> to open</span>
              <span><kbd>Esc</kbd> to close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
