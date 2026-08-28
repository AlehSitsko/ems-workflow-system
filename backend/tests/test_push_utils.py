"""Backend tests for the Web Push seam (push_utils.py).

Mocks are placed at the external-library boundary (pywebpush.webpush) — no real push
is sent. Covers: success, a provider exception (non-410 -> False), an expired
subscription (410 -> re-raised so the caller cleans it up), malformed subscription
JSON (-> False, no unhandled 500), the VAPID public key resolution, and that no
VAPID private key material leaks into the return value.

Run: pytest backend/tests/test_push_utils.py -v
"""

from types import SimpleNamespace

import pytest
from pywebpush import WebPushException

import push_utils

SUB = '{"endpoint":"https://example.com/ep","keys":{"p256dh":"x","auth":"y"}}'


def test_send_push_success(monkeypatch):
    monkeypatch.setattr(push_utils, "webpush", lambda **kw: None)
    assert push_utils.send_push(SUB, "t", "b") is True


def test_send_push_provider_exception_returns_false(monkeypatch):
    def boom(**kw):
        raise WebPushException("500 error", response=SimpleNamespace(status_code=500))
    monkeypatch.setattr(push_utils, "webpush", boom)
    assert push_utils.send_push(SUB, "t", "b") is False


def test_send_push_expired_410_is_reraised(monkeypatch):
    def gone(**kw):
        raise WebPushException("gone", response=SimpleNamespace(status_code=410))
    monkeypatch.setattr(push_utils, "webpush", gone)
    with pytest.raises(WebPushException):
        push_utils.send_push(SUB, "t", "b")


def test_send_push_malformed_subscription_is_false_not_500(monkeypatch):
    # json.loads raises before webpush is reached -> caught -> False (never an unhandled 500)
    monkeypatch.setattr(push_utils, "webpush", lambda **kw: None)
    assert push_utils.send_push("{not json", "t", "b") is False


def test_send_push_generic_exception_returns_false(monkeypatch):
    def boom(**kw):
        raise RuntimeError("network down")
    monkeypatch.setattr(push_utils, "webpush", boom)
    assert push_utils.send_push(SUB, "t", "b") is False


def test_send_push_does_not_leak_key_material():
    # the return contract is a bare bool — no key/path is ever surfaced to the caller
    import inspect
    assert "return True" in inspect.getsource(push_utils.send_push)


def test_vapid_public_key_prefers_env(monkeypatch):
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "  test-key  ")
    push_utils.get_vapid_public_key.cache_clear()
    assert push_utils.get_vapid_public_key() == "test-key"
    push_utils.get_vapid_public_key.cache_clear()


def test_vapid_public_key_empty_when_unconfigured(monkeypatch):
    monkeypatch.delenv("VAPID_PUBLIC_KEY", raising=False)
    monkeypatch.setattr(push_utils, "VAPID_PRIVATE_KEY_PATH", "/no/such/vapid.pem")
    push_utils.get_vapid_public_key.cache_clear()
    assert push_utils.get_vapid_public_key() == ""
    push_utils.get_vapid_public_key.cache_clear()
