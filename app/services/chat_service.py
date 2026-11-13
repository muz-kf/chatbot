import json
import logging
import re
from typing import Any, AsyncGenerator
from uuid import uuid4

from fastapi import Request
from openai import AsyncOpenAI

from ..core import config
from ..core.time_utils import get_system_datetime_context
from ..db.models import PublicChat
from ..db.session import SessionLocal
from ..schemas.chat import ChatMessage
from .tools import tool_registry

logger = logging.getLogger(__name__)


def to_openrouter_message(message: ChatMessage) -> dict[str, Any]:
    """Convert ChatMessage schema to OpenRouter / OpenAI message structure."""
    if message.role == "assistant":
        return {"role": "assistant", "content": message.content}

    text_parts = [message.content.strip()] if message.content.strip() else []
    content: list[dict[str, Any]] = []
    for attachment in message.attachments:
        text_parts.append(f"Attached file: {attachment.name} ({attachment.mimeType}).")
        if attachment.transcript:
            text_parts.append(f"Voice transcript: {attachment.transcript}")
        if attachment.text:
            text_parts.append(f"Extracted text from {attachment.name}:\n{attachment.text}")
        if (
            attachment.mimeType.startswith(("image/", "audio/", "video/"))
            and not attachment.data
            and not attachment.frames
        ):
            text_parts.append(
                f"The media content of {attachment.name} is not included in this turn."
            )
    content.append({"type": "text", "text": "\n\n".join(text_parts)})
    for attachment in message.attachments:
        if attachment.data and attachment.mimeType.startswith("image/"):
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{attachment.mimeType};base64,{attachment.data}"
                    },
                }
            )
        if attachment.data and attachment.format:
            content.append(
                {
                    "type": "input_audio",
                    "input_audio": {
                        "data": attachment.data,
                        "format": attachment.format,
                    },
                }
            )
        for index, frame in enumerate(attachment.frames, start=1):
            content.extend(
                [
                    {
                        "type": "text",
                        "text": f"Video frame {index} from {attachment.name}:",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{frame}"},
                    },
                ]
            )
    return {"role": "user", "content": content}


