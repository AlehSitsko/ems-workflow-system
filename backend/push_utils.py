import base64
import functools
import json
import os

from pywebpush import webpush, WebPushException

VAPID_PRIVATE_KEY_PATH = os.path.join(os.path.dirname(__file__), "vapid_private.pem")
VAPID_CLAIMS_SUB = os.environ.get("VAPID_CLAIMS_SUB", "mailto:sitskoaleh@gmail.com")


@functools.lru_cache(maxsize=1)
def get_vapid_public_key() -> str:
    """The base64url `applicationServerKey` the browser subscribes with.

    Prefer the `VAPID_PUBLIC_KEY` env var; otherwise derive it from the private PEM,
    so the key the client subscribes with always matches the key the server signs
    with — there is no second value to configure and keep in step (a mismatch is
    exactly what makes a push silently fail). Empty string if no key can be found,
    which the UI reads as "push not configured"."""
    env = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
    if env:
        return env
    try:
        from py_vapid import Vapid02 as _Vapid
    except Exception:  # pragma: no cover - older py_vapid
        try:
            from py_vapid import Vapid as _Vapid
        except Exception:
            return ""
    try:
        from cryptography.hazmat.primitives import serialization
        vapid = _Vapid.from_file(VAPID_PRIVATE_KEY_PATH)
        raw = vapid.public_key.public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    except Exception:
        return ""


def send_push(subscription_json: str, title: str, body: str, tag: str = "ems-notif") -> bool:
    """Send a Web Push notification to a single subscription. Returns True on success."""
    try:
        sub = json.loads(subscription_json)
        payload = json.dumps({"title": title, "body": body, "tag": tag})
        webpush(
            subscription_info=sub,
            data=payload,
            vapid_private_key=VAPID_PRIVATE_KEY_PATH,
            vapid_claims={"sub": VAPID_CLAIMS_SUB},
        )
        return True
    except WebPushException as e:
        # 410 Gone means subscription expired — caller should clean it up.
        if e.response is not None and e.response.status_code == 410:
            raise
        return False
    except Exception:
        return False
