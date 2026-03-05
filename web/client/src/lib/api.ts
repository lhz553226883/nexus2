// Nexus UI — Backend API Client
// Handles: health check, SSE task streaming

// ── SSE Event Types ────────────────────────────────────────────────────────────

export interface SSEEvent {
  type:
    | "step_start"
    | "step_end"
    | "think"
    | "tool_start"
    | "tool_end"
    | "message"
    | "log"
    | "task_done"
    | "task_error"
    | "stream_end";
  // step_start / step_end / think / tool_start / tool_end
  step?: number;
  title?: string;
  thoughts?: string;
  tool_names?: string[];
  tool_name?: string;
  tool_args?: string;
  tool_result?: string;
  // message
  content?: string;
  // log
  level?: "info" | "warning" | "error" | "critical";
  // task_done / stream_end
  status?: "completed" | "failed";
  // task_error
  error?: string;
}

// ── Configuration ──────────────────────────────────────────────────────────────

const BACKEND_BASE_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  "http://localhost:8000";

// ── Health check ───────────────────────────────────────────────────────────────

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── SSE task streaming ─────────────────────────────────────────────────────────

/**
 * Start a streaming task via Server-Sent Events.
 * Returns an AbortController so the caller can cancel the stream.
 */
export function streamTask(
  prompt: string,
  onEvent: (event: SSEEvent) => void,
  onError: (err: Error) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/task/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
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
              // Ignore malformed JSON lines
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
