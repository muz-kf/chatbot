import json
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.core.time_utils import get_system_datetime_context
from app.services.chat_service import ChatService, parse_text_tool_call
from app.services.tools.base import BaseTool
from app.services.tools.registry import ToolRegistry, tool_registry
from app.services.tools.search import WebSearchTool
from app.services.tools.weather import WMO_WEATHER_CODES, WeatherTool


def test_system_datetime_context() -> None:
    context = get_system_datetime_context()
    assert "Current system date and time:" in context
    assert "- Date:" in context
    assert "- Day of the week:" in context
    assert "- Time:" in context
    assert "- Timezone:" in context

    # Test with specific timezone
    utc_context = get_system_datetime_context("UTC")
    assert "UTC" in utc_context

    tokyo_context = get_system_datetime_context("Asia/Tokyo")
    assert "JST" in tokyo_context or "+0900" in tokyo_context


def test_tool_registry_registration() -> None:
    class DummyTool(BaseTool):
        name = "dummy_tool"
        description = "A dummy tool for testing"
        parameters = {
            "type": "object",
            "properties": {"value": {"type": "string"}},
            "required": ["value"],
        }

        async def execute(self, value: str, **kwargs):
            return {"echo": value}

    reg = ToolRegistry()
    dummy = DummyTool()
    reg.register(dummy)

    assert reg.get("dummy_tool") is dummy
    assert dummy in reg.get_all()

    schemas = reg.to_openai_tools()
    assert len(schemas) == 1
    assert schemas[0]["type"] == "function"
    assert schemas[0]["function"]["name"] == "dummy_tool"
    assert schemas[0]["function"]["description"] == "A dummy tool for testing"


@pytest.mark.anyio
async def test_tool_registry_execution() -> None:
    class EchoTool(BaseTool):
        name = "echo"
        description = "Echo tool"
        parameters = {"type": "object", "properties": {"msg": {"type": "string"}}}

        async def execute(self, msg: str = "default", **kwargs):
            return {"received": msg}

    reg = ToolRegistry()
    reg.register(EchoTool())

    # Test with dict arguments
    res1 = await reg.execute_tool("echo", {"msg": "hello"})
    assert res1 == {"received": "hello"}

    # Test with JSON string arguments
    res2 = await reg.execute_tool("echo", json.dumps({"msg": "world"}))
    assert res2 == {"received": "world"}

    # Test with unknown tool
    res3 = await reg.execute_tool("unknown_tool", {})
    assert "error" in res3


@pytest.mark.anyio
async def test_weather_tool_mocked() -> None:
    tool = WeatherTool()

    mock_geo_resp = MagicMock()
    mock_geo_resp.json.return_value = {
        "results": [
            {
                "name": "London",
                "country": "United Kingdom",
                "admin1": "England",
                "latitude": 51.50853,
                "longitude": -0.12574,
            }
        ]
    }
    mock_geo_resp.raise_for_status.return_value = None

    mock_weather_resp = MagicMock()
    mock_weather_resp.json.return_value = {
        "current": {
            "temperature_2m": 15.5,
            "apparent_temperature": 14.2,
            "relative_humidity_2m": 72,
            "weather_code": 3,
            "wind_speed_10m": 18.5,
            "precipitation": 0.0,
            "is_day": 1,
        }
    }
    mock_weather_resp.raise_for_status.return_value = None

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_get.side_effect = [mock_geo_resp, mock_weather_resp]

        result = await tool.execute(location="London", temperature_unit="celsius")
        assert result["location"] == "London, England, United Kingdom"
        assert result["temperature"] == "15.5 °C"
        assert result["condition"] == "Overcast"
        assert result["humidity"] == "72%"
        assert result["wind_speed"] == "18.5 km/h"


@pytest.mark.anyio
async def test_weather_tool_city_not_found() -> None:
    tool = WeatherTool()

    mock_geo_resp = MagicMock()
    mock_geo_resp.json.return_value = {"results": []}
    mock_geo_resp.raise_for_status.return_value = None

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_get.return_value = mock_geo_resp
        result = await tool.execute(location="UnknownPlace123456")
        assert "error" in result
        assert "Could not find coordinates" in result["error"]


