/*
  Displays patient transport order fields.

  Includes:
  - Required first patient field.
  - Optional next-patient list.
  - Add/remove patient controls.

  This component is intentionally presentation-focused.
  All state management remains in CrewPlannerPage.
*/

function PatientOrderSection({
  firstPatient,
  nextPatients,
  onFirstPatientChange,
  onNextPatientChange,
  onAddNextPatientField,
  onRemoveNextPatientField,
  disabled,
}) {
  return (
    <>
      {/* Patient order section header. */}
      <div className="col-12">
        <hr />
        <h5 className="mb-0">Patient Order</h5>
      </div>

      {/* Required first patient field. */}
      <div className="col-12">
        <label htmlFor="firstPatient" className="form-label fw-semibold">
          First Patient
          <span className="badge text-bg-danger ms-2">Required</span>
        </label>

        <input
          id="firstPatient"
          type="text"
          className="form-control"
          value={firstPatient}
          onChange={onFirstPatientChange}
          disabled={disabled}
        />
      </div>

      {/* Optional patient queue. */}
      <div className="col-12">
        <label className="form-label fw-semibold">
          Next Patients
        </label>

        <div className="d-flex flex-column gap-2">
          {nextPatients.map((patient, index) => (
            <div
              key={`next-patient-${index}`}
              className="d-flex gap-2"
            >
              <input
                type="text"
                className="form-control"
                value={patient}
                onChange={(event) =>
                  onNextPatientChange(index, event.target.value)
                }
                disabled={disabled}
              />

              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => onRemoveNextPatientField(index)}
                disabled={disabled}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {/* Adds another patient position to the queue. */}
        <button
          type="button"
          className="btn btn-sm btn-outline-primary mt-3"
          onClick={onAddNextPatientField}
          disabled={disabled}
        >
          Add Next Patient
        </button>
      </div>
    </>
  );
}

export default PatientOrderSection;