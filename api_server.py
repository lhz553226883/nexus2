"""
Nexus API Server — 真正调用 OpenManus Agent 的后端服务
通过 monkey-patch Agent 的 think/act/step 方法，捕获结构化事件并通过 SSE 推送到前端。

启动方式：
  cd ~/Desktop/Nexus_new-master
  source .venv/bin/activate
  pip install fastapi uvicorn -i https://pypi.tuna.tsinghua.edu.cn/simple
  python api_server.py

接口：
  POST /api/tasks          - 创建新任务并开始执行（SSE 流式返回）
  POST /api/tasks/{id}/stop - 停止正在执行的任务
  GET  /api/tasks          - 获取任务历史列表
  GET  /api/tasks/{id}     - 获取单个任务详情
  GET  /health             - 健康检查
"""

import asyncio
import base64
import io
import json
import re
import uuid
import traceback
from datetime import datetime
from typing import AsyncGenerator, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ─── Screenshot Renderer ─────────────────────────────────────────────────────
def render_tool_screenshot(content: str, tool_name: str = "terminal", max_lines: int = 50) -> str:
    """
    Render tool output as a terminal/editor-style screenshot.
    Returns a base64-encoded PNG data URI.
    Works without Docker sandbox — pure Python/Pillow.
    Supports dual-font rendering: ASCII via LiberationMono, CJK via DroidSansFallback.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont

        # Dark theme colors
        BG = (22, 27, 34)              # GitHub dark background
        FG = (201, 209, 217)           # Default text
        HEADER_BG = (33, 38, 45)       # Header bar
        LINE_NUM_FG = (110, 118, 129)  # Line numbers
        COMMENT_FG = (110, 118, 129)   # Gray (comments)
        SUCCESS_FG = (63, 185, 80)     # Green
        ERROR_FG = (248, 81, 73)       # Red

        lines = content.replace('\t', '    ').split('\n')[:max_lines]
        if not lines:
            lines = ['(empty)']

        # ── Dual-font setup ──────────────────────────────────────────────────
        # font_ascii: monospace for code/ASCII (LiberationMono)
        # font_cjk:   CJK fallback for Chinese/Japanese/Korean (DroidSansFallback)
        FONT_SIZE = 13
        _ASCII_CANDIDATES = [
            '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
            '/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf',
        ]
        _ASCII_BOLD_CANDIDATES = [
            '/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
        ]
        _CJK_CANDIDATES = [
            '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf',
            '/usr/share/fonts/truetype/droid/DroidSansFallback.ttf',
        ]
        font_ascii = None
        font_ascii_bold = None
        font_cjk = None
        for fp in _ASCII_CANDIDATES:
            try:
                font_ascii = ImageFont.truetype(fp, FONT_SIZE)
                break
            except Exception:
                continue
        for fp in _ASCII_BOLD_CANDIDATES:
            try:
                font_ascii_bold = ImageFont.truetype(fp, FONT_SIZE)
                break
            except Exception:
                continue
        for fp in _CJK_CANDIDATES:
            try:
                font_cjk = ImageFont.truetype(fp, FONT_SIZE)
                break
            except Exception:
                continue
        if font_ascii is None:
            font_ascii = ImageFont.load_default()
        if font_ascii_bold is None:
            font_ascii_bold = font_ascii
        # If no CJK font, fall back to ascii font (CJK chars may show as boxes)
        if font_cjk is None:
            font_cjk = font_ascii

        def draw_mixed_text(draw_obj, pos, text, font_a, font_c, fill):
            """Draw text with dual-font support: ASCII uses font_a, CJK uses font_c."""
            x, y = pos
            for ch in text:
                cp = ord(ch)
                # CJK Unified Ideographs and common CJK ranges
                is_cjk = (
                    0x4E00 <= cp <= 0x9FFF or   # CJK Unified Ideographs
                    0x3000 <= cp <= 0x303F or   # CJK Symbols and Punctuation
                    0xFF00 <= cp <= 0xFFEF or   # Halfwidth/Fullwidth Forms
                    0x3040 <= cp <= 0x309F or   # Hiragana
                    0x30A0 <= cp <= 0x30FF or   # Katakana
                    0xAC00 <= cp <= 0xD7AF      # Hangul
                )
                use_font = font_c if is_cjk else font_a
                draw_obj.text((x, y), ch, font=use_font, fill=fill)
                # Advance: CJK chars are typically double-width
                char_advance = 14 if is_cjk else 8
                x += char_advance
            return x  # return final x position

        CHAR_W = 8
        CHAR_H = 18
        PADDING_X = 16
        PADDING_Y = 12
        HEADER_H = 38
        LINE_NUM_W = 40

        max_line_len = max((len(l) for l in lines), default=0)
        width = max(700, max_line_len * CHAR_W + LINE_NUM_W + PADDING_X * 2 + 20)
        width = min(width, 1400)  # cap at 1400px
        height = HEADER_H + len(lines) * CHAR_H + PADDING_Y * 2

        img = Image.new('RGB', (width, height), BG)
        draw = ImageDraw.Draw(img)

        # Header bar
        draw.rectangle([0, 0, width, HEADER_H], fill=HEADER_BG)
        # macOS-style traffic lights
        for idx, color in enumerate([(255, 95, 87), (255, 189, 46), (40, 200, 64)]):
            cx = 14 + idx * 20
            cy = HEADER_H // 2
            draw.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=color)
        # Tool name in header
        header_label = {
            'str_replace_editor': '  Editor',
            'python_execute': '  Python',
            'browser_use': '  Browser',
            'bash': '  Terminal',
            'python': '  Python',
        }.get(tool_name, f'  {tool_name}')
        draw_mixed_text(draw, (70, HEADER_H // 2 - 7), header_label, font_ascii_bold, font_cjk, FG)

        # Separator line
        draw.line([(0, HEADER_H), (width, HEADER_H)], fill=(48, 54, 61), width=1)

        # Content lines
        y = HEADER_H + PADDING_Y
        for i, line in enumerate(lines):
            line_num_str = f'{i + 1:3d}'
            draw.text((PADDING_X, y), line_num_str, font=font_ascii, fill=LINE_NUM_FG)
            # Separator between line numbers and code
            draw.line([(PADDING_X + LINE_NUM_W - 6, y + 2), (PADDING_X + LINE_NUM_W - 6, y + CHAR_H - 2)],
                      fill=(48, 54, 61), width=1)
            # Truncate long lines (rough estimate)
            display_line = line[:int((width - LINE_NUM_W - PADDING_X * 2) / CHAR_W)]
            # Color hint based on content
            if line.startswith('#') or line.startswith('//'):
                line_color = COMMENT_FG
            elif any(kw in line for kw in ['Error', 'error', 'Exception', 'failed', 'FAILED']):
                line_color = ERROR_FG
            elif any(kw in line for kw in ['success', 'Success', 'created', 'Created', 'OK', 'done', '成功', '完成']):
                line_color = SUCCESS_FG
            else:
                line_color = FG
            draw_mixed_text(draw, (PADDING_X + LINE_NUM_W, y), display_line, font_ascii, font_cjk, line_color)
            y += CHAR_H

        # Convert to base64
        buf = io.BytesIO()
        img.save(buf, format='PNG', optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
        return f'data:image/png;base64,{b64}'
    except Exception:
        return ''


# ─── SSE Event Queue Management ─────────────────────────────────────────────
event_queues: Dict[str, asyncio.Queue] = {}

def push_event(task_id: str, event: dict):
    """Push an event to the task's SSE queue (non-blocking)."""
    q = event_queues.get(task_id)
    if q:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass

