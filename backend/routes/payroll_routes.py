import csv
import io
from datetime import datetime

from flask import Blueprint, jsonify, request, Response

from models import db, PayPeriod, TimeEntry, Employee, EmployeePayConfig

payroll_bp = Blueprint("payroll", __name__, url_prefix="/api/payroll")


# ── helpers ──────────────────────────────────────────────────────────────────

def _parse_dt(s):
    if not s:
        return None
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None


def _iso_week(dt):
    """Return ISO year-week string, e.g. '2026-W24'."""
    iso = dt.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def _entry_duration(entry):
    """Net minutes for a TimeEntry (clock_out - clock_in - break)."""
    if not entry.clock_in or not entry.clock_out:
        return 0
    try:
        ci = datetime.fromisoformat(entry.clock_in)
        co = datetime.fromisoformat(entry.clock_out)
        return max(0, int((co - ci).total_seconds() / 60) - (entry.break_minutes or 0))
    except Exception:
        return 0


def _calc_period_summary(period):
    """
    Query all TimeEntry rows within the period first, then group by employee.
    FLSA weekly OT: overtime calculated per ISO week, summed across weeks.
    """
    # Pull every entry that starts within the period window
    all_entries = TimeEntry.query.filter(
        TimeEntry.clock_in >= period.start_date,
        TimeEntry.clock_in <= period.end_date + "T23:59:59",
    ).all()

    if not all_entries:
        return []

    # Group by employee_id
    by_emp: dict[int, list] = {}
    for e in all_entries:
        by_emp.setdefault(e.employee_id, []).append(e)

    results = []
    for emp_id, entries in sorted(by_emp.items()):
        emp = Employee.query.get(emp_id)
        if not emp:
            continue

        config = EmployeePayConfig.query.filter_by(employee_id=emp_id).first()
        rate = config.hourly_rate if config else 0.0
        ot_rate_mult = config.overtime_rate if config else 1.5
        ot_after_hrs = config.overtime_after if config else 40

        # Group net minutes by ISO week (FLSA)
        week_minutes: dict[str, int] = {}
        for e in entries:
            dt = _parse_dt(e.clock_in)
            if not dt:
                continue
            week = _iso_week(dt)
            net = _entry_duration(e)
            week_minutes[week] = week_minutes.get(week, 0) + net

        ot_threshold_min = ot_after_hrs * 60
        total_regular = 0
        total_ot = 0
        for mins in week_minutes.values():
            total_regular += min(mins, ot_threshold_min)
            total_ot += max(0, mins - ot_threshold_min)

        total_minutes = total_regular + total_ot
        regular_pay = (total_regular / 60) * rate
        ot_pay = (total_ot / 60) * rate * ot_rate_mult
        total_pay = regular_pay + ot_pay

        results.append({
            "employee_id": emp.id,
            "employee_number": emp.employee_number or "",
            "first_name": emp.first_name,
            "last_name": emp.last_name,
            "total_minutes": total_minutes,
            "regular_minutes": total_regular,
            "ot_minutes": total_ot,
            "total_hours": round(total_minutes / 60, 2),
            "regular_hours": round(total_regular / 60, 2),
            "ot_hours": round(total_ot / 60, 2),
            "hourly_rate": rate,
            "ot_rate_multiplier": ot_rate_mult,
            "regular_pay": round(regular_pay, 2),
            "ot_pay": round(ot_pay, 2),
            "total_pay": round(total_pay, 2),
            "pay_type": config.pay_type if config else "hourly",
            "entry_count": len(entries),
            "weeks": list(week_minutes.keys()),
        })

    return results


# ── routes ───────────────────────────────────────────────────────────────────

@payroll_bp.route("/periods", methods=["GET"])
def list_periods():
    periods = PayPeriod.query.order_by(PayPeriod.start_date.desc()).all()
    return jsonify([p.to_dict() for p in periods])


@payroll_bp.route("/periods", methods=["POST"])
def create_period():
    data = request.get_json() or {}
    if not data.get("start_date") or not data.get("end_date"):
        return jsonify({"error": "start_date and end_date are required"}), 400

    period = PayPeriod(
        start_date=data["start_date"],
        end_date=data["end_date"],
        period_type=data.get("period_type", "weekly"),
        status="open",
        notes=data.get("notes", ""),
        created_by=data.get("created_by"),
        created_at=datetime.utcnow().isoformat(),
    )
    db.session.add(period)
    db.session.commit()
    return jsonify(period.to_dict()), 201


