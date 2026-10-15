import secrets
import string
from datetime import datetime, timezone

from fastapi import APIRouter

from ...schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    suffix = "".join(
        secrets.choice(string.ascii_lowercase + string.digits) for _ in range(10)
    )
    return HealthResponse(
        server_time=datetime.now(timezone.utc),
        message=f"DAZZ API is healthy: {suffix}",
    )
