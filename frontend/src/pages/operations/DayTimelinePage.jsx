import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { FaArrowLeft, FaExternalLinkAlt } from "react-icons/fa";

import { PageHeader, PageSection } from "../../components/ui/Page";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States";
import StatusBadge from "../../components/ui/StatusBadge";
import { getDayTimeline } from "../../api/operationsApi";
import { buildDispatchLink } from "../../utils/calendarLinks";

// The operational day as an agenda: every trip top to bottom by planned pickup,
// with its actual lifecycle milestones beside the plan and how late the pickup
// ran. The read side of the timestamps the Dispatch Board records — a past day
// only shows on a board that displays today, so this is where you review it.

const MILESTONES = [
  ["dispatched", "Dispatched"],
  ["arrivedPickup", "At pickup"],
  ["loaded", "Loaded"],
  ["arrivedDest", "At dest."],
  ["completed", "Completed"],
];

function VarianceChip({ minutes }) {
  if (minutes === null || minutes === undefined) {
    return <span className="badge text-bg-light text-dark">No pickup recorded</span>;
  }
  if (minutes <= 5 && minutes >= -5) {
    return <span className="badge text-bg-success">On time</span>;
  }
  const late = minutes > 0;
  return (
    <span className={`badge ${late ? "text-bg-danger" : "text-bg-info"}`}>
      {late ? `+${minutes}` : minutes} min {late ? "late" : "early"}
    </span>
  );
}

function TripRow({ trip }) {
  const p = trip.planned;
  return (
    <div className="card shadow-sm mb-2">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <span className="fs-5 fw-semibold">{p.pickup || "—"}</span>
            {p.end && <span className="text-secondary"> → {p.end}{p.endNextDay ? " (+1d)" : ""}</span>}
            <span className="ms-2">
              <Link to={`/calls/${trip.callId}`}>
                {trip.patientName || `Call #${trip.callId}`}
              </Link>
            </span>
            {trip.serviceLevel && <span className="badge text-bg-secondary ms-2">{trip.serviceLevel}</span>}
            <span className="badge text-bg-light text-dark ms-1 text-capitalize">
              {String(trip.status).replace(/_/g, " ")}
            </span>
          </div>
          <VarianceChip minutes={trip.pickupVarianceMinutes} />
        </div>

        <div className="d-flex flex-wrap gap-3 mt-2">
          {MILESTONES.map(([key, label]) => (
            <div key={key} className="small">
              <span className="text-secondary">{label}: </span>
              <span className={trip.actual[key] ? "" : "text-secondary"}>
                {trip.actual[key] || "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DayTimelinePage() {
  const { date } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    setData(null);
    getDayTimeline(date)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load the day timeline"));
  }, [date]);

  useEffect(load, [load]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Day timeline"
        description={`Planned vs actual for ${date}`}
        actions={(
          <div className="d-flex gap-2">
            <Link to="/calendar" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2">
              <FaArrowLeft /> Calendar
            </Link>
            <Link
              to={buildDispatchLink(date)}
              className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-2"
            >
              Open on the board <FaExternalLinkAlt />
            </Link>
          </div>
        )}
      />

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && data === null && <LoadingSkeleton rows={4} label="Loading the day" />}

      {data && (
        <>
          <div className="row g-3 mb-2">
            <SummaryTile label="Trips" value={data.summary.trips} />
            <SummaryTile label="With pickup time" value={data.summary.withPickupVariance} />
            <SummaryTile
              label="Late arrivals"
              value={data.summary.lateArrivals}
              tone={data.summary.lateArrivals > 0 ? "text-danger" : ""}
            />
          </div>

          <PageSection title="Trips" description="Ordered by planned pickup; unscheduled trips last.">
            {data.trips.length === 0 ? (
              <EmptyState variant="empty" title="No trips on this day"
                          description="Nothing was scheduled or recorded for this date." />
            ) : (
              data.trips.map((t) => <TripRow key={t.callId} trip={t} />)
            )}
          </PageSection>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone = "" }) {
  return (
    <div className="col-4 col-md-3">
      <div className="card shadow-sm h-100">
        <div className="card-body text-center py-3">
          <div className={`fs-3 fw-semibold ${tone}`}>{value}</div>
          <div className="text-muted small text-uppercase">{label}</div>
        </div>
      </div>
    </div>
  );
}
