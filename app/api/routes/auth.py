import asyncio
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException, Request as FastAPIRequest, Response

from ...core.config import (
    RESEND_API_KEY,
    RESEND_FROM_EMAIL,
    SESSION_SECRET,
    STRICT_AUTH,
)
from ...core.security import authenticated_email, clear_session, issue_session
from ...db.session import get_pool
from ...schemas.auth import (
    AuthModeResponse,
    MessageResponse,
    ProfileRequest,
    UserResponse,
    VerifyCodeRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
CODE_LIFETIME = timedelta(minutes=10)
RESEND_COOLDOWN = timedelta(minutes=1)
SEND_WINDOW = timedelta(hours=1)
MAX_CODE_SENDS = 5
MAX_CODE_ATTEMPTS = 5


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _digest(email: str, code: str) -> str:
    if len(SESSION_SECRET) < 32 or SESSION_SECRET.startswith(
        "replace-with-a-random-secret"
    ):
        raise RuntimeError("SESSION_SECRET must be configured with at least 32 characters.")
    return hmac.new(
        SESSION_SECRET.encode(), f"{email}:{code}".encode(), hashlib.sha256
    ).hexdigest()


async def _send_code(email: str, code: str) -> None:
    payload = json.dumps(
        {
            "from": RESEND_FROM_EMAIL,
            "to": [email],
            "subject": "Your DAZZ sign-in code",
            "text": f"Your DAZZ verification code is {code}. It expires in 10 minutes.",
        }
    ).encode()

    def send() -> None:
        request = Request(
            "https://api.resend.com/emails",
            data=payload,
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=15) as response:
                if response.status >= 300:
                    raise RuntimeError(f"Resend returned HTTP {response.status}.")
        except HTTPError as error:
            raise RuntimeError(f"Resend returned HTTP {error.code}.") from error
        except URLError as error:
            raise RuntimeError("Resend could not be reached.") from error

    await asyncio.to_thread(send)


def _resend_error_message(error: RuntimeError) -> str:
    message = str(error)
    if "HTTP 401" in message:
        return "Resend rejected the API key. Check that RESEND_API_KEY is current and belongs to this Resend account."
    if "HTTP 403" in message:
        return "Resend denied this request. Check the API key permissions and verify the sender domain."
    if "HTTP 422" in message:
        return "Resend rejected the email details. Check that RESEND_FROM_EMAIL uses a verified sender domain."
    if "HTTP 429" in message:
        return "Resend is rate-limiting requests. Wait a little and try again."
    return "Resend could not send the code. Check the sender configuration and server outbound network access."


@router.get("/mode", response_model=AuthModeResponse)
async def auth_mode() -> dict[str, bool]:
    return {"requiresEmailVerification": STRICT_AUTH}


@router.post("/dev-sign-in", response_model=UserResponse)
async def dev_sign_in(profile: ProfileRequest, response: Response) -> dict:
    if STRICT_AUTH:
        raise HTTPException(status_code=404, detail="Not found.")
    email = normalize_email(str(profile.email))
    async with get_pool().connection() as connection:
        async with connection.transaction():
            await connection.execute(
                """
                INSERT INTO users (email, name, date_of_birth)
                VALUES (%s, %s, %s)
                ON CONFLICT (email) DO NOTHING
                """,
                (email, profile.name, profile.dateOfBirth),
            )
            user = await (
                await connection.execute(
                    "SELECT email, name, date_of_birth FROM users WHERE email = %s",
                    (email,),
                )
            ).fetchone()
    if not user or user["date_of_birth"] != profile.dateOfBirth:
        raise HTTPException(
            status_code=401,
            detail="Authentication failed. Check your email and date of birth.",
        )
    try:
        issue_session(response, email)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="Sign-in is temporarily unavailable.") from error
    return {"user": {"email": user["email"], "name": user["name"]}}


@router.get("/session", response_model=UserResponse)
async def session(request: FastAPIRequest, response: Response) -> dict:
    email = authenticated_email(request)
    if not email:
        clear_session(response)
        raise HTTPException(status_code=401, detail="Sign-in required.")
    async with get_pool().connection() as connection:
        user = await (
            await connection.execute(
                "SELECT email, name FROM users WHERE email = %s", (email,)
            )
        ).fetchone()
    if not user:
        clear_session(response)
        raise HTTPException(status_code=401, detail="Sign-in required.")
    return {"user": user}


