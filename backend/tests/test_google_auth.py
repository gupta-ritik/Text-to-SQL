from unittest.mock import patch

from app.security.google_auth import require_google_user


def test_require_google_user_exposes_stable_id():
    with patch(
        "app.security.google_auth.verify_google_credential",
        return_value={"sub": "google-user-123", "email": "user@example.com"},
    ):
        user = require_google_user("Bearer test-token")

    assert user["id"] == "google-user-123"
    assert user["sub"] == "google-user-123"


def test_require_google_user_rejects_missing_stable_id():
    with patch(
        "app.security.google_auth.verify_google_credential",
        return_value={"email": "user@example.com"},
    ):
        try:
            require_google_user("Bearer test-token")
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 401
        else:
            raise AssertionError("Expected missing user ID to be rejected")
