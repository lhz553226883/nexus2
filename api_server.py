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
  GET  /api/tasks          - 获取任务历史列表
  GET  /api/tasks/{id}     - 获取单个任务详情
  GET  /health             - 健康检查
"""

import asyncio
import json
import uuid
import traceback
from datetime import datetime
from typing import AsyncGenerator, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

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
from app.schema import AgentState
from app.logger import logger

# ─── App setup ───────────────────────────────────────────────────────────────
app = FastAPI(title="Nexus API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── In-memory task store ─────────────────────────────────────────────────────
tasks_store: Dict[str, dict] = {}

# ─── Models ──────────────────────────────────────────────────────────────────
class CreateTaskRequest(BaseModel):
    prompt: str

# ─── SSE helpers ─────────────────────────────────────────────────────────────
def sse_format(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def instrument_agent(agent: Manus, task_id: str):
    """
    Monkey-patch the agent's think/act methods to emit structured SSE events.
    This captures:
    - step_start / step_end
    - think (LLM thoughts + tool selection)
    - tool_start / tool_end (each tool call)
    - message content (assistant text)
    """
    original_think = agent.think
    original_act = agent.act
    original_execute_tool = agent.execute_tool

    async def patched_think() -> bool:
        step_num = agent.current_step
        # Emit step start
        push_event(task_id, {
            "type": "step_start",
            "step": step_num,
            "title": f"步骤 {step_num}: 思考中...",
        })

        result = await original_think()

        # Extract thoughts and tool calls from the LLM response
        # The think() method stores tool_calls on the agent
        thoughts = ""
        if agent.memory.messages:
            last_msgs = agent.memory.messages[-3:]
            for msg in reversed(last_msgs):
                if msg.role == "assistant" and msg.content:
                    thoughts = msg.content
                    break

        tool_names = []
        if agent.tool_calls:
            tool_names = [tc.function.name for tc in agent.tool_calls]

        push_event(task_id, {
            "type": "think",
            "step": step_num,
            "thoughts": thoughts[:2000] if thoughts else "",
            "tool_names": tool_names,
            "will_act": result,
        })
        # NOTE: Do NOT push a 'message' event here.
        # Intermediate thoughts from each step are shown in the terminal panel.
        # The final assistant reply is sent once via task_done.result.
        return result

    async def patched_act() -> str:
        step_num = agent.current_step
        push_event(task_id, {
            "type": "act_start",
            "step": step_num,
            "tool_count": len(agent.tool_calls) if agent.tool_calls else 0,
        })

        result = await original_act()

        push_event(task_id, {
            "type": "step_end",
            "step": step_num,
            "result_preview": result[:500] if result else "",
        })

        return result

    async def patched_execute_tool(command) -> str:
        name = command.function.name if command and command.function else "unknown"
        args_str = command.function.arguments if command and command.function else "{}"

        push_event(task_id, {
            "type": "tool_start",
            "step": agent.current_step,
            "tool_name": name,
            "tool_args": args_str[:500],
        })

        result = await original_execute_tool(command)

        push_event(task_id, {
            "type": "tool_end",
            "step": agent.current_step,
            "tool_name": name,
            "tool_result": result[:1000] if result else "",
        })

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
            instrument_agent(agent, task_id)
            tasks_store[task_id]["status"] = "running"

            result = await agent.run(prompt)

            # Extract the last assistant message as the final reply
            final_reply = ""
            if agent.memory and agent.memory.messages:
                for msg in reversed(agent.memory.messages):
                    if msg.role == "assistant" and msg.content and msg.content.strip():
                        final_reply = msg.content.strip()
                        break

            tasks_store[task_id]["status"] = "completed"
            tasks_store[task_id]["result"] = final_reply or result or ""
            await q.put({
                "type": "task_done",
                "status": "completed",
                "result": (final_reply or result or "")[:4000],
            })
        except Exception as e:
            error_msg = f"{str(e)}\n{traceback.format_exc()}"
            tasks_store[task_id]["status"] = "failed"
            tasks_store[task_id]["error"] = str(e)
            await q.put({"type": "task_error", "error": str(e)})
        finally:
            _active_task_id = None
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

    return StreamingResponse(
        run_agent_and_stream(task_id, req.prompt),
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
