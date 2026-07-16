import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import PatientList from "./PatientList";
import { SERVICE_LEVELS } from "../../utils/taxonomy";

const basePatient = {
  id: 1, first_name: "Alla", last_name: "Alala", dob: "1991-03-01",
  phone: "555-0100", insurance: "", address: "800 Main st",
  default_service_level: "BLS", is_archived: false, is_sensitive: false,
};

function renderList(patients, extra = {}) {
  return render(
    <MemoryRouter>
      <PatientList
        patients={patients}
        paginationMeta={{ total: patients.length, page: 1 }}
        patientCalls={[]}
        selectedPatient={null}
        loading={false}
        loadingMore={false}
        onSelectPatient={() => {}}
        onEditPatient={() => {}}
        onArchivePatient={() => {}}
        onRestorePatient={() => {}}
        onServiceLevelChange={() => {}}
        onLoadMore={() => {}}
        {...extra}
      />
    </MemoryRouter>,
  );
}

const serviceSelect = (patient) =>
  within(screen.getByText(`${patient.first_name} ${patient.last_name}`).closest(".patient-list-card"))
    .getByRole("combobox");

describe("PatientList default-service select", () => {
  it("shows the stored canonical level as selected, not a blank fallback", () => {
    // The regression: options were lowercase (bls/als/…) while stored values are
    // canonical (BLS/ALS/…), so a patient with a service level rendered as
    // "— Not set —". The select must reflect what is actually stored.
    renderList([basePatient]);
    expect(serviceSelect(basePatient).value).toBe("BLS");
  });

  it("offers exactly the canonical service levels", () => {
    renderList([basePatient]);
    const values = [...serviceSelect(basePatient).options].map((o) => o.value).filter(Boolean);
    expect(values).toEqual(SERVICE_LEVELS);
  });

  it("does not offer 'emergency' — it is a call type, not a service level", () => {
    renderList([basePatient]);
    const values = [...serviceSelect(basePatient).options].map((o) => o.value.toLowerCase());
    expect(values).not.toContain("emergency");
  });

  it("keeps an unrecognised legacy value visible rather than blanking it", () => {
    const legacy = { ...basePatient, id: 2, default_service_level: "legacy-xyz" };
    renderList([legacy]);
    expect(serviceSelect(legacy).value).toBe("legacy-xyz");
  });

  it("reports the chosen level back to the caller", () => {
    const onServiceLevelChange = vi.fn();
    renderList([basePatient], { onServiceLevelChange });
    fireEvent.change(serviceSelect(basePatient), { target: { value: "CCT" } });
    expect(onServiceLevelChange).toHaveBeenCalledWith(basePatient, "CCT");
  });
});
