from fastapi import Header, HTTPException
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


def require_google_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Google sign-in is required.")
    claims = verify_google_credential(authorization[7:].strip())
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Google credential has no stable user ID.")
    return {**claims, "id": user_id}