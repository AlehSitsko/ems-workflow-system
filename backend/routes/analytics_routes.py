from flask import Blueprint, jsonify, request

from models import Call
from utils.auth_utils import require_role


# Blueprint for supervisor analytics routes.
analytics_bp = Blueprint(
    "analytics",
    __name__,
    url_prefix="/api/analytics"
)


# Split a comma-separated missing fields string into a clean list.
def split_missing_fields(value):
    if not value:
        return []

    return [
        item.strip()
        for item in value.split(",")
        if item.strip()
    ]


# Return dispatcher performance and call quality analytics.
@analytics_bp.route("/dispatchers", methods=["GET"])
@require_role("admin", "supervisor")
def get_dispatcher_analytics():
    limit = min(request.args.get("limit", 2000, type=int) or 2000, 5000)
    # Load only the five columns this aggregation reads, not whole Call rows (which
    # carry wide/encrypted fields — addresses, caller PII — that would be fetched and,
    # for encrypted columns, is wasted work). Stays on Call.query so the tenant
    # read-filter still scopes it to the caller's org.
    calls = (Call.query
             .with_entities(Call.dispatcher_name, Call.quality_score,
                            Call.missing_critical_fields, Call.missing_optional_fields,
                            Call.missing_info_explanation)
             .order_by(Call.id.desc()).limit(limit).all())

    analytics = {}

    for call in calls:
        dispatcher = call.dispatcher_name or "Unknown"

        if dispatcher not in analytics:
            analytics[dispatcher] = {
                "dispatcher_name": dispatcher,
                "total_calls": 0,
                "quality_score_sum": 0,
                "quality_score_count": 0,
                "missing_critical_count": 0,
                "missing_optional_count": 0,
                "calls_with_missing_critical": 0,
                "calls_with_explanation": 0,
            }

        dispatcher_stats = analytics[dispatcher]

        dispatcher_stats["total_calls"] += 1

        if call.quality_score is not None:
            dispatcher_stats["quality_score_sum"] += call.quality_score
            dispatcher_stats["quality_score_count"] += 1

        missing_critical_fields = split_missing_fields(
            call.missing_critical_fields
        )
        missing_optional_fields = split_missing_fields(
            call.missing_optional_fields
        )

        dispatcher_stats["missing_critical_count"] += len(
            missing_critical_fields
        )
        dispatcher_stats["missing_optional_count"] += len(
            missing_optional_fields
        )

        if missing_critical_fields:
            dispatcher_stats["calls_with_missing_critical"] += 1

        if call.missing_info_explanation:
            dispatcher_stats["calls_with_explanation"] += 1

    result = []

    for dispatcher_stats in analytics.values():
        score_count = dispatcher_stats["quality_score_count"]

        if score_count > 0:
            average_quality_score = round(
                dispatcher_stats["quality_score_sum"] / score_count
            )
        else:
            average_quality_score = None

        result.append({
            "dispatcher_name": dispatcher_stats["dispatcher_name"],
            "total_calls": dispatcher_stats["total_calls"],
            "average_quality_score": average_quality_score,
            "missing_critical_count": dispatcher_stats[
                "missing_critical_count"
            ],
            "missing_optional_count": dispatcher_stats[
                "missing_optional_count"
            ],
            "calls_with_missing_critical": dispatcher_stats[
                "calls_with_missing_critical"
            ],
            "calls_with_explanation": dispatcher_stats[
                "calls_with_explanation"
            ],
        })

    result.sort(
        key=lambda item: item["average_quality_score"] or 0,
        reverse=True
    )

    return jsonify(result)