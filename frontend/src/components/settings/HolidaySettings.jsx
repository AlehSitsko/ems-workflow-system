import { useEffect, useState } from "react";
import { FaTrash } from "react-icons/fa";

import { listHolidays, createHoliday, deleteHoliday } from "../../api/holidaysApi";

// HR manages the org's observed holidays. A holiday inside a leave range does not
// spend PTO (the backend excludes it, with weekends, from the business-day count).
export default function HolidaySettings() {
  const [holidays, setHolidays] = useState([]);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => listHolidays().then(setHolidays).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!date || !name.trim()) { setError("A date and a name are required."); return; }
    setError(""); setBusy(true);
    try {
      await createHoliday(date, name.trim());
      setDate(""); setName("");
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    setError(""); setBusy(true);
    try { await deleteHoliday(id); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-body">
        <h5 className="mb-1">Company holidays</h5>
        <p className="text-muted small mb-3">
          A holiday inside a leave range does not cost PTO.
        </p>
        {error && <div className="alert alert-danger py-2">{error}</div>}

        <form onSubmit={add} className="row g-2 align-items-end mb-3">
          <div className="col-auto">
            <label className="form-label small mb-1" htmlFor="hol-date">Date</label>
            <input id="hol-date" type="date" className="form-control form-control-sm"
                   value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} />
          </div>
          <div className="col">
            <label className="form-label small mb-1" htmlFor="hol-name">Name</label>
            <input id="hol-name" className="form-control form-control-sm" value={name}
                   onChange={(e) => setName(e.target.value)} disabled={busy}
                   placeholder="Independence Day" />
          </div>
          <div className="col-auto">
            <button type="submit" className="btn btn-outline-primary btn-sm" disabled={busy}>Add</button>
          </div>
        </form>

        {holidays.length === 0 ? (
          <p className="text-muted small mb-0">No holidays yet.</p>
        ) : (
          <ul className="list-group list-group-flush">
            {holidays.map((h) => (
              <li key={h.id} className="list-group-item d-flex justify-content-between align-items-center px-0 py-1">
                <span><code>{h.date}</code> — {h.name}</span>
                <button type="button" className="btn btn-link btn-sm text-danger p-0"
                        onClick={() => remove(h.id)} disabled={busy} aria-label={`Delete ${h.name}`}>
                  <FaTrash />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
