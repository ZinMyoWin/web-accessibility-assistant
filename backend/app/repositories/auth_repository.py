from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.auth import PasswordResetToken, User, UserSession
from app.schemas.auth import UserResponse
from app.services.auth_service import (
    decode_session_token,
    hash_session_token,
    unusable_password_hash,
)


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


def get_or_create_oauth_user(
    session: Session,
    *,
    name: str,
    email: str,
) -> User:
    """Return the existing account for ``email`` or create a passwordless one.

    Google sign-in is keyed on the verified email. If a credentials account
    already exists for the email it is reused (account linking); otherwise a new
    account is created with an unusable password hash so it cannot be used for
    credentials login until the user sets a password via the reset flow.
    """
    existing = get_user_by_email(session, email)
    if existing is not None:
        return existing

    user = User(
        name=name,
        email=email.lower(),
        password_hash=unusable_password_hash(),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def update_user_password(session: Session, *, user: User, password_hash: str) -> User:
    user.password_hash = password_hash
    session.commit()
    session.refresh(user)
    return user


def create_password_reset_token(
    session: Session,
    *,
    user: User,
    token_hash: str,
    expires_at: datetime,
) -> PasswordResetToken:
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    session.add(reset_token)
    session.commit()
    session.refresh(reset_token)
    return reset_token


def invalidate_unused_password_reset_tokens(
    session: Session,
    *,
    user: User,
) -> int:
    consumed_at = datetime.now(UTC)
    reset_tokens = list(
        session.scalars(
            select(PasswordResetToken).where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used_at.is_(None),
            )
        )
    )
    for reset_token in reset_tokens:
        reset_token.used_at = consumed_at
    session.commit()
    return len(reset_tokens)


def get_valid_reset_token(
    session: Session, token_hash: str
) -> PasswordResetToken | None:
    return session.scalar(
        select(PasswordResetToken)
        .options(joinedload(PasswordResetToken.user))
        .where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > datetime.now(UTC),
        )
    )


def consume_reset_token(session: Session, reset_token: PasswordResetToken) -> None:
    reset_token.used_at = datetime.now(UTC)
    session.commit()


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
