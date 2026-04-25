from sqlalchemy.orm import Session

from app.models.preferences import AppPreferences
from app.schemas.preferences import AppPreferencesUpdate
from app.utils.encryption import encrypt_api_key


def get_preferences(db: Session) -> AppPreferences:
    prefs = db.query(AppPreferences).filter(AppPreferences.id == 1).first()
    if not prefs:
        prefs = AppPreferences(id=1)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs


def update_preferences(db: Session, update_data: AppPreferencesUpdate) -> AppPreferences:
    prefs = get_preferences(db)
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


def reset_preferences(db: Session) -> AppPreferences:
    existing = db.query(AppPreferences).filter(AppPreferences.id == 1).first()
    if existing:
        db.delete(existing)
        db.flush()

    prefs = AppPreferences(id=1)
    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return prefs
