import React, { useEffect, useMemo, useState } from "react";

import { getCallsReport, callsReportExportUrl } from "../api/reportsApi";

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
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (s, e) => {
    setLoading(true);
    setError("");
    try {
      setData(await getCallsReport(s, e));
    } catch (err) {
      setError(err.message || "Failed to load report.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // Load the default range on open.
  useEffect(() => {
    load(initial.start, initial.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyRange = (event) => {
    event.preventDefault();
    load(start, end);
  };

  const summary = data?.summary;
  const maxDay = useMemo(
    () => Math.max(1, ...((data?.by_day || []).map((d) => d.total))),
    [data],
  );

  return (
    <div className="container mt-4">
      <div className="card shadow-sm p-3 mb-4">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div>
            <h4 className="mb-1">Operational Reports</h4>
            <p className="text-muted mb-0">
              Call volume, outcomes and service-level mix over a date range.
            </p>
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
            <a
              className={`btn btn-outline-secondary btn-sm${loading ? " disabled" : ""}`}
              href={callsReportExportUrl(start, end)}
              // A normal navigation the browser turns into a download.
            >
              Export CSV
            </a>
          </form>
        </div>

        {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
      </div>

      {summary && (
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
                  <BreakdownTable rows={data.by_status} keyField="status" label="Status" />
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="card shadow-sm h-100">
                <div className="card-body">
                  <h5 className="mb-3">By service level</h5>
                  <BreakdownTable
                    rows={data.by_service_level}
                    keyField="service_level"
                    label="Service level"
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const BreakdownTable = ({ rows, keyField, label }) => {
  if (!rows || rows.length === 0) {
    return <p className="text-muted mb-0">No data.</p>;
  }
  return (
    <div className="table-responsive">
      <table className="table table-sm table-hover align-middle mb-0">
        <thead className="table-light">
          <tr>
            <th>{label}</th>
            <th className="text-end">Calls</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[keyField]}>
              <td className="text-capitalize">{String(r[keyField]).replace(/_/g, " ")}</td>
              <td className="text-end">{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ReportsPage;
