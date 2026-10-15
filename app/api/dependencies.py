from fastapi import HTTPException, Request

from ..core.security import authenticated_email
from ..db.session import get_pool


async def get_current_user_email(request: Request) -> str:
    email = authenticated_email(request)
    if email is None:
        raise HTTPException(status_code=401, detail="Sign-in required.")

    async with get_pool().connection() as connection:
        user = await (
            await connection.execute(
                "SELECT email FROM users WHERE email = %s",
                (email,),
            )
        ).fetchone()

    if user is None:
        raise HTTPException(status_code=401, detail="Sign-in required.")
    return email
