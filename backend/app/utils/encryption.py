import os
from cryptography.fernet import Fernet
import base64

# For development, if ENCRYPTION_KEY is not set, use a deterministic dummy key.
# In production, ENCRYPTION_KEY MUST be a secure base64-encoded 32-byte key.
_dummy_key = base64.urlsafe_b64encode(b"0123456789abcdef0123456789abcdef")
_encryption_key = os.getenv("ENCRYPTION_KEY", _dummy_key.decode("utf-8"))

try:
    _fernet = Fernet(_encryption_key.encode("utf-8"))
except Exception:
    _fernet = Fernet(_dummy_key)


def encrypt_api_key(api_key: str | None) -> str | None:
    if not api_key:
        return None
    return _fernet.encrypt(api_key.encode("utf-8")).decode("utf-8")


def decrypt_api_key(encrypted_key: str | None) -> str | None:
    if not encrypted_key:
        return None
    try:
        return _fernet.decrypt(encrypted_key.encode("utf-8")).decode("utf-8")
    except Exception:
        return None