@router.post("/send-code", response_model=MessageResponse)
async def send_code(profile: ProfileRequest) -> dict[str, str]:
    if not RESEND_API_KEY or not RESEND_FROM_EMAIL:
        raise HTTPException(
            status_code=503, detail="Email sign-in is not configured on the server."
        )
    email = normalize_email(str(profile.email))
    now = datetime.now(timezone.utc)
    code = f"{secrets.randbelow(1_000_000):06d}"
    code_hash = _digest(email, code)
    async with get_pool().connection() as connection:
        async with connection.transaction():
            await connection.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (email,))
            challenge = await (
                await connection.execute(
                    """
                    SELECT last_sent_at, send_count, window_started_at
                    FROM email_verification_codes WHERE email = %s FOR UPDATE
                    """,
                    (email,),
                )
            ).fetchone()
            if challenge and now - challenge["last_sent_at"] < RESEND_COOLDOWN:
                raise HTTPException(
                    status_code=429,
                    detail="Please wait a minute before requesting another code.",
                )
            window_active = bool(
                challenge and now - challenge["window_started_at"] < SEND_WINDOW
            )
            if window_active and challenge["send_count"] >= MAX_CODE_SENDS:
                raise HTTPException(
                    status_code=429,
                    detail="Too many sign-in codes requested. Try again in an hour.",
                )
            window_started = challenge["window_started_at"] if window_active else now
            send_count = challenge["send_count"] + 1 if window_active else 1
            await connection.execute(
                """
                INSERT INTO email_verification_codes
                    (email, code_hash, attempts, send_count, window_started_at, expires_at, last_sent_at)
                VALUES (%s, %s, 0, %s, %s, %s, %s)
                ON CONFLICT (email) DO UPDATE SET
                    code_hash = EXCLUDED.code_hash,
                    attempts = 0,
                    send_count = EXCLUDED.send_count,
                    window_started_at = EXCLUDED.window_started_at,
                    expires_at = EXCLUDED.expires_at,
                    last_sent_at = EXCLUDED.last_sent_at
                """,
                (
                    email,
                    code_hash,
                    send_count,
                    window_started,
                    now + CODE_LIFETIME,
                    now,
                ),
            )
    try:
        await _send_code(email, code)
    except RuntimeError as error:
        async with get_pool().connection() as connection:
            await connection.execute(
                "UPDATE email_verification_codes SET expires_at = %s WHERE email = %s",
                (datetime.now(timezone.utc), email),
            )
        raise HTTPException(
            status_code=502, detail=_resend_error_message(error)
        ) from error
    return {"message": "If the email can receive sign-in codes, one has been sent."}


@router.post("/verify-code", response_model=UserResponse)
async def verify_code(data: VerifyCodeRequest, response: Response) -> dict:
    email = normalize_email(str(data.email))
    now = datetime.now(timezone.utc)
    async with get_pool().connection() as connection:
        async with connection.transaction():
            challenge = await (
                await connection.execute(
                    """
                    SELECT code_hash, attempts FROM email_verification_codes
                    WHERE email = %s AND expires_at > %s FOR UPDATE
                    """,
                    (email, now),
                )
            ).fetchone()
            if not challenge or challenge["attempts"] >= MAX_CODE_ATTEMPTS:
                user = None
            elif not hmac.compare_digest(challenge["code_hash"], _digest(email, data.code)):
                await connection.execute(
                    "UPDATE email_verification_codes SET attempts = attempts + 1 WHERE email = %s",
                    (email,),
                )
                user = None
            else:
                user = await (
                    await connection.execute(
                        """
                        INSERT INTO users (email, name, date_of_birth, updated_at)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (email) DO UPDATE SET
                            name = EXCLUDED.name,
                            date_of_birth = EXCLUDED.date_of_birth,
                            updated_at = EXCLUDED.updated_at
                        RETURNING email, name
                        """,
                        (email, data.name, data.dateOfBirth, now),
                    )
                ).fetchone()
                await connection.execute(
                    """
                    UPDATE email_verification_codes
                    SET attempts = %s, expires_at = %s WHERE email = %s
                    """,
                    (MAX_CODE_ATTEMPTS, now, email),
                )
    if not user:
        raise HTTPException(
            status_code=400,
            detail="That code is invalid or expired. Request a new one and try again.",
        )
    try:
        issue_session(response, email)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="Sign-in is temporarily unavailable.") from error
    return {"user": user}


@router.post("/logout", status_code=204)
async def logout(response: Response) -> Response:
    clear_session(response)
    response.status_code = 204
    return response
