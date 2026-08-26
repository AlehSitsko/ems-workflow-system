"""Regression guard for stress_test.py's database index analyzer.

patient.dob is encrypted at rest and deliberately carries no plaintext index; exact
search / duplicate detection use the blind index patient.dob_bidx, and the birthday
calendar uses the derived patient.dob_month_day. The analyzer must be satisfied by
that architecture and must never demand an index on plaintext patient.dob again.
"""
import os
import sys

from sqlalchemy import create_engine

# stress_test.py lives at the repo root, one directory above backend/.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

import stress_test  # noqa: E402
from models import db  # noqa: E402


def test_index_analysis_passes_on_the_real_schema(tmp_path):
    """Build the real schema into a throwaway SQLite file and run the analyzer.

    A clean result proves the expected critical indexes (including patient.dob_bidx and
    patient.dob_month_day) exist. If the check regressed to expecting plaintext
    patient.dob — which has no index by design — this would report it missing and fail.
    """
    db_file = str(tmp_path / "schema.sqlite")
    engine = create_engine(f"sqlite:///{db_file}")
    db.metadata.create_all(engine)
    engine.dispose()

    missing = stress_test.run_index_analysis(db_file)

    assert missing == [], (
        "stress-test index analyzer reported missing indexes on the real schema: "
        f"{missing}. patient.dob must NOT be expected (it is encrypted); dob_bidx and "
        "dob_month_day are the indexed blind/derived columns."
    )
