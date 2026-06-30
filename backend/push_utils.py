import json
import os

from pywebpush import webpush, WebPushException

VAPID_PRIVATE_KEY_PATH = os.path.join(os.path.dirname(__file__), "vapid_private.pem")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_CLAIMS_SUB = os.environ.get("VAPID_CLAIMS_SUB", "mailto:sitskoaleh@gmail.com")


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
