from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.auth import User, UserSession
from app.schemas.auth import UserResponse
from app.services.auth_service import decode_session_token, hash_session_token


def get_user_by_email(session: Session, email: str) -> User | None:
    return session.scalar(select(User).where(User.email == email.lower()))


def create_user(
    session: Session,
    *,
    name: str,
    email: str,
    password_hash: str,
) -> User:
    user = User(name=name, email=email.lower(), password_hash=password_hash)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def create_user_session(
    session: Session,
    *,
    user: User,
    token_jti: str,
    expires_at: datetime,
) -> UserSession:
    user_session = UserSession(
        user_id=user.id,
        token_hash=hash_session_token(token_jti),
        expires_at=expires_at,
    )
    session.add(user_session)
    session.commit()
    session.refresh(user_session)
    return user_session


def get_user_for_token(session: Session, token: str) -> User | None:
    payload = decode_session_token(token)
    if payload is None:
        return None

    statement = (
        select(UserSession)
        .options(joinedload(UserSession.user))
        .where(
            UserSession.token_hash == hash_session_token(str(payload["jti"])),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > datetime.now(UTC),
        )
    )
    user_session = session.scalar(statement)
    return user_session.user if user_session else None


def revoke_user_session(session: Session, token: str) -> bool:
    payload = decode_session_token(token)
    if payload is None:
        return False

    user_session = session.scalar(
        select(UserSession).where(
            UserSession.token_hash == hash_session_token(str(payload["jti"])),
            UserSession.revoked_at.is_(None),
        )
    )
    if user_session is None:
        return False

    user_session.revoked_at = datetime.now(UTC)
    session.commit()
    return True


def to_user_response(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        name=user.name,
        email=user.email,
        created_at=user.created_at.isoformat(),
    )
