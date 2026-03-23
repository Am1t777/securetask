import os
import json
from cryptography.fernet import Fernet


def _get_fernet() -> Fernet:
    key = os.environ.get('FERNET_KEY')
    if not key:
        raise RuntimeError('FERNET_KEY environment variable not set')
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_data(data: dict) -> str:
    return _get_fernet().encrypt(json.dumps(data).encode()).decode()


def decrypt_data(token: str) -> dict:
    return json.loads(_get_fernet().decrypt(token.encode()))
