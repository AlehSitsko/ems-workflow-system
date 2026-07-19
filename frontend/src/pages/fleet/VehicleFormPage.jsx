import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { FaChevronLeft } from "react-icons/fa";

import { createVehicle, getVehicle, updateVehicle } from "../../api/vehiclesApi";
import { hasFleetEditAccess } from "../../api/authApi";
import { VEHICLE_CAPABILITIES, OPERATIONAL_STATUSES, describeOperationalStatus } from "../../utils/taxonomy";
import { PageHeader, PageSection } from "../../components/ui/Page";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { useToast } from "../../components/ui/useToast";
import { useUnsavedGuard } from "../../hooks/useUnsavedGuard";

const EMPTY = {
  unitName: "", unitNumber: "", unitType: "BLS", capabilities: ["BLS"],
  vin: "", licensePlate: "", plateState: "", modelYear: "", make: "", model: "",
  color: "", ownershipType: "", operationalStatus: "in_service", outOfServiceReason: "",
  inspectionExpiry: "", registrationExpiry: "", insuranceExpiry: "", nextMaintenanceDate: "",
  notes: "",
};

/**
 * Create / edit a vehicle.
 *
 * A full page rather than a drawer: this has identity, capabilities, compliance
 * and maintenance sections, which is past the point where a drawer stays usable
 * (see docs/UI_STANDARD.md).
 *
 * Validation errors come from the API — the frontend does not invent its own
 * copy of the rules and then disagree with the server.
 */
