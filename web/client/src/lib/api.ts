// Nexus UI — Backend API Client
// Connects to api_server.py (POST /api/tasks → SSE stream)
// Backend default: http://localhost:8765

// ── SSE Event Types (matches api_server.py push_event calls) ─────────────────

export interface SSEEvent {
  type:
    | "task_start"
    | "step_start"
    | "step_end"
    | "think"
    | "act_start"
    | "tool_start"
    | "tool_end"
    | "message"
    | "log"
    | "task_done"
    | "task_error"
    | "stream_end"
    | "heartbeat"
    | "screenshot";

  // screenshot
  image?: string;

  // task_start
  task_id?: string;
  prompt?: string;

  // step_start / step_end / think / act_start / tool_start / tool_end
  step?: number;
  title?: string;

  // think
  thoughts?: string;
  tool_names?: string[];
  will_act?: boolean;

  // act_start
  tool_count?: number;

  // tool_start / tool_end
  tool_name?: string;
  tool_args?: string;
  tool_result?: string;

  // message
  content?: string;

  // log
  level?: "info" | "warning" | "error" | "critical" | "debug" | "success";

  // task_done / stream_end
  status?: "completed" | "failed";
  result?: string;

  // task_error
  error?: string;
}

// ── Configuration ──────────────────────────────────────────────────────────────

function getBackendUrl(): string {
  // In dev mode, Vite proxies /api and /health to localhost:8765
  // In production, backend is served from same origin
  // VITE_BACKEND_URL can override for custom deployments
  const envUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined);
  if (envUrl) return envUrl.replace(/\/$/, "");
  // Use relative path — works with both Vite proxy (dev) and same-origin (prod)
  return "";
}

// ── Health check ───────────────────────────────────────────────────────────────

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getBackendUrl()}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.status === "ok";
  } catch {
    return false;
  }
}

// ── Stop task ────────────────────────────────────────────────────────────────

/**
 * POST /api/tasks/{taskId}/stop
 * Signals the backend to stop the running agent immediately.
 */
export async function stopBackendTask(taskId: string): Promise<boolean> {
  try {
    const res = await fetch(`${getBackendUrl()}/api/tasks/${taskId}/stop`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── SSE task streaming ─────────────────────────────────────────────────────────

/**
 * POST /api/tasks with { prompt }
 * Streams SSE events back via the response body.
 * Returns an AbortController so the caller can cancel.
 */
export function streamTask(
  prompt: string,
  onEvent: (event: SSEEvent) => void,
  onError: (err: Error) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;

          if (trimmed.startsWith("data:")) {
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") return;
            try {
              const event = JSON.parse(data) as SSEEvent;
              onEvent(event);
            } catch {
              // Ignore malformed JSON
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();

  return controller;
}
