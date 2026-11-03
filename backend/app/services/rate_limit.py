"""In-process token-bucket rate limiting for authentication and scan endpoints.

The limits are deliberately simple so they add no dependency and no network
hop: one token bucket per identity key (authenticated user id for scans, client
IP for auth) held in a module-level registry.

Environment knobs
-----------------
``RATE_LIMIT_ENABLED`` (default ``"true"``)
    Master switch. When disabled, every ``check_rate_limit`` call allows.
``RATE_LIMIT_SCAN_PER_MINUTE`` (default ``30``)
    Per-authenticated-user limit for ``POST /scan/page``.
``RATE_LIMIT_AUTH_PER_MINUTE`` (default ``10``)
    Per-client-IP limit for ``/auth/signup``, ``/auth/login`` and
    ``/auth/forgot-password``.

IMPORTANT: this limiter is **per process**. With multiple API processes or
containers behind a load balancer each process keeps its own buckets, so the
effective global limit is ``configured limit x number of processes``. A
horizontally scaled deployment must replace this with a shared store (for
example Redis) or enforce the limit at the ingress/gateway.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from typing import Callable

DEFAULT_SCAN_LIMIT_PER_MINUTE = 30
DEFAULT_AUTH_LIMIT_PER_MINUTE = 10
SCAN_SCOPE = "scan"
AUTH_SCOPE = "auth"

_DISABLED_VALUES = frozenset({"0", "false", "no", "off"})
_DEFAULT_LIMITS: dict[str, int] = {
    SCAN_SCOPE: DEFAULT_SCAN_LIMIT_PER_MINUTE,
    AUTH_SCOPE: DEFAULT_AUTH_LIMIT_PER_MINUTE,
}
_ENV_NAMES: dict[str, str] = {
    SCAN_SCOPE: "RATE_LIMIT_SCAN_PER_MINUTE",
    AUTH_SCOPE: "RATE_LIMIT_AUTH_PER_MINUTE",
}
_IDLE_BUCKET_SECONDS = 300.0
_PRUNE_INTERVAL_SECONDS = 60.0
_PRUNE_MIN_BUCKETS = 256


@dataclass
class _Bucket:
    tokens: float
    updated_at: float


class TokenBucketRateLimiter:
    """Thread-safe token bucket keyed by an arbitrary identity string."""

    def __init__(
        self,
        *,
        rate_per_minute: int,
        capacity: float | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if rate_per_minute <= 0:
            raise ValueError("rate_per_minute must be a positive integer")
        self.rate_per_minute = int(rate_per_minute)
        self.capacity = float(capacity if capacity is not None else rate_per_minute)
        self._clock = clock
        self._lock = threading.Lock()
        self._buckets: dict[str, _Bucket] = {}
        self._last_prune_at = self._clock()

    def try_acquire(self, key: str, *, cost: float = 1.0) -> tuple[bool, float]:
        """Consume one token for *key*.

        Returns ``(allowed, retry_after_seconds)``. When the bucket is empty
        ``retry_after_seconds`` is the estimated time until the next token.
        """
        if cost <= 0:
            return True, 0.0
        now = self._clock()
        refill_per_second = self.rate_per_minute / 60.0
        with self._lock:
            self._prune_idle_locked(now)
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _Bucket(tokens=self.capacity, updated_at=now)
                self._buckets[key] = bucket
            elapsed = max(now - bucket.updated_at, 0.0)
            bucket.tokens = min(self.capacity, bucket.tokens + elapsed * refill_per_second)
            bucket.updated_at = now

            if bucket.tokens >= cost:
                bucket.tokens -= cost
                return True, 0.0

            missing = cost - bucket.tokens
            return False, missing / refill_per_second

    def bucket_count(self) -> int:
        """Return the number of tracked identities (introspection for tests)."""
        with self._lock:
            return len(self._buckets)

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()

    def _prune_idle_locked(self, now: float) -> None:
        if (
            len(self._buckets) < _PRUNE_MIN_BUCKETS
            and now - self._last_prune_at < _PRUNE_INTERVAL_SECONDS
        ):
            return
        self._last_prune_at = now
        idle_cutoff = now - _IDLE_BUCKET_SECONDS
        idle_keys = [
            key for key, bucket in self._buckets.items() if bucket.updated_at < idle_cutoff
        ]
        for key in idle_keys:
            del self._buckets[key]


_limiters: dict[str, TokenBucketRateLimiter] = {}
_limiters_lock = threading.Lock()


def is_rate_limit_enabled() -> bool:
    """Return whether rate limiting is enabled (``RATE_LIMIT_ENABLED``)."""
    raw_value = os.getenv("RATE_LIMIT_ENABLED", "").strip().lower()
    return raw_value not in _DISABLED_VALUES


def get_configured_limit(scope: str) -> int:
    """Return the configured per-minute limit for *scope*.

    Unknown scopes use their own ``RATE_LIMIT_<SCOPE>_PER_MINUTE`` variable
    when present and otherwise fall back to 60 requests/minute.
    """
    env_name = _ENV_NAMES.get(scope, f"RATE_LIMIT_{scope.upper()}_PER_MINUTE")
    default = _DEFAULT_LIMITS.get(scope, 60)
    raw_value = os.getenv(env_name, "").strip()
    if not raw_value:
        return default
    try:
        return max(int(raw_value), 1)
    except ValueError:
        return default


def get_limiter(scope: str) -> TokenBucketRateLimiter:
    """Return the process-wide limiter for *scope*.

    If the configured limit changes (for example in tests through monkeypatch)
    the limiter is rebuilt so the new limit takes effect immediately.
    """
    limit = get_configured_limit(scope)
    with _limiters_lock:
        limiter = _limiters.get(scope)
        if limiter is None or limiter.rate_per_minute != limit:
            limiter = TokenBucketRateLimiter(rate_per_minute=limit)
            _limiters[scope] = limiter
        return limiter


def check_rate_limit(*, scope: str, identity: str) -> tuple[bool, float]:
    """Consume one token for *identity* in *scope*.

    Returns ``(allowed, retry_after_seconds)``. Always allows when rate
    limiting is disabled through the environment.
    """
    if not is_rate_limit_enabled():
        return True, 0.0
    return get_limiter(scope).try_acquire(identity)


def reset_rate_limits() -> None:
    """Drop every bucket (used by tests; also useful on reload)."""
    with _limiters_lock:
        _limiters.clear()
