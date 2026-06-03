/*
  Displays crew preset controls.

  Includes:
  - Applying an existing preset.
  - Saving the current crew configuration as a new preset.

  This component is presentation-focused.
  Preset loading and save logic remain in CrewPlannerPage.
*/

function CrewPresetsSection({
  crewPresets,
  selectedPresetId,
  presetName,
  presetsLoading,
  unitsLoading,
  onApplyPreset,
  onPresetNameChange,
  onSavePreset,
}) {
  return (
    <div className="col-12">
      <div className="card bg-light border-0">
        <div className="card-body">
          <h6 className="mb-3">Crew Presets</h6>

          <div className="row g-3">
            {/* Existing preset selector. */}
            <div className="col-md-6">
              <label className="form-label fw-semibold">
                Apply Existing Preset
              </label>

              <select
                className="form-select"
                value={selectedPresetId}
                onChange={(event) => onApplyPreset(event.target.value)}
                disabled={presetsLoading || unitsLoading}
              >
                <option value="">Select preset...</option>

                {crewPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.presetName}
                  </option>
                ))}
              </select>
            </div>

            {/* Save current crew as a reusable preset. */}
            <div className="col-md-6">
              <label className="form-label fw-semibold">
                Save Current Crew as Preset
              </label>

              <div className="d-flex gap-2">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Preset name..."
                  value={presetName}
                  onChange={(event) =>
                    onPresetNameChange(event.target.value)
                  }
                  disabled={presetsLoading || unitsLoading}
                />

                <button
                  type="button"
                  className="btn btn-outline-success"
                  onClick={onSavePreset}
                  disabled={presetsLoading || unitsLoading}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CrewPresetsSection;