@pytest.mark.anyio
async def test_web_search_tool_duckduckgo_mocked() -> None:
    tool = WebSearchTool()

    mock_ddg_results = [
        {"title": "Python 3.12 Release Notes", "href": "https://python.org", "body": "What's new in Python 3.12"}
    ]

    with patch.object(tool, "_execute_ddgs_sync", return_value=mock_ddg_results):
        result = await tool.execute(query="Python 3.12")
        assert result["query"] == "Python 3.12"
        assert len(result["results"]) == 1
        assert result["results"][0]["title"] == "Python 3.12 Release Notes"
        assert result["results"][0]["url"] == "https://python.org"


@pytest.mark.anyio
async def test_web_search_tavily_flag_enabled() -> None:
    tool = WebSearchTool()

    mock_tavily_resp = MagicMock()
    mock_tavily_resp.json.return_value = {
        "results": [
            {"title": "Tavily Search Result", "url": "https://tavily.com", "content": "Tavily answer snippet"}
        ]
    }
    mock_tavily_resp.raise_for_status.return_value = None

    with patch("app.services.tools.search.ENABLE_TAVILY", True):
        with patch("app.services.tools.search.TAVILY_API_KEY", "tvly-testkey"):
            with patch("httpx.AsyncClient.post", return_value=mock_tavily_resp):
                result = await tool.execute(query="Artificial Intelligence")
                assert result["provider"] == "tavily"
                assert len(result["results"]) == 1
                assert result["results"][0]["title"] == "Tavily Search Result"


def test_parse_text_tool_call() -> None:
    # Test markdown wrapped json
    text1 = 'Here is the tool call:\n```json\n{"tool": "get_weather", "arguments": {"location": "Tokyo"}}\n```'
    parsed1 = parse_text_tool_call(text1)
    assert parsed1 is not None
    assert parsed1[0] == "get_weather"
    assert parsed1[1] == {"location": "Tokyo"}

    # Test ```tool_call block
    text2 = '```tool_call\n{"tool": "web_search", "arguments": {"query": "Mars Rover"}}\n```'
    parsed2 = parse_text_tool_call(text2)
    assert parsed2 is not None
    assert parsed2[0] == "web_search"
    assert parsed2[1] == {"query": "Mars Rover"}

    # Test plain text
    text3 = "No tool call here, just chatting."
    assert parse_text_tool_call(text3) is None


@pytest.mark.anyio
async def test_chat_service_tool_loop_mocked() -> None:
    chat_service = ChatService(api_key="test-key")

    mock_tool_call = MagicMock()
    mock_tool_call.id = "call_abc123"
    mock_tool_call.function.name = "get_weather"
    mock_tool_call.function.arguments = json.dumps({"location": "Berlin"})

    # First turn: returns tool call
    choice1 = MagicMock()
    choice1.message.content = None
    choice1.message.tool_calls = [mock_tool_call]
    completion1 = MagicMock(choices=[choice1])

    # Second turn: returns final assistant response
    choice2 = MagicMock()
    choice2.message.content = "The current weather in Berlin is 18°C and Sunny."
    choice2.message.tool_calls = None
    completion2 = MagicMock(choices=[choice2])

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=[completion1, completion2])
    mock_client.close = AsyncMock()

    mock_request = MagicMock()
    mock_request.is_disconnected = AsyncMock(return_value=False)

    from uuid import uuid4
    from app.schemas.chat import ChatMessage

    msg = ChatMessage(id=uuid4(), role="user", content="How is the weather in Berlin?", attachments=[])

    with patch("app.services.chat_service.AsyncOpenAI", return_value=mock_client):
        with patch("app.services.tools.weather.WeatherTool.execute", new_callable=AsyncMock) as mock_weather_exec:
            mock_weather_exec.return_value = {
                "location": "Berlin, Germany",
                "temperature": "18 °C",
                "condition": "Clear sky",
            }

            tokens = []
            done = False
            # Mock DB update
            with patch("app.services.chat_service.SessionLocal") as mock_db:
                mock_session = MagicMock()
                mock_session.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = MagicMock(messages=[])
                mock_db.return_value.__enter__.return_value = mock_session

                async for chunk in chat_service.stream_chat_turn(
                    request=mock_request,
                    chat_id="test-chat",
                    email="test@example.com",
                    current_messages=[msg],
                    model="openrouter/free",
                ):
                    event = json.loads(chunk.strip())
                    if "token" in event:
                        tokens.append(event["token"])
                    if event.get("done"):
                        done = True

            full_text = "".join(tokens)
            assert "The current weather in Berlin is 18°C and Sunny." in full_text
            assert done is True
            assert mock_weather_exec.called


