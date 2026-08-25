"""Organization and user / auth / session models."""

from .base import db


class Organization(db.Model):
    __tablename__ = "organization"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(100), unique=True, nullable=False)  # subdomain identifier
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.String(50))
    settings_json = db.Column(db.Text)  # reserved for future per-org config (timezone, logo, etc.)

    # Envelope encryption: the organisation's data key (DEK), stored WRAPPED by the
    # master key (never plaintext), plus the master-key version used to wrap it.
    # Null until the org is provisioned (encryption is opt-in via EMS_MASTER_KEY).
    data_key_wrapped = db.Column(db.Text)
    data_key_version = db.Column(db.Integer)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "is_active": self.is_active,
            "created_at": self.created_at,
        }


class User(db.Model):
    # Usernames are unique *per organisation*, not globally — the same "admin" can
    # exist in two orgs, each reached by its own subdomain. A platform super-admin
    # is the exception: is_platform_admin with a NULL org, managing orgs from the
    # platform console rather than belonging to any one of them.
    __table_args__ = (
        db.UniqueConstraint("org_id", "username", name="uq_user_org_username"),
    )

    id = db.Column(db.Integer, primary_key=True)

    # Basic authentication information. (Unique per-org via __table_args__ above.)
    username = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    # A cross-org platform operator: creates and manages organisations, belongs to
    # none (org_id is NULL), and is only admitted on the platform host.
    is_platform_admin = db.Column(db.Boolean, nullable=False, default=False)
    # When the password was last set — drives optional rotation (see
    # Config.PASSWORD_MAX_AGE_DAYS). ISO datetime; stamped on every password set.
    password_changed_at = db.Column(db.String(50))

    # Display name is used in the UI and as dispatcher identity.
    display_name = db.Column(db.String(150), nullable=False)

    # Role controls what the user can access.
    # Planned roles: admin, supervisor, dispatcher.
    role = db.Column(db.String(50), nullable=False, default="dispatcher")

    # Allows disabling users without deleting historical data.
    is_active = db.Column(db.Boolean, default=True)

    # An organisation Owner is a distinguished admin responsible for ownership
    # continuity and recovery. Ownership can be transferred to another admin, so
    # losing one Owner never strands the organisation.
    is_owner = db.Column(db.Boolean, nullable=False, default=False)

    # Optional link to an Employee record (for clock-in/out from dashboard).
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=True)

    # Multi-tenancy foundation — nullable until full tenant isolation is enabled.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    # Per-user settings blob: {notifications:{...}, dispatch:{...}, ui:{...}}
    settings_json = db.Column(db.Text)

    def to_dict(self):
        # Never return password_hash to the frontend.
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            "role": self.role,
            "is_active": self.is_active,
            "employee_id": self.employee_id,
            "is_platform_admin": bool(self.is_platform_admin),
        }


class UserSession(db.Model):
    """A server-side record of one signed-in session (one device/browser).

    Flask's cookie is stateless, so on its own a session cannot be revoked before
    it expires. This registry gives each login a random `sid` (stored in the
    cookie); the auth guard checks the sid is still present and not revoked every
    request, so revoking a row signs that one device out on its next call —
    without touching the user's other sessions. A child of User with no org_id; it
    is only ever queried by sid or for the session user's own id."""
    __tablename__ = "user_session"

    id = db.Column(db.Integer, primary_key=True)
    sid = db.Column(db.String(64), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    created_at = db.Column(db.String(50), nullable=False)
    last_seen_at = db.Column(db.String(50))
    user_agent = db.Column(db.String(300))
    revoked = db.Column(db.Boolean, nullable=False, default=False, index=True)

    def to_dict(self, current_sid=None):
        return {
            "id": self.id,
            "createdAt": self.created_at,
            "lastSeenAt": self.last_seen_at or self.created_at,
            "userAgent": self.user_agent or "",
            "current": bool(current_sid and self.sid == current_sid),
        }


class PasswordHistory(db.Model):
    """Past password hashes, so a rotation can refuse reuse of a recent one (see
    Config.PASSWORD_HISTORY_DEPTH). A child of User with no org_id of its own — it
    is only ever queried for the session user's own id, never by a client id."""
    __tablename__ = "password_history"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.String(50), nullable=False)


class UserInvitation(db.Model):
    """An invitation to join an organisation with a fixed role — invite-only
    onboarding for server/cloud mode.

    The organisation and role are fixed at creation, so an invitee can change
    neither via the accept request. The raw token is never stored; only its
    SHA-256 hash is kept, and the invitation is one-time, expiring and revocable.
    """
    __tablename__ = "user_invitation"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), nullable=False)
    display_name = db.Column(db.String(150))
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=True)
    # SHA-256 hex of the raw token; the raw value is shown once and never stored.
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    created_by = db.Column(db.Integer)
    created_at = db.Column(db.String(50), nullable=False)
    expires_at = db.Column(db.String(50), nullable=False)
    accepted_at = db.Column(db.String(50))
    revoked_at = db.Column(db.String(50))

    def status(self, now_iso=None):
        from datetime import datetime, timezone
        if self.revoked_at:
            return "revoked"
        if self.accepted_at:
            return "accepted"
        now = now_iso or datetime.now(timezone.utc).isoformat(timespec="seconds")
        if self.expires_at and now > self.expires_at:
            return "expired"
        return "pending"

    def to_dict(self):
        # Never includes the token or its hash.
        return {
            "id": self.id,
            "email": self.email,
            "role": self.role,
            "displayName": self.display_name,
            "employeeId": self.employee_id,
            "status": self.status(),
            "createdAt": self.created_at,
            "expiresAt": self.expires_at,
            "acceptedAt": self.accepted_at,
            "revokedAt": self.revoked_at,
        }


class OrgRecoveryCode(db.Model):
    """A one-time emergency recovery code for an organisation.

    Codes are an authorisation factor for the emergency owner-recovery process —
    not an encryption key. Only the SHA-256 hash is stored; raw codes are shown
    once at generation. Each code is single-use; regenerating a set invalidates any
    unused prior codes.
    """
    __tablename__ = "org_recovery_code"

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=False)
    code_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    created_at = db.Column(db.String(50), nullable=False)
    created_by = db.Column(db.Integer)
    used_at = db.Column(db.String(50))
    used_note = db.Column(db.String(255))


# The models that carry an `org_id` and are therefore isolated per organisation.
# Named once here so the tenant filter/stamp events (tenant.py) and any future
# tooling share one authoritative list rather than drifting apart. Child/detail
# tables (documents, assignments, task comments, …) are deliberately absent: they
# have no org_id and inherit their tenant through an org-owning parent.
