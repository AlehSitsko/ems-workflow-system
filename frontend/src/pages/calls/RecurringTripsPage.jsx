import { useCallback, useEffect, useState } from "react";
import { FaPlus, FaSyncAlt, FaStop, FaSave } from "react-icons/fa";

import { PageHeader, PageSection } from "../../components/ui/Page";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States";
import StatusBadge from "../../components/ui/StatusBadge";
import { useToast } from "../../components/ui/useToast";
import { useConfirm } from "../../components/ui/useConfirm";
import {
  getRecurringTrips, createRecurringTrip, updateRecurringTrip,
  regenerateRecurringTrip, stopRecurringTrip,
} from "../../api/recurringApi";
import { getPatients } from "../../api/patientsApi";
import { SERVICE_LEVELS } from "../../utils/taxonomy";

// Standing transport orders — dialysis every Mon/Wed/Fri and the like.
//
// The template produces ordinary calls a few weeks ahead, so everything else
// (board, calendar, confirmation round) already knows what to do with them. The
// one rule worth stating in the UI: a trip someone has already worked is never
// rewritten by a schedule change unless it is asked for explicitly.

const WEEKDAYS = [
  { value: 0, label: "Mon" }, { value: 1, label: "Tue" }, { value: 2, label: "Wed" },
  { value: 3, label: "Thu" }, { value: 4, label: "Fri" }, { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
];

const EMPTY_FORM = {
  patientId: "", weekdays: [], startDate: "", endDate: "",
  pickupTime: "", returnPickupTime: "", pickupAddress: "", dropoffAddress: "",
  serviceLevel: "BLS", horizonWeeks: 4, notes: "",
};

function describeReport(report) {
  if (!report) return "";
  const parts = [];
  if (report.created) parts.push(`${report.created} created`);
  if (report.updated) parts.push(`${report.updated} updated`);
  if (report.removed) parts.push(`${report.removed} withdrawn`);
  if (report.skipped) parts.push(`${report.skipped} left alone (already worked)`);
  return parts.join(" · ") || "No changes";
}

export default function RecurringTripsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [trips, setTrips] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    return Promise.all([
      getRecurringTrips(),
      getPatients({}, 1, 500).then((d) => d.items || d).catch(() => []),
    ])
      .then(([rows, people]) => {
        setTrips(rows);
        setPatients(Array.isArray(people) ? people : []);
      })
      .catch((err) => setError(err.message || "Failed to load standing orders"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const startNew = () => {
    setEditingId("new");
    setForm({ ...EMPTY_FORM, startDate: new Date().toISOString().slice(0, 10) });
    setFormError("");
  };

  const startEdit = (trip) => {
    setEditingId(trip.id);
    setFormError("");
    setForm({
      patientId: String(trip.patientId),
      weekdays: trip.weekdays,
      startDate: trip.startDate,
      endDate: trip.endDate,
      pickupTime: trip.pickupTime,
      returnPickupTime: trip.returnPickupTime,
      pickupAddress: trip.pickupAddress,
      dropoffAddress: trip.dropoffAddress,
      serviceLevel: trip.serviceLevel || "BLS",
      horizonWeeks: trip.horizonWeeks,
      notes: trip.notes,
    });
  };

  const toggleDay = (day) =>
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(day)
        ? f.weekdays.filter((d) => d !== day)
        : [...f.weekdays, day].sort((a, b) => a - b),
    }));

  const save = async () => {
    setFormError("");
    if (!form.patientId) return setFormError("Choose a patient.");
    if (form.weekdays.length === 0) return setFormError("Pick at least one weekday.");
    if (!form.startDate) return setFormError("A start date is required.");

    const payload = { ...form, patientId: Number(form.patientId) };

    // Editing an existing order: ask what should happen to trips someone has
    // already worked, instead of guessing.
    if (editingId !== "new") {
      const answer = await confirm({
        title: "Apply to trips that were already worked?",
        message: "Confirmed, assigned or hand-edited trips keep their current details " +
                 "unless you choose to re-sync them.",
        confirmLabel: "Re-sync everything",
        cancelLabel: "Only untouched trips",
        variant: "danger",
      });
      payload.applyToTouched = Boolean(answer);
    }

    setBusy(true);
    try {
      const saved = editingId === "new"
        ? await createRecurringTrip(payload)
        : await updateRecurringTrip(editingId, payload);
      toast.success(editingId === "new" ? "Standing order created" : "Standing order updated",
        describeReport(saved.generated));
      setEditingId(null);
      load();
    } catch (err) {
      setFormError(err.message || "Could not save the standing order.");
    } finally {
      setBusy(false);
    }
  };

  const extend = async (trip) => {
    setBusy(true);
    try {
      const result = await regenerateRecurringTrip(trip.id);
      toast.success("Schedule extended", describeReport(result.generated));
      load();
    } catch (err) {
      toast.error("Could not extend the schedule", err.message);
    } finally {
      setBusy(false);
    }
  };

  const stop = async (trip) => {
    const ok = await confirm({
      title: "Stop this standing order?",
      message: "Future trips nobody has worked yet are withdrawn. Trips already " +
               "confirmed or assigned are kept.",
      confirmLabel: "Stop it",
      variant: "danger",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const result = await stopRecurringTrip(trip.id);
      toast.success("Standing order stopped", describeReport(result.withdrawn));
      load();
    } catch (err) {
      toast.error("Could not stop the standing order", err.message);
    } finally {
      setBusy(false);
    }
  };

  const dayLabels = (days) =>
    days.map((d) => WEEKDAYS.find((w) => w.value === d)?.label).filter(Boolean).join(" · ");

  return (
    <div className="page-stack">
      <PageHeader
        title="Recurring trips"
        description="Standing orders that create the day's trips automatically, a few weeks ahead."
        count={trips.length}
      />

      <PageSection>
        {!editingId && (
          <button type="button" className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-2 mb-3"
            onClick={startNew} disabled={busy}>
            <FaPlus /> New standing order
          </button>
        )}

        {editingId && (
          <div className="mb-4">
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label fw-semibold" htmlFor="rtPatient">Patient</label>
                <select id="rtPatient" className="form-select" value={form.patientId}
                  onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
                  disabled={busy || editingId !== "new"}>
                  <option value="">Select a patient…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label fw-semibold" htmlFor="rtLevel">Service level</label>
                <select id="rtLevel" className="form-select" value={form.serviceLevel}
                  onChange={(e) => setForm((f) => ({ ...f, serviceLevel: e.target.value }))} disabled={busy}>
                  {SERVICE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label fw-semibold" htmlFor="rtHorizon">
                  Create ahead <span className="text-secondary fw-normal">(weeks)</span>
                </label>
                <input id="rtHorizon" type="number" min={1} max={12} className="form-control"
                  value={form.horizonWeeks}
                  onChange={(e) => setForm((f) => ({ ...f, horizonWeeks: Number(e.target.value) }))}
                  disabled={busy} />
              </div>

              <div className="col-12">
                <label className="form-label fw-semibold">Days</label>
                <div className="d-flex gap-2 flex-wrap">
                  {WEEKDAYS.map((day) => (
                    <button key={day.value} type="button"
                      className={`btn btn-sm ${form.weekdays.includes(day.value)
                        ? "btn-primary" : "btn-outline-secondary"}`}
                      onClick={() => toggleDay(day.value)} disabled={busy}>
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-md-3">
                <label className="form-label fw-semibold" htmlFor="rtStart">First day</label>
                <input id="rtStart" type="date" className="form-control" value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} disabled={busy} />
              </div>
              <div className="col-md-3">
                <label className="form-label fw-semibold" htmlFor="rtEnd">
                  Last day <span className="text-secondary fw-normal">(open-ended if blank)</span>
                </label>
                <input id="rtEnd" type="date" className="form-control" value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} disabled={busy} />
              </div>
              <div className="col-md-3">
                <label className="form-label fw-semibold" htmlFor="rtPickupTime">Pickup time</label>
                <input id="rtPickupTime" type="time" className="form-control" value={form.pickupTime}
                  onChange={(e) => setForm((f) => ({ ...f, pickupTime: e.target.value }))} disabled={busy} />
              </div>
              <div className="col-md-3">
                <label className="form-label fw-semibold" htmlFor="rtReturnTime">
                  Return pickup <span className="text-secondary fw-normal">(optional)</span>
                </label>
                <input id="rtReturnTime" type="time" className="form-control" value={form.returnPickupTime}
                  onChange={(e) => setForm((f) => ({ ...f, returnPickupTime: e.target.value }))} disabled={busy} />
              </div>

              <div className="col-md-6">
                <label className="form-label fw-semibold" htmlFor="rtPickup">Pickup address</label>
                <input id="rtPickup" type="text" className="form-control" value={form.pickupAddress}
                  onChange={(e) => setForm((f) => ({ ...f, pickupAddress: e.target.value }))} disabled={busy} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold" htmlFor="rtDropoff">Dropoff address</label>
                <input id="rtDropoff" type="text" className="form-control" value={form.dropoffAddress}
                  onChange={(e) => setForm((f) => ({ ...f, dropoffAddress: e.target.value }))} disabled={busy} />
              </div>
            </div>

            {formError && <div className="alert alert-danger py-2 mt-3 mb-0">{formError}</div>}

            <div className="d-flex gap-2 mt-3">
              <button type="button" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
                onClick={save} disabled={busy}>
                <FaSave /> {editingId === "new" ? "Create and schedule" : "Save and re-schedule"}
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm"
                onClick={() => setEditingId(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading && <LoadingSkeleton rows={3} label="Loading standing orders" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && trips.length === 0 && !editingId && (
          <EmptyState variant="empty" title="No standing orders"
            description="Recurring transport, such as dialysis three times a week, will appear here." />
        )}

        {!loading && !error && trips.length > 0 && (
          <div className="entity-list">
            {trips.map((trip) => (
              <div key={trip.id} className="cert-row">
                <div className="cert-row-body">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <strong>{trip.patientName || `Patient #${trip.patientId}`}</strong>
                    <span className="badge text-bg-secondary">{dayLabels(trip.weekdays)}</span>
                    {trip.pickupTime && <span className="badge text-bg-light text-dark">{trip.pickupTime}</span>}
                    {trip.returnPickupTime && (
                      <span className="badge text-bg-light text-dark">return {trip.returnPickupTime}</span>
                    )}
                    <StatusBadge tone={trip.isActive ? "success" : "neutral"}
                      label={trip.isActive ? "Active" : "Stopped"} />
                  </div>
                  <div className="text-secondary small mt-1">
                    {trip.pickupAddress || "—"} → {trip.dropoffAddress || "—"}
                  </div>
                  <div className="text-secondary small">
                    From {trip.startDate}{trip.endDate ? ` to ${trip.endDate}` : " · open-ended"}
                    {` · creating ${trip.horizonWeeks} week(s) ahead`}
                  </div>
                </div>

                <div className="d-flex gap-2 flex-shrink-0">
                  <button type="button" className="btn btn-sm btn-outline-secondary"
                    onClick={() => startEdit(trip)} disabled={busy}>
                    Edit
                  </button>
                  {trip.isActive && (
                    <>
                      <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                        onClick={() => extend(trip)} disabled={busy} title="Create the next weeks of trips">
                        <FaSyncAlt />
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                        onClick={() => stop(trip)} disabled={busy}>
                        <FaStop />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
