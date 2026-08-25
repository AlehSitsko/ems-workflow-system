import React, { useEffect, useMemo, useState } from "react";

import {
  getCallsReport, callsReportExportUrl,
  getUtilizationReport,
  getHoursReport, hoursReportExportUrl,
  getPunctualityReport, punctualityReportExportUrl,
  getCallLog, callLogExportUrl, getCallAudit,
} from "../api/reportsApi";

/** Local YYYY-MM-DD (never UTC — the report is keyed by the operational day). */
function isoLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29); // last 30 days, inclusive
  return { start: isoLocal(start), end: isoLocal(end) };
}

// The three reports share the date range and export mechanics; each defines how
// to fetch it, its export URL (or none), and a one-line description.
const REPORTS = {
  calls: {
    label: "Calls",
    title: "Call volume, outcomes and service-level mix over a date range.",
    fetch: getCallsReport,
    exportUrl: callsReportExportUrl,
  },
  utilization: {
    label: "Fleet utilisation",
    title: "Crew units on duty against the calls they carried.",
    fetch: getUtilizationReport,
    exportUrl: null,
  },
  hours: {
    label: "Staff hours",
    title: "Worked hours per employee, from approved time entries.",
    fetch: getHoursReport,
    exportUrl: hoursReportExportUrl,
  },
  punctuality: {
    label: "Punctuality",
    title: "On-time performance vs the scheduled pickup and appointment times.",
    fetch: null, // handled specially — it also takes a groupBy
    exportUrl: punctualityReportExportUrl, // called with (start, end, groupBy)
  },
  callLog: {
    label: "Call history",
    title: "Every call over a range — who took it, who dispatched it, the crew and lateness.",
    fetch: getCallLog,
    exportUrl: callLogExportUrl,
  },
};

const SummaryTile = ({ label, value, sub }) => (
  <div className="col-6 col-md-3">
    <div className="card shadow-sm h-100">
      <div className="card-body text-center">
        <div className="display-6 mb-0">{value}</div>
        <div className="text-muted small text-uppercase">{label}</div>
        {sub && <div className="small mt-1">{sub}</div>}
      </div>
    </div>
  </div>
);

