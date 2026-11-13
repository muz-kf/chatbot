import logging
from typing import Any
import httpx

from .base import BaseTool

logger = logging.getLogger(__name__)


class MappingAndRoutingTool(BaseTool):
    """Tool for calculating driving routes, travel duration, turn-by-turn navigation, and OpenStreetMap embeds."""

    name = "get_route_or_map"
    description = (
        "Get driving routes, estimated travel time, traffic duration, turn-by-turn navigation steps, "
        "or interactive OpenStreetMap visualizer between locations using OpenStreetMap and OSRM."
    )
    parameters = {
        "type": "object",
        "properties": {
            "origin": {
                "type": "string",
                "description": (
                    "Starting address, city, landmark, or coordinates (e.g. 'Times Square, New York' "
                    "or 'current_location' if using user's live location)."
                ),
            },
            "destination": {
                "type": "string",
                "description": "Destination address, city, or landmark (e.g. 'Central Park, New York').",
            },
            "include_steps": {
                "type": "boolean",
                "description": "Whether to include detailed turn-by-turn navigation steps (default: true).",
                "default": True,
            },
        },
        "required": ["destination"],
    }

    async def _geocode(self, client: httpx.AsyncClient, query: str) -> dict[str, Any] | None:
        """Geocode location query to latitude, longitude, and formatted name."""
        query = query.strip()
        # Check if coordinates were passed directly as "lat, lon"
        if "," in query:
            parts = [p.strip() for p in query.split(",")]
            if len(parts) == 2:
                try:
                    lat, lon = float(parts[0]), float(parts[1])
                    return {"name": f"{lat:.4f}, {lon:.4f}", "latitude": lat, "longitude": lon}
                except ValueError:
                    pass

        try:
            # 1. Try Open-Meteo geocoding
            resp = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": query, "count": 1, "language": "en", "format": "json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results")
                if results:
                    r = results[0]
                    name_parts = [r.get("name"), r.get("admin1"), r.get("country")]
                    name = ", ".join(p for p in name_parts if p)
                    return {"name": name or query, "latitude": r["latitude"], "longitude": r["longitude"]}

            # 2. Try Nominatim as fallback
            nom_resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": query, "format": "json", "limit": 1},
                headers={"User-Agent": "DAZZ-Chatbot/2.0"},
            )
            if nom_resp.status_code == 200:
                nom_data = nom_resp.json()
                if nom_data:
                    n = nom_data[0]
                    return {
                        "name": n.get("display_name", query),
                        "latitude": float(n["lat"]),
                        "longitude": float(n["lon"]),
                    }
        except Exception as e:
            logger.warning("Geocoding failed for '%s': %s", query, e)

        return None

    async def execute(
        self,
        destination: str,
        origin: str | None = None,
        include_steps: bool = True,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Execute route calculation or map location lookup."""
        destination = destination.strip()
        if not destination:
            return {"error": "A destination location must be provided."}

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                dest_geo = await self._geocode(client, destination)
                if not dest_geo:
                    return {"error": f"Could not find coordinates for destination '{destination}'."}

                dest_lat = dest_geo["latitude"]
                dest_lon = dest_geo["longitude"]

                # If no origin is provided, return a location map overview
                if not origin or origin.strip().lower() in ("none", ""):
                    bbox_delta = 0.02
                    embed_map_url = (
                        f"https://www.openstreetmap.org/export/embed.html?"
                        f"bbox={dest_lon - bbox_delta:.4f}%2C{dest_lat - bbox_delta:.4f}%2C"
                        f"{dest_lon + bbox_delta:.4f}%2C{dest_lat + bbox_delta:.4f}&"
                        f"layer=mapnik&marker={dest_lat:.5f}%2C{dest_lon:.5f}"
                    )
                    return {
                        "type": "location",
                        "location": dest_geo["name"],
                        "coordinates": {"latitude": dest_lat, "longitude": dest_lon},
                        "map_embed_url": embed_map_url,
                        "map_link": f"https://www.openstreetmap.org/?mlat={dest_lat}&mlon={dest_lon}#map=15/{dest_lat}/{dest_lon}",
                    }

                # Geocode origin
                orig_geo = await self._geocode(client, origin)
                if not orig_geo:
                    return {"error": f"Could not find coordinates for origin '{origin}'."}

                orig_lat = orig_geo["latitude"]
                orig_lon = orig_geo["longitude"]

                # Query OSRM driving route API
                osrm_url = (
                    f"https://router.project-osrm.org/route/v1/driving/"
                    f"{orig_lon},{orig_lat};{dest_lon},{dest_lat}"
                )
                route_resp = await client.get(
                    osrm_url,
                    params={
                        "overview": "full",
                        "geometries": "geojson",
                        "steps": "true" if include_steps else "false",
                    },
                    headers={"User-Agent": "DAZZ-Chatbot/2.0"},
                )
                route_resp.raise_for_status()
                route_data = route_resp.json()

                if route_data.get("code") != "Ok" or not route_data.get("routes"):
                    return {
                        "error": f"No driving route found between '{origin}' and '{destination}'."
                    }

                best_route = route_data["routes"][0]
                distance_meters = best_route.get("distance", 0)
                duration_seconds = best_route.get("duration", 0)

                distance_km = round(distance_meters / 1000, 2)
                distance_miles = round(distance_km * 0.621371, 2)

                mins = int(round(duration_seconds / 60))
                hours = mins // 60
                remaining_mins = mins % 60
                duration_str = f"{hours} hr {remaining_mins} min" if hours > 0 else f"{mins} min"

                # Navigation steps
                steps_list: list[str] = []
                if include_steps:
                    for leg in best_route.get("legs", []):
                        for step in leg.get("steps", []):
                            maneuver = step.get("maneuver", {})
                            instruction = maneuver.get("type", "").capitalize()
                            modifier = maneuver.get("modifier")
                            if modifier:
                                instruction += f" {modifier}"
                            name = step.get("name")
                            if name:
                                instruction += f" onto {name}"
                            step_dist = round(step.get("distance", 0))
                            if step_dist > 0:
                                instruction += f" ({step_dist} m)"
                            if instruction.strip():
                                steps_list.append(instruction)

                min_lat = min(orig_lat, dest_lat) - 0.03
                max_lat = max(orig_lat, dest_lat) + 0.03
                min_lon = min(orig_lon, dest_lon) - 0.03
                max_lon = max(orig_lon, dest_lon) + 0.03

                embed_map_url = (
                    f"https://www.openstreetmap.org/export/embed.html?"
                    f"bbox={min_lon:.4f}%2C{min_lat:.4f}%2C{max_lon:.4f}%2C{max_lat:.4f}&"
                    f"layer=mapnik&marker={dest_lat:.5f}%2C{dest_lon:.5f}"
                )

                return {
                    "type": "route",
                    "origin": orig_geo["name"],
                    "destination": dest_geo["name"],
                    "distance_km": f"{distance_km} km",
                    "distance_miles": f"{distance_miles} miles",
                    "estimated_duration": duration_str,
                    "traffic_summary": f"Estimated normal driving duration: {duration_str} over {distance_km} km ({distance_miles} miles).",
                    "steps": steps_list[:12],
                    "map_embed_url": embed_map_url,
                    "map_link": f"https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route={orig_lat}%2C{orig_lon}%3B{dest_lat}%2C{dest_lon}",
                }

        except httpx.TimeoutException:
            logger.warning("Routing service timed out between '%s' and '%s'", origin, destination)
            return {"error": "Routing service timed out while calculating the route. Please try again."}
        except Exception as e:
            logger.exception("Error calculating route between '%s' and '%s'", origin, destination)
            return {"error": f"Failed to calculate route: {str(e)}"}

