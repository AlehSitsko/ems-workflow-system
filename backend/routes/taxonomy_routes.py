"""Publishes the canonical operational taxonomy contract.

`utils/taxonomy.py` is authoritative; this endpoint makes the contract
discoverable so the frontend mirror (`frontend/src/utils/taxonomy.js`) can be
verified against it instead of drifting silently. Read-only and non-sensitive —
it is vocabulary, not data — so it carries no role gate.
"""

from flask import Blueprint, jsonify

from utils.taxonomy import as_contract

taxonomy_bp = Blueprint("taxonomy", __name__, url_prefix="/api/taxonomy")


@taxonomy_bp.route("", methods=["GET"])
def get_taxonomy():
    return jsonify(as_contract())
