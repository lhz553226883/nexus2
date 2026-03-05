import re
import json
from typing import Dict, List, Optional

from pydantic import Field, model_validator

from app.agent.browser import BrowserContextHelper
from app.agent.toolcall import ToolCallAgent
from app.schema import Function, ToolCall
from app.config import config
from app.logger import logger
from app.prompt.manus import NEXT_STEP_PROMPT, SYSTEM_PROMPT
from app.tool import Terminate, ToolCollection
from app.tool.ask_human import AskHuman
from app.tool.browser_use_tool import BrowserUseTool
from app.tool.mcp import MCPClients, MCPClientTool
from app.tool.python_execute import PythonExecute
from app.tool.str_replace_editor import StrReplaceEditor


class Manus(ToolCallAgent):
    """A versatile general-purpose agent with support for both local and MCP tools."""

    name: str = "Manus"
    description: str = "A versatile agent that can solve various tasks using multiple tools including MCP-based tools"

    system_prompt: str = SYSTEM_PROMPT.format(directory=config.workspace_root)
    next_step_prompt: str = NEXT_STEP_PROMPT

    max_observe: int = 10000
    max_steps: int = 20

    # MCP clients for remote tool access
    mcp_clients: MCPClients = Field(default_factory=MCPClients)

    # Add general-purpose tools to the tool collection
    available_tools: ToolCollection = Field(
        default_factory=lambda: ToolCollection(
            PythonExecute(),
            BrowserUseTool(),
            StrReplaceEditor(),
            AskHuman(),
            Terminate(),
        )
    )

    special_tool_names: list[str] = Field(default_factory=lambda: [Terminate().name])
    browser_context_helper: Optional[BrowserContextHelper] = None

    # Track connected MCP servers
    connected_servers: Dict[str, str] = Field(
        default_factory=dict
    )  # server_id -> url/command
    _initialized: bool = False

    @model_validator(mode="after")
    def initialize_helper(self) -> "Manus":
        """Initialize basic components synchronously."""
        self.browser_context_helper = BrowserContextHelper(self)
        return self

    @classmethod
    async def create(cls, **kwargs) -> "Manus":
        """Factory method to create and properly initialize a Manus instance."""
        instance = cls(**kwargs)
        await instance.initialize_mcp_servers()
        instance._initialized = True
        return instance

    async def initialize_mcp_servers(self) -> None:
        """Initialize connections to configured MCP servers."""
        for server_id, server_config in config.mcp_config.servers.items():
            try:
                if server_config.type == "sse":
                    if server_config.url:
                        await self.connect_mcp_server(server_config.url, server_id)
                        logger.info(
                            f"Connected to MCP server {server_id} at {server_config.url}"
                        )
                elif server_config.type == "stdio":
                    if server_config.command:
                        await self.connect_mcp_server(
                            server_config.command,
                            server_id,
                            use_stdio=True,
                            stdio_args=server_config.args,
                        )
                        logger.info(
                            f"Connected to MCP server {server_id} using command {server_config.command}"
                        )
            except Exception as e:
                logger.error(f"Failed to connect to MCP server {server_id}: {e}")

    async def connect_mcp_server(
        self,
        server_url: str,
        server_id: str = "",
        use_stdio: bool = False,
        stdio_args: List[str] = None,
    ) -> None:
        """Connect to an MCP server and add its tools."""
        if use_stdio:
            await self.mcp_clients.connect_stdio(
                server_url, stdio_args or [], server_id
            )
            self.connected_servers[server_id or server_url] = server_url
        else:
            await self.mcp_clients.connect_sse(server_url, server_id)
            self.connected_servers[server_id or server_url] = server_url

        # Update available tools with only the new tools from this server
        new_tools = [
            tool for tool in self.mcp_clients.tools if tool.server_id == server_id
        ]
        self.available_tools.add_tools(*new_tools)

    async def disconnect_mcp_server(self, server_id: str = "") -> None:
        """Disconnect from an MCP server and remove its tools."""
        await self.mcp_clients.disconnect(server_id)
        if server_id:
            self.connected_servers.pop(server_id, None)
        else:
            self.connected_servers.clear()

        # Rebuild available tools without the disconnected server's tools
        base_tools = [
            tool
            for tool in self.available_tools.tools
            if not isinstance(tool, MCPClientTool)
        ]
        self.available_tools = ToolCollection(*base_tools)
        self.available_tools.add_tools(*self.mcp_clients.tools)

    async def cleanup(self):
        """Clean up Manus agent resources."""
        if self.browser_context_helper:
            await self.browser_context_helper.cleanup_browser()
        # Disconnect from all MCP servers only if we were initialized
        if self._initialized:
            await self.disconnect_mcp_server()
            self._initialized = False

    async def think(self) -> bool:
        """Process current state and decide next actions with appropriate context."""
        if not self._initialized:
            await self.initialize_mcp_servers()
            self._initialized = True

        original_prompt = self.next_step_prompt
        recent_messages = self.memory.messages[-3:] if self.memory.messages else []
        browser_in_use = any(
            tc.function.name == BrowserUseTool().name
            for msg in recent_messages
            if msg.tool_calls
            for tc in msg.tool_calls
        )

        if browser_in_use:
            self.next_step_prompt = (
                await self.browser_context_helper.format_next_step_prompt()
            )

        # Add the next_step_prompt as a user message to guide the LLM
        user_msg = Message.user_message(self.next_step_prompt)
        self.messages.append(user_msg)

        try:
            # Get response with tool options
            response = await self.llm.ask_tool(
                messages=self.messages,
                system_msgs=(
                    [Message.system_message(self.system_prompt)]
                    if self.system_prompt
                    else None
                ),
                tools=self.available_tools.to_params(),
                tool_choice=self.tool_choices,
            )
        except ValueError:
            raise
        except Exception as e:
            # Check if this is a RetryError containing TokenLimitExceeded
            if hasattr(e, "__cause__") and isinstance(e.__cause__, TokenLimitExceeded):
                token_limit_error = e.__cause__
                logger.error(
                    f"🚨 Token limit error (from RetryError): {token_limit_error}"
                )
                self.memory.add_message(
                    Message.assistant_message(
                        f"Maximum token limit reached, cannot continue execution: {str(token_limit_error)}"
                    )
                )
                self.state = AgentState.FINISHED
                return False
            raise

        content = response.content if response and response.content else ""
        self.tool_calls = tool_calls = (
            response.tool_calls if response and response.tool_calls else []
        )

        # Log raw response for debugging
        logger.info(f"✨ {self.name}\'s raw LLM response: {content}")

        # Parse structured output
        observation_match = re.search(r'\*\*观察 \(Observation\)\*\*:([\s\S]*?)(?=\n\*\*思考 \(Thought\)\*\*|$)', content)
        thought_match = re.search(r'\*\*思考 \(Thought\)\*\*:([\s\S]*?)(?=\n\*\*计划 \(Plan\)\*\*|$)', content)
        plan_match = re.search(r'\*\*计划 \(Plan\)\*\*:([\s\S]*?)(?=\n\*\*行动 \(Action\)\*\*|$)', content)
        action_match = re.search(r'\*\*行动 \(Action\)\*\*:([\s\S]*?)(?=\n\*\*回答 \(Answer\)\*\*|$)', content)
        answer_match = re.search(r'\*\*回答 \(Answer\)\*\*:([\s\S]*)$', content)

        observation = observation_match.group(1).strip() if observation_match else ""
        thought = thought_match.group(1).strip() if thought_match else ""
        plan = plan_match.group(1).strip() if plan_match else ""
        action_str = action_match.group(1).strip() if action_match else ""
        answer = answer_match.group(1).strip() if answer_match else ""

        logger.info(f"\n--- Structured Thinking ---")
        logger.info(f"Observation: {observation}")
        logger.info(f"Thought: {thought}")
        logger.info(f"Plan: {plan}")
        logger.info(f"Action: {action_str}")
        logger.info(f"Answer: {answer}")
        logger.info(f"---------------------------")

        # Update memory with the LLM\'s thought process
        # We add the full content here, as the structured output is part of the content
        self.memory.add_message(Message.assistant_message(content))

        # If there\'s an answer and no explicit tool action, we can finish
        if answer and not action_str and not tool_calls:
            self.state = AgentState.FINISHED
            return False

        # If there\'s an action string, try to parse it into tool calls
        if action_str:
            try:
                tool_name_match = re.match(r'(\w+)\(', action_str)
                if tool_name_match:
                    tool_name = tool_name_match.group(1)
                    args_str = action_str[len(tool_name) + 1:-1]
                    try:
                        args = json.loads(args_str)
                    except json.JSONDecodeError:
                        args = {"input": args_str}

                    function_call = Function(name=tool_name, arguments=json.dumps(args))
                    self.tool_calls = [ToolCall(id="call_structured_action", function=function_call)]
                    logger.info(f"Parsed structured action into tool call: {tool_name}({args})")
                else:
                    logger.warning(f"Could not parse action string: {action_str}")

            except Exception as e:
                logger.error(f"Error parsing structured action: {e}")
                self.memory.add_message(Message.assistant_message(f"Error parsing structured action: {e}"))
                return False

        # Restore original prompt
        self.next_step_prompt = original_prompt
        return bool(self.tool_calls)
