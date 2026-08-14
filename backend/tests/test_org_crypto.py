"""Per-organisation data key provisioning + access (envelope encryption bridge)."""

import base64
import os

import pytest

from models import db, Organization
from core.security import org_crypto


def _master():
    return base64.b64encode(os.urandom(32)).decode("ascii")


@pytest.fixture()
def master(monkeypatch):
    monkeypatch.setenv("EMS_MASTER_KEY", _master())
    org_crypto.clear_cache()
    yield
    org_crypto.clear_cache()


def _org(name="Org", slug="org"):
    o = Organization(name=name, slug=slug)
    db.session.add(o)
    db.session.commit()
    return o


def test_provision_stores_a_wrapped_dek_and_get_returns_it(app, master):
    o = _org()
    dek = org_crypto.provision_org_dek(o)
    assert o.data_key_wrapped and o.data_key_version == 1
    # The DB holds the WRAPPED key, never the raw DEK.
    assert base64.urlsafe_b64decode(o.data_key_wrapped) != dek
    assert org_crypto.get_org_dek(o) == dek


def test_each_org_gets_a_distinct_key(app, master):
    a, b = _org("A", "a"), _org("B", "b")
    assert org_crypto.provision_org_dek(a) != org_crypto.provision_org_dek(b)


def test_reads_do_not_provision_but_writes_do(app, master):
    o = _org()
    assert org_crypto.get_org_dek(o, provision=False) is None
    assert o.data_key_wrapped is None
    assert org_crypto.get_org_dek(o, provision=True) is not None
    assert o.data_key_wrapped is not None


def test_without_a_master_key_encryption_is_off(app, monkeypatch):
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    org_crypto.clear_cache()
    o = _org()
    assert org_crypto.get_org_dek(o, provision=True) is None
    assert o.data_key_wrapped is None  # never provisioned in plaintext mode


def test_cache_returns_the_same_key_and_clearing_reunwraps_equal(app, master):
    o = _org()
    dek = org_crypto.provision_org_dek(o)
    assert org_crypto.get_org_dek(o) == dek       # from cache
    org_crypto.clear_cache()
    assert org_crypto.get_org_dek(o) == dek       # unwrapped again, equal


def test_provision_all_orgs_backfills_only_missing(app, master):
    _org("A", "a")
    _org("B", "b")
    provisioned = org_crypto.provision_all_orgs()
    assert provisioned == 2
    # Re-running provisions nothing new.
    assert org_crypto.provision_all_orgs() == 0


def test_rewrap_moves_dek_to_the_newest_master_version(app, monkeypatch):
    v1, v2 = _master(), _master()
    monkeypatch.setenv("EMS_MASTER_KEY", f"v1:{v1}")
    org_crypto.clear_cache()
    o = _org()
    dek = org_crypto.provision_org_dek(o)
    db.session.commit()
    assert o.data_key_version == 1

    # Add v2, then re-wrap: the version advances, the DEK (and any field ciphertext)
    # is unchanged, and the wrapped blob differs.
    monkeypatch.setenv("EMS_MASTER_KEY", f"v1:{v1},v2:{v2}")
    org_crypto.clear_cache()
    old_wrapped = o.data_key_wrapped
    assert org_crypto.rewrap_all_orgs() == 1
    assert o.data_key_version == 2
    assert o.data_key_wrapped != old_wrapped
    org_crypto.clear_cache()
    assert org_crypto.get_org_dek(o) == dek

    # Re-running is a no-op now that everything is on the newest version.
    assert org_crypto.rewrap_all_orgs() == 0

    # And v1 can now be retired without losing access.
    monkeypatch.setenv("EMS_MASTER_KEY", f"v2:{v2}")
    org_crypto.clear_cache()
    assert org_crypto.get_org_dek(o) == dek
