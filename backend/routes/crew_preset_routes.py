from flask import Blueprint, jsonify, request

from models import db, CrewPreset
from utils.employee_utils import parse_optional_employee_id
from utils.auth_utils import require_role


# Blueprint for reusable crew preset routes.
crew_preset_bp = Blueprint(
    "crew_preset",
    __name__,
    url_prefix="/api/crew-presets"
)

# A crew preset is a saved crew layout for the Crew Planner, so it is scoped to the
# roles that plan crews — the same set as crew_routes. Previously these routes had
# no role gate, so any signed-in role (HR, or an employee portal login) could read
# and edit them.
CREW_ROLES = ("admin", "supervisor", "dispatcher")


# Return all saved crew presets.
@crew_preset_bp.route("", methods=["GET"])
@require_role(*CREW_ROLES)
def get_crew_presets():
    presets = CrewPreset.query.order_by(
        CrewPreset.preset_name.asc(),
        CrewPreset.id.asc()
    ).all()

    return jsonify([preset.to_dict() for preset in presets])


# Create a new crew preset.
@crew_preset_bp.route("", methods=["POST"])
@require_role(*CREW_ROLES)
def create_crew_preset():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    preset_name = data.get("presetName", "").strip()

    if not preset_name:
        return jsonify({"error": "Preset name is required"}), 400

    crew = data.get("crew") or {}

    try:
        driver_id = parse_optional_employee_id(crew.get("driver"))
        medical_id = parse_optional_employee_id(crew.get("medical"))
        assist1_id = parse_optional_employee_id(crew.get("assist1"))
        assist2_id = parse_optional_employee_id(crew.get("assist2"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    preset = CrewPreset(
        preset_name=preset_name,
        unit_type=data.get("unitType", "BLS"),

        driver_id=driver_id,
        medical_id=medical_id,
        assist1_id=assist1_id,
        assist2_id=assist2_id,

        notes=data.get("notes", "").strip(),
    )

    db.session.add(preset)
    db.session.commit()

    return jsonify(preset.to_dict()), 201


# Update an existing crew preset.
@crew_preset_bp.route("/<int:id>", methods=["PUT"])
@require_role(*CREW_ROLES)
def update_crew_preset(id):
    preset = CrewPreset.query.get(id)

    if not preset:
        return jsonify({"error": "Crew preset not found"}), 404

    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    preset_name = data.get("presetName", "").strip()

    if not preset_name:
        return jsonify({"error": "Preset name is required"}), 400

    crew = data.get("crew") or {}

    try:
        driver_id = parse_optional_employee_id(crew.get("driver"))
        medical_id = parse_optional_employee_id(crew.get("medical"))
        assist1_id = parse_optional_employee_id(crew.get("assist1"))
        assist2_id = parse_optional_employee_id(crew.get("assist2"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    preset.preset_name = preset_name
    preset.unit_type = data.get("unitType", "BLS")

    preset.driver_id = driver_id
    preset.medical_id = medical_id
    preset.assist1_id = assist1_id
    preset.assist2_id = assist2_id

    preset.notes = data.get("notes", "").strip()

    db.session.commit()

    return jsonify(preset.to_dict())


# Delete an existing crew preset.
@crew_preset_bp.route("/<int:id>", methods=["DELETE"])
@require_role(*CREW_ROLES)
def delete_crew_preset(id):
    preset = CrewPreset.query.get(id)

    if not preset:
        return jsonify({"error": "Crew preset not found"}), 404

    db.session.delete(preset)
    db.session.commit()

    return jsonify({"message": "Crew preset deleted"})