# ─── Loguru Sink: capture all agent logs ─────────────────────────────────────
_active_task_id: Optional[str] = None

def loguru_sse_sink(message):
    """Loguru sink that forwards log messages to the active task's SSE queue."""
    global _active_task_id
    if not _active_task_id:
        return
    record = message.record
    text = record["message"]
    level = record["level"].name.lower()
    push_event(_active_task_id, {
        "type": "log",
        "content": text,
        "level": level,
    })

# Install loguru sink BEFORE importing app modules
from loguru import logger as loguru_logger
loguru_logger.add(loguru_sse_sink, level="INFO", format="{message}")

# ─── Import OpenManus ─────────────────────────────────────────────────────────
from app.agent.manus import Manus
from app.schema import AgentState, Message
from app.llm import LLM
from app.logger import logger

# ─── App setup ───────────────────────────────────────────────────────────────
app = FastAPI(title="Nexus API", version="2.0.0")

# Configure screenshot debug logging to stdout
import logging as _std_logging
_std_logging.basicConfig(
    level=_std_logging.DEBUG,
    format='%(asctime)s %(name)s %(levelname)s %(message)s',
)
_std_logging.getLogger('nexus.screenshot').setLevel(_std_logging.DEBUG)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── In-memory task store ─────────────────────────────────────────────────────
tasks_store: Dict[str, dict] = {}

