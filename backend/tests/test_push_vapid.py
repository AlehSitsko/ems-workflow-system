"""The VAPID public key the browser subscribes with must be derivable from the
private key the server signs with — a mismatch makes every push fail silently.
"""

import base64

from push_utils import get_vapid_public_key, VAPID_PRIVATE_KEY_PATH


def test_public_key_is_derived_from_the_private_pem():
    key = get_vapid_public_key()
    # A P-256 uncompressed point is 65 bytes → 87 base64url chars, leading 0x04 ("B").
    assert key and len(key) == 87 and key.startswith("B")


def test_served_key_matches_the_signing_key():
    from py_vapid import Vapid02
    from cryptography.hazmat.primitives import serialization

    vapid = Vapid02.from_file(VAPID_PRIVATE_KEY_PATH)
    raw = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    signer_key = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    assert get_vapid_public_key() == signer_key


def test_endpoint_serves_the_derived_key(client):
    body = client.get("/api/notifications/vapid-public-key").get_json()
    assert body["publicKey"] == get_vapid_public_key()
    assert body["publicKey"]        # non-empty → the UI reads push as configured
