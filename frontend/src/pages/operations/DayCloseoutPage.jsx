import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FaLock, FaLockOpen, FaExternalLinkAlt, FaCheckCircle } from "react-icons/fa";

import { PageHeader, PageSection } from "../../components/ui/Page";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States";
import StatusBadge from "../../components/ui/StatusBadge";
import { EntityField } from "../../components/ui/Entity";
import { useToast } from "../../components/ui/useToast";
import { useConfirm } from "../../components/ui/useConfirm";
import { getOperationalDay, closeOperationalDay, reopenOperationalDay } from "../../api/operationsApi";
import { buildDispatchLink } from "../../utils/calendarLinks";

// The end-of-day handoff. A past date is already read-only, so this is not a
// lock — it is the review: what the day ended up as, what nobody tidied, and a
// name against the statement that it was checked.
//
// The loose ends are the reason the page exists. A call left "assigned" on a
// finished day either never happened or never got recorded, and a shift with no
// actual end time cannot be paid accurately — neither shows up on a board that
// only displays today.

function authHeaders(currentUser) {
  return {
    "X-User-Role": currentUser?.role || "",
    "X-User-Id": String(currentUser?.id || ""),
    "X-User-Name": currentUser?.display_name || "",
  };
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function DayCloseoutPage({ currentUser }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [searchParams, setSearchParams] = useSearchParams();
  // Closing usually happens the morning after, so yesterday is the default.
  const day = searchParams.get("date") || yesterdayStr();

  const canClose = ["admin", "supervisor"].includes(currentUser?.role);
  const canReopen = currentUser?.role === "admin";

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    return getOperationalDay(day, authHeaders(currentUser))
      .then((data) => {
        setReport(data);
        setNotes(data.closure?.notes || "");
      })
      .catch((err) => setError(err.message || "Failed to load the day"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, currentUser?.id, currentUser?.role]);

  useEffect(() => { load(); }, [load]);

  const looseCount = report
    ? report.looseEnds.calls.length + report.looseEnds.units.length
    : 0;

  const close = async () => {
    if (looseCount > 0) {
      const ok = await confirm({
        title: `Close ${day} with ${looseCount} unresolved item(s)?`,
        message: "They stay unresolved and are recorded as part of the handoff.",
        confirmLabel: "Close anyway",
        variant: "danger",
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      await closeOperationalDay(day, {
        notes,
        acknowledgeLooseEnds: looseCount > 0,
      }, authHeaders(currentUser));
      toast.success(`${day} closed`);
      load();
    } catch (err) {
      toast.error("Could not close the day", err.message);
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    const ok = await confirm({
      title: `Reopen ${day}?`,
      message: "The existing sign-off and its snapshot are discarded.",
      confirmLabel: "Reopen",
      variant: "danger",
    });
    if (!ok) return;

    setBusy(true);
    try {
      await reopenOperationalDay(day, authHeaders(currentUser));
      toast.success(`${day} reopened`);
      load();
    } catch (err) {
      toast.error("Could not reopen the day", err.message);
    } finally {
      setBusy(false);
    }
  };

  const closed = Boolean(report?.closure);

  return (
    <div className="page-stack">
      <PageHeader
        title="Day closeout"
        description="Review how a day finished, resolve what was left open, and sign it off."
      />

      <PageSection>
        <div className="d-flex align-items-end gap-3 flex-wrap mb-3">
          <div>
            <label className="form-label small mb-1" htmlFor="closeoutDate">Operational day</label>
            <input
              id="closeoutDate"
              type="date"
              className="form-control form-control-sm"
              value={day}
              onChange={(e) => setSearchParams({ date: e.target.value })}
            />
          </div>
          {report && (
            <>
              <StatusBadge
                tone={closed ? "success" : looseCount ? "warning" : "neutral"}
                label={closed ? "Closed" : looseCount ? `${looseCount} unresolved` : "Open"}
              />
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2"
                onClick={() => navigate(buildDispatchLink(day))}
              >
                <FaExternalLinkAlt /> Open the board
              </button>
            </>
          )}
        </div>

        {loading && <LoadingSkeleton rows={3} label="Loading the day" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && report && (
          <>
            <div className="workspace-grid mb-4">
              <EntityField label="Trips" value={String(report.summary.callsTotal)} />
              <EntityField label="Completed" value={String(report.summary.callsCompleted)} />
              <EntityField label="Cancelled" value={String(report.summary.callsCancelled)} />
              <EntityField label="Crew units" value={String(report.summary.unitsTotal)} />
            </div>

            {closed && (
              <div className="alert alert-success d-flex align-items-start gap-2">
                <FaCheckCircle className="mt-1" />
                <div>
                  <div className="fw-semibold">
                    Closed by {report.closure.closedByName || "—"} · {report.closure.closedAt}
                  </div>
                  {report.closure.notes && <div>{report.closure.notes}</div>}
                  {report.closure.snapshot.callsUnfinished + report.closure.snapshot.unitsUnfinished > 0 && (
                    <div className="small">
                      Signed off with {report.closure.snapshot.callsUnfinished} call(s) and{" "}
                      {report.closure.snapshot.unitsUnfinished} shift(s) still unresolved.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </PageSection>

      {!loading && !error && report && (
        <PageSection
          title="Loose ends"
          description="Left open when the day ended. Neither is visible on a board that only shows today."
        >
          {looseCount === 0 ? (
            <EmptyState variant="success" title="Nothing left open"
              description="Every trip was resolved and every shift was closed out." />
          ) : (
            <div className="entity-list">
              {report.looseEnds.calls.map((call) => (
                <div key={`call-${call.id}`} className="cert-row">
                  <div className="cert-row-body">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <strong>{call.pickupTime || "No time"}</strong>
                      <button type="button" className="btn btn-link p-0"
                        onClick={() => navigate(`/calls/${call.id}`)}>
                        Call #{call.id}
                      </button>
                      <StatusBadge tone="warning" label={call.status} />
                    </div>
                    <div className="text-secondary small mt-1">{call.reason}</div>
                  </div>
                </div>
              ))}
              {report.looseEnds.units.map((unit) => (
                <div key={`unit-${unit.id}`} className="cert-row">
                  <div className="cert-row-body">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <strong>Unit {unit.truckNumber}</strong>
                      <StatusBadge tone="warning" label={unit.shiftStatus} />
                    </div>
                    <div className="text-secondary small mt-1">{unit.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageSection>
      )}

      {!loading && !error && report && canClose && (
        <PageSection title={closed ? "Sign-off" : "Close the day"}>
          {!closed && (
            <>
              <label className="form-label fw-semibold" htmlFor="closeNotes">
                Handoff note <span className="text-secondary fw-normal">(optional)</span>
              </label>
              <textarea
                id="closeNotes" rows={2} className="form-control mb-3"
                placeholder="Anything the next shift should know"
                value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy}
              />
              <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2"
                onClick={close} disabled={busy}>
                <FaLock /> Close {day}
              </button>
            </>
          )}

          {closed && canReopen && (
            <button type="button" className="btn btn-outline-danger d-inline-flex align-items-center gap-2"
              onClick={reopen} disabled={busy}>
              <FaLockOpen /> Reopen the day
            </button>
          )}
        </PageSection>
      )}
    </div>
  );
}
