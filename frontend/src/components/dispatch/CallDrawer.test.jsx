import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

import CallDrawer from "./CallDrawer";
import * as callsApi from "../../api/callsApi";
import * as patientsApi from "../../api/patientsApi";

vi.mock("../../api/callsApi");
vi.mock("../../api/patientsApi");
// useConfirm() throws without a ConfirmProvider; the save path never calls it, so a
// stub that always confirms is enough to let the component mount in isolation.
vi.mock("../ui/useConfirm", () => ({ useConfirm: () => vi.fn().mockResolvedValue(true) }));

const CALL = {
  id: 42,
  patient_id: 7,
  patient_name: "Grace Hopper",
  dispatcher_name: "Dispatcher User",
  date_of_call: "2026-07-01",
  trip_date: "2026-08-01",
  pickup_time: "10:00",
  appointment_time: "",
  pickup_address: "1 A St",
  dropoff_address: "2 B St",
  call_type: "scheduled",
  service_level: "BLS",
  caller_phone: "",
  caller_note: "",
  caller_type: "",
  notes: "",
};

function setup(extra = {}) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const { container } = render(
    <CallDrawer open onClose={onClose} onSaved={onSaved} callToEdit={CALL} {...extra} />,
  );
  const form = container.querySelector("#call-drawer-form");
  const dateInputs = () => container.querySelectorAll('input[type="date"]');
  return { onSaved, onClose, container, form, dateInputs };
}

describe("CallDrawer edit contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callsApi.updateCall.mockResolvedValue({ ...CALL });
    callsApi.createCall.mockResolvedValue({ id: 99 });
    patientsApi.getPatients.mockResolvedValue({ items: [] });
    patientsApi.createPatient.mockResolvedValue({ id: 9, first_name: "Alan", last_name: "Turing" });
    patientsApi.findDuplicatePatient.mockResolvedValue(null);
  });

  it("loads current date_of_call and linked patient in edit mode", () => {
    const { dateInputs } = setup();
    // Two date fields with a patient linked: [0]=Trip Date, [1]=Date of Call.
    expect(dateInputs()[0]).toHaveValue("2026-08-01");
    expect(dateInputs()[1]).toHaveValue("2026-07-01");
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });

  it("sends the edited Date of Call in the update payload", async () => {
    const { form, dateInputs } = setup();
    fireEvent.change(dateInputs()[1], { target: { value: "2026-09-15" } });
    fireEvent.submit(form);
    await waitFor(() => expect(callsApi.updateCall).toHaveBeenCalledWith(
      42, expect.objectContaining({ date_of_call: "2026-09-15" }),
    ));
  });

  it("sends the newly selected patient in the update payload", async () => {
    patientsApi.getPatients.mockResolvedValue({
      items: [{ id: 9, first_name: "Alan", last_name: "Turing" }],
    });
    const { form } = setup();
    // Unlink current patient, revealing the search UI.
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    fireEvent.change(screen.getByPlaceholderText("Smith…"), { target: { value: "Turing" } });
    fireEvent.click(screen.getByRole("button", { name: /^search/i }));
    fireEvent.click(await screen.findByText("Alan Turing"));

    fireEvent.submit(form);
    await waitFor(() => expect(callsApi.updateCall).toHaveBeenCalledWith(
      42, expect.objectContaining({ patient_id: 9 }),
    ));
  });

  it("sends patient_id: null when the patient is cleared", async () => {
    const { form } = setup();
    fireEvent.click(screen.getByRole("button", { name: /change/i }));   // clears the link
    fireEvent.submit(form);
    await waitFor(() => expect(callsApi.updateCall).toHaveBeenCalledWith(
      42, expect.objectContaining({ patient_id: null }),
    ));
  });

  it("shows a backend error and does NOT signal success", async () => {
    callsApi.updateCall.mockRejectedValue(new Error("Patient not found"));
    const { form, onSaved } = setup();
    fireEvent.submit(form);
    expect(await screen.findByText("Patient not found")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("does not announce success until the API call resolves", async () => {
    let resolveUpdate;
    callsApi.updateCall.mockReturnValue(new Promise((r) => { resolveUpdate = r; }));
    const { form, onSaved } = setup();
    fireEvent.submit(form);

    // Request in flight: no success yet, button shows the saving state.
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();

    await act(async () => { resolveUpdate({ ...CALL }); });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
