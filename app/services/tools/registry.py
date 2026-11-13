import json
import logging
from typing import Any

from .base import BaseTool
from .search import WebSearchTool
from .weather import WeatherTool

logger = logging.getLogger(__name__)


class ToolRegistry:
    """Registry for managing and executing tools."""

    def __init__(self) -> None:
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        """Register a new tool instance."""
        self._tools[tool.name] = tool
        logger.info("Registered tool: %s", tool.name)

    def get(self, name: str) -> BaseTool | None:
        """Retrieve a tool by name."""
        return self._tools.get(name)

    def get_all(self) -> list[BaseTool]:
        """Return all registered tools."""
        return list(self._tools.values())

    def to_openai_tools(self) -> list[dict[str, Any]]:
        """Return the OpenAI-compatible tool specifications for all registered tools."""
        return [tool.to_openai_tool() for tool in self._tools.values()]

    async def execute_tool(self, name: str, arguments: dict[str, Any] | str) -> dict[str, Any]:
        """Execute a tool by name with parsed or string arguments."""
        tool = self.get(name)
        if not tool:
            return {"error": f"Tool '{name}' is not recognized or supported."}

        parsed_args: dict[str, Any] = {}
        if isinstance(arguments, str):
            try:
                parsed_args = json.loads(arguments) if arguments.strip() else {}
            except Exception as e:
                return {"error": f"Invalid JSON arguments provided for tool '{name}': {str(e)}"}
        elif isinstance(arguments, dict):
            parsed_args = arguments

        try:
            result = await tool.execute(**parsed_args)
            return result if isinstance(result, dict) else {"result": result}
        except TypeError as e:
            logger.warning("Argument mismatch executing tool '%s': %s", name, e)
            return {"error": f"Invalid arguments for tool '{name}': {str(e)}"}
        except Exception as e:
            logger.exception("Error executing tool '%s'", name)
            return {"error": f"Execution error in tool '{name}': {str(e)}"}


# Global tool registry instance initialized with default tools
tool_registry = ToolRegistry()
tool_registry.register(WeatherTool())
tool_registry.register(WebSearchTool())

