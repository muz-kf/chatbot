import logging
from typing import Any
import httpx

from .base import BaseTool

logger = logging.getLogger(__name__)


class MappingAndRoutingTool(BaseTool):
    """Tool for calculating driving routes, travel duration, turn-by-turn navigation, and OpenStreetMap embeds."""

    name = "get_route_or_map"
    description = (
        "Calculate driving directions, routes, travel duration, distance, traffic estimates, "
        "and interactive OpenStreetMap visualizer embeds between locations. "
        "Use ONLY when the user explicitly requests navigation, driving routes, travel time, or a map embed."
    )
    parameters = {
        "type": "object",
        "properties": {
            "origin": {
                "type": "string",
                "description": (
                    "Starting address, city, landmark, or coordinates. "
                    "Use 'current_location' if navigating from the user's live location."
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

    async def _geocode(
        self,
        client: httpx.AsyncClient,
        query: str,
        client_location: Any | None = None,
    ) -> dict[str, Any] | None:
        """Geocode location query to latitude, longitude, and formatted name."""
        query_str = str(query).strip()

        # Check if live location was requested
        if query_str.lower() in ("current_location", "here", "my location", "me", "current", "my position", "my coordinates"):
            if client_location:
                c_lat = getattr(client_location, "latitude", None) or (
                    client_location.get("latitude") if isinstance(client_location, dict) else None
                )
                c_lon = getattr(client_location, "longitude", None) or (
                    client_location.get("longitude") if isinstance(client_location, dict) else None
                )
                if c_lat is not None and c_lon is not None:
                    return {
                        "name": "Current Location",
                        "latitude": float(c_lat),
                        "longitude": float(c_lon),
                    }
            return None

        # Strip conversational prefixes if present
        clean_query = query_str
        prefixes = [
            "directions to ", "directions for ", "direction to ", "route to ", "route from ",
            "navigate to ", "how to get to ", "map of ", "take me to ", "way to ", "path to ",
            "drive to ", "trip to ", "walk to ", "where is "
        ]
        for p in prefixes:
            if clean_query.lower().startswith(p):
                clean_query = clean_query[len(p):].strip()
                break

        # Check if coordinates were passed directly as "lat, lon"
        if "," in clean_query:
            parts = [p.strip() for p in clean_query.split(",")]
            if len(parts) == 2:
                try:
                    lat, lon = float(parts[0]), float(parts[1])
                    return {"name": f"{lat:.4f}, {lon:.4f}", "latitude": lat, "longitude": lon}
                except ValueError:
                    pass

        try:
            # 1. Try Open-Meteo geocoding (fast city/town search)
            resp = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": clean_query, "count": 1, "language": "en", "format": "json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results")
                if results:
                    r = results[0]
                    name_parts = [r.get("name"), r.get("admin1"), r.get("country")]
                    name = ", ".join(p for p in name_parts if p)
                    return {"name": name or clean_query, "latitude": r["latitude"], "longitude": r["longitude"]}

            # 2. Try Komoot Photon API (free OpenStreetMap landmark & POI geocoding)
            photon_resp = await client.get(
                "https://photon.komoot.io/api/",
                params={"q": clean_query, "limit": 1},
                headers={"User-Agent": "DAZZ-Chatbot/2.0"},
            )
            if photon_resp.status_code == 200:
                photon_data = photon_resp.json()
                features = photon_data.get("features", [])
                if features:
                    coords = features[0]["geometry"]["coordinates"]
                    props = features[0].get("properties", {})
                    p_name = props.get("name") or props.get("city") or clean_query
                    p_country = props.get("country", "")
                    full_p_name = f"{p_name}, {p_country}".strip(", ")
                    return {
                        "name": full_p_name or clean_query,
                        "latitude": float(coords[1]),
                        "longitude": float(coords[0]),
                    }

            # 3. Try Nominatim as fallback
            nom_resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": clean_query, "format": "json", "limit": 1},
                headers={"User-Agent": "DAZZ-Chatbot/2.0"},
            )
            if nom_resp.status_code == 200:
                nom_data = nom_resp.json()
                if nom_data:
                    n = nom_data[0]
                    return {
                        "name": n.get("display_name", clean_query),
                        "latitude": float(n["lat"]),
                        "longitude": float(n["lon"]),
                    }
        except Exception as e:
            logger.warning("Geocoding failed for '%s': %s", clean_query, e)

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

        client_location = kwargs.get("client_location")

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                dest_geo = await self._geocode(client, destination, client_location=client_location)
                if not dest_geo:
                    return {
                        "status": "unresolved",
                        "error": (
                            f"Could not find geographic coordinates for '{destination}'. "
                            "Please answer the user conversationally using your general knowledge without map coordinates, "
                            "or suggest a more specific city or landmark name."
                        ),
                    }

                dest_lat = dest_geo["latitude"]
                dest_lon = dest_geo["longitude"]

                # If no origin is provided, return a location map overview
                if not origin or origin.strip().lower() in ("none", "", "null"):
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
                orig_geo = await self._geocode(client, origin, client_location=client_location)
                if not orig_geo:
                    # Return destination location map instead of failing completely
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
                        "note": f"Starting point '{origin}' could not be resolved or live location was not shared. Showing location map for '{dest_geo['name']}'.",
                    }

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

