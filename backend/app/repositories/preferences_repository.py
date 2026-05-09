from uuid import UUID

from sqlalchemy.orm import Session

from app.models.preferences import AppPreferences
from app.schemas.preferences import AppPreferencesUpdate
from app.utils.encryption import encrypt_api_key


def get_preferences(db: Session, user_id: UUID) -> AppPreferences:
    prefs = db.query(AppPreferences).filter(AppPreferences.user_id == user_id).first()
    if not prefs:
        prefs = AppPreferences(user_id=user_id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    elif prefs.skip_previously_scanned_pages is None:
        prefs.skip_previously_scanned_pages = True
        db.commit()
        db.refresh(prefs)
    return prefs


def update_preferences(
    db: Session,
    user_id: UUID,
    update_data: AppPreferencesUpdate,
) -> AppPreferences:
    prefs = get_preferences(db, user_id)
    data = update_data.model_dump(exclude_unset=True)

    clear_api_key = bool(data.pop("clear_api_key", False))
    api_key_val = data.pop("api_key", None)

    if clear_api_key:
        prefs.encrypted_api_key = None
    elif api_key_val is not None and api_key_val.strip():
        prefs.encrypted_api_key = encrypt_api_key(api_key_val)

    for key, value in data.items():
        setattr(prefs, key, value)

    db.commit()
    db.refresh(prefs)
    return prefs


def reset_preferences(db: Session, user_id: UUID) -> AppPreferences:
    existing = db.query(AppPreferences).filter(AppPreferences.user_id == user_id).first()
    if existing:
        db.delete(existing)
        db.flush()

    prefs = AppPreferences(user_id=user_id)
    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return prefs
