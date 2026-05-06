from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID


PASSWORD_ALGORITHM = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 260_000
JWT_ALGORITHM = "HS256"
JWT_TTL_DAYS = 7


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return (
        f"{PASSWORD_ALGORITHM}${PASSWORD_ITERATIONS}$"
        f"{_b64encode(salt)}${_b64encode(digest)}"
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt, expected_digest = password_hash.split("$", maxsplit=3)
        if algorithm != PASSWORD_ALGORITHM:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            _b64decode(salt),
            int(iterations),
        )
        return hmac.compare_digest(_b64encode(digest), expected_digest)
    except Exception:
        return False


def create_session_token(user_id: UUID) -> tuple[str, str, datetime]:
    expires_at = datetime.now(UTC) + timedelta(days=JWT_TTL_DAYS)
    jti = secrets.token_urlsafe(24)
    payload = {
        "sub": str(user_id),
        "jti": jti,
        "exp": int(expires_at.timestamp()),
        "iat": int(datetime.now(UTC).timestamp()),
        "typ": "access",
    }
    token = _encode_jwt(payload)
    return token, jti, expires_at


def decode_session_token(token: str) -> dict[str, object] | None:
    try:
        header_segment, payload_segment, signature_segment = token.split(".")
        signed_value = f"{header_segment}.{payload_segment}"
        expected_signature = _sign(signed_value)
        if not hmac.compare_digest(expected_signature, signature_segment):
            return None
        payload = json.loads(_b64url_decode(payload_segment).decode("utf-8"))
        expires_at = int(payload.get("exp", 0))
        if expires_at <= int(datetime.now(UTC).timestamp()):
            return None
        if payload.get("typ") != "access":
            return None
        if not payload.get("sub") or not payload.get("jti"):
            return None
        return payload
    except Exception:
        return None


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _encode_jwt(payload: dict[str, object]) -> str:
    header = {"alg": JWT_ALGORITHM, "typ": "JWT"}
    header_segment = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_segment = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signed_value = f"{header_segment}.{payload_segment}"
    return f"{signed_value}.{_sign(signed_value)}"


def _sign(value: str) -> str:
    return _b64url_encode(
        hmac.new(
            _get_jwt_secret().encode("utf-8"),
            value.encode("utf-8"),
            hashlib.sha256,
        ).digest()
    )


def _get_jwt_secret() -> str:
    return os.getenv("AUTH_JWT_SECRET", "accessaudit-local-development-secret")


def _b64encode(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.b64decode(value.encode("ascii"))


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))
