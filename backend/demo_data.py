"""A coherent demo dataset for screenshots and walkthroughs.

Everything is dated relative to today so the calendar, dispatch board and reports
always look current. Deliberately small and hand-written rather than random: the
point is a screenshot that reads well — recognisable names, a believable mix of
trip outcomes, a couple of expiring certifications, one recurring staff meeting —
not volume. Local/demo only; never seed this into production.

`build_demo_dataset` is guarded by `has_demo_data`, so re-running is a no-op
rather than a duplicate, and it never touches a database that already has records.
"""

from datetime import datetime, timedelta

from werkzeug.security import generate_password_hash

from models import (
    db, User, Employee, Patient, Vehicle, DailyCrewUnit, Call, CallAssignment,
    Task, CalendarEvent, TimeEntry, EmployeeDocument,
)


def has_demo_data():
    """True if operational demo rows already exist (so we don't double-seed)."""
    return db.session.query(Patient.id).first() is not None \
        or db.session.query(Employee.id).first() is not None


def _iso(d, hm, offset_min=0):
    """A naive-local ISO timestamp from a date, HH:MM and a minute offset."""
    base = datetime.strptime(f"{d} {hm}", "%Y-%m-%d %H:%M") + timedelta(minutes=offset_min)
    return base.isoformat(timespec="seconds")