def parse_text_tool_call(content: str) -> tuple[str, dict[str, Any]] | None:
    """Parse JSON or markdown-wrapped tool calls emitted as text by some free LLM models."""
    if not content:
        return None

    # Pattern 1: ```tool_call ... ``` or ```json ... ```
    match = re.search(r"```(?:tool_call|json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    candidate_strs = [match.group(1)] if match else []

    # Pattern 2: Raw JSON object with "tool" or "function" or "name"
    if not candidate_strs:
        match_raw = re.search(r"\{[^{}]*(?:tool|function|name)[^{}]*\}", content, re.DOTALL)
        if match_raw:
            candidate_strs.append(match_raw.group(0))

    for candidate in candidate_strs:
        try:
            data = json.loads(candidate)
            name = data.get("tool") or data.get("function") or data.get("name")
            args = data.get("arguments") or data.get("parameters") or {}
            if name and isinstance(name, str) and tool_registry.get(name):
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except Exception:
                        args = {}
                return name, args if isinstance(args, dict) else {}
        except Exception:
            continue

    return None


class ChatService:
    """Service to orchestrate chat turns, tool calling execution loop, and response streaming."""

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or config.OPENROUTER_API_KEY
        self.base_url = "https://openrouter.ai/api/v1"

    def get_provider_config(
        self,
        requested_provider: str | None = None,
        requested_model: str | None = None,
        uses_attachments: bool = False,
    ) -> tuple[str, str, str, str]:
        """Return (provider_name, base_url, api_key, resolved_model)."""
        active_provider = (requested_provider or config.AI_PROVIDER or "auto").strip().lower()
        if active_provider == "auto":
            active_provider = "groq" if config.GROQ_API_KEY else "openrouter"

        if active_provider == "groq":
            default_model = (
                config.GROQ_MULTIMODAL_MODEL if uses_attachments else config.GROQ_MODEL
            )
            return (
                "groq",
                config.GROQ_BASE_URL,
                config.GROQ_API_KEY,
                requested_model or default_model,
            )

        default_model = (
            config.OPENROUTER_MULTIMODAL_MODEL if uses_attachments else config.OPENROUTER_MODEL
        )
        return (
            "openrouter",
            self.base_url,
            self.api_key or config.OPENROUTER_API_KEY,
            requested_model or default_model,
        )

    def build_system_prompt(
        self,
        client_timezone: str | None = None,
        client_location: Any | None = None,
    ) -> str:
        """Inject current system date, time, weekday, timezone, live location, and tool instructions into system prompt."""
        tz_to_use = client_timezone or config.DEFAULT_TIMEZONE or None
        time_context = get_system_datetime_context(tz_to_use)
        tools = tool_registry.get_all()
        tool_descriptions = "\n".join(
            f"- `{t.name}`: {t.description}" for t in tools
        )

        location_context = ""
        if client_location:
            lat = getattr(client_location, "latitude", None) or (
                client_location.get("latitude") if isinstance(client_location, dict) else None
            )
            lon = getattr(client_location, "longitude", None) or (
                client_location.get("longitude") if isinstance(client_location, dict) else None
            )
            if lat is not None and lon is not None:
                location_context = (
                    f"User's Live Location:\n"
                    f"- Coordinates: Latitude {lat:.5f}, Longitude {lon:.5f}\n"
                    f"- The user has shared their live device GPS location with DAZZ. You know their exact current position.\n"
                    f"- Use these coordinates when the user asks 'where am I?', requests weather for their current area, "
                    f"or requests directions/routes/traffic from 'here' or 'my location' without asking them for their location.\n\n"
                )

        return (
            "You are a helpful, accurate personal AI assistant named DAZZ.\n\n"
            f"{time_context}\n\n"
            f"{location_context}"
            "You have access to real-time tools:\n"
            f"{tool_descriptions}\n\n"
            "Guidelines:\n"
            "1. When answering questions regarding current weather, conditions, or forecasts, call `get_weather`.\n"
            "2. When answering questions regarding current news, events after your training cutoff, live facts, or searching the web, call `web_search`.\n"
            "3. When answering questions about driving routes, travel duration, traffic, or maps, call `get_route_or_map`.\n"
            "4. If current date or time is asked, use the system date and time provided above.\n"
            "5. Always synthesize tool outputs into a clear, natural-language response for the user. When a route or location map is returned, include the interactive map iframe directly (e.g. `<iframe src=\"<map_embed_url>\" width=\"100%\" height=\"350\"></iframe>`) along with the full-screen route link."
        )

    async def stream_chat_turn(
        self,
        request: Request,
        chat_id: str,
        email: str,
        current_messages: list[ChatMessage],
        model: str | None = None,
        client_timezone: str | None = None,
        client_location: Any | None = None,
        provider: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Execute chat turn with multi-turn tool calling loop and stream NDJSON response to client."""
        uses_attachments = any(
            attachment.data or attachment.frames
            for message in current_messages
            for attachment in message.attachments
        )
        active_provider, base_url, api_key, resolved_model = self.get_provider_config(
            requested_provider=provider,
            requested_model=model,
            uses_attachments=uses_attachments,
        )

        headers: dict[str, str] = {}
        if active_provider == "openrouter":
            headers = {
                "HTTP-Referer": "http://localhost:5173",
                "X-Title": "DAZZ",
            }

        client = AsyncOpenAI(
            base_url=base_url,
            api_key=api_key,
            default_headers=headers if headers else None,
        )
        assistant_content = ""

        try:
            system_prompt = self.build_system_prompt(client_timezone, client_location)
            messages: list[dict[str, Any]] = [
                {"role": "system", "content": system_prompt},
                *(to_openrouter_message(msg) for msg in current_messages),
            ]

            tools = tool_registry.to_openai_tools()
            max_turns = 5
            turn = 0
            supports_native_tools = True

            while turn < max_turns:
                turn += 1
                if await request.is_disconnected():
                    return

                # If the model supports native tools, attempt tool resolution
                if supports_native_tools and tools:
                    try:
                        completion = await client.chat.completions.create(
                            model=resolved_model,
                            messages=messages,
                            tools=tools,
                            tool_choice="auto",
                            stream=False,
                        )
                    except Exception as exc:
                        exc_str = str(exc).lower()
                        provider_name = "Groq" if active_provider == "groq" else "OpenRouter"
                        key_name = "GROQ_API_KEY" if active_provider == "groq" else "OPENROUTER_API_KEY"
                        if "429" in exc_str or "rate limit" in exc_str:
                            logger.warning("%s rate limit 429 encountered: %s", provider_name, exc)
                            yield json.dumps({
                                "error": f"{provider_name} rate limit reached. Please wait a few seconds and try again."
                            }) + "\n"
                            return
                        if "401" in exc_str or "auth" in exc_str or "invalid token" in exc_str:
                            logger.error("%s auth error: %s", provider_name, exc)
                            yield json.dumps({
                                "error": f"{provider_name} authentication failed. Please verify your {key_name}."
                            }) + "\n"
                            return
                        # If model fails on tools parameter (400 or unsupported), fall back to non-tool call
                        if "tool" in exc_str or "unsupported" in exc_str or "400" in exc_str:
                            logger.warning("Model '%s' does not support native tools (%s). Switching to fallback.", resolved_model, exc)
                            supports_native_tools = False
                            continue
                        raise

                    choice = completion.choices[0]
                    msg = choice.message
                    tool_calls = getattr(msg, "tool_calls", None)

                    if tool_calls:
                        # Append assistant message with tool calls to conversation history
                        tool_call_dicts = [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments,
                                },
                            }
                            for tc in tool_calls
                        ]
                        messages.append({
                            "role": "assistant",
                            "content": msg.content or "",
                            "tool_calls": tool_call_dicts,
                        })

                        # Execute all requested tools
                        for tc in tool_calls:
                            func_name = tc.function.name
                            func_args = tc.function.arguments
                            logger.info("Executing tool '%s' with args: %s", func_name, func_args)
                            tool_output = await tool_registry.execute_tool(func_name, func_args)
                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc.id,
                                "content": json.dumps(tool_output),
                            })
                        # Continue next loop turn to let model synthesize tool outputs
                        continue

                    # If no native tool calls, check for text-formatted tool calls
                    text_content = msg.content or ""
                    parsed = parse_text_tool_call(text_content)
                    if parsed:
                        tool_name, tool_args = parsed
                        logger.info("Executing text-parsed tool '%s' with args: %s", tool_name, tool_args)
                        tool_output = await tool_registry.execute_tool(tool_name, tool_args)
                        messages.append({"role": "assistant", "content": text_content})
                        messages.append({
                            "role": "user",
                            "content": (
                                f"[Tool Result for '{tool_name}']:\n{json.dumps(tool_output)}\n\n"
                                "Please answer my original question using this information."
                            ),
                        })
                        continue

                    # Model provided final natural language response without further tool calls
                    assistant_content = text_content
                    # Stream tokens in small chunks to frontend
                    chunk_size = 12
                    for i in range(0, len(assistant_content), chunk_size):
                        if await request.is_disconnected():
                            return
                        token = assistant_content[i : i + chunk_size]
                        yield json.dumps({"token": token}) + "\n"
                    break

                else:
                    # Native tools disabled or fallback path: stream completion directly
                    stream = await client.chat.completions.create(
                        model=resolved_model,
                        messages=messages,
                        stream=True,
                    )
                    async for chunk in stream:
                        if await request.is_disconnected():
                            return
                        token = chunk.choices[0].delta.content
                        if isinstance(token, str) and token:
                            assistant_content += token
                            yield json.dumps({"token": token}) + "\n"
                    break

            # Save the final assistant response to the database
            if SessionLocal is None:
                raise RuntimeError("Database session is unavailable.")
            with SessionLocal() as stream_db:
                latest = (
                    stream_db.query(PublicChat)
                    .filter(
                        PublicChat.id == chat_id,
                        PublicChat.email == email,
                    )
                    .with_for_update()
                    .first()
                )
                if latest:
                    latest.messages = [
                        *latest.messages,
                        {
                            "id": str(uuid4()),
                            "role": "assistant",
                            "content": assistant_content,
                        },
                    ]
                    stream_db.commit()

            yield json.dumps({"done": True}) + "\n"

        except Exception as e:
            logger.exception("Chat turn processing failed: %s", e)
            provider_name = "Groq" if active_provider == "groq" else "OpenRouter"
            key_name = "GROQ_API_KEY" if active_provider == "groq" else "OPENROUTER_API_KEY"
            error_text = "The assistant could not complete this response. Please try again."
            e_str = str(e).lower()
            if "429" in e_str or "rate limit" in e_str:
                error_text = f"Rate limit reached from {provider_name}. Please wait a moment before trying again."
            elif "401" in e_str or "auth" in e_str or "invalid token" in e_str:
                error_text = f"{provider_name} authentication failed. Please verify the {key_name}."
            elif "timeout" in e_str or "timed out" in e_str:
                error_text = f"Request timed out while waiting for a response from {provider_name}. Please try again."

            yield json.dumps({"error": error_text}) + "\n"

        finally:
            await client.close()

