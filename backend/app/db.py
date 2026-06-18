from __future__ import annotations

import os
from functools import lru_cache
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


DEFAULT_DATABASE_URL = (
    "postgresql+psycopg://postgres:postgres@localhost:5432/accessibility_assistant"
)


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    return database_url


@lru_cache(maxsize=1)
def get_engine():
    return create_engine(get_database_url(), future=True)


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
