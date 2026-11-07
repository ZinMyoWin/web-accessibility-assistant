from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import time

from fastapi import HTTPException


def verify_mcp_assertion(token: str) -> dict[str, object]:
    """Accept only short-lived assertions minted by our trusted MCP frontend."""
    secret = os.getenv("MCP_INTERNAL_SECRET", "")
    issuer = os.getenv("MCP_OAUTH_ISSUER", "")
    if len(secret.encode()) < 32 or not issuer:
        raise HTTPException(status_code=503, detail="MCP integration is not configured.")
    try:
        if len(token) > 8192:
            raise ValueError("oversized assertion")
        header, payload, signature = token.split(".")
        if not all(re.fullmatch(r"[A-Za-z0-9_-]+", part) for part in (header, payload, signature)):
            raise ValueError("invalid encoding")
        expected = base64.urlsafe_b64encode(
            hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
        ).decode().rstrip("=")
        if not hmac.compare_digest(signature, expected):
            raise ValueError("invalid signature")

        def decode(part: str):
            return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))

        protected, claims = decode(header), decode(payload)
        if not isinstance(protected, dict) or protected.get("alg") != "HS256" or "crit" in protected:
            raise ValueError("invalid header")
        if not isinstance(claims, dict):
            raise ValueError("invalid claims")
        now = int(time.time())
        issued, expires = claims.get("iat"), claims.get("exp")
        if type(issued) is not int or type(expires) is not int:
            raise ValueError("missing timestamps")
        if not (issued <= now < expires <= issued + 60):
            raise ValueError("invalid lifetime")
        not_before = claims.get("nbf", issued)
        if type(not_before) is not int or not_before > now:
            raise ValueError("assertion not active")
        if (
            claims.get("iss") != "waa-mcp"
            or claims.get("aud") != "waa-mcp-backend"
            or claims.get("typ") != "mcp-delegation"
            or claims.get("scope") != "scans:read"
            or claims.get("oauth_issuer") != issuer
            or not isinstance(claims.get("sub"), str)
            or not 1 <= len(claims["sub"]) <= 512
        ):
            raise ValueError("invalid identity or audience")
        return claims
    except (ValueError, TypeError, KeyError, UnicodeError):
        raise HTTPException(status_code=401, detail="Invalid or expired MCP assertion.") from None


def mcp_identity_key(claims: dict[str, object]) -> str:
    return hashlib.sha256(
        json.dumps([claims["oauth_issuer"], claims["sub"]], separators=(",", ":")).encode()
    ).hexdigest()