# ─── Active agent registry (for stop support) ────────────────────────────────
# Maps task_id -> Manus agent instance currently running
_active_agents: Dict[str, Manus] = {}

# ─── Models ──────────────────────────────────────────────────────────────────
class CreateTaskRequest(BaseModel):
    prompt: str

# ─── SSE helpers ─────────────────────────────────────────────────────────────
def sse_format(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ─── Simple chat classifier ───────────────────────────────────────────────────
# Keywords/patterns that indicate a simple conversational message
# that doesn't require Agent tool use.
_SIMPLE_CHAT_PATTERNS = [
    # Greetings
    "你好", "hi", "hello", "hey", "嗨", "哈喽", "早上好", "下午好", "晚上好",
    "早安", "晚安", "good morning", "good night", "good afternoon",
    # Thanks
    "谢谢", "感谢", "thanks", "thank you", "thx",
    # Farewells
    "再见", "拜拜", "bye", "goodbye", "see you",
    # Acknowledgements
    "好的", "ok", "okay", "明白", "收到", "知道了", "好", "嗯", "哦",
    # Simple questions about the assistant
    "你是谁", "你叫什么", "你能做什么", "介绍一下你自己", "你是什么",
    "who are you", "what can you do", "what are you",
]

def is_simple_chat(prompt: str) -> bool:
    """
    Returns True if the prompt is a simple conversational message
    that should be answered directly by LLM without Agent tool steps.
    """
    text = prompt.strip().lower()
    # Very short messages (≤ 15 chars) are likely simple chat
    if len(text) <= 15:
        return True
    # Check for known simple patterns
    for pattern in _SIMPLE_CHAT_PATTERNS:
        if pattern in text:
            return True
    return False


async def run_simple_chat(task_id: str, prompt: str) -> AsyncGenerator[str, None]:
    """
    Handle simple conversational prompts directly via LLM.ask(),
    bypassing the full Agent loop entirely — no steps, no tools.
    """
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    event_queues[task_id] = q

    yield sse_format({"type": "task_start", "task_id": task_id, "prompt": prompt})

    async def _run():
        try:
            llm = LLM()
            reply = await llm.ask(
                messages=[{"role": "user", "content": prompt}],
                system_msgs=[{
                    "role": "system",
                    "content": (
                        "你是 Nexus，一个全能的 AI 助手。"
                        "请用简洁、自然的语气回复用户。"
                        "如果用户只是打招呼或闲聊，直接友好地回应即可，不要列举功能清单。"
                    ),
                }],
                stream=False,
            )
            tasks_store[task_id]["status"] = "completed"
            tasks_store[task_id]["result"] = reply
            await q.put({"type": "task_done", "status": "completed", "result": reply})
        except Exception as e:
            tasks_store[task_id]["status"] = "failed"
            tasks_store[task_id]["error"] = str(e)
            await q.put({"type": "task_error", "error": str(e)})
        finally:
            await q.put(None)

    asyncio.create_task(_run())

    while True:
        try:
            event = await asyncio.wait_for(q.get(), timeout=60.0)
        except asyncio.TimeoutError:
            yield sse_format({"type": "heartbeat"})
            continue
        if event is None:
            break
        yield sse_format(event)

    task = tasks_store.get(task_id, {})
    yield sse_format({"type": "stream_end", "status": task.get("status", "completed"), "task_id": task_id})
    event_queues.pop(task_id, None)


def instrument_agent(agent: Manus, task_id: str):
    """
    Monkey-patch the agent's think/act methods to emit structured SSE events.
    This captures:
    - step_start / step_end
    - think (LLM thoughts + tool selection)
    - tool_start / tool_end (each tool call)
    """
    original_think = agent.think
    original_act = agent.act
    original_execute_tool = agent.execute_tool

    async def patched_think() -> bool:
        # If task was stopped, set agent state to FINISHED to break the loop
        task = tasks_store.get(task_id, {})
        if task.get("status") == "stopped":
            agent.state = AgentState.FINISHED
            return False

        step_num = agent.current_step
        push_event(task_id, {
            "type": "step_start",
            "step": step_num,
            "title": f"步骤 {step_num}: 思考中...",
        })

        result = await original_think()

        # Extract thoughts and tool calls from the LLM response
        thoughts = ""
        if agent.memory.messages:
            last_msgs = agent.memory.messages[-3:]
            for msg in reversed(last_msgs):
                if msg.role == "assistant" and msg.content:
                    thoughts = msg.content
                    break

        # Try to parse structured sections from the assistant message so
        # frontend can display 观察/思考/计划/行动/回答 清晰结构
        observation = thought = plan = action_str = answer = ""
        if thoughts:
            try:
                observation_match = re.search(
                    r"\*\*观察(?: \(Observation\))?\*\*:([\s\S]*?)(?=\n\*\*思考(?: \(Thought\))?\*\*|$)",
                    thoughts,
                )
                thought_match = re.search(
                    r"\*\*思考(?: \(Thought\))?\*\*:([\s\S]*?)(?=\n\*\*计划(?: \(Plan\))?\*\*|$)",
                    thoughts,
                )
                plan_match = re.search(
                    r"\*\*计划(?: \(Plan\))?\*\*:([\s\S]*?)(?=\n\*\*行动(?: \(Action\))?\*\*|$)",
                    thoughts,
                )
                action_match = re.search(
                    r"\*\*行动(?: \(Action\))?\*\*:([\s\S]*?)(?=\n\*\*回答(?: \(Answer\))?\*\*|$)",
                    thoughts,
                )
                answer_match = re.search(
                    r"\*\*回答(?: \(Answer\))?\*\*:([\s\S]*)$",
                    thoughts,
                )

                observation = observation_match.group(1).strip() if observation_match else ""
                thought = thought_match.group(1).strip() if thought_match else ""
                plan = plan_match.group(1).strip() if plan_match else ""
                action_str = action_match.group(1).strip() if action_match else ""
                answer = answer_match.group(1).strip() if answer_match else ""
            except Exception:
                # 如果结构解析失败，就退回到原始 thoughts 文本
                thought = thoughts

        tool_names = []
        if agent.tool_calls:
            tool_names = [tc.function.name for tc in agent.tool_calls]

        push_event(task_id, {
            "type": "think",
            "step": step_num,
            "thoughts": thoughts[:2000] if thoughts else "",
            "tool_names": tool_names,
            "will_act": result,
            # Structured thinking fields (may be empty if parsing failed)
            "observation": observation[:1000] if observation else "",
            "thought": thought[:1000] if thought else "",
            "plan": plan[:1000] if plan else "",
            "action": action_str[:1000] if action_str else "",
            "answer": answer[:2000] if answer else "",
        })
        # NOTE: Do NOT push a 'message' event here.
        # The final assistant reply is sent once via task_done.result.
        return result

    async def patched_act() -> str:
        # If task was stopped, abort immediately
        task = tasks_store.get(task_id, {})
        if task.get("status") == "stopped":
            agent.state = AgentState.FINISHED
            return ""
        step_num = agent.current_step
        pending_tools = list(agent.tool_calls) if agent.tool_calls else []
        push_event(task_id, {
            "type": "act_start",
            "step": step_num,
            "tool_count": len(pending_tools),
        })
        # NOTE: tool_start / tool_end / screenshot are all handled by
        # patched_execute_tool below (which is called inside original_act).
        # Do NOT push them here to avoid duplicate events.
        result = await original_act()
        # Check again after act (tools may have taken a while)
        task = tasks_store.get(task_id, {})
        if task.get("status") == "stopped":
            agent.state = AgentState.FINISHED
            return result
        push_event(task_id, {
            "type": "step_end",
            "step": step_num,
            "result_preview": result[:500] if result else "",
        })
        return result

    async def patched_execute_tool(command) -> str:
        # If task was stopped, skip tool execution
        task = tasks_store.get(task_id, {})
        if task.get("status") == "stopped":
            return "[Task stopped by user]"

        name = command.function.name if command and command.function else "unknown"
        args_str = command.function.arguments if command and command.function else "{}"

        push_event(task_id, {
            "type": "tool_start",
            "step": agent.current_step,
            "tool_name": name,
            "tool_args": args_str[:500],
        })

        result = await original_execute_tool(command)

        # Check again after tool execution
        task = tasks_store.get(task_id, {})
        if task.get("status") == "stopped":
            return result

        push_event(task_id, {
            "type": "tool_end",
            "step": agent.current_step,
            "tool_name": name,
            "tool_result": result[:1000] if result else "",
        })

        # ── Screenshot: push screenshot after each tool execution ──
        # Priority 1: BrowserUseTool — actively call get_current_state to capture real browser screenshot
        # Priority 2: agent._current_base64_image (set by tools returning ToolResult.base64_image)
        # Priority 3: Docker sandbox Xvfb screenshot (if sandbox is running)
        # Priority 4: Render tool output as a code/terminal screenshot (always works, no Docker needed)
        try:
            screenshot_b64: Optional[str] = None
            import logging as _logging
            _logging.getLogger('nexus.screenshot').info(f'[SCREENSHOT] tool={name} starting screenshot capture')

            if name == "browser_use":
                # For browser tool: actively capture current page screenshot
                try:
                    browser_tool = agent.available_tools.tool_map.get("browser_use")
                    if browser_tool and hasattr(browser_tool, "get_current_state"):
                        state_result = await browser_tool.get_current_state()
                        if state_result and hasattr(state_result, "base64_image") and state_result.base64_image:
                            img_data = state_result.base64_image
                            if img_data.startswith("data:"):
                                screenshot_b64 = img_data
                            else:
                                screenshot_b64 = f"data:image/jpeg;base64,{img_data}"
                except Exception:
                    pass  # Browser screenshot failed, try other methods

            # Check if the tool produced a screenshot via ToolResult.base64_image
            if not screenshot_b64 and hasattr(agent, "_current_base64_image") and agent._current_base64_image:
                img_data = agent._current_base64_image
                if img_data.startswith("data:"):
                    screenshot_b64 = img_data
                else:
                    screenshot_b64 = f"data:image/jpeg;base64,{img_data}"

            # Try Docker sandbox display screenshot
            if not screenshot_b64:
                try:
                    from app.sandbox.client import SANDBOX_CLIENT
                    if SANDBOX_CLIENT.sandbox:
                        screenshot_bytes = await SANDBOX_CLIENT.take_screenshot()
                        if screenshot_bytes:
                            screenshot_b64 = "data:image/png;base64," + base64.b64encode(screenshot_bytes).decode("utf-8")
                except Exception:
                    pass

            # Final fallback: render tool args/result as a code screenshot (no Docker needed)
            if not screenshot_b64:
                # For str_replace_editor: show the file content being written
                if name == "str_replace_editor":
                    try:
                        import json as _json
                        args = _json.loads(args_str) if args_str else {}
                        file_text = args.get("file_text") or args.get("new_str") or ""
                        path = args.get("path", "")
                        if file_text:
                            display_content = f"# {path}\n" + file_text if path else file_text
                        else:
                            display_content = result or args_str
                        screenshot_b64 = render_tool_screenshot(display_content, name, max_lines=60)
                    except Exception:
                        screenshot_b64 = render_tool_screenshot(result or args_str, name)
                else:
                    # For other tools: show the tool result
                    display_content = result or f"[{name}] executed"
                    screenshot_b64 = render_tool_screenshot(display_content, name)

            if screenshot_b64:
                _logging.getLogger('nexus.screenshot').info(f'[SCREENSHOT] tool={name} PUSHING screenshot ({len(screenshot_b64)} bytes)')
                push_event(task_id, {
                    "type": "screenshot",
                    "step": agent.current_step,
                    "tool_name": name,
                    "image": screenshot_b64,
                })
            else:
                _logging.getLogger('nexus.screenshot').warning(f'[SCREENSHOT] tool={name} NO screenshot generated')
        except Exception as _ss_err:
            import logging as _logging2
            _logging2.getLogger('nexus.screenshot').error(f'[SCREENSHOT] tool={name} EXCEPTION: {_ss_err}')
            pass  # Screenshot is optional, never block execution

        return result

    agent.think = patched_think
    agent.act = patched_act
    agent.execute_tool = patched_execute_tool


async def run_agent_and_stream(task_id: str, prompt: str) -> AsyncGenerator[str, None]:
    """Run the Manus agent and yield SSE events."""
    global _active_task_id

    q: asyncio.Queue = asyncio.Queue(maxsize=1000)
    event_queues[task_id] = q

    # Signal start
    yield sse_format({"type": "task_start", "task_id": task_id, "prompt": prompt})

    agent = None

    async def _run():
        global _active_task_id
        nonlocal agent
        try:
            _active_task_id = task_id
            agent = await Manus.create()
            _active_agents[task_id] = agent
            instrument_agent(agent, task_id)
            tasks_store[task_id]["status"] = "running"

            result = await agent.run(prompt)

            # Check if stopped during execution
            task = tasks_store.get(task_id, {})
            if task.get("status") == "stopped":
                await q.put({"type": "task_done", "status": "completed", "result": "[已停止]"})
                return

            # Extract the last assistant message as the final reply.
            # Prefer the structured **回答** section if present, so the user
            # only sees the final answer text instead of the whole reasoning.
            final_reply = ""
            full_reasoning = ""
            if agent.memory and agent.memory.messages:
                for msg in reversed(agent.memory.messages):
                    if msg.role == "assistant" and msg.content and msg.content.strip():
                        content = msg.content.strip()
                        full_reasoning = content
                        answer_only = ""
                        try:
                            answer_match = re.search(
                                r"\*\*回答(?: \(Answer\))?\*\*:([\s\S]*)$",
                                content,
                            )
                            if answer_match:
                                answer_only = answer_match.group(1).strip()
                        except Exception:
                            # Fallback to full content if parsing fails
                            answer_only = ""

                        final_reply = answer_only or content
                        break

            tasks_store[task_id]["status"] = "completed"
            tasks_store[task_id]["result"] = final_reply or result or ""
            if full_reasoning:
                tasks_store[task_id]["reasoning"] = full_reasoning
            await q.put({
                "type": "task_done",
                "status": "completed",
                "result": (final_reply or result or "")[:4000],
                "reasoning": (full_reasoning or "")[:4000],
            })
        except Exception as e:
            task = tasks_store.get(task_id, {})
            if task.get("status") == "stopped":
                await q.put({"type": "task_done", "status": "completed", "result": "[已停止]"})
            else:
                tasks_store[task_id]["status"] = "failed"
                tasks_store[task_id]["error"] = str(e)
                await q.put({"type": "task_error", "error": str(e)})
        finally:
            _active_task_id = None
            _active_agents.pop(task_id, None)
            if agent:
                try:
                    await agent.cleanup()
                except Exception:
                    pass
            await q.put(None)  # sentinel

    # Run agent in background
    asyncio.create_task(_run())

    # Stream events from queue
    while True:
        try:
            event = await asyncio.wait_for(q.get(), timeout=120.0)
        except asyncio.TimeoutError:
            yield sse_format({"type": "heartbeat"})
            continue

        if event is None:
            break

        yield sse_format(event)

    # Final status
    task = tasks_store.get(task_id, {})
    yield sse_format({
        "type": "stream_end",
        "status": task.get("status", "completed"),
        "task_id": task_id,
    })

    # Cleanup
    event_queues.pop(task_id, None)


# ─── Routes ──────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "nexus-api", "version": "2.0.0"}

@app.get("/api/tasks")
async def list_tasks():
    return {"tasks": sorted(tasks_store.values(), key=lambda t: t.get("created_at", ""), reverse=True)}

@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str):
    task = tasks_store.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.post("/api/tasks/{task_id}/stop")