export default function VehicleFormPage({ currentUser }) {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const isEdit = vehicleId !== "new";
  const canEdit = hasFleetEditAccess(currentUser);

  const [form, setForm] = useState(EMPTY);
  const [baseline, setBaseline] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const listSearch = location.state?.listSearch || "";
  const backHref = `/fleet/vehicles${listSearch}`;

  useEffect(() => {
    if (!isEdit || !canEdit) { setLoading(false); return undefined; }
    let cancelled = false;
    getVehicle(vehicleId)
      .then((v) => {
        if (cancelled) return;
        const loaded = {
          ...EMPTY,
          ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, v[k] ?? EMPTY[k]])),
          capabilities: v.capabilities?.length ? v.capabilities : [v.unitType],
          modelYear: v.modelYear ?? "",
        };
        setForm(loaded);
        setBaseline(loaded);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) setNotFound(true);
        else setError(err.message || "Failed to load vehicle");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [vehicleId, isEdit, canEdit]);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline),
    [form, baseline],
  );

  // Leaving with unsaved edits should be a decision, not an accident. The guard
  // covers in-app navigation (sidebar, palette, back); beforeunload covers a
  // browser close/refresh, which the router blocker can't intercept.
  const { allowNext } = useUnsavedGuard(dirty);
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const toggleCapability = (cap) => {
    setForm((prev) => {
      const has = prev.capabilities.includes(cap);
      const next = has ? prev.capabilities.filter((c) => c !== cap) : [...prev.capabilities, cap];
      // A vehicle with no capability could never be assigned to any unit.
      return { ...prev, capabilities: next.length ? next : prev.capabilities };
    });
  };

  // Plain navigation — the unsaved-changes prompt is handled once by
  // useUnsavedGuard, so the back/Cancel controls don't confirm again.
  const leave = () => navigate(backHref);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      modelYear: form.modelYear === "" ? null : Number(form.modelYear),
    };
    try {
      const saved = isEdit
        ? await updateVehicle(vehicleId, payload)
        : await createVehicle(payload);
      toast.success(isEdit ? "Vehicle updated" : "Vehicle added");
      setBaseline(form);   // clean, so leaving does not prompt
      allowNext();         // don't guard the post-save redirect
      navigate(`/fleet/vehicles/${saved.id}`, { state: { listSearch } });
    } catch (err) {
      // Surface the API's own message (duplicate unit number, invalid
      // capability, ...) rather than a generic failure.
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <EmptyState
        variant="forbidden"
        title="Not available"
        description="Changing the fleet requires a supervisor or administrator."
      />
    );
  }
  if (loading) return <p className="text-muted">Loading…</p>;
  if (notFound) {
    return <EmptyState variant="empty" title="Vehicle not found" description="It may have been removed." />;
  }

  return (
    <form onSubmit={submit}>
      <button type="button" className="workspace-back" onClick={leave}>
        <FaChevronLeft aria-hidden="true" /> Vehicles
      </button>

      <PageHeader
        title={isEdit ? `Edit ${baseline.unitName || "vehicle"}` : "Add vehicle"}
        description={isEdit
          ? "Update the physical vehicle record."
          : "Register a physical vehicle. Daily crew units are planned separately on the Crew Planner."}
        actions={(
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={leave} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || (isEdit && !dirty)}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add vehicle"}
            </button>
          </>
        )}
      />

      {error && <div className="mb-3"><ErrorState title="Could not save" message={error} /></div>}

      <PageSection title="Identity">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label" htmlFor="v-name">Unit name *</label>
            <input id="v-name" className="form-control" required value={form.unitName}
                   onChange={(e) => set({ unitName: e.target.value })} />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="v-number">Unit number *</label>
            <input id="v-number" className="form-control" required value={form.unitNumber}
                   onChange={(e) => set({ unitNumber: e.target.value })} />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="v-vin">VIN</label>
            <input id="v-vin" className="form-control" value={form.vin}
                   onChange={(e) => set({ vin: e.target.value })} />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="v-plate">License plate</label>
            <input id="v-plate" className="form-control" value={form.licensePlate}
                   onChange={(e) => set({ licensePlate: e.target.value })} />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="v-plate-state">Plate state</label>
            <input id="v-plate-state" className="form-control" value={form.plateState}
                   onChange={(e) => set({ plateState: e.target.value })} />
          </div>
          <div className="col-md-3">
            <label className="form-label" htmlFor="v-year">Year</label>
            <input id="v-year" type="number" className="form-control" value={form.modelYear}
                   min="1900" max="2100"
                   onChange={(e) => set({ modelYear: e.target.value })} />
          </div>
          <div className="col-md-3">
            <label className="form-label" htmlFor="v-make">Make</label>
            <input id="v-make" className="form-control" value={form.make}
                   onChange={(e) => set({ make: e.target.value })} />
          </div>
          <div className="col-md-3">
            <label className="form-label" htmlFor="v-model">Model</label>
            <input id="v-model" className="form-control" value={form.model}
                   onChange={(e) => set({ model: e.target.value })} />
          </div>
          <div className="col-md-3">
            <label className="form-label" htmlFor="v-color">Color</label>
            <input id="v-color" className="form-control" value={form.color}
                   onChange={(e) => set({ color: e.target.value })} />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="v-ownership">Ownership</label>
            <input id="v-ownership" className="form-control" value={form.ownershipType}
                   placeholder="Owned, leased…"
                   onChange={(e) => set({ ownershipType: e.target.value })} />
          </div>
        </div>
      </PageSection>

      <PageSection
        title="Capabilities"
        description="What this vehicle can be deployed as. A daily unit type is checked against these."
      >
        <div className="capability-picker">
          {VEHICLE_CAPABILITIES.map((cap) => (
            <label key={cap} className="capability-option">
              <input
                type="checkbox"
                checked={form.capabilities.includes(cap)}
                onChange={() => toggleCapability(cap)}
              />
              {cap}
            </label>
          ))}
        </div>
        <div className="row g-3 mt-1">
          <div className="col-md-6">
            <label className="form-label" htmlFor="v-primary-type">Primary type *</label>
            <select id="v-primary-type" className="form-select" value={form.unitType}
                    onChange={(e) => set({ unitType: e.target.value })}>
              {VEHICLE_CAPABILITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </PageSection>

      <PageSection title="Operational status">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label" htmlFor="v-status">Status</label>
            <select id="v-status" className="form-select" value={form.operationalStatus}
                    onChange={(e) => set({ operationalStatus: e.target.value })}>
              {OPERATIONAL_STATUSES.map((s) => (
                <option key={s} value={s}>{describeOperationalStatus(s).label}</option>
              ))}
            </select>
          </div>
          {form.operationalStatus === "out_of_service" && (
            <div className="col-md-6">
              <label className="form-label" htmlFor="v-oos">Out-of-service reason</label>
              <input id="v-oos" className="form-control" value={form.outOfServiceReason}
                     onChange={(e) => set({ outOfServiceReason: e.target.value })} />
            </div>
          )}
        </div>
      </PageSection>

      <PageSection title="Compliance & maintenance" description="These dates also appear on the Calendar.">
        <div className="row g-3">
          {[
            ["inspectionExpiry", "Inspection expiry", "v-insp"],
            ["registrationExpiry", "Registration expiry", "v-reg"],
            ["insuranceExpiry", "Insurance expiry", "v-ins"],
            ["nextMaintenanceDate", "Next maintenance", "v-maint"],
          ].map(([field, label, id]) => (
            <div className="col-md-3" key={field}>
              <label className="form-label" htmlFor={id}>{label}</label>
              <input id={id} type="date" className="form-control" value={form[field] || ""}
                     onChange={(e) => set({ [field]: e.target.value })} />
            </div>
          ))}
          <div className="col-12">
            <label className="form-label" htmlFor="v-notes">Notes</label>
            <textarea id="v-notes" className="form-control" rows={2} value={form.notes}
                      onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
      </PageSection>
    </form>
  );
}
