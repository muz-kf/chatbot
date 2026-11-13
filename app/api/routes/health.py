import logging
import secrets
import string
from typing import Any

from fastapi import APIRouter, Response
from openai import AsyncOpenAI

from ...core.config import (
    AI_PROVIDER,
    GROQ_API_KEY,
    GROQ_BASE_URL,
    GROQ_MODEL,
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
)
from ...core.time_utils import get_current_time
from ...schemas.health import AgentHealthRequest, AgentHealthResponse, HealthResponse

router = APIRouter(tags=["health"])

logger = logging.getLogger(__name__)
AGENT_HEALTH_PROMPTS = (
    "Reply with a brief greeting.",
    "In one sentence, describe what you can help with.",
    "Say hello and confirm you are available.",
)

@router.get("/health", response_model=HealthResponse, response_model_exclude_none=True)
async def health() -> HealthResponse:
    suffix = "".join(
        secrets.choice(string.ascii_lowercase + string.digits) for _ in range(10)
    )
    return HealthResponse(
        server_time=get_current_time(),
        message=f"DAZZ API is healthy: {suffix}",
    )

@router.get("/health/liveness")
async def liveness() :
    suffix = "".join(
        secrets.choice(string.ascii_lowercase + string.digits) for _ in range(10)
    )
    return HealthResponse(
        server_time=get_current_time(),
        message=f"DAZZ API is alive: {suffix}",
        key=suffix
    )

def _to_serializable(obj: Any) -> Any:
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "dict") and callable(obj.dict):
        return obj.dict()
    if hasattr(obj, "__dict__"):
        return {k: _to_serializable(v) for k, v in vars(obj).items()}
    if isinstance(obj, list):
        return [_to_serializable(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _to_serializable(v) for k, v in obj.items()}
    return obj


@router.post("/health/agent")
async def agent_health(
    response: Response,
    data: AgentHealthRequest | None = None,
) -> AgentHealthResponse:
    prompt = (data.text if data else None) or ""
    if not prompt.strip():
        prompt = secrets.choice(AGENT_HEALTH_PROMPTS)

    active_provider = AI_PROVIDER if AI_PROVIDER != "auto" else ("groq" if GROQ_API_KEY else "openrouter")
    api_key = GROQ_API_KEY if active_provider == "groq" else OPENROUTER_API_KEY
    base_url = GROQ_BASE_URL if active_provider == "groq" else "https://openrouter.ai/api/v1"
    model = GROQ_MODEL if active_provider == "groq" else OPENROUTER_MODEL

    if not api_key:
        response.status_code = 503
        key_name = "GROQ_API_KEY" if active_provider == "groq" else "OPENROUTER_API_KEY"
        return AgentHealthResponse(
            server_time=get_current_time(),
            healthy=False,
            message=f"Agent is unavailable: {key_name} is not configured.",
        )

    headers = {}
    if active_provider == "openrouter":
        headers = {
            "HTTP-Referer": "http://muz.postman.com",
            "X-Title": "DAZZ",
        }

    client = AsyncOpenAI(
        base_url=base_url,
        api_key=api_key,
        default_headers=headers if headers else None,
    )
    try:
        completion = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a rare AI who specializes in rare contents of online platforms."},
                {"role": "user", "content": prompt},
            ],
        )
        agent_response = completion.choices[0].message.content
        raw = _to_serializable(completion)
        return AgentHealthResponse(
            server_time=get_current_time(),
            healthy=True,
            message="Agent is healthy.",
            agent_response=agent_response,
            raw=raw,
        )
    except Exception:
        logger.exception("Agent health check failed")
        response.status_code = 503
        return AgentHealthResponse(
            server_time=get_current_time(),
            healthy=False,
            message="Agent is unavailable.",
        )
    finally:
        await client.close()