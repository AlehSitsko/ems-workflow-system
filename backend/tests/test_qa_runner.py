"""Meta-tests for the live QA runner (qa_test.py).

These prove the runner's *contract* without needing a live backend:

  * it exits non-zero when a check fails (so CI can gate on it), and
  * it exits zero when checks pass.

A regression here would mean the June-2026 bug is back: the old runner printed
failures but always exited 0, so a broken build looked green.
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # project root (holds qa_test.py)
QA = ROOT / "qa_test.py"


def _run(flag):
    return subprocess.run(
        [sys.executable, str(QA), flag],
        cwd=str(ROOT), capture_output=True, text=True, timeout=60,
    )


def test_runner_exits_nonzero_on_failure():
    result = _run("--selftest-fail")
    assert result.returncode != 0, (
        "qa_test.py must exit non-zero when a check fails; "
        f"got exit {result.returncode}\n{result.stdout}\n{result.stderr}"
    )


def test_runner_exits_zero_when_all_pass():
    result = _run("--selftest-pass")
    assert result.returncode == 0, (
        f"qa_test.py should exit 0 when checks pass; got {result.returncode}\n"
        f"{result.stdout}\n{result.stderr}"
    )
