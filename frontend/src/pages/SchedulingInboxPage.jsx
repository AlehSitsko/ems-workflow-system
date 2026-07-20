import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaCalendarPlus, FaBan, FaArrowRight } from "react-icons/fa";

import { PageHeader, PageSection } from "../components/ui/Page";
import { EmptyState, ErrorState, LoadingSkeleton } from "../components/ui/States";
import { useToast } from "../components/ui/useToast";
import { useConfirm } from "../components/ui/useConfirm";
import { getUnscheduledCalls, scheduleCall, cancelCall } from "../api/callsApi";
import { buildDispatchLink } from "../utils/calendarLinks";
import { todayStr } from "../utils/dispatchBoardUtils";
import { describeLevel } from "../utils/taxonomy";

// Calls taken without a trip date used to exist in the database and nowhere in
// the product: the calendar filters by date and the Dispatch Board loads one day
// at a time, so "we'll call you back with the day" fell through both. This page
// is that queue, and giving a call a date is the only way out of it — after
// which it behaves like any other call.

function authHeaders(currentUser) {
  return {
    "X-User-Role": currentUser?.role || "",
    "X-User-Id": String(currentUser?.id || ""),
    "X-User-Name": currentUser?.display_name || "",
  };
}

export default function SchedulingInboxPage({ currentUser }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);

  const headers = authHeaders(currentUser);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    return getUnscheduledCalls(authHeaders(currentUser))
      .then(setCalls)
      .catch((err) => setError(err.message || "Failed to load the scheduling inbox"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => { load(); }, [load]);

  const draftFor = (id) => drafts[id] || { tripDate: "", pickupTime: "" };
  const setDraft = (id, patch) =>
    setDrafts((d) => ({ ...d, [id]: { ...draftFor(id), ...patch } }));

  const schedule = async (call) => {
    const draft = draftFor(call.id);
    if (!draft.tripDate) {
      toast.error("Pick a date", "A trip date is required to take this call out of the inbox.");
      return;
    }

    setBusyId(call.id);
    try {
      await scheduleCall(call.id, draft.tripDate, draft.pickupTime, headers);
      toast.success("Call scheduled", `Now on the board for ${draft.tripDate}.`);
      setDrafts((d) => {
        const next = { ...d };
        delete next[call.id];
        return next;
      });
      load();
    } catch (err) {
      toast.error("Could not schedule the call", err.message);
    } finally {
      setBusyId(null);
    }
  };

  const drop = async (call) => {
    const reason = await confirm({
      title: "Cancel this call?",
      message: "It leaves the inbox and is kept as a cancelled record.",
      confirmLabel: "Cancel call",
      variant: "danger",
    });
    if (!reason) return;

    setBusyId(call.id);
    try {
      await cancelCall(call.id, "Cancelled from the scheduling inbox", headers);
      toast.success("Call cancelled");
      load();
    } catch (err) {
      toast.error("Could not cancel the call", err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Scheduling inbox"
        description="Calls taken without a trip date. They appear on no board until they get one."
        count={calls.length}
      />

      <PageSection>
        {loading && <LoadingSkeleton rows={3} label="Loading the inbox" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && calls.length === 0 && (
          <EmptyState
            variant="success"
            title="Nothing waiting to be scheduled"
            description="Calls taken without a date will appear here until one is set."
          />
        )}

        {!loading && !error && calls.length > 0 && (
          <div className="entity-list">
            {calls.map((call) => {
              const draft = draftFor(call.id);
              const level = describeLevel(call.service_level);

              return (
                <div key={call.id} className="cert-row flex-wrap">
                  <div className="cert-row-body">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <strong>{call.patientLabel || `Call #${call.id}`}</strong>
                      <span className="badge text-bg-secondary" title={level.title}>
                        {level.label}
                      </span>
                      {call.call_type && call.call_type !== "none" && (
                        <span className="badge text-bg-light text-dark">{call.call_type}</span>
                      )}
                      {call.date_of_call && (
                        <span className="text-secondary small">Taken {call.date_of_call}</span>
                      )}
                    </div>

                    {(call.pickup_address || call.dropoff_address) && (
                      <div className="text-secondary small mt-1">
                        {call.pickup_address || "—"} → {call.dropoff_address || "—"}
                      </div>
                    )}
                    {call.caller_note && (
                      <div className="text-secondary small">Note: {call.caller_note}</div>
                    )}
                  </div>

                  <div className="d-flex align-items-end gap-2 flex-wrap">
                    <div>
                      <label className="form-label small mb-1" htmlFor={`date-${call.id}`}>
                        Trip date
                      </label>
                      <input
                        id={`date-${call.id}`}
                        type="date"
                        className="form-control form-control-sm"
                        min={todayStr()}
                        value={draft.tripDate}
                        onChange={(e) => setDraft(call.id, { tripDate: e.target.value })}
                        disabled={busyId === call.id}
                      />
                    </div>
                    <div>
                      <label className="form-label small mb-1" htmlFor={`time-${call.id}`}>
                        Pickup <span className="text-secondary">(optional)</span>
                      </label>
                      <input
                        id={`time-${call.id}`}
                        type="time"
                        className="form-control form-control-sm"
                        value={draft.pickupTime}
                        onChange={(e) => setDraft(call.id, { pickupTime: e.target.value })}
                        disabled={busyId === call.id}
                      />
                    </div>

                    <button
                      type="button"
                      className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
                      onClick={() => schedule(call)}
                      disabled={busyId === call.id}
                    >
                      <FaCalendarPlus /> Schedule
                    </button>
                    {draft.tripDate && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                        onClick={() => navigate(buildDispatchLink(draft.tripDate))}
                        title="Open that day on the board first"
                      >
                        <FaArrowRight />
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                      onClick={() => drop(call)}
                      disabled={busyId === call.id}
                    >
                      <FaBan />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageSection>
    </div>
  );
}
