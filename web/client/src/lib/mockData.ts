// Nexus UI — Mock Data & Simulation Utilities
// Provides: QUICK_TASKS, SAMPLE_TASKS, helper functions, and mock agent simulation

import { nanoid } from "nanoid";
import {
  Task,
  ChatMessage,
  Step,
  ToolCall,
  TerminalLine,
} from "@/lib/types";

// ── Quick task chip definitions ────────────────────────────────────────────────

export interface QuickTask {
  icon: string;
  label: string;
  prompt: string;
}

export const QUICK_TASKS: QuickTask[] = [
  {
    icon: "🔍",
    label: "搜索信息",
    prompt: "帮我搜索并整理关于人工智能最新进展的信息",
  },
  {
    icon: "📝",
    label: "撰写文章",
    prompt: "帮我写一篇关于可持续发展的文章，大约500字",
  },
  {
    icon: "💻",
    label: "编写代码",
    prompt: "帮我用 Python 写一个简单的数据分析脚本",
  },
  {
    icon: "📊",
    label: "数据分析",
    prompt: "帮我分析一组销售数据并生成可视化图表",
  },
  {
    icon: "🌐",
    label: "浏览网页",
    prompt: "帮我浏览并总结 Hacker News 上今天的热门文章",
  },
];

// ── Sample tasks for initial state ────────────────────────────────────────────

export const SAMPLE_TASKS: Task[] = [];

// ── Message factory helpers ────────────────────────────────────────────────────

export function createUserMessage(content: string): ChatMessage {
  return {
    id: nanoid(),
    role: "user",
    content,
    timestamp: Date.now(),
  };
}

export function createAssistantMessage(): ChatMessage {
  return {
    id: nanoid(),
    role: "assistant",
    content: "",
    steps: [],
    isStreaming: true,
    timestamp: Date.now(),
  };
}

// ── Task title generation ──────────────────────────────────────────────────────

export function generateTaskTitle(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= 20) return trimmed;
  return trimmed.slice(0, 20) + "…";
}

// ── Timestamp formatting ───────────────────────────────────────────────────────

export function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;

  return new Date(ts).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

// ── Tool label mapping ─────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  browser: "浏览器",
  terminal: "终端",
  file: "文件",
  search: "搜索",
  python: "Python",
  planning: "规划",
  ask_human: "询问用户",
  terminate: "完成",
  other: "工具",
};

export function getToolLabel(type: string): string {
  return TOOL_LABELS[type] ?? type;
}

// ── Agent event types (used by mock simulation) ────────────────────────────────

export interface AgentEvent {
  type:
    | "message_chunk"
    | "step_start"
    | "step_end"
    | "tool_start"
    | "tool_end"
    | "terminal_line"
    | "message_end"
    | "task_done";
  payload: Record<string, unknown>;
}

// ── Mock agent execution simulation ───────────────────────────────────────────

export function simulateAgentExecution(prompt: string): AgentEvent[] {
  const events: AgentEvent[] = [];
  const stepId1 = nanoid();
  const stepId2 = nanoid();
  const toolId1 = nanoid();
  const toolId2 = nanoid();

  // Step 1: Planning
  events.push({
    type: "step_start",
    payload: { stepId: stepId1, index: 1, title: "分析任务需求" },
  });
  events.push({
    type: "terminal_line",
    payload: {
      content: `ubuntu@nexus:~$ # 开始处理: ${prompt.slice(0, 60)}`,
      type: "prompt" as TerminalLine["type"],
    },
  });
  events.push({
    type: "tool_start",
    payload: {
      stepId: stepId1,
      toolId: toolId1,
      type: "planning",
      name: "planning",
      args: "制定执行计划",
    },
  });
  events.push({
    type: "terminal_line",
    payload: { content: "正在分析任务...", type: "output" as TerminalLine["type"] },
  });
  events.push({
    type: "tool_end",
    payload: {
      stepId: stepId1,
      toolId: toolId1,
      result: "计划制定完成",
    },
  });
  events.push({ type: "step_end", payload: { stepId: stepId1 } });

  // Step 2: Execution
  events.push({
    type: "step_start",
    payload: { stepId: stepId2, index: 2, title: "执行任务" },
  });
  events.push({
    type: "tool_start",
    payload: {
      stepId: stepId2,
      toolId: toolId2,
      type: "terminal",
      name: "bash",
      args: `# 执行: ${prompt.slice(0, 40)}`,
    },
  });
  events.push({
    type: "terminal_line",
    payload: { content: "任务执行中...", type: "output" as TerminalLine["type"] },
  });
  events.push({
    type: "tool_end",
    payload: {
      stepId: stepId2,
      toolId: toolId2,
      result: "执行完成",
    },
  });
  events.push({ type: "step_end", payload: { stepId: stepId2 } });

  // Stream response text
  const response = `我已收到您的任务：**${prompt.slice(0, 50)}${prompt.length > 50 ? "…" : ""}**\n\n由于当前处于离线模式，这是一个模拟响应。请连接到 OpenManus 后端以获取真实的 AI 执行结果。\n\n如需启动后端，请运行：\n\`\`\`bash\npython run_manus.py\n\`\`\``;

  for (const char of response) {
    events.push({
      type: "message_chunk",
      payload: { chunk: char },
    });
  }

  events.push({ type: "message_end", payload: {} });
  events.push({ type: "task_done", payload: {} });

  return events;
}
