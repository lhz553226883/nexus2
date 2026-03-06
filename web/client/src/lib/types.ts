// Nexus UI — Core Type Definitions

export type TaskStatus = "idle" | "running" | "completed" | "failed";

export type ToolCallType =
  | "browser"
  | "terminal"
  | "file"
  | "search"
  | "python"
  | "planning"
  | "ask_human"
  | "terminate"
  | "other";

export interface ToolCall {
  id: string;
  type: ToolCallType;
  name: string;
  args: string;
  status: "running" | "done" | "error";
  result?: string;
  timestamp: number;
}

export interface Step {
  id: string;
  index: number;
  title: string;
  status: "running" | "completed" | "failed";
  toolCalls: ToolCall[];
  expanded: boolean;
  timestamp: number;
  // Optional structured thinking fields (from backend "think" events)
  observation?: string;
  thought?: string;
  plan?: string;
  action?: string;
  answer?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: Step[];
  isStreaming?: boolean;
  timestamp: number;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  messages: ChatMessage[];
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TerminalLine {
  id: string;
  type: "prompt" | "output" | "error" | "command";
  content: string;
  timestamp: number;
}

export interface ComputerPanelState {
  type: "idle" | "terminal" | "browser" | "file";
  title: string;
  subtitle?: string;
  url?: string;
  screenshot?: string;
  terminalLines?: TerminalLine[];
}
