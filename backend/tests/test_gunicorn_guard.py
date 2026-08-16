"""The fail-closed realtime guard in gunicorn.conf.py.

It must refuse exactly one configuration — multiple workers in production without a
Redis broker — because the in-memory event bus is process-local and SSE realtime
would silently lose events across workers. Every other combination boots.
"""

import importlib.util
import os

_SPEC = importlib.util.spec_from_file_location(
    "gunicorn_conf",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gunicorn.conf.py"),
)
gconf = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(gconf)


def test_multi_worker_production_without_redis_is_refused():
    err = gconf._guard(3, {"EMS_ENV": "production"})
    assert err and "EMS_REDIS_URL" in err


def test_multi_worker_production_with_redis_is_allowed():
    assert gconf._guard(3, {"EMS_ENV": "production",
                            "EMS_REDIS_URL": "redis://redis:6379/0"}) is None


def test_single_worker_production_without_redis_is_allowed():
    assert gconf._guard(1, {"EMS_ENV": "production"}) is None


def test_multi_worker_outside_production_is_allowed():
    # Dev / CI may run multiple workers without Redis — realtime isn't a promise there.
    assert gconf._guard(3, {}) is None
    assert gconf._guard(3, {"EMS_ENV": "development"}) is None


def test_on_starting_raises_on_the_unsafe_combo(monkeypatch):
    monkeypatch.setenv("EMS_ENV", "production")
    monkeypatch.delenv("EMS_REDIS_URL", raising=False)

    class _Cfg:
        workers = 3

    class _Server:
        cfg = _Cfg()

    import pytest
    with pytest.raises(RuntimeError, match="EMS_REDIS_URL"):
        gconf.on_starting(_Server())
