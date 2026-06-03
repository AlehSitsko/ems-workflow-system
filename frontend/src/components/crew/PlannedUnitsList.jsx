/*
  Displays planned crew units for the selected shift date.

  This component is presentation-focused.
  Crew unit loading, editing, deleting, and employee lookup logic
  remain in CrewPlannerPage.
*/

function PlannedUnitsList({
  selectedDate,
  units,
  unitsLoading,
  onEditUnit,
  onDeleteUnit,
  getEmployeeName,
  isMedicalSlotVisible,
  getMedicalSlotLabel,
}) {
  return (
    <div className="card shadow-sm">
      {/* Card header with planned unit count. */}
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="mb-0">Planned Units for {selectedDate}</h5>

        <span className="badge text-bg-secondary">{units.length}</span>
      </div>

      <div className="card-body">
        {unitsLoading && units.length === 0 ? (
          <p className="text-muted mb-0">Loading planned units...</p>
        ) : units.length === 0 ? (
          <p className="text-muted mb-0">No units created for this date.</p>
        ) : (
          <div className="row g-3">
            {units.map((unit) => (
              <div key={unit.id} className="col-12">
                <div className="card border-light-subtle">
                  <div className="card-body">
                    {/* Unit summary header. */}
                    <div className="d-flex justify-content-between align-items-start mb-3">
                      <div>
                        <h5 className="mb-1">
                          {unit.startTime} — Truck {unit.truckNumber}
                        </h5>

                        <div className="d-flex flex-wrap gap-2">
                          <span className="badge text-bg-primary">
                            {unit.unitType}
                          </span>

                          <span className="badge text-bg-secondary">
                            Date: {unit.shiftDate}
                          </span>

                          <span className="badge text-bg-dark">
                            First: {unit.firstPatient}
                          </span>
                        </div>
                      </div>

                      {/* Unit action buttons. */}
                      <div className="d-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => onEditUnit(unit)}
                          disabled={unitsLoading}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => onDeleteUnit(unit.id)}
                          disabled={unitsLoading}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Saved crew summary. */}
                    <div className="mb-3">
                      <div className="fw-semibold mb-2">Crew</div>

                      <div className="row g-2">
                        <div className="col-md-3">
                          <div className="border rounded p-2">
                            <strong>Driver:</strong>{" "}
                            {getEmployeeName(unit.crew.driver)}
                          </div>
                        </div>

                        {isMedicalSlotVisible(unit.unitType) && (
                          <div className="col-md-3">
                            <div className="border rounded p-2">
                              <strong>
                                {getMedicalSlotLabel(unit.unitType)}:
                              </strong>{" "}
                              {getEmployeeName(unit.crew.medical)}
                            </div>
                          </div>
                        )}

                        <div className="col-md-3">
                          <div className="border rounded p-2">
                            <strong>Assist 1:</strong>{" "}
                            {getEmployeeName(unit.crew.assist1)}
                          </div>
                        </div>

                        <div className="col-md-3">
                          <div className="border rounded p-2">
                            <strong>Assist 2:</strong>{" "}
                            {getEmployeeName(unit.crew.assist2)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Saved patient order summary. */}
                    <div>
                      <div className="fw-semibold mb-2">Patient Order</div>

                      <ol className="mb-0">
                        <li>{unit.firstPatient}</li>

                        {(unit.nextPatients || []).map((patient, index) => (
                          <li key={`saved-patient-${unit.id}-${index}`}>
                            {patient}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PlannedUnitsList;