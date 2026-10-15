import base64
import hashlib
import hmac
import json
import time

from fastapi import Request, Response

from .config import IS_PRODUCTION, SESSION_SECRET

COOKIE_NAME = "dazz_session"
SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60


def _secret() -> bytes:
    if len(SESSION_SECRET) < 32 or SESSION_SECRET.startswith(
        "replace-with-a-random-secret"
    ):
        raise RuntimeError("SESSION_SECRET must be configured with at least 32 characters.")
    return SESSION_SECRET.encode()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def issue_session(response: Response, email: str) -> None:
    now = int(time.time())
    header = _b64(b'{"alg":"HS256","typ":"JWT"}')
    payload = _b64(
        json.dumps({"sub": email, "iat": now, "exp": now + SESSION_LIFETIME_SECONDS}).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    signature = _b64(hmac.new(_secret(), signing_input, hashlib.sha256).digest())
    token = f"{header}.{payload}.{signature}"
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_LIFETIME_SECONDS,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="strict",
        path="/",
    )


def clear_session(response: Response) -> None:
    response.delete_cookie(
        COOKIE_NAME,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="strict",
        path="/",
    )


def authenticated_email(request: Request) -> str | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        header, payload, signature = token.split(".")
        if json.loads(base64.urlsafe_b64decode(header + "===")).get("alg") != "HS256":
            return None
        signing_input = f"{header}.{payload}".encode()
        expected = _b64(hmac.new(_secret(), signing_input, hashlib.sha256).digest())
        if not hmac.compare_digest(expected, signature):
            return None
        claims = json.loads(base64.urlsafe_b64decode(payload + "==="))
        if claims.get("exp", 0) <= int(time.time()):
            return None
        subject = claims.get("sub")
        return subject if isinstance(subject, str) else None
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, RuntimeError):
        return None