@payroll_bp.route("/periods/<int:period_id>", methods=["DELETE"])
def delete_period(period_id):
    period = PayPeriod.query.get_or_404(period_id)
    db.session.delete(period)
    db.session.commit()
    return jsonify({"ok": True})


@payroll_bp.route("/periods/<int:period_id>", methods=["GET"])
def get_period(period_id):
    period = PayPeriod.query.get_or_404(period_id)
    return jsonify(period.to_dict())


@payroll_bp.route("/periods/<int:period_id>", methods=["PATCH"])
def update_period(period_id):
    period = PayPeriod.query.get_or_404(period_id)
    data = request.get_json() or {}
    for field in ("start_date", "end_date", "period_type", "notes"):
        if field in data:
            setattr(period, field, data[field])
    db.session.commit()
    return jsonify(period.to_dict())


@payroll_bp.route("/periods/<int:period_id>/status", methods=["PATCH"])
def update_period_status(period_id):
    period = PayPeriod.query.get_or_404(period_id)
    data = request.get_json() or {}
    new_status = data.get("status")
    allowed = {"open", "review", "approved", "exported"}
    if new_status not in allowed:
        return jsonify({"error": f"status must be one of {sorted(allowed)}"}), 400
    period.status = new_status
    if new_status == "exported":
        period.exported_at = datetime.utcnow().isoformat()
        period.exported_to = data.get("exported_to", "csv")
    db.session.commit()
    return jsonify(period.to_dict())


@payroll_bp.route("/periods/<int:period_id>/summary", methods=["GET"])
def period_summary(period_id):
    period = PayPeriod.query.get_or_404(period_id)
    summary = _calc_period_summary(period)
    return jsonify({"period": period.to_dict(), "employees": summary})


@payroll_bp.route("/export", methods=["GET"])
def export_payroll():
    period_id = request.args.get("period_id", type=int)
    fmt = request.args.get("format", "csv").lower()

    if not period_id:
        return jsonify({"error": "period_id is required"}), 400

    period = PayPeriod.query.get_or_404(period_id)
    rows = _calc_period_summary(period)

    output = io.StringIO()
    writer = csv.writer(output)

    if fmt == "gusto":
        writer.writerow([
            "Employee ID", "First Name", "Last Name",
            "Hours", "Earnings Amount", "Earnings Type",
        ])
        for r in rows:
            if r["regular_hours"] > 0:
                writer.writerow([
                    r["employee_number"] or r["employee_id"],
                    r["first_name"], r["last_name"],
                    r["regular_hours"], r["regular_pay"], "Regular",
                ])
            if r["ot_hours"] > 0:
                writer.writerow([
                    r["employee_number"] or r["employee_id"],
                    r["first_name"], r["last_name"],
                    r["ot_hours"], r["ot_pay"], "Overtime",
                ])
    elif fmt == "adp":
        writer.writerow([
            "Co Code", "Batch ID", "File #", "Reg Hours", "O/T Hours",
            "Reg Earnings", "O/T Earnings",
        ])
        for r in rows:
            writer.writerow([
                "EMS", period.id,
                r["employee_number"] or r["employee_id"],
                r["regular_hours"], r["ot_hours"],
                r["regular_pay"], r["ot_pay"],
            ])
    else:
        writer.writerow([
            "Employee ID", "First Name", "Last Name",
            "Total Hours", "Regular Hours", "OT Hours",
            "Hourly Rate", "OT Multiplier",
            "Regular Pay", "OT Pay", "Total Pay",
            "Pay Type", "Period Start", "Period End",
        ])
        for r in rows:
            writer.writerow([
                r["employee_number"] or r["employee_id"],
                r["first_name"], r["last_name"],
                r["total_hours"], r["regular_hours"], r["ot_hours"],
                r["hourly_rate"], r["ot_rate_multiplier"],
                r["regular_pay"], r["ot_pay"], r["total_pay"],
                r["pay_type"], period.start_date, period.end_date,
            ])

    filename = f"payroll_{period.start_date}_{period.end_date}_{fmt}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
