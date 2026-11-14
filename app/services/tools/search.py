import anyio
import logging
from typing import Any
import httpx

from ...core.config import ENABLE_TAVILY, TAVILY_API_KEY
from .base import BaseTool

logger = logging.getLogger(__name__)


class WebSearchTool(BaseTool):
    """Tool for performing live internet web searches using DuckDuckGo or Tavily."""

    name = "web_search"
    description = (
        "Search the internet for up-to-date information, news, documentation, or facts. "
        "Returns top search snippets with titles, URLs, and summaries."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query, terms, or phrase to look up.",
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum number of search results to return (default: 5, max: 10).",
                "default": 5,
            },
        },
        "required": ["query"],
    }

    async def execute(self, query: str, max_results: int = 5, **kwargs: Any) -> dict[str, Any]:
        """Execute web search using Tavily (if enabled) or DuckDuckGo."""
        query = query.strip()
        if not query:
            return {"error": "A search query must be provided."}

        max_results = max(1, min(int(max_results), 10))

        # Check if Tavily is explicitly enabled and API key is present
        if ENABLE_TAVILY and TAVILY_API_KEY:
            try:
                return await self._search_tavily(query, max_results)
            except Exception as e:
                logger.warning("Tavily search failed, falling back to DuckDuckGo: %s", e)

        # Default to DuckDuckGo
        return await self._search_duckduckgo(query, max_results)

    async def _search_tavily(self, query: str, max_results: int) -> dict[str, Any]:
        """Search using the Tavily API."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": query,
                    "search_depth": "basic",
                    "max_results": max_results,
                    "include_answer": False,
                },
            )
            response.raise_for_status()
            data = response.json()

            results = []
            for item in data.get("results", []):
                results.append(
                    {
                        "title": item.get("title", ""),
                        "url": item.get("url", ""),
                        "snippet": item.get("content", ""),
                    }
                )

            if not results:
                return {"query": query, "results": [], "message": f"No search results found for '{query}'."}

            return {"query": query, "provider": "tavily", "results": results}

    def _execute_ddgs_sync(self, query: str, max_results: int) -> list[dict[str, Any]]:
        """Synchronous DDGS call wrapped for execution in worker thread."""
        try:
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                try:
                    from ddgs import DDGS
                except ImportError:
                    from duckduckgo_search import DDGS
                with DDGS() as ddgs:
                    try:
                        results = list(ddgs.text(query, max_results=max_results))
                        if results:
                            return results
                    except Exception:
                        pass
                    try:
                        return list(ddgs.text(query, backend="html", max_results=max_results))
                    except Exception:
                        return []
        except Exception as ex:
            logger.warning("DDGS library text search encountered an error: %s", ex)
            return []

    async def _search_duckduckgo(self, query: str, max_results: int) -> dict[str, Any]:
        """Search using DuckDuckGo via ddgs library with HTTP fallback."""
        try:
            raw_results = await anyio.to_thread.run_sync(self._execute_ddgs_sync, query, max_results)
            if raw_results:
                results = [
                    {
                        "title": item.get("title", ""),
                        "url": item.get("href") or item.get("url", ""),
                        "snippet": item.get("body") or item.get("snippet", ""),
                    }
                    for item in raw_results
                ]
                return {"query": query, "provider": "duckduckgo", "results": results}

            # 2. HTTP instant answer fallback if DDGS library returned no results
            return await self._search_duckduckgo_api_fallback(query)

        except Exception as e:
            logger.exception("DuckDuckGo search error for query '%s'", query)
            # Try fallback API before returning error
            try:
                return await self._search_duckduckgo_api_fallback(query)
            except Exception:
                return {"error": f"Search could not be completed for '{query}': {str(e)}"}

    async def _search_duckduckgo_api_fallback(self, query: str) -> dict[str, Any]:
        """Query DuckDuckGo Instant Answer API as a zero-dependency fallback."""
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
                headers={"User-Agent": "Mozilla/5.0 (compatible; DazzBot/1.0)"},
            )
            resp.raise_for_status()
            data = resp.json()

            results = []
            heading = data.get("Heading", "")
            abstract = data.get("AbstractText", "")
            abstract_url = data.get("AbstractURL", "")

            if abstract:
                results.append({"title": heading or query, "url": abstract_url, "snippet": abstract})

            for topic in data.get("RelatedTopics", [])[:4]:
                if isinstance(topic, dict) and "Text" in topic and "FirstURL" in topic:
                    results.append(
                        {
                            "title": topic.get("Text", "").split(" - ")[0],
                            "url": topic.get("FirstURL", ""),
                            "snippet": topic.get("Text", ""),
                        }
                    )

            if not results:
                return {
                    "query": query,
                    "results": [],
                    "message": f"No immediate search snippets found for '{query}'.",
                }

            return {"query": query, "provider": "duckduckgo_instant", "results": results}
