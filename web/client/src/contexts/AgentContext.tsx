// Nexus UI — Agent Context
// Manages global task state, message streaming, and computer panel state
// Supports: real OpenManus backend (SSE) + mock simulation fallback

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { nanoid } from "nanoid";
import {
  Task,
  ChatMessage,
  Step,
  ToolCall,
  ComputerPanelState,
  TerminalLine,
  TaskStatus,
} from "@/lib/types";
import {
  SAMPLE_TASKS,
  createUserMessage,
  createAssistantMessage,
  simulateAgentExecution,
  generateTaskTitle,
  AgentEvent,
} from "@/lib/mockData";
import { checkBackendHealth, streamTask, stopBackendTask, SSEEvent } from "@/lib/api";

interface AgentContextValue {
  tasks: Task[];
  activeTaskId: string | null;
  activeTask: Task | null;
  computerPanel: ComputerPanelState;
  isPanelOpen: boolean;
  isRunning: boolean;
  backendOnline: boolean;
  setActiveTaskId: (id: string | null) => void;
  createNewTask: () => void;
  sendMessage: (content: string) => void;
  stopTask: () => void;
  togglePanel: () => void;
}

const defaultPanel: ComputerPanelState = {
  type: "idle",
  title: "Nexus's Computer",
  terminalLines: [],
};

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(SAMPLE_TASKS);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [computerPanel, setComputerPanel] = useState<ComputerPanelState>(
    defaultPanel,
  );
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Track the current task+msg for cleanup on stop
  const activeRunRef = useRef<{ taskId: string; msgId: string; backendTaskId?: string } | null>(null);

  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null;

  // Check backend health on mount and every 30s
  useEffect(() => {
    const check = async () => {
      const online = await checkBackendHealth();
      setBackendOnline(online);
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const updateMessage = useCallback(
    (
      taskId: string,
      msgId: string,
      updater: (m: ChatMessage) => ChatMessage,
    ) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            messages: t.messages.map((m) =>
              m.id === msgId ? updater(m) : m,
            ),
          };
        }),
      );
    },
    [],
  );

  const addTerminalLine = useCallback(
    (content: string, type: TerminalLine["type"] = "output") => {
      setComputerPanel((prev) => ({
        ...prev,
        terminalLines: [
          ...(prev.terminalLines || []),
          { id: nanoid(), type, content, timestamp: Date.now() },
        ],
      }));
    },
    [],
  );

  const createNewTask = useCallback(() => {
    const newTask: Task = {
      id: nanoid(),
      title: "新任务",
      status: "idle",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setTasks((prev) => [newTask, ...prev]);
    setActiveTaskId(newTask.id);
    setComputerPanel(defaultPanel);
  }, []);

  // ── Shared finalize helper ────────────────────────────────────────────────────
  // Marks all running steps as completed and clears isRunning state
  const finalizeRun = useCallback(
    (taskId: string, msgId: string, status: "completed" | "failed" | "stopped") => {
      // Mark all still-running steps as completed (prevent "思考中..." stuck)
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            status: status === "stopped" ? "completed" : status,
            summary:
              status === "failed"
                ? "执行失败"
                : status === "stopped"
                  ? "已停止"
                  : "任务已完成",
            updatedAt: Date.now(),
            messages: t.messages.map((m) => {
              if (m.id !== msgId) return m;
              return {
                ...m,
                isStreaming: false,
                steps: (m.steps || []).map((s) =>
                  s.status === "running"
                    ? { ...s, status: "completed" as const }
                    : s,
                ),
              };
            }),
          };
        }),
      );
      setIsRunning(false);
      runningRef.current = false;
      activeRunRef.current = null;
      setComputerPanel((prev) => ({
        ...prev,
        subtitle:
          status === "failed"
            ? "Task failed"
            : status === "stopped"
              ? "Task stopped"
              : "Task completed",
      }));
    },
    [],
  );

  // ── Process a single AgentEvent (used by mock path) ─────────────────────────
  const processEvent = useCallback(
    (taskId: string, assistantMsgId: string, event: AgentEvent) => {
      const { type, payload } = event;

      if (type === "message_chunk") {
        updateMessage(taskId, assistantMsgId, (m) => ({
          ...m,
          content: m.content + (payload.chunk as string),
        }));
      } else if (type === "step_start") {
        const step: Step = {
          id: payload.stepId as string,
          index: payload.index as number,
          title: payload.title as string,
          status: "running",
          toolCalls: [],
          expanded: true,
          timestamp: Date.now(),
        };
        updateMessage(taskId, assistantMsgId, (m) => ({
          ...m,
          steps: [...(m.steps || []), step],
        }));
      } else if (type === "step_end") {
        updateMessage(taskId, assistantMsgId, (m) => ({
          ...m,
          steps: (m.steps || []).map((s) =>
            s.id === payload.stepId
              ? { ...s, status: "completed" as const }
              : s,
          ),
        }));
      } else if (type === "tool_start") {
        const toolCall: ToolCall = {
          id: payload.toolId as string,
          type: payload.type as ToolCall["type"],
          name: payload.name as string,
          args: payload.args as string,
          status: "running",
          timestamp: Date.now(),
        };
        updateMessage(taskId, assistantMsgId, (m) => ({
          ...m,
          steps: (m.steps || []).map((s) =>
            s.id === payload.stepId
              ? { ...s, toolCalls: [...s.toolCalls, toolCall] }
              : s,
          ),
        }));
        setComputerPanel((prev) => ({
          ...prev,
          subtitle: `${toolCall.name}: ${toolCall.args.slice(0, 50)}`,
        }));
      } else if (type === "tool_end") {
        updateMessage(taskId, assistantMsgId, (m) => ({
          ...m,
          steps: (m.steps || []).map((s) =>
            s.id === payload.stepId
              ? {
                  ...s,
                  toolCalls: s.toolCalls.map((tc) =>
                    tc.id === payload.toolId
                      ? {
                          ...tc,
                          status: "done" as const,
                          result: payload.result as string,
                        }
                      : tc,
                  ),
                }
              : s,
          ),
        }));
      } else if (type === "terminal_line") {
        addTerminalLine(
          payload.content as string,
          payload.type as TerminalLine["type"],
        );
      } else if (type === "message_end") {
        updateMessage(taskId, assistantMsgId, (m) => ({
          ...m,
          isStreaming: false,
        }));
      } else if (type === "task_done") {
        finalizeRun(taskId, assistantMsgId, "completed");
      }
    },
    [updateMessage, addTerminalLine, finalizeRun],
  );

  // ── Real backend path (SSE) ─────────────────────────────────────────────────
  const runWithBackend = useCallback(
    (taskId: string, assistantMsgId: string, prompt: string) => {
      // Track step IDs for mapping backend step numbers to frontend step IDs
      const stepIdMap: Record<number, string> = {};

      const controller = streamTask(
        prompt,
        (event: SSEEvent) => {
          // ── task_start: capture backend task_id for stop API ──
          if (event.type === "task_start" && event.task_id) {
            if (activeRunRef.current) {
              activeRunRef.current.backendTaskId = event.task_id;
            }
          }

          // ── step_start: Agent begins a new step ──
          else if (event.type === "step_start" && event.step !== undefined) {
            const stepId = nanoid();
            stepIdMap[event.step] = stepId;
            const step: Step = {
              id: stepId,
              index: event.step,
              title: event.title || `步骤 ${event.step}`,
              status: "running",
              toolCalls: [],
              expanded: true,
              timestamp: Date.now(),
            };
            updateMessage(taskId, assistantMsgId, (m) => ({
              ...m,
              steps: [...(m.steps || []), step],
            }));
            addTerminalLine(
              `── Step ${event.step}: ${event.title || "Processing..."} ──`,
              "prompt",
            );
          }

          // ── think: LLM returned structured thinking (观察/思考/计划/行动/回答) and tool selection ──
          else if (event.type === "think" && event.step !== undefined) {
            const stepId = stepIdMap[event.step];
            if (stepId) {
              // Update step title with tool info or mark as "思考完成"
              const toolsStr =
                event.tool_names && event.tool_names.length > 0
                  ? `调用 ${event.tool_names.join(", ")}`
                  : "思考完成";
              updateMessage(taskId, assistantMsgId, (m) => ({
                ...m,
                steps: (m.steps || []).map((s) =>
                  s.id === stepId
                    ? {
                        ...s,
                        title: `步骤 ${event.step}: ${toolsStr}`,
                      }
                    : s,
                ),
              }));
            }
            // Prefer structured fields if present, fall back to raw thoughts.
            // Also store them on the Step so the main chat UI can render them.
            const observation = (event as any).observation as string | undefined;
            const thought = (event as any).thought as string | undefined;
            const plan = (event as any).plan as string | undefined;
            const action = (event as any).action as string | undefined;
            const answer = (event as any).answer as string | undefined;

            if (stepId && (observation || thought || plan || action || answer)) {
              updateMessage(taskId, assistantMsgId, (m) => ({
                ...m,
                steps: (m.steps || []).map((s) =>
                  s.id === stepId
                    ? {
                        ...s,
                        observation: observation ?? s.observation,
                        thought: thought ?? s.thought,
                        plan: plan ?? s.plan,
                        action: action ?? s.action,
                        answer: answer ?? s.answer,
                      }
                    : s,
                ),
              }));
            }

            // We now显示思考过程在步骤面板中，而不是终端。
            // If will_act is false, the step won't call act(), so we complete it here
            if (event.will_act === false && stepIdMap[event.step!]) {
              const stepId = stepIdMap[event.step!];
              updateMessage(taskId, assistantMsgId, (m) => ({
                ...m,
                steps: (m.steps || []).map((s) =>
                  s.id === stepId
                    ? { ...s, status: "completed" as const }
                    : s,
                ),
              }));
            }
          }

          // ── tool_start: A tool begins execution ──
          else if (event.type === "tool_start" && event.step !== undefined) {
            const stepId = stepIdMap[event.step];
            if (stepId) {
              const toolCall: ToolCall = {
                id: nanoid(),
                type: mapToolType(event.tool_name || ""),
                name: event.tool_name || "unknown",
                args: event.tool_args || "",
                status: "running",
                timestamp: Date.now(),
              };
              updateMessage(taskId, assistantMsgId, (m) => ({
                ...m,
                steps: (m.steps || []).map((s) =>
                  s.id === stepId
                    ? { ...s, toolCalls: [...s.toolCalls, toolCall] }
                    : s,
                ),
              }));
              const panelType = mapToolType(event.tool_name || "") === "browser"
                ? "browser"
                : mapToolType(event.tool_name || "") === "file"
                  ? "file"
                  : "terminal";
              setComputerPanel((prev) => ({
                ...prev,
                type: panelType as "terminal" | "browser" | "file",
                title: `Nexus is using ${event.tool_name || "Tool"}`,
                subtitle: (event.tool_args || "").slice(0, 80),
                // Clear previous screenshot so terminal view shows while tool runs
                screenshot: undefined,
              }));
              addTerminalLine(
                `🔧 ${event.tool_name}: ${(event.tool_args || "").slice(0, 100)}`,
                "command",
              );
            }
          }

          // ── tool_end: A tool finished execution ──
          else if (event.type === "tool_end" && event.step !== undefined) {
            const stepId = stepIdMap[event.step];
            if (stepId) {
              updateMessage(taskId, assistantMsgId, (m) => ({
                ...m,
                steps: (m.steps || []).map((s) =>
                  s.id === stepId
                    ? {
                        ...s,
                        toolCalls: s.toolCalls.map((tc) =>
                          tc.name === event.tool_name && tc.status === "running"
                            ? {
                                ...tc,
                                status: "done" as const,
                                result: event.tool_result || "",
                              }
                            : tc,
                        ),
                      }
                    : s,
                ),
              }));
              if (event.tool_result) {
                addTerminalLine(
                  event.tool_result.slice(0, 200),
                  "output",
                );
              }
            }
          }

          // ── step_end: Step completed ──
          else if (event.type === "step_end" && event.step !== undefined) {
            const stepId = stepIdMap[event.step];
            if (stepId) {
              updateMessage(taskId, assistantMsgId, (m) => ({
                ...m,
                steps: (m.steps || []).map((s) =>
                  s.id === stepId
                    ? { ...s, status: "completed" as const }
                    : s,
                ),
              }));
            }
          }

          // ── message: Assistant text content (overwrite, not append) ──
          // We intentionally ignore mid-stream message events here.
          // The final reply arrives via task_done.result and is set there.
          // This prevents duplicate/repeated content from each think step.
          // else if (event.type === "message") { ... }

          // ── screenshot: Sandbox display screenshot after tool execution ──
          else if (event.type === "screenshot" && event.image) {
            setComputerPanel((prev) => ({
              ...prev,
              // Keep the current panel type (terminal/file/browser) so the
              // tool status bar stays correct; screenshot is shown regardless
              screenshot: event.image,
              subtitle: event.tool_name ? `Task completed` : prev.subtitle,
            }));
          }

          // ── log: Agent log lines ──
          else if (event.type === "log" && event.content) {
            const lineType =
              event.level === "error" || event.level === "critical"
                ? "error"
                : "output";
            addTerminalLine(event.content, lineType);
          }

          // ── task_done / stream_end ──
          else if (
            event.type === "task_done" ||
            event.type === "stream_end"
          ) {
            // Set the final reply from task_done.result (overwrite, not append)
            if (event.type === "task_done" && event.result && event.result.trim()) {
              updateMessage(taskId, assistantMsgId, (m) => ({
                ...m,
                content: event.result!.trim(),
              }));
            }
            const finalStatus =
              event.status === "failed" ? "failed" : "completed";
            finalizeRun(taskId, assistantMsgId, finalStatus);
          }

          // ── task_error ──
          else if (event.type === "task_error") {
            updateMessage(taskId, assistantMsgId, (m) => ({
              ...m,
              content:
                m.content + `\n\n**错误：** ${event.error || "未知错误"}`,
            }));
            addTerminalLine(`❌ Error: ${event.error}`, "error");
            finalizeRun(taskId, assistantMsgId, "failed");
          }
        },
        (err: Error) => {
          if (activeRunRef.current?.taskId === taskId) {
            updateMessage(taskId, assistantMsgId, (m) => ({
              ...m,
              content: m.content + `\n\n**连接错误：** ${err.message}`,
            }));
            addTerminalLine(`❌ Connection error: ${err.message}`, "error");
            finalizeRun(taskId, assistantMsgId, "failed");
          }
        },
      );
      abortRef.current = controller;
    },
    [updateMessage, addTerminalLine, finalizeRun],
  );

  // ── Mock simulation path ──────────────────────────────────────────────────
  const runWithMock = useCallback(
    async (taskId: string, assistantMsgId: string, prompt: string) => {
      const events = simulateAgentExecution(prompt);
      for (const event of events) {
        if (!runningRef.current) {
          // Stopped early — finalize
          if (event.type !== "task_done") continue;
        }
        processEvent(taskId, assistantMsgId, event);
        const delay =
          event.type === "message_chunk"
            ? 30
            : event.type === "terminal_line"
              ? 120
              : event.type === "tool_start"
                ? 200
                : event.type === "step_start"
                  ? 300
                  : 150;
        await new Promise((r) => setTimeout(r, delay));
      }
    },
    [processEvent],
  );

  // ── stopTask ──────────────────────────────────────────────────────────────────
  const stopTask = useCallback(() => {
    if (!runningRef.current) return;
    // 1. Notify backend to stop the agent (fire-and-forget)
    if (activeRunRef.current?.backendTaskId) {
      stopBackendTask(activeRunRef.current.backendTaskId).catch(() => {});
    }
    // 2. Abort the SSE stream so no more events arrive
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // 3. Finalize UI state immediately
    if (activeRunRef.current) {
      const { taskId, msgId } = activeRunRef.current;
      finalizeRun(taskId, msgId, "stopped");
      addTerminalLine("⏹ Task stopped by user", "output");
    } else {
      setIsRunning(false);
      runningRef.current = false;
      activeRunRef.current = null;
    }
  }, [finalizeRun, addTerminalLine]);

  // ── Main sendMessage ──────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string) => {
      if (isRunning || !content.trim()) return;

      let taskId = activeTaskId;
      if (!taskId) {
        const newTask: Task = {
          id: nanoid(),
          title: generateTaskTitle(content),
          status: "idle",
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setTasks((prev) => [newTask, ...prev]);
        setActiveTaskId(newTask.id);
        taskId = newTask.id;
      }

      const userMsg = createUserMessage(content);
      const assistantMsg = createAssistantMessage();

      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            title:
              t.title === "新任务" ? generateTaskTitle(content) : t.title,
            status: "running" as TaskStatus,
            messages: [...t.messages, userMsg, assistantMsg],
            updatedAt: Date.now(),
          };
        }),
      );

      setIsRunning(true);
      runningRef.current = true;
      activeRunRef.current = { taskId, msgId: assistantMsg.id };

      setComputerPanel({
        type: "terminal",
        title: "Nexus is using Terminal",
        subtitle: "Processing your request...",
        terminalLines: [
          {
            id: nanoid(),
            type: "prompt",
            content: `ubuntu@nexus:~$ # Task: ${content.slice(0, 60)}`,
            timestamp: Date.now(),
          },
        ],
      });

      if (backendOnline) {
        runWithBackend(taskId, assistantMsg.id, content);
      } else {
        await runWithMock(taskId, assistantMsg.id, content);
      }
    },
    [activeTaskId, isRunning, backendOnline, runWithBackend, runWithMock],
  );

  const togglePanel = useCallback(() => {
    setIsPanelOpen((prev) => !prev);
  }, []);

  return (
    <AgentContext.Provider
      value={{
        tasks,
        activeTaskId,
        activeTask,
        computerPanel,
        isPanelOpen,
        isRunning,
        backendOnline,
        setActiveTaskId,
        createNewTask,
        sendMessage,
        stopTask,
        togglePanel,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used within AgentProvider");
  return ctx;
}

// ── Helper: map tool name to ToolType ─────────────────────────────────────────
function mapToolType(
  name: string,
): "browser" | "terminal" | "file" | "search" | "python" | "planning" | "ask_human" | "terminate" | "other" {
  const n = name.toLowerCase();
  if (n.includes("browser")) return "browser";
  if (n.includes("terminal") || n.includes("bash")) return "terminal";
  if (n.includes("file") || n.includes("str_replace") || n.includes("editor"))
    return "file";
  if (n.includes("search") || n.includes("web_search")) return "search";
  if (n.includes("python")) return "python";
  if (n.includes("planning") || n.includes("plan")) return "planning";
  if (n.includes("ask_human") || n.includes("human")) return "ask_human";
  if (n.includes("terminate") || n.includes("finish")) return "terminate";
  return "other";
}