async def stop_task(task_id: str):
    """
    Stop a running task immediately.
    Sets the task status to 'stopped' so the agent checks and exits
    at the next think/act/execute_tool checkpoint.
    """
    task = tasks_store.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.get("status") not in ("running", "pending"):
        return {"ok": True, "message": "Task is not running"}

    # Mark as stopped — agent will check this flag at every checkpoint
    tasks_store[task_id]["status"] = "stopped"

    # Also set agent state to FINISHED if it's still alive
    agent = _active_agents.get(task_id)
    if agent:
        try:
            agent.state = AgentState.FINISHED
        except Exception:
            pass

    # Push a stop event so the SSE stream closes cleanly
    push_event(task_id, {
        "type": "task_done",
        "status": "completed",
        "result": "[已停止]",
    })

    return {"ok": True, "message": "Task stop signal sent"}

@app.post("/api/tasks")
async def create_task(req: CreateTaskRequest):
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    task_id = str(uuid.uuid4())
    tasks_store[task_id] = {
        "id": task_id,
        "prompt": req.prompt,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
    }

    # Route to simple chat or full agent based on prompt complexity
    if is_simple_chat(req.prompt):
        generator = run_simple_chat(task_id, req.prompt)
    else:
        generator = run_agent_and_stream(task_id, req.prompt)

    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ─── Entry point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 56)
    print("  Nexus API Server v2.0")
    print("  http://localhost:8765")
    print("  真正调用 OpenManus Agent 执行任务")
    print("  前端配置: VITE_API_URL=http://localhost:8765")
    print("=" * 56 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8765, log_level="info")
