"""URL validation helpers for scan targets.

Scan targets are fetched server-side, so the input needs basic SSRF protection.
The strict private-network check is controlled by ``SCAN_ALLOW_PRIVATE_TARGETS``
(default ``"true"`` so local demos and tests keep working); production
deployments should set it to ``"false"``.
"""

from __future__ import annotations

import ipaddress
import logging
import os
import socket
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

MAX_URL_LENGTH = 2048
ALLOW_PRIVATE_TARGETS_ENV = "SCAN_ALLOW_PRIVATE_TARGETS"
_ALLOW_PRIVATE_VALUES = {"1", "true", "yes", "on"}
_DENY_PRIVATE_VALUES = {"0", "false", "no", "off"}

_warned_private_targets_allowed = False


def private_targets_allowed() -> bool:
    """Return True when private/loopback scan targets may be fetched."""
    raw_value = os.getenv(ALLOW_PRIVATE_TARGETS_ENV, "").strip().lower()
    if raw_value in _DENY_PRIVATE_VALUES:
        return False
    return True


def _warn_private_targets_allowed_once() -> None:
    global _warned_private_targets_allowed
    if _warned_private_targets_allowed:
        return
    _warned_private_targets_allowed = True
    logger.warning(
        "SCAN_ALLOW_PRIVATE_TARGETS is enabled: private, loopback and link-local "
        "scan targets are allowed. Set it to 'false' in production."
    )


def validate_public_http_url(url: str) -> str:
    """Validate a scan target URL, rejecting malformed or (optionally) private hosts.

    Always rejects non-http(s) URLs, URLs with embedded credentials, URLs longer
    than 2048 characters, and URLs without a host. When
    ``SCAN_ALLOW_PRIVATE_TARGETS`` is ``"false"`` it additionally resolves the
    hostname and rejects private, loopback, link-local, reserved, multicast and
    otherwise non-global IPv4/IPv6 addresses, including resolution failures.
    """
    if not isinstance(url, str) or len(url) > MAX_URL_LENGTH:
        raise ValueError(f"URL must be at most {MAX_URL_LENGTH} characters")

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only http and https URLs are supported")
    if not parsed.netloc or not parsed.hostname:
        raise ValueError("URL must include a valid host")
    if parsed.username or parsed.password:
        raise ValueError("URLs with embedded credentials are not supported")

    if private_targets_allowed():
        _warn_private_targets_allowed_once()
        return url

    _assert_public_host(parsed.hostname)
    return url


def _assert_public_host(host: str) -> None:
    for address in _resolve_host_addresses(host):
        try:
            ip_address = ipaddress.ip_address(address)
        except ValueError as exc:
            raise ValueError("URL host could not be resolved") from exc
        if not ip_address.is_global:
            raise ValueError("URL resolves to a private or reserved network address")


def _resolve_host_addresses(host: str) -> set[str]:
    literal_host = host.strip("[]")
    try:
        ipaddress.ip_address(literal_host)
        return {literal_host}
    except ValueError:
        pass

    try:
        address_info = socket.getaddrinfo(host, None)
    except (OSError, UnicodeError) as exc:
        raise ValueError("URL host could not be resolved") from exc

    addresses = {info[4][0] for info in address_info}
    if not addresses:
        raise ValueError("URL host could not be resolved")
    return addresses
