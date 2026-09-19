"""Generation, hashing, and authenticated encryption for bearer credentials."""

import base64
import hashlib
import secrets

from cryptography.fernet import Fernet, InvalidToken


def generate_credential() -> str:
    return "ic_" + secrets.token_urlsafe(32)


def derive_credential_key(credential: str) -> str:
    # Permanent lookup keys must not reveal a usable bearer credential.
    return "cred:" + hashlib.sha256(credential.encode()).hexdigest()


def seal_credential(credential: str, secret: str) -> str:
    return Fernet(_key(secret)).encrypt(credential.encode()).decode()


def unseal_credential(token: str, secret: str) -> str:
    try:
        return Fernet(_key(secret)).decrypt(token.encode()).decode()
    except (InvalidToken, ValueError) as exc:
        raise ValueError("invalid encrypted credential replay") from exc


def _key(secret: str) -> bytes:
    # Fernet requires a URL-safe, 32-byte key regardless of secret formatting.
    return base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
