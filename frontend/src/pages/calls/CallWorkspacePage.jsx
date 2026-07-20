import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaArrowLeft, FaPhoneAlt, FaSave, FaExternalLinkAlt } from "react-icons/fa";

import { PageSection } from "../../components/ui/Page";
import { EntityField } from "../../components/ui/Entity";
import { ErrorState, LoadingSkeleton, EmptyState } from "../../components/ui/States";
import StatusBadge from "../../components/ui/StatusBadge";
import { useToast } from "../../components/ui/useToast";
import { useConfirm } from "../../components/ui/useConfirm";
import { getCall, setCallConfirmation, updateCall } from "../../api/callsApi";
import { buildDispatchLink } from "../../utils/calendarLinks";
import {
  describeConfirmation, describeLevel, CONFIRMATION_STATUSES, CONFIRMATION_STATUS_META,
} from "../../utils/taxonomy";

// One call, in full. The dispatcher working tomorrow's confirmation round needs
// to see every detail of a trip, fix what the patient corrects on the phone, and
// record how the call went — without hunting across the board, the calendar and
// the patient record.
//
// Declining is deliberately not a plain status change: the server cancels the
// call, so the button says that and asks first.

function authHeaders(currentUser) {
  return {
    "X-User-Role": currentUser?.role || "",
    "X-User-Id": String(currentUser?.id || ""),
    "X-User-Name": currentUser?.display_name || "",
  };
}

const EDITABLE = ["pickup_time", "pickup_address", "dropoff_address", "caller_phone", "notes"];

