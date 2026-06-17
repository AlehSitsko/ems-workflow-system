# Normalize nested license data coming from the frontend.
def normalize_license_data(data, license_key):
    license_data = data.get(license_key) or {}

    return {
        "has_license": bool(license_data.get("hasLicense", False)),
        "license_name": license_data.get("licenseName", ""),
        "expiration_date": license_data.get("expirationDate", ""),
    }


# Apply incoming employee form data to an Employee model instance.
def apply_employee_data(employee, data):
    employee.first_name = data.get("firstName", "").strip()
    employee.last_name = data.get("lastName", "").strip()

    employee.phone = data.get("phone", "").strip()
    employee.email = data.get("email", "").strip()

    employee.employee_number = data.get(
        "employeeNumber",
        ""
    ).strip()

    employee.hire_date = data.get(
        "hireDate",
        ""
    ).strip()

    # Operational role.
    employee.role = data.get(
        "role",
        "EMT"
    ).strip()

    # Operational employee status.
    employee.status = data.get(
        "status",
        "active"
    ).strip()

    employee.is_active = bool(
        data.get("isActive", True)
    )

    employee.notes = data.get(
        "notes",
        ""
    ).strip()

    employee.kiosk_pin = (data.get("kioskPin") or "").strip() or None

    # CPR certification.
    cpr = normalize_license_data(data, "cpr")

    employee.cpr_has_license = cpr["has_license"]
    employee.cpr_license_name = cpr["license_name"]
    employee.cpr_expiration_date = cpr["expiration_date"]

    # EVOC certification.
    evoc = normalize_license_data(data, "evoc")

    employee.evoc_has_license = evoc["has_license"]
    employee.evoc_license_name = evoc["license_name"]
    employee.evoc_expiration_date = evoc["expiration_date"]

    # EMT certification.
    emt = normalize_license_data(data, "emt")

    employee.emt_has_license = emt["has_license"]
    employee.emt_license_name = emt["license_name"]
    employee.emt_expiration_date = emt["expiration_date"]

    # Paramedic certification.
    paramedic = normalize_license_data(data, "paramedic")

    employee.paramedic_has_license = paramedic["has_license"]
    employee.paramedic_license_name = paramedic["license_name"]
    employee.paramedic_expiration_date = paramedic["expiration_date"]


# Convert an optional employee ID from the frontend into an integer or None.
def parse_optional_employee_id(value):
    if value:
        return int(value)

    return None