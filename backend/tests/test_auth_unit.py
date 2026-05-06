from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.auth import User, UserSession
from app.repositories.auth_repository import (
    create_user,
    create_user_session,
    get_user_by_email,
    get_user_for_token,
    revoke_user_session,
)
from app.services.auth_service import (
    create_session_token,
    decode_session_token,
    hash_password,
    verify_password,
)


def _session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    User.__table__.create(engine)
    UserSession.__table__.create(engine)
    return sessionmaker(bind=engine)()


def test_password_hash_verification_round_trip():
    password_hash = hash_password("correct horse battery staple")

    assert verify_password("correct horse battery staple", password_hash) is True
    assert verify_password("wrong password", password_hash) is False


def test_jwt_session_token_round_trip():
    token, token_jti, expires_at = create_session_token(uuid4())
    payload = decode_session_token(token)

    assert payload is not None
    assert payload["jti"] == token_jti
    assert payload["typ"] == "access"
    assert expires_at.timestamp() > datetime.now(UTC).timestamp()


def test_user_and_session_records_are_persisted():
    session = _session()
    user = create_user(
        session,
        name="Test User",
        email="TEST@EXAMPLE.COM",
        password_hash=hash_password("password123"),
    )
    token, token_jti, expires_at = create_session_token(user.id)
    user_session = create_user_session(
        session,
        user=user,
        token_jti=token_jti,
        expires_at=expires_at,
    )

    assert user.email == "test@example.com"
    assert user_session.user_id == user.id
    assert get_user_by_email(session, "test@example.com").id == user.id
    assert get_user_for_token(session, token).id == user.id


def test_revoked_session_no_longer_authenticates():
    session = _session()
    user = create_user(
        session,
        name="Test User",
        email="test@example.com",
        password_hash=hash_password("password123"),
    )
    token, token_jti, expires_at = create_session_token(user.id)
    create_user_session(
        session,
        user=user,
        token_jti=token_jti,
        expires_at=expires_at,
    )

    assert revoke_user_session(session, token) is True
    assert get_user_for_token(session, token) is None


def test_expired_session_no_longer_authenticates():
    session = _session()
    user = create_user(
        session,
        name="Test User",
        email="test@example.com",
        password_hash=hash_password("password123"),
    )
    token, token_jti, expires_at = create_session_token(user.id)
    user_session = create_user_session(
        session,
        user=user,
        token_jti=token_jti,
        expires_at=expires_at,
    )
    user_session.expires_at = datetime(2020, 1, 1, tzinfo=UTC)
    session.commit()

    assert get_user_for_token(session, token) is None