export default function CallWorkspacePage({ currentUser }) {
  const { callId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const headers = authHeaders(currentUser);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    setNotFound(false);
    return getCall(callId, authHeaders(currentUser))
      .then((data) => {
        setCall(data);
        setForm(Object.fromEntries(EDITABLE.map((k) => [k, data[k] || ""])));
        setNote(data.confirmation_note || "");
      })
      .catch((err) => {
        if (err.status === 404) setNotFound(true);
        else setError(err.message || "Failed to load call");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, currentUser?.id, currentUser?.role]);

  useEffect(() => { load(); }, [load]);

  const dirty = call && EDITABLE.some((k) => (form[k] || "") !== (call[k] || ""));

  const save = async () => {
    setBusy(true);
    try {
      await updateCall(callId, { ...call, ...form }, headers);
      toast.success("Call updated");
      load();
    } catch (err) {
      toast.error("Could not save the call", err.message);
    } finally {
      setBusy(false);
    }
  };

  const record = async (status) => {
    if (status === "declined") {
      const ok = await confirm({
        title: "Patient declined this trip?",
        message: "The call will be cancelled and kept in history.",
        confirmLabel: "Decline and cancel",
        variant: "danger",
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      const saved = await setCallConfirmation(callId, status, note, headers);
      if (saved.cancelledByConfirmation) toast.warning("Trip cancelled", saved.message);
      else toast.success(`Marked as ${CONFIRMATION_STATUS_META[status].label.toLowerCase()}`);
      load();
    } catch (err) {
      toast.error("Could not record the confirmation", err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="page-stack"><LoadingSkeleton rows={4} label="Loading call" /></div>;
  if (notFound) {
    return (
      <div className="page-stack">
        <EmptyState variant="empty" title="Call not found"
          description={`No call with id ${callId}.`} />
      </div>
    );
  }
  if (error) return <div className="page-stack"><ErrorState message={error} onRetry={load} /></div>;

  const confirmation = describeConfirmation(call.confirmation_status);
  const level = describeLevel(call.service_level);
  const cancelled = call.status === "cancelled";

  return (
    <div className="page-stack">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2"
          onClick={() => navigate(-1)}>
          <FaArrowLeft /> Back
        </button>
        {call.trip_date && (
          <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2"
            onClick={() => navigate(buildDispatchLink(call.trip_date, { call: call.id }))}>
            <FaExternalLinkAlt /> Open on the board
          </button>
        )}
      </div>

      <PageSection
        title={`Call #${call.id}${call.patientLabel ? ` — ${call.patientLabel}` : ""}`}
        description={call.trip_date ? `Trip on ${call.trip_date}` : "No trip date yet — in the scheduling inbox"}
      >
        <div className="d-flex align-items-center gap-2 flex-wrap mb-3">
          <StatusBadge tone={confirmation.tone} label={confirmation.label} title={confirmation.title} />
          <span className="badge text-bg-secondary" title={level.title}>{level.label}</span>
          {call.call_type && call.call_type !== "none" && (
            <span className="badge text-bg-light text-dark">{call.call_type}</span>
          )}
          {cancelled && <StatusBadge tone="danger" label="Cancelled" />}
        </div>

        <div className="workspace-grid">
          <EntityField label="Status" value={call.status} />
          <EntityField label="Trip date" value={call.trip_date || null} />
          <EntityField label="Taken on" value={call.date_of_call || null} />
          <EntityField label="Dispatcher" value={call.dispatcher_name || null} />
          {call.confirmed_by_name && (
            <EntityField label="Confirmation by" value={`${call.confirmed_by_name} · ${call.confirmed_at}`} />
          )}
          {cancelled && <EntityField label="Cancellation reason" value={call.cancel_reason || null} />}
        </div>
      </PageSection>

      <PageSection title="Trip details" description="Correct anything the patient changes on the phone.">
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label fw-semibold" htmlFor="pickup_time">Pickup time</label>
            <input id="pickup_time" type="time" className="form-control" value={form.pickup_time || ""}
              onChange={(e) => setForm((f) => ({ ...f, pickup_time: e.target.value }))} disabled={busy} />
          </div>
          <div className="col-md-4">
            <label className="form-label fw-semibold" htmlFor="caller_phone">Phone</label>
            <input id="caller_phone" type="text" className="form-control" value={form.caller_phone || ""}
              onChange={(e) => setForm((f) => ({ ...f, caller_phone: e.target.value }))} disabled={busy} />
          </div>
          <div className="col-12">
            <label className="form-label fw-semibold" htmlFor="pickup_address">Pickup address</label>
            <input id="pickup_address" type="text" className="form-control" value={form.pickup_address || ""}
              onChange={(e) => setForm((f) => ({ ...f, pickup_address: e.target.value }))} disabled={busy} />
          </div>
          <div className="col-12">
            <label className="form-label fw-semibold" htmlFor="dropoff_address">Dropoff address</label>
            <input id="dropoff_address" type="text" className="form-control" value={form.dropoff_address || ""}
              onChange={(e) => setForm((f) => ({ ...f, dropoff_address: e.target.value }))} disabled={busy} />
          </div>
          <div className="col-12">
            <label className="form-label fw-semibold" htmlFor="notes">Notes</label>
            <textarea id="notes" rows={2} className="form-control" value={form.notes || ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} disabled={busy} />
          </div>
        </div>

        <button type="button" className="btn btn-primary btn-sm mt-3 d-inline-flex align-items-center gap-2"
          onClick={save} disabled={busy || !dirty}>
          <FaSave /> Save changes
        </button>
      </PageSection>

      <PageSection
        title="Confirmation call"
        description="Record how the day-before call went. Declining cancels the trip."
      >
        <label className="form-label fw-semibold" htmlFor="confirmation_note">Note</label>
        <input id="confirmation_note" type="text" className="form-control mb-3"
          placeholder="What the patient said"
          value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />

        <div className="d-flex gap-2 flex-wrap">
          {CONFIRMATION_STATUSES.map((status) => {
            const meta = CONFIRMATION_STATUS_META[status];
            const active = call.confirmation_status === status;
            const danger = status === "declined";
            return (
              <button
                key={status}
                type="button"
                className={`btn btn-sm d-inline-flex align-items-center gap-2 ${
                  active ? (danger ? "btn-danger" : "btn-primary")
                    : (danger ? "btn-outline-danger" : "btn-outline-secondary")}`}
                onClick={() => record(status)}
                disabled={busy || active}
              >
                <FaPhoneAlt /> {meta.label}
              </button>
            );
          })}
        </div>
      </PageSection>
    </div>
  );
}