const ReportsPage = () => {
  const initial = useMemo(defaultRange, []);
  const [report, setReport] = useState("calls");
  const [groupBy, setGroupBy] = useState("driver"); // punctuality grouping
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [data, setData] = useState(null);
  // Which report `data` belongs to — the three payload shapes differ, so a view
  // must never render against another report's data during the switch's in-flight
  // fetch. Rendering is gated on this matching the selected report.
  const [dataKind, setDataKind] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const active = REPORTS[report];

  const load = async (kind, s, e, gb = groupBy, page = 1) => {
    setLoading(true);
    setError("");
    try {
      let result;
      if (kind === "punctuality") result = await getPunctualityReport(s, e, gb);
      else if (kind === "callLog") result = await getCallLog(s, e, page);
      else result = await REPORTS[kind].fetch(s, e);
      setData(result);
      setDataKind(kind);
    } catch (err) {
      setError(err.message || "Failed to load report.");
      setData(null);
      setDataKind(null);
    } finally {
      setLoading(false);
    }
  };

  // Load on open and whenever the report type changes (reusing the current range).
  useEffect(() => {
    load(report, start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const applyRange = (event) => {
    event.preventDefault();
    load(report, start, end);
  };

  const changeGroupBy = (gb) => {
    setGroupBy(gb);
    load("punctuality", start, end, gb);
  };

  const changeCallLogPage = (page) => {
    load("callLog", start, end, groupBy, page);
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm p-3 mb-4">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div>
            <h4 className="mb-1">Operational Reports</h4>
            <p className="text-muted mb-0">{active.title}</p>
          </div>

          <form className="d-flex align-items-end flex-wrap gap-2" onSubmit={applyRange}>
            <div>
              <label className="form-label small mb-1" htmlFor="report-start">From</label>
              <input
                id="report-start"
                type="date"
                className="form-control form-control-sm"
                value={start}
                max={end}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label small mb-1" htmlFor="report-end">To</label>
              <input
                id="report-end"
                type="date"
                className="form-control form-control-sm"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
              {loading ? "Loading..." : "Apply"}
            </button>
            {active.exportUrl && (
              <a
                className={`btn btn-outline-secondary btn-sm${loading ? " disabled" : ""}`}
                // Punctuality's export also needs the current grouping.
                href={report === "punctuality"
                  ? active.exportUrl(start, end, groupBy)
                  : active.exportUrl(start, end)}
                // A normal navigation the browser turns into a download.
              >
                Export CSV
              </a>
            )}
          </form>
        </div>

        <ul className="nav nav-pills gap-1 mt-3">
          {Object.entries(REPORTS).map(([key, cfg]) => (
            <li className="nav-item" key={key}>
              <button
                type="button"
                className={`nav-link py-1 px-3${report === key ? " active" : ""}`}
                aria-current={report === key ? "page" : undefined}
                onClick={() => setReport(key)}
              >
                {cfg.label}
              </button>
            </li>
          ))}
        </ul>

        {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
      </div>

      {data && dataKind === report && report === "calls" && <CallsView data={data} />}
      {data && dataKind === report && report === "utilization" && <UtilizationView data={data} />}
      {data && dataKind === report && report === "hours" && <HoursView data={data} />}
      {data && dataKind === report && report === "punctuality" && (
        <PunctualityView data={data} groupBy={groupBy} onGroupBy={changeGroupBy} />
      )}
      {data && dataKind === report && report === "callLog" && (
        <CallLogView data={data} onPage={changeCallLogPage} loading={loading} />
      )}
    </div>
  );
};

// ── Call history ───────────────────────────────────────────────────────────────

const prettyAction = (action) =>
  String(action || "").replace(/^call\./, "").replace(/[._]/g, " ");

const StatusBadge = ({ status }) => {
  const cls = status === "completed" ? "text-bg-success"
    : status === "cancelled" ? "text-bg-danger"
    : status === "assigned" ? "text-bg-primary" : "text-bg-secondary";
  return <span className={`badge ${cls}`}>{status}</span>;
};

const CallTimeline = ({ entries }) => {
  if (entries === "loading" || entries === undefined) {
    return <div className="text-muted small py-2">Loading timeline…</div>;
  }
  if (!entries.length) return <div className="text-muted small py-2">No recorded events.</div>;
  // The API returns newest-first; show the timeline oldest-first.
  const ordered = [...entries].reverse();
  return (
    <ul className="list-unstyled small mb-0 py-2">
      {ordered.map((e) => (
        <li key={e.id} className="mb-1">
          <span className="text-muted">{(e.timestamp || "").replace("T", " ")}</span>
          {" — "}<strong className="text-capitalize">{prettyAction(e.action)}</strong>
          {" by "}{e.user_name}
        </li>
      ))}
    </ul>
  );
};

const CallLogView = ({ data, onPage, loading }) => {
  const [openId, setOpenId] = useState(null);
  const [timelines, setTimelines] = useState({}); // callId -> "loading" | entries[]

  const toggle = async (id) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (timelines[id] === undefined) {
      setTimelines((t) => ({ ...t, [id]: "loading" }));
      try {
        const entries = await getCallAudit(id);
        setTimelines((t) => ({ ...t, [id]: entries }));
      } catch {
        setTimelines((t) => ({ ...t, [id]: [] }));
      }
    }
  };

  return (
    <div className="card shadow-sm">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <h5 className="mb-0">Call history</h5>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="text-muted small">
              {data.total} calls · page {data.page} of {data.pages || 1} · click a row for its timeline
            </span>
            {data.pages > 1 && (
              <div className="btn-group btn-group-sm" role="group" aria-label="Call history pages">
                <button type="button" className="btn btn-outline-secondary"
                  disabled={loading || data.page <= 1}
                  onClick={() => onPage(data.page - 1)}>‹ Prev</button>
                <button type="button" className="btn btn-outline-secondary"
                  disabled={loading || data.page >= data.pages}
                  onClick={() => onPage(data.page + 1)}>Next ›</button>
              </div>
            )}
          </div>
        </div>
        {data.items.length === 0 ? (
          <p className="text-muted mb-0">No calls in this range.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>#</th><th>Date</th><th>Service</th><th>Status</th><th>Route</th>
                  <th>Dispatcher</th><th>Assigned by</th><th>Crew</th>
                  <th className="text-end">Pickup late</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <React.Fragment key={c.id}>
                    <tr style={{ cursor: "pointer" }} onClick={() => toggle(c.id)}>
                      <td>#{c.id}</td>
                      <td>{c.date}</td>
                      <td>{c.serviceLevel}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td className="small text-truncate" style={{ maxWidth: 240 }}
                          title={`${c.pickupAddress || ""} → ${c.dropoffAddress || ""}`}>
                        {c.pickupAddress || "—"} → {c.dropoffAddress || "—"}
                      </td>
                      <td>{c.dispatcher || "—"}</td>
                      <td>{c.assignedBy || "—"}</td>
                      <td>{c.crew || (c.truck ? `Truck ${c.truck}` : "—")}</td>
                      <td className="text-end">
                        {c.pickupLateMinutes == null ? "—" : (
                          <span className={c.isLate ? "text-danger" : "text-success"}>
                            {c.pickupLateMinutes}m
                          </span>
                        )}
                      </td>
                    </tr>
                    {openId === c.id && (
                      <tr>
                        <td colSpan={9} className="bg-body-tertiary">
                          <CallTimeline entries={timelines[c.id]} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Punctuality ────────────────────────────────────────────────────────────────

const GROUPINGS = [
  { key: "driver", label: "By driver" },
  { key: "crew", label: "By crew" },
  { key: "dispatcher", label: "By dispatcher" },
];

const onTimeCell = (s) => {
  if (s.onTimeRate === null) return <span className="text-muted">—</span>;
  const cls = s.onTimeRate >= 90 ? "text-success"
    : s.onTimeRate >= 75 ? "text-warning" : "text-danger";
  return <span className={cls}>{s.onTimeRate}%</span>;
};

const PunctualityView = ({ data, groupBy, onGroupBy }) => {
  const subjectHead = groupBy === "dispatcher" ? "Dispatcher"
    : groupBy === "crew" ? "Crew" : "Driver";
  return (
    <>
      <div className="card shadow-sm mb-3">
        <div className="card-body d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div className="btn-group btn-group-sm" role="group" aria-label="Group punctuality by">
            {GROUPINGS.map((g) => (
              <button key={g.key} type="button"
                className={`btn ${groupBy === g.key ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => onGroupBy(g.key)}>{g.label}</button>
            ))}
          </div>
          <span className="text-muted small">
            Late = arriving more than <strong>{data.graceMinutes} min</strong> after the scheduled time.
          </span>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <h5 className="mb-3">On-time performance (worst first)</h5>
          {data.rows.length === 0 ? (
            <p className="text-muted mb-0">
              No completed trips with scheduled times in this range.
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>{subjectHead}</th>
                    <th className="text-end">Pickup on-time</th>
                    <th className="text-end">Late / measured</th>
                    <th className="text-end">Avg late</th>
                    <th className="text-end">Worst</th>
                    <th className="text-end">Appt on-time</th>
                    <th className="text-end">Appt late</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td className="text-end">{onTimeCell(r.pickup)}</td>
                      <td className="text-end">
                        {r.pickup.measured ? `${r.pickup.late} / ${r.pickup.measured}` : "—"}
                      </td>
                      <td className="text-end">{r.pickup.late ? `${r.pickup.avgLateMinutes}m` : "—"}</td>
                      <td className="text-end">{r.pickup.late ? `${r.pickup.maxLateMinutes}m` : "—"}</td>
                      <td className="text-end">{onTimeCell(r.appointment)}</td>
                      <td className="text-end">
                        {r.appointment.measured ? `${r.appointment.late} / ${r.appointment.measured}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ── Calls ────────────────────────────────────────────────────────────────────

const CallsView = ({ data }) => {
  const summary = data.summary;
  const maxDay = Math.max(1, ...(data.by_day || []).map((d) => d.total));
  return (
    <>
      <div className="row g-3 mb-4">
        <SummaryTile label="Total calls" value={summary.total_calls} />
        <SummaryTile
          label="Completed"
          value={summary.completed}
          sub={<span className="text-success">{summary.completion_rate}% of total</span>}
        />
        <SummaryTile
          label="Cancelled"
          value={summary.cancelled}
          sub={<span className="text-danger">{summary.cancellation_rate}% of total</span>}
        />
        <SummaryTile label="Days" value={data.range.days} />
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h5 className="mb-3">Calls by day</h5>
          {summary.total_calls === 0 ? (
            <p className="text-muted mb-0">No calls in this range.</p>
          ) : (
            <div className="d-flex align-items-stretch gap-1" style={{ height: 160 }}>
              {data.by_day.map((d) => (
                <div
                  key={d.date}
                  className="flex-fill d-flex flex-column justify-content-end"
                  style={{ minWidth: 2 }}
                  title={`${d.date}: ${d.total} calls (${d.completed} completed, ${d.cancelled} cancelled)`}
                  aria-label={`${d.date}: ${d.total} calls`}
                >
                  <div
                    className="bg-primary rounded-top"
                    style={{ height: `${(d.total / maxDay) * 100}%` }}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="d-flex justify-content-between text-muted small mt-2">
            <span>{data.range.start}</span>
            <span>{data.range.end}</span>
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h5 className="mb-3">By status</h5>
              <CountTable rows={data.by_status} keyField="status" label="Status" valueField="count" valueHead="Calls" />
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h5 className="mb-3">By service level</h5>
              <CountTable rows={data.by_service_level} keyField="service_level" label="Service level" valueField="count" valueHead="Calls" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ── Fleet utilisation ─────────────────────────────────────────────────────────

const UtilizationView = ({ data }) => {
  const s = data.summary;
  const maxUnits = Math.max(1, ...(data.by_day || []).map((d) => d.units));
  return (
    <>
      <div className="row g-3 mb-4">
        <SummaryTile label="Unit-days" value={s.unit_days} sub={<span className="text-muted">{s.avg_units_per_day}/day</span>} />
        <SummaryTile label="Total calls" value={s.total_calls} />
        <SummaryTile label="Calls / unit" value={s.avg_calls_per_unit} />
        <SummaryTile label="Assigned" value={s.assigned_calls} sub={<span className="text-success">{s.assigned_rate}% of calls</span>} />
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h5 className="mb-3">Units on duty by day</h5>
          {s.unit_days === 0 ? (
            <p className="text-muted mb-0">No crew units scheduled in this range.</p>
          ) : (
            <div className="d-flex align-items-stretch gap-1" style={{ height: 160 }}>
              {data.by_day.map((d) => (
                <div
                  key={d.date}
                  className="flex-fill d-flex flex-column justify-content-end"
                  style={{ minWidth: 2 }}
                  title={`${d.date}: ${d.units} units, ${d.calls} calls (${d.calls_per_unit}/unit)`}
                  aria-label={`${d.date}: ${d.units} units, ${d.calls} calls`}
                >
                  <div className="bg-info rounded-top" style={{ height: `${(d.units / maxUnits) * 100}%` }} />
                </div>
              ))}
            </div>
          )}
          <div className="d-flex justify-content-between text-muted small mt-2">
            <span>{data.range.start}</span>
            <span>{data.range.end}</span>
          </div>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <h5 className="mb-3">By day</h5>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Date</th>
                  <th className="text-end">Units</th>
                  <th className="text-end">Calls</th>
                  <th className="text-end">Assigned</th>
                  <th className="text-end">Calls / unit</th>
                </tr>
              </thead>
              <tbody>
                {data.by_day.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td className="text-end">{d.units}</td>
                    <td className="text-end">{d.calls}</td>
                    <td className="text-end">{d.assigned}</td>
                    <td className="text-end">{d.calls_per_unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

// ── Staff hours ────────────────────────────────────────────────────────────────

const HoursView = ({ data }) => {
  const s = data.summary;
  return (
    <>
      <div className="row g-3 mb-4">
        <SummaryTile label="Total hours" value={s.total_hours} />
        <SummaryTile label="Employees" value={s.employees} />
        <SummaryTile label="Time entries" value={s.total_entries} />
        <SummaryTile label="Days" value={data.range.days} />
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <h5 className="mb-3">Hours by employee</h5>
          {s.employees === 0 ? (
            <p className="text-muted mb-0">No completed time entries in this range.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Employee</th>
                    <th className="text-end">Hours</th>
                    <th className="text-end">Days worked</th>
                    <th className="text-end">Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_employee.map((r) => (
                    <tr key={r.employee_id}>
                      <td>{r.name}</td>
                      <td className="text-end">{r.total_hours}</td>
                      <td className="text-end">{r.days_worked}</td>
                      <td className="text-end">{r.entries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const CountTable = ({ rows, keyField, label, valueField, valueHead }) => {
  if (!rows || rows.length === 0) {
    return <p className="text-muted mb-0">No data.</p>;
  }
  return (
    <div className="table-responsive">
      <table className="table table-sm table-hover align-middle mb-0">
        <thead className="table-light">
          <tr>
            <th>{label}</th>
            <th className="text-end">{valueHead}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[keyField]}>
              <td className="text-capitalize">{String(r[keyField]).replace(/_/g, " ")}</td>
              <td className="text-end">{r[valueField]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ReportsPage;