@pytest.mark.anyio
async def test_mapping_tool_single_location() -> None:
    from app.services.tools.mapping import MappingAndRoutingTool
    tool = MappingAndRoutingTool()

    mock_geo_resp = MagicMock()
    mock_geo_resp.status_code = 200
    mock_geo_resp.json.return_value = {
        "results": [
            {"name": "Eiffel Tower", "admin1": "Ile-de-France", "country": "France", "latitude": 48.8584, "longitude": 2.2945}
        ]
    }

    with patch("httpx.AsyncClient.get", return_value=mock_geo_resp):
        result = await tool.execute(destination="Eiffel Tower, Paris")
        assert result["type"] == "location"
        assert "Eiffel Tower" in result["location"]
        assert "map_embed_url" in result
        assert "openstreetmap.org/export/embed.html" in result["map_embed_url"]


@pytest.mark.anyio
async def test_mapping_tool_routing() -> None:
    from app.services.tools.mapping import MappingAndRoutingTool
    tool = MappingAndRoutingTool()

    mock_geo1 = MagicMock(status_code=200)
    mock_geo1.json.return_value = {
        "results": [{"name": "Times Square", "latitude": 40.7580, "longitude": -73.9855}]
    }
    mock_geo2 = MagicMock(status_code=200)
    mock_geo2.json.return_value = {
        "results": [{"name": "Central Park", "latitude": 40.78509, "longitude": -73.96828}]
    }

    mock_osrm = MagicMock(status_code=200)
    mock_osrm.raise_for_status.return_value = None
    mock_osrm.json.return_value = {
        "code": "Ok",
        "routes": [
            {
                "distance": 4500,
                "duration": 720,
                "legs": [
                    {
                        "steps": [
                            {"maneuver": {"type": "depart"}, "name": "7th Ave", "distance": 1200},
                            {"maneuver": {"type": "turn", "modifier": "left"}, "name": "Central Park S", "distance": 800},
                        ]
                    }
                ],
            }
        ],
    }

    with patch("httpx.AsyncClient.get", side_effect=[mock_geo2, mock_geo1, mock_osrm]):
        result = await tool.execute(origin="Times Square", destination="Central Park")
        assert result["type"] == "route"
        assert result["distance_km"] == "4.5 km"
        assert result["estimated_duration"] == "12 min"
        assert "map_embed_url" in result
        assert len(result["steps"]) > 0


def test_client_location_and_timezone_in_system_prompt() -> None:
    chat_service = ChatService(api_key="test-key")
    prompt = chat_service.build_system_prompt(
        client_timezone="Asia/Tokyo",
        client_location={"latitude": 35.6762, "longitude": 139.6503},
    )

    assert "User's Live Location:" in prompt
    assert "Latitude 35.67620, Longitude 139.65030" in prompt
    assert "JST" in prompt or "+0900" in prompt
    assert "get_route_or_map" in prompt


def test_chat_service_groq_provider_resolution(monkeypatch) -> None:
    from app.core import config
    from app.services.chat_service import ChatService

    monkeypatch.setattr(config, "GROQ_API_KEY", "gsk_test_key_123")
    monkeypatch.setattr(config, "AI_PROVIDER", "auto")
    monkeypatch.setattr(config, "GROQ_MODEL", "llama-3.3-70b-versatile")

    service = ChatService()
    provider, base_url, api_key, model = service.get_provider_config()

    assert provider == "groq"
    assert "groq.com" in base_url
    assert api_key == "gsk_test_key_123"
    assert "llama" in model.lower()

    # Explicit provider override
    provider2, base_url2, api_key2, model2 = service.get_provider_config(
        requested_provider="openrouter",
        requested_model="mistralai/mistral-7b",
    )
    assert provider2 == "openrouter"
    assert "openrouter.ai" in base_url2
    assert model2 == "mistralai/mistral-7b"




