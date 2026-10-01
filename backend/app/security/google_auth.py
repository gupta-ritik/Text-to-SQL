from fastapi import Header, HTTPException
import httpx
from app.config import get_settings


def verify_google_credential(credential: str) -> dict:
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google authentication is not configured.")

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        return id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.google_client_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Google credential: {exc}")


def verify_recaptcha(token: str) -> None:
    secret_key = get_settings().recaptcha_secret_key
    if not secret_key:
        return
    if not token:
        raise HTTPException(status_code=400, detail="Please complete the reCAPTCHA challenge.")

    try:
        response = httpx.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={"secret": secret_key, "response": token},
            timeout=5,
        )
        response.raise_for_status()
        result = response.json()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not verify reCAPTCHA: {exc}")

    if not result.get("success"):
        raise HTTPException(status_code=400, detail="reCAPTCHA verification failed. Please try again.")


def require_google_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Google sign-in is required.")
    return verify_google_credential(authorization[7:].strip())