"""Environment-backed application settings."""

import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = (os.getenv("PSQL_STR") or os.getenv("DATABASE_URL") or "").strip()
SESSION_SECRET = os.getenv("SESSION_SECRET", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free").strip()
OPENROUTER_MULTIMODAL_MODEL = os.getenv(
    "OPENROUTER_MULTIMODAL_MODEL", "google/gemini-2.5-flash"
).strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b").strip()
GROQ_MULTIMODAL_MODEL = os.getenv(
    "GROQ_MULTIMODAL_MODEL", "llama-3.2-11b-vision-preview"
).strip()
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").strip()
AI_PROVIDER = os.getenv("AI_PROVIDER", "auto").strip().lower()
ENABLE_TAVILY = os.getenv("ENABLE_TAVILY", "false").lower() in ("true", "1", "yes")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "").strip()
DEFAULT_TIMEZONE = os.getenv("DEFAULT_TIMEZONE", "").strip()
APP_ENV = os.getenv("APP_ENV", os.getenv("NODE_ENV", "development")).lower()
IS_PRODUCTION = APP_ENV == "production"

APP_ORIGIN = os.getenv("APP_ORIGIN", "")
TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("TRUSTED_ORIGINS", "").split(",")
    if origin.strip()
]
SERVER_HOST = os.getenv("HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("PORT", "5002"))


def allowed_origins() -> set[str]:
    origins = [APP_ORIGIN, *TRUSTED_ORIGINS]
    if not IS_PRODUCTION:
        origins.extend(
            [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:5001",
                "http://127.0.0.1:5001",
                "http://localhost:5002",
                "http://127.0.0.1:5002",
                "http://localhost:5003",
                "http://127.0.0.1:5003",
                "http://localhost:8000",
                "http://127.0.0.1:8000",
            ]
        )
    normalized: set[str] = set()
    for origin in filter(None, origins):
        normalized.add(normalize_origin(origin))
    if IS_PRODUCTION and not normalized:
        raise ValueError("Configure APP_ORIGIN with the public DAZZ origin in production.")
    return normalized


def normalize_origin(origin: str) -> str:
    from urllib.parse import urlsplit

    parsed = urlsplit(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"Invalid origin configured in APP_ORIGIN/TRUSTED_ORIGINS: {origin}")
    return f"{parsed.scheme}://{parsed.netloc}"
