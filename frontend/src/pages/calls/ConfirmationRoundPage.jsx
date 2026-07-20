import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FaPhoneAlt, FaCheck, FaTimes, FaExternalLinkAlt } from "react-icons/fa";

import { PageHeader, PageSection } from "../../components/ui/Page";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States";
import StatusBadge from "../../components/ui/StatusBadge";
import { useToast } from "../../components/ui/useToast";
import { useConfirm } from "../../components/ui/useConfirm";
import { getConfirmationRound, setCallConfirmation } from "../../api/callsApi";
import { describeConfirmation, describeLevel } from "../../utils/taxonomy";
import { todayStr } from "../../utils/dispatchBoardUtils";
import { formatTimeForDisplay } from "../../utils/timeUtils";
import { useUserSettings } from "../../context/useUserSettings";

// The confirmation round: a whole day's trips as a call list. Opening each trip
// individually is fine for one correction and hopeless for twenty, so this shows
// the day in the order it would be rung and keeps count of what is left.

function authHeaders(currentUser) {
  return {
    "X-User-Role": currentUser?.role || "",
    "X-User-Id": String(currentUser?.id || ""),
    "X-User-Name": currentUser?.display_name || "",
  };
}

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function ConfirmationRoundPage({ currentUser }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";

  const [searchParams, setSearchParams] = useSearchParams();
  // The round is almost always about tomorrow — that is when it is made.
  const date = searchParams.get("date") || tomorrowStr();

  const [round, setRound] = useState({ calls: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    return getConfirmationRound(date, authHeaders(currentUser))
      .then(setRound)
      .catch((err) => setError(err.message || "Failed to load the round"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, currentUser?.id, currentUser?.role]);

  useEffect(() => { load(); }, [load]);

  const record = async (call, status) => {
    if (status === "declined") {
      const ok = await confirm({
        title: "Patient declined this trip?",
        message: "The call will be cancelled and kept in history.",
        confirmLabel: "Decline and cancel",
        variant: "danger",
      });
      if (!ok) return;
    }

    setBusyId(call.id);
    try {
      const saved = await setCallConfirmation(call.id, status, "", authHeaders(currentUser));
      if (saved.cancelledByConfirmation) toast.warning("Trip cancelled", saved.message);
      load();
    } catch (err) {
      toast.error("Could not record the confirmation", err.message);
    } finally {
      setBusyId(null);
    }
  };

  const summary = round.summary;

  return (
    <div className="page-stack">
      <PageHeader
        title="Confirmation round"
        description="Ring through the day's trips and record how each call went."
      />

      <PageSection>
        <div className="d-flex align-items-end gap-3 flex-wrap mb-3">
          <div>
            <label className="form-label small mb-1" htmlFor="roundDate">Trip date</label>
            <input
              id="roundDate"
              type="date"
              className="form-control form-control-sm"
              value={date}
              min={todayStr()}
              onChange={(e) => setSearchParams({ date: e.target.value })}
            />
          </div>

          {summary && summary.total > 0 && (
            <div className="d-flex gap-2 flex-wrap align-items-center">
              <StatusBadge tone={summary.remaining === 0 ? "success" : "warning"}
                label={summary.remaining === 0
                  ? "All trips confirmed or answered"
                  : `${summary.remaining} of ${summary.total} still to ring`} />
              <span className="text-secondary small">
                {summary.confirmed} confirmed · {summary.no_answer} no answer · {summary.not_called} not called
              </span>
            </div>
          )}
        </div>

        {loading && <LoadingSkeleton rows={4} label="Loading the round" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && round.calls.length === 0 && (
          <EmptyState
            variant="empty"
            title="No trips that day"
            description="Trips scheduled for this date will appear here to be confirmed."
          />
        )}

        {!loading && !error && round.calls.length > 0 && (
          <div className="entity-list">
            {round.calls.map((call) => {
              const state = describeConfirmation(call.confirmation_status);
              const level = describeLevel(call.service_level);
              const done = call.confirmation_status === "confirmed";

              return (
                <div key={call.id} className={`cert-row${done ? " opacity-75" : ""}`}>
                  <div className="cert-row-body">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <strong>
                        {call.pickup_time
                          ? formatTimeForDisplay(call.pickup_time, timeFormat)
                          : "No time"}
                      </strong>
                      <button
                        type="button"
                        className="btn btn-link p-0"
                        onClick={() => navigate(`/calls/${call.id}`)}
                        title="Open the full call"
                      >
                        {call.patientLabel || `Call #${call.id}`}
                      </button>
                      <span className="badge text-bg-secondary" title={level.title}>{level.label}</span>
                      <StatusBadge tone={state.tone} label={state.label} title={state.title} />
                    </div>

                    <div className="text-secondary small mt-1">
                      {call.caller_phone || "No phone on file"}
                      {call.pickup_address ? ` · ${call.pickup_address}` : ""}
                    </div>
                    {call.confirmation_note && (
                      <div className="text-secondary small">Note: {call.confirmation_note}</div>
                    )}
                  </div>

                  <div className="d-flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1"
                      onClick={() => record(call, "confirmed")}
                      disabled={busyId === call.id || done}
                      title="Patient confirmed"
                    >
                      <FaCheck /> Confirmed
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                      onClick={() => record(call, "no_answer")}
                      disabled={busyId === call.id}
                      title="Nobody picked up — ring again later"
                    >
                      <FaPhoneAlt /> No answer
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                      onClick={() => record(call, "declined")}
                      disabled={busyId === call.id}
                      title="Patient declined — cancels the trip"
                    >
                      <FaTimes />
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                      onClick={() => navigate(`/calls/${call.id}`)}
                      title="Open the full call"
                    >
                      <FaExternalLinkAlt />
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
