import logging
from typing import Any
import httpx

from .base import BaseTool

logger = logging.getLogger(__name__)

# WMO Weather interpretation codes (WW) from Open-Meteo
WMO_WEATHER_CODES: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


class WeatherTool(BaseTool):
    """Tool for fetching real-time weather using Open-Meteo free API."""

    name = "get_weather"
    description = (
        "Get real-time weather information (temperature, weather condition, "
        "humidity, and wind speed) for any requested city or location. "
        "Use 'current_location' if the user asks for the weather for their current live location."
    )
    parameters = {
        "type": "object",
        "properties": {
            "location": {
                "type": "string",
                "description": "City or location name (e.g. 'Paris', 'Tokyo', 'San Francisco, CA' or 'current_location')",
            },
            "temperature_unit": {
                "type": "string",
                "enum": ["celsius", "fahrenheit"],
                "description": "Temperature unit (default: 'celsius')",
            },
        },
        "required": ["location"],
    }

    async def execute(self, location: str, temperature_unit: str = "celsius", **kwargs: Any) -> dict[str, Any]:
        """Fetch current weather for the specified location."""
        location = location.strip()
        if not location:
            return {"error": "A location must be provided."}

        unit = "fahrenheit" if temperature_unit.lower() == "fahrenheit" else "celsius"
        temp_symbol = "°F" if unit == "fahrenheit" else "°C"

        # Check if live location was requested
        lat: float | None = None
        lon: float | None = None
        location_full: str = location

        if location.lower() in ("current_location", "here", "my location", "me", "current", "my area"):
            client_location = kwargs.get("client_location")
            if client_location:
                c_lat = getattr(client_location, "latitude", None) or (
                    client_location.get("latitude") if isinstance(client_location, dict) else None
                )
                c_lon = getattr(client_location, "longitude", None) or (
                    client_location.get("longitude") if isinstance(client_location, dict) else None
                )
                if c_lat is not None and c_lon is not None:
                    lat = float(c_lat)
                    lon = float(c_lon)
                    location_full = "Current Location"

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # 1. Geocode location if not already resolved from client coordinates
                if lat is None or lon is None:
                    geo_resp = await client.get(
                        "https://geocoding-api.open-meteo.com/v1/search",
                        params={"name": location, "count": 1, "language": "en", "format": "json"},
                    )
                    geo_resp.raise_for_status()
                    geo_data = geo_resp.json()

                    results = geo_data.get("results")
                    if not results:
                        return {
                            "error": f"Could not find coordinates for location '{location}'. Please verify the spelling or specify a nearby city."
                        }

                    place = results[0]
                    lat = place.get("latitude")
                    lon = place.get("longitude")
                    name = place.get("name", location)
                    country = place.get("country", "")
                    admin1 = place.get("admin1", "")
                    location_full = f"{name}, {admin1}, {country}".replace(", ,", ",").strip(", ")

                # 2. Query Open-Meteo Forecast API
                weather_resp = await client.get(
                    "https://api.open-meteo.com/v1/forecast",
                    params={
                        "latitude": lat,
                        "longitude": lon,
                        "current": [
                            "temperature_2m",
                            "relative_humidity_2m",
                            "apparent_temperature",
                            "is_day",
                            "precipitation",
                            "weather_code",
                            "wind_speed_10m",
                        ],
                        "temperature_unit": unit,
                        "wind_speed_unit": "kmh",
                    },
                )
                weather_resp.raise_for_status()
                weather_data = weather_resp.json()

                current = weather_data.get("current", {})
                weather_code = current.get("weather_code")
                condition = WMO_WEATHER_CODES.get(weather_code, f"Code {weather_code}")

                return {
                    "location": location_full,
                    "latitude": lat,
                    "longitude": lon,
                    "temperature": f"{current.get('temperature_2m')} {temp_symbol}",
                    "feels_like": f"{current.get('apparent_temperature')} {temp_symbol}",
                    "condition": condition,
                    "humidity": f"{current.get('relative_humidity_2m')}%",
                    "wind_speed": f"{current.get('wind_speed_10m')} km/h",
                    "precipitation": f"{current.get('precipitation')} mm",
                    "is_day": bool(current.get("is_day", 1)),
                }

        except httpx.TimeoutException:
            logger.warning("Weather API request timed out for location: %s", location)
            return {"error": f"Weather service timed out while querying '{location}'. Please try again."}
        except httpx.HTTPStatusError as e:
            logger.warning("Weather API HTTP status error: %s", e)
            return {"error": f"Weather service responded with status {e.response.status_code}."}
        except Exception as e:
            logger.exception("Unexpected error fetching weather for '%s'", location)
            return {"error": f"Failed to retrieve weather for '{location}': {str(e)}"}

