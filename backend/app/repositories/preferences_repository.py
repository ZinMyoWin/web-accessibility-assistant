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
    
    # Handle API Key encryption separately
    if "api_key" in data:
        api_key_val = data.pop("api_key")
        # If frontend sends "sk-••••••••", ignore it as it's a masked key meaning "keep existing"
        if api_key_val and not api_key_val.startswith("sk-••••"):
            prefs.encrypted_api_key = encrypt_api_key(api_key_val)
        elif api_key_val == "":
            prefs.encrypted_api_key = None
            
    for key, value in data.items():
        setattr(prefs, key, value)
        
    db.commit()
    db.refresh(prefs)
    return prefs
