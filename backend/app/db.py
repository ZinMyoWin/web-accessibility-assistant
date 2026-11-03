from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


DEFAULT_DATABASE_URL = (
    "postgresql+psycopg://postgres:postgres@localhost:5432/accessibility_assistant"
)

# Connection-pool defaults. They are deliberately conservative for a single
# FastAPI process plus one or two scan workers; production deployments tune them
# with the environment variables below. SQLite ignores them entirely (the test
# suite and local unit tests use in-memory SQLite).
DEFAULT_POOL_SIZE = 5
DEFAULT_MAX_OVERFLOW = 10
DEFAULT_POOL_TIMEOUT = 30
DEFAULT_POOL_RECYCLE = 1800
DEFAULT_POOL_PRE_PING = True


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    return database_url


def get_engine_options(database_url: str | None = None) -> dict[str, Any]:
    """Return ``create_engine`` pool kwargs for *database_url*.

    SQLite is used by the test suite and by local unit tests, and it does not
    accept the ``QueuePool`` arguments below, so SQLite URLs return an empty
    mapping and keep SQLAlchemy's defaults. Every other backend (PostgreSQL in
    production) is configured from the environment so connection-pool behaviour
    can be tuned without a code change:

    * ``DB_POOL_SIZE`` (default 5)
    * ``DB_MAX_OVERFLOW`` (default 10)
    * ``DB_POOL_TIMEOUT`` (default 30 seconds)
    * ``DB_POOL_RECYCLE`` (default 1800 seconds)
    * ``DB_POOL_PRE_PING`` (default "true")
    """
    url = database_url if database_url is not None else get_database_url()
    if url.startswith("sqlite"):
        return {}
    return {
        "pool_size": _get_env_int("DB_POOL_SIZE", DEFAULT_POOL_SIZE, minimum=1),
        "max_overflow": _get_env_int("DB_MAX_OVERFLOW", DEFAULT_MAX_OVERFLOW, minimum=0),
        "pool_timeout": _get_env_int("DB_POOL_TIMEOUT", DEFAULT_POOL_TIMEOUT, minimum=1),
        "pool_recycle": _get_env_int("DB_POOL_RECYCLE", DEFAULT_POOL_RECYCLE, minimum=0),
        "pool_pre_ping": _get_env_bool("DB_POOL_PRE_PING", DEFAULT_POOL_PRE_PING),
    }


def _get_env_int(name: str, default: int, *, minimum: int) -> int:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default
    try:
        return max(int(raw_value), minimum)
    except ValueError:
        return default


def _get_env_bool(name: str, default: bool) -> bool:
    raw_value = os.getenv(name, "").strip().lower()
    if not raw_value:
        return default
    if raw_value in {"1", "true", "yes", "on"}:
        return True
    if raw_value in {"0", "false", "no", "off"}:
        return False
    return default


@lru_cache(maxsize=1)
def get_engine():
    database_url = get_database_url()
    return create_engine(database_url, future=True, **get_engine_options(database_url))


@lru_cache(maxsize=1)
def get_session_factory():
    return sessionmaker(
        bind=get_engine(),
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
        class_=Session,
    )


def get_db_session() -> Generator[Session, None, None]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
