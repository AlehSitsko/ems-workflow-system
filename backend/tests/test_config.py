"""Secret resolution: `{NAME}_FILE` (a mounted Docker/K8s secret) wins over the
`{NAME}` environment variable."""

import os

from config import _secret


def _clear(monkeypatch, name):
    monkeypatch.delenv(name, raising=False)
    monkeypatch.delenv(f"{name}_FILE", raising=False)


def test_reads_the_env_var_when_no_file(monkeypatch):
    _clear(monkeypatch, "SECRET_KEY")
    monkeypatch.setenv("SECRET_KEY", "from-env")
    assert _secret("SECRET_KEY") == "from-env"


def test_reads_the_file_and_strips_it(monkeypatch, tmp_path):
    _clear(monkeypatch, "SECRET_KEY")
    f = tmp_path / "secret"
    f.write_text("  from-file\n")
    monkeypatch.setenv("SECRET_KEY_FILE", str(f))
    assert _secret("SECRET_KEY") == "from-file"


def test_file_takes_precedence_over_env(monkeypatch, tmp_path):
    _clear(monkeypatch, "SECRET_KEY")
    f = tmp_path / "secret"
    f.write_text("from-file")
    monkeypatch.setenv("SECRET_KEY", "from-env")
    monkeypatch.setenv("SECRET_KEY_FILE", str(f))
    assert _secret("SECRET_KEY") == "from-file"


def test_missing_or_empty_file_falls_back_to_env(monkeypatch, tmp_path):
    _clear(monkeypatch, "SECRET_KEY")
    empty = tmp_path / "empty"
    empty.write_text("   \n")
    monkeypatch.setenv("SECRET_KEY", "from-env")
    monkeypatch.setenv("SECRET_KEY_FILE", str(tmp_path / "does-not-exist"))
    assert _secret("SECRET_KEY") == "from-env"          # unreadable file → env
    monkeypatch.setenv("SECRET_KEY_FILE", str(empty))
    assert _secret("SECRET_KEY") == "from-env"          # blank file → env


def test_none_when_neither_is_set(monkeypatch):
    _clear(monkeypatch, "NOPE")
    assert _secret("NOPE") is None