def build_demo_dataset(today=None):
    """Create the demo dataset. Returns a short summary dict of what was made."""
    today = today or datetime.now().date()
    d = lambda days: (today + timedelta(days=days)).isoformat()  # noqa: E731
    now = datetime.now().isoformat(timespec="seconds")

    # ── Staff ────────────────────────────────────────────────────────────────
    # role is the legacy mirror; qualification drives crew eligibility. A couple
    # of certifications land inside the warning/critical window on purpose so the
    # Compliance board shows colour.
    employees_spec = [
        # first, last, qual, role, dob, hire, cpr_exp, evoc_exp, emt_exp, para_exp
        ("James", "Carter", "paramedic", "Paramedic", "1988-04-12", "2019-03-01",
         d(210), d(180), None, d(120)),
        ("Maria", "Lopez", "emt", "EMT", "1992-09-30", "2021-06-15",
         d(90), d(40), d(75), None),
        ("David", "Kim", "emt", "EMT", "1990-01-22", "2020-11-02",
         d(25), d(200), d(150), None),          # CPR expiring (critical)
        ("Sarah", "Collins", "paramedic", "Paramedic", "1985-07-08", "2017-08-20",
         d(160), d(160), None, d(300)),
        ("Robert", "Hayes", "driver_only", "Driver", "1979-12-03", "2018-02-11",
         d(140), d(15), None, None),             # EVOC expiring (critical)
        ("Emily", "Nguyen", "emt", "EMT", "1996-06-18", "2022-09-05",
         d(310), d(120), d(260), None),
        ("Michael", "Brown", "paramedic", "Paramedic", "1983-03-27", "2016-05-30",
         d(200), d(220), None, d(-10)),          # Paramedic cert expired
        ("Jessica", "Taylor", "emt", "EMT", "1994-11-14", "2020-04-19",
         d(70), d(85), d(55), None),
    ]
    employees = []
    for i, (fn, ln, qual, role, dob, hire, cpr, evoc, emt, para) in enumerate(employees_spec, start=1):
        e = Employee(
            first_name=fn, last_name=ln, qualification=qual, role=role,
            employee_number=f"E{100 + i}", dob=dob, hire_date=hire,
            phone=f"555-01{i:02d}", email=f"{fn.lower()}.{ln.lower()}@example-ems.org",
            status="active", is_active=True,
            cpr_has_license=cpr is not None, cpr_expiration_date=cpr,
            evoc_has_license=evoc is not None, evoc_expiration_date=evoc,
            emt_has_license=emt is not None, emt_expiration_date=emt,
            paramedic_has_license=para is not None, paramedic_expiration_date=para,
        )
        db.session.add(e)
        employees.append(e)
    db.session.flush()

    # ── Patients ─────────────────────────────────────────────────────────────
    patients_spec = [
        ("Eleanor", "Whitfield", "1940-05-21", "BLS", "1420 Oak Meadow Dr", "Springfield", "IL", "62704"),
        ("George", "Alvarez", "1952-11-02", "ALS", "88 Riverside Ave", "Springfield", "IL", "62702"),
        ("Dorothy", "Chen", "1948-02-14", "BLS", "305 Linden St", "Chatham", "IL", "62629"),
        ("Frank", "Delgado", "1935-08-30", "ALS", "77 Hilltop Rd", "Springfield", "IL", "62703"),
        ("Margaret", "OBrien", "1957-06-09", "BLS", "2210 Prairie Ln", "Rochester", "IL", "62563"),
        ("Harold", "Nguyen", "1944-12-17", "BLS", "640 Cedar Ct", "Springfield", "IL", "62711"),
    ]
    patients = []
    for i, (fn, ln, dob, sl, addr, city, st, zc) in enumerate(patients_spec, start=1):
        p = Patient(
            first_name=fn, last_name=ln, dob=dob, default_service_level=sl,
            phone=f"555-02{i:02d}", address=addr, city=city, state=st, zip_code=zc,
            facility_name="Springfield Memorial" if i % 2 else "St. John's Rehab",
        )
        db.session.add(p)
        patients.append(p)
    db.session.flush()

    # ── Fleet ────────────────────────────────────────────────────────────────
    vehicles_spec = [
        ("Medic-1", "214", "ALS", d(45), d(120), d(15)),   # insurance expiring soon
        ("Medic-2", "216", "ALS", d(200), d(90), d(240)),
        ("Ambu-3", "231", "BLS", d(20), d(310), d(60)),    # inspection expiring soon
        ("Ambu-4", "233", "BLS", d(150), d(150), d(150)),
    ]
    vehicles = []
    for name, num, vtype, insp, reg, ins in vehicles_spec:
        v = Vehicle(
            unit_name=name, unit_number=num, unit_type=vtype, is_active=True,
            operational_status="in_service",
            make="Ford", model="E-450", model_year=2021, ownership_type="owned",
            inspection_expiry=insp, registration_expiry=reg, insurance_expiry=ins,
            next_maintenance_date=d(30), current_odometer=60000 + int(num) * 37,
        )
        db.session.add(v)
        vehicles.append(v)
    db.session.flush()

    # ── Today's crews ────────────────────────────────────────────────────────
    # Two ALS and one BLS unit on today's board, crewed from the roster.
    crews_spec = [
        (vehicles[0], "214", "ALS", employees[4], employees[0]),   # Hayes drives, Carter medic
        (vehicles[1], "216", "ALS", employees[2], employees[3]),   # Kim drives, Collins medic
        (vehicles[2], "231", "BLS", employees[7], employees[1]),   # Taylor drives, Lopez medic
    ]
    units = []
    for veh, num, utype, driver, medic in crews_spec:
        u = DailyCrewUnit(
            shift_date=today.isoformat(), unit_type=utype, truck_number=num,
            vehicle_id=veh.id, start_time="08:00", end_time="20:00",
            shift_type="day", shift_duration_hours=12, shift_status="active",
            driver_id=driver.id, medical_id=medic.id,
            dispatch_status="available", created_at=now, updated_at=now,
        )
        db.session.add(u)
        units.append(u)
    db.session.flush()

    # ── Calls ────────────────────────────────────────────────────────────────
    dispatchers = ["Dispatcher User", "Admin User"]
    call_count = {"total": 0}

    def add_call(day, hm, patient, sl, status, dispatcher, duration=None,
                 completed=False, confirmation=None, assign_unit=None, trip=True):
        c = Call(
            patient_id=patient.id if patient else None,
            dispatcher_name=dispatcher,
            received_at=_iso(day, hm, -30),
            status=status,
            date_of_call=day, trip_date=day if trip else None,
            pickup_time=hm, appointment_time=None,
            estimated_duration_minutes=duration,
            pickup_address=(patient.address if patient else "1200 Main St"),
            dropoff_address="Springfield Memorial, 800 Medical Center Dr",
            caller_type="Facility", call_type="scheduled", service_level=sl,
            caller_phone="555-0300",
            confirmation_status=confirmation or "not_called",
        )
        if completed:
            c.dispatched_at = _iso(day, hm, -6)
            c.arrived_pickup_at = _iso(day, hm, 4)
            c.patient_loaded_at = _iso(day, hm, 12)
            c.arrived_dest_at = _iso(day, hm, 38)
            c.completed_at = _iso(day, hm, 45)
        db.session.add(c)
        db.session.flush()
        if assign_unit is not None:
            db.session.add(CallAssignment(
                call_id=c.id, unit_id=assign_unit.id, is_active=True,
                assigned_at=now, assigned_by=dispatcher,
            ))
        call_count["total"] += 1
        return c

    # History: the last 7 days, a believable mix of completed and cancelled, with
    # lifecycle times on the completed ones so Reports and the Day Timeline read.
    hist_times = ["08:15", "09:30", "10:45", "13:00", "14:30", "16:15"]
    levels = ["BLS", "ALS", "BLS", "BLS", "ALS", "BLS"]
    for back in range(7, 0, -1):
        day = d(-back)
        for j, hm in enumerate(hist_times):
            patient = patients[(back + j) % len(patients)]
            # ~80% completed, the rest cancelled — a realistic day.
            if (back + j) % 5 == 0:
                add_call(day, hm, patient, levels[j], "cancelled", dispatchers[j % 2],
                         duration=60)
            else:
                add_call(day, hm, patient, levels[j], "completed", dispatchers[j % 2],
                         duration=60, completed=True)

    # Today: a couple already assigned to units, a couple still to assign.
    add_call(today.isoformat(), "09:00", patients[0], "BLS", "assigned", "Dispatcher User",
             duration=45, assign_unit=units[2])
    add_call(today.isoformat(), "10:30", patients[1], "ALS", "assigned", "Dispatcher User",
             duration=90, assign_unit=units[0])
    add_call(today.isoformat(), "12:00", patients[3], "ALS", "new", "Dispatcher User", duration=60)
    add_call(today.isoformat(), "14:00", patients[2], "BLS", "new", "Admin User", duration=45)

    # Tomorrow: scheduled trips that still need a confirmation call (badge), and a
    # couple with no date at all sitting in the scheduling inbox.
    add_call(d(1), "08:30", patients[4], "BLS", "new", "Dispatcher User",
             duration=45, confirmation="not_called")
    add_call(d(1), "11:00", patients[5], "ALS", "new", "Dispatcher User",
             duration=75, confirmation="not_called")
    add_call(d(3), "09:15", patients[0], "BLS", "new", "Admin User", duration=45)
    # Undated → Scheduling Inbox.
    add_call(today.isoformat(), "00:00", patients[2], "BLS", "new", "Dispatcher User", trip=False)
    add_call(today.isoformat(), "00:00", patients[5], "ALS", "new", "Admin User", trip=False)

    # ── An employee self-service login ───────────────────────────────────────
    # James Carter already has a shift and a task, so his portal has something to
    # show. Idempotent: skip if the username is already taken.
    if not User.query.filter_by(username="jcarter").first():
        db.session.add(User(
            username="jcarter", password_hash=generate_password_hash("employee"),
            display_name="James Carter", role="employee", is_active=True,
            employee_id=employees[0].id,
        ))

    # ── Tasks ────────────────────────────────────────────────────────────────
    admin = User.query.filter_by(username="admin").first()
    admin_id = admin.id if admin else None
    tasks_spec = [
        ("Restock Medic-1 narcotics kit", "Supply", "High", "New", d(0), employees[0]),
        ("Submit EVOC recertification paperwork", "Compliance", "High", "In Progress", d(-2), employees[4]),
        ("Follow up on Unit 231 brake inspection", "Fleet", "Normal", "New", d(2), employees[7]),
        ("Review Q3 trip volume report", "Admin", "Normal", "New", d(5), employees[3]),
    ]
    for title, ttype, prio, status, due, assignee in tasks_spec:
        db.session.add(Task(
            title=title, task_type=ttype, priority=prio, status=status, due_date=due,
            assigned_to_employee_id=assignee.id, created_by_user_id=admin_id,
            assigned_by_user_id=admin_id, created_at=now, updated_at=now,
        ))

    # ── Portal phase 2: hours + a document for James Carter ──────────────────
    # A couple of closed shifts and an on-file license so his My Hours and My
    # Documents tabs are populated.
    for offset in (-3, -2, -1):
        day = today + timedelta(days=offset)
        db.session.add(TimeEntry(
            employee_id=employees[0].id,
            clock_in=f"{day.isoformat()}T08:00:00",
            clock_out=f"{day.isoformat()}T20:00:00",
            entry_type="clock", status="approved",
        ))
    db.session.add(EmployeeDocument(
        employee_id=employees[0].id, doc_type="ems_license",
        title="Paramedic License", document_number="PM-44821",
        issuing_body="State EMS Office", expiry_date=d(300),
        uploaded_at=now, updated_at=now,
    ))

    # ── A recurring staff meeting ────────────────────────────────────────────
    if admin_id:
        db.session.add(CalendarEvent(
            title="Weekly operations huddle", event_date=d(0), all_day=True,
            category="meeting", visibility="company", recurrence="weekly",
            owner_user_id=admin_id, owner_name="Admin User", created_at=now, updated_at=now,
        ))

    db.session.commit()

    return {
        "employees": len(employees),
        "patients": len(patients),
        "vehicles": len(vehicles),
        "units_today": len(units),
        "calls": call_count["total"],
        "tasks": len(tasks_spec),
    }
