import pytest

from app.security import (
    derive_credential_key,
    generate_credential,
    seal_credential,
    unseal_credential,
)


@pytest.fixture(autouse=True)
def flush():
    """These unit tests do not need the integration-test Redis fixture."""
    yield


def test_credentials_are_random_and_hash_to_non_reversible_keys():
    first = generate_credential()
    second = generate_credential()
    assert first.startswith("ic_")
    assert first != second
    assert first not in derive_credential_key(first)


def test_credential_replay_encryption_round_trips_and_detects_tampering():
    token = seal_credential("ic_secret", "test-secret")
    assert unseal_credential(token, "test-secret") == "ic_secret"

    changed = token[:-1] + ("A" if token[-1] != "A" else "B")
    with pytest.raises(ValueError, match="invalid encrypted credential replay"):
        unseal_credential(changed, "test-secret")

    with pytest.raises(ValueError, match="invalid encrypted credential replay"):
        unseal_credential(token, "different-secret")
