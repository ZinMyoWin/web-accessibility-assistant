from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.auth import PasswordResetToken, User, UserSession
from app.repositories.auth_repository import (
    create_password_reset_token,
    create_user,
    create_user_session,
    get_valid_reset_token,
    get_user_by_email,
    get_user_for_token,
    invalidate_unused_password_reset_tokens,
    revoke_user_session,
    update_user_password,
)
from app.services.auth_service import (
    create_session_token,
    decode_session_token,
    hash_session_token,
    hash_password,
    verify_password,
)


def _session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    User.__table__.create(engine)
    UserSession.__table__.create(engine)
    PasswordResetToken.__table__.create(engine)
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


def test_new_reset_token_invalidates_previous_unused_tokens():
    session = _session()
    user = create_user(
        session,
        name="Reset User",
        email="reset@example.com",
        password_hash=hash_password("password123"),
    )
    first_hash = hash_session_token("first-token")
    second_hash = hash_session_token("second-token")
    expires_at = datetime.now(UTC) + timedelta(hours=1)

    create_password_reset_token(
        session,
        user=user,
        token_hash=first_hash,
        expires_at=expires_at,
    )
    invalidated_count = invalidate_unused_password_reset_tokens(session, user=user)
    create_password_reset_token(
        session,
        user=user,
        token_hash=second_hash,
        expires_at=expires_at,
    )

    assert invalidated_count == 1
    assert get_valid_reset_token(session, first_hash) is None
    assert get_valid_reset_token(session, second_hash) is not None


def test_password_reset_success_invalidates_all_unused_tokens_for_user():
    session = _session()
    user = create_user(
        session,
        name="Reset User",
        email="reset@example.com",
        password_hash=hash_password("password123"),
    )
    token_hash = hash_session_token("reset-token")
    other_token_hash = hash_session_token("other-reset-token")
    expires_at = datetime.now(UTC) + timedelta(hours=1)

    reset_token = create_password_reset_token(
        session,
        user=user,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    create_password_reset_token(
        session,
        user=user,
        token_hash=other_token_hash,
        expires_at=expires_at,
    )

    assert get_valid_reset_token(session, token_hash).id == reset_token.id

    update_user_password(
        session,
        user=reset_token.user,
        password_hash=hash_password("updated-password"),
    )
    invalidated_count = invalidate_unused_password_reset_tokens(
        session,
        user=reset_token.user,
    )

    assert invalidated_count == 2
    assert get_valid_reset_token(session, token_hash) is None
    assert get_valid_reset_token(session, other_token_hash) is None
    assert verify_password("updated-password", user.password_hash) is True


def test_used_and_expired_reset_tokens_are_rejected():
    session = _session()
    user = create_user(
        session,
        name="Reset User",
        email="reset@example.com",
        password_hash=hash_password("password123"),
    )
    used_hash = hash_session_token("used-token")
    expired_hash = hash_session_token("expired-token")

    used_token = create_password_reset_token(
        session,
        user=user,
        token_hash=used_hash,
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )
    used_token.used_at = datetime.now(UTC)
    create_password_reset_token(
        session,
        user=user,
        token_hash=expired_hash,
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    session.commit()

    assert get_valid_reset_token(session, used_hash) is None
    assert get_valid_reset_token(session, expired_hash) is None
