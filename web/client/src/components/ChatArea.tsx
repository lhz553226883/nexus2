// Nexus UI — Chat Area (open-webui style)
// Includes: header bar, message list, input bar

import { useState, useRef, useCallback, useEffect, KeyboardEvent } from "react";
import {
  ArrowUp,
  Square,
  Paperclip,
  Terminal,
  MonitorX,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Globe,
  FileText,
  Search,
  Code2,
  ClipboardList,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { useAgent } from "@/contexts/AgentContext";
import { cn } from "@/lib/utils";
import { QUICK_TASKS, getToolLabel } from "@/lib/mockData";
import type { ChatMessage, Step, ToolCall } from "@/lib/types";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663030293317/CB35CGSaC7cLf4fYJsm4GM/nexus-logo-evZjb9ALTdVtmGtUot3NJU.webp";

// ── Tool icon ─────────────────────────────────────────────────────────────────
function ToolIcon({ type }: { type: string }) {
  const cls = "w-3 h-3 shrink-0";
  if (type === "browser") return <Globe className={cls} />;
  if (type === "terminal") return <Terminal className={cls} />;
  if (type === "file") return <FileText className={cls} />;
  if (type === "search") return <Search className={cls} />;
  if (type === "python") return <Code2 className={cls} />;
  if (type === "planning") return <ClipboardList className={cls} />;
  if (type === "ask_human") return <MessageCircle className={cls} />;
  return <Terminal className={cls} />;
}

// ── Tool call badge ───────────────────────────────────────────────────────────
function ToolCallBadge({ tool }: { tool: ToolCall }) {
  return (
    <span className="tool-badge">
      <ToolIcon type={tool.type} />
      <span className="truncate max-w-[200px]">{tool.name}</span>
      {tool.status === "running" && (
        <Loader2 size={9} className="animate-spin shrink-0 text-blue-400" />
      )}
      {tool.status === "done" && (
        <CheckCircle2 size={9} className="shrink-0 text-emerald-400" />
      )}
    </span>
  );
}

// ── Step item ─────────────────────────────────────────────────────────────────
function StepItem({ step }: { step: Step }) {
  const [expanded, setExpanded] = useState(step.expanded ?? true);
  return (
    <div className="flex items-start gap-2.5 py-1">
      {/* Status indicator */}
      <div className="mt-0.5 shrink-0">
        {step.status === "running" && (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 step-dot-active" />
        )}
        {step.status === "completed" && (
          <CheckCircle2 size={14} className="text-emerald-400" />
        )}
        {step.status === "failed" && (
          <AlertCircle size={14} className="text-red-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors w-full text-left"
        >
          {expanded ? (
            <ChevronDown size={12} className="text-foreground/30 shrink-0" />
          ) : (
            <ChevronRight size={12} className="text-foreground/30 shrink-0" />
          )}
          <span className="truncate">{step.title}</span>
        </button>
        {expanded && step.toolCalls.length > 0 && (
          <div className="mt-1.5 ml-4 flex flex-col gap-1">
            {step.toolCalls.map((tool) => (
              <ToolCallBadge key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="typing-dot w-1.5 h-1.5 rounded-full bg-foreground/30"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── User message ──────────────────────────────────────────────────────────────
function UserMessage({ msg }: { msg: ChatMessage }) {
  return (
    <div className="msg-enter flex justify-end mb-6 px-4 md:px-8">
      <div className="max-w-[80%] bg-accent text-accent-foreground rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  );
}

// ── Assistant message ─────────────────────────────────────────────────────────
function AssistantMessage({ msg }: { msg: ChatMessage }) {
  const hasSteps = msg.steps && msg.steps.length > 0;
  return (
    <div className="msg-enter mb-6 px-4 md:px-8">
      {/* Agent header */}
      <div className="flex items-center gap-2 mb-2.5">
        <img
          src={LOGO_URL}
          alt="Nexus"
          className="w-6 h-6 object-contain rounded-full bg-sidebar-accent p-0.5"
        />
        <span className="text-sm font-semibold text-foreground">Nexus</span>
        {msg.isStreaming && <TypingIndicator />}
      </div>

      {/* Steps */}
      {hasSteps && (
        <div className="mb-3 ml-8 pl-3 border-l-2 border-border space-y-0.5">
          {msg.steps!.map((step) => (
            <StepItem key={step.id} step={step} />
          ))}
        </div>
      )}

      {/* Content */}
      {msg.content && (
        <div className="ml-8 text-sm text-foreground/90 leading-relaxed prose prose-sm max-w-none dark:prose-invert">
          <Streamdown>{msg.content}</Streamdown>
        </div>
      )}

      {/* Empty streaming */}
      {msg.isStreaming && !msg.content && !hasSteps && (
        <div className="ml-8">
          <TypingIndicator />
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onQuickTask }: { onQuickTask: (prompt: string) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
      {/* Logo + title */}
      <div className="flex flex-col items-center gap-3 mb-10">
        <img
          src={LOGO_URL}
          alt="Nexus"
          className="w-14 h-14 object-contain rounded-2xl opacity-90"
        />
        <h1 className="text-2xl font-semibold text-foreground">
          有什么可以帮你的？
        </h1>
        <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed">
          Nexus 是全能 AI 助手，可搜索信息、编写代码、分析数据、执行任务。
        </p>
      </div>

      {/* Suggested prompts */}
      <div className="w-full max-w-xl">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Sparkles size={12} />
          建议任务
        </p>
        <div className="grid grid-cols-1 gap-2">
          {QUICK_TASKS.map((qt) => (
            <button
              key={qt.label}
              onClick={() => onQuickTask(qt.prompt)}
              className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-border/80 transition-all duration-150 text-left group"
            >
              <span className="text-base mt-0.5">{qt.icon}</span>
              <div>
                <p className="text-sm font-medium text-foreground group-hover:text-foreground">
                  {qt.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {qt.prompt}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Input Bar ─────────────────────────────────────────────────────────────────
function InputBar() {
  const { sendMessage, isRunning, togglePanel, isPanelOpen } = useAgent();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isRunning) return;
    sendMessage(trimmed);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isRunning, sendMessage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  };

  return (
    <div className="px-4 pb-4 pt-2 shrink-0">
      <div
        className={cn(
          "relative flex flex-col rounded-2xl border bg-card shadow-sm transition-all duration-150",
          input.length > 0 || isRunning
            ? "border-border shadow-md"
            : "border-border/60 hover:border-border",
        )}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="发送消息给 Nexus..."
          disabled={isRunning}
          rows={1}
          className={cn(
            "w-full resize-none bg-transparent text-sm text-foreground placeholder-muted-foreground",
            "px-4 pt-3.5 pb-2 outline-none leading-relaxed",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
          style={{ maxHeight: 180 }}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 pb-2.5">
          <div className="flex items-center gap-1">
            {/* Attachment */}
            <button
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="添加附件"
            >
              <Paperclip size={15} />
            </button>
            {/* Toggle terminal panel */}
            <button
              onClick={togglePanel}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                isPanelOpen
                  ? "text-blue-400 hover:text-blue-300 hover:bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
              title={isPanelOpen ? "隐藏终端" : "显示终端"}
            >
              {isPanelOpen ? <MonitorX size={15} /> : <Terminal size={15} />}
            </button>
          </div>

          {/* Send / Stop */}
          <button
            onClick={handleSend}
            disabled={!input.trim() && !isRunning}
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150 shadow-sm",
              input.trim() && !isRunning
                ? "bg-foreground text-background hover:opacity-85"
                : isRunning
                  ? "bg-foreground/10 text-foreground/60 cursor-not-allowed"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {isRunning ? (
              <Square size={12} className="fill-current" />
            ) : (
              <ArrowUp size={14} />
            )}
          </button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground/40 text-center mt-2">
        按 Enter 发送 · Shift+Enter 换行
      </p>
    </div>
  );
}

// ── Chat Header ───────────────────────────────────────────────────────────────
function ChatHeader() {
  const { activeTask, isRunning, backendOnline } = useAgent();

  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {activeTask ? (
          <>
            <h1 className="text-sm font-semibold text-foreground truncate">
              {activeTask.title}
            </h1>
            {isRunning && (
              <div className="flex items-center gap-1.5 text-xs text-blue-400 shrink-0">
                <Loader2 size={11} className="animate-spin" />
                <span>执行中</span>
              </div>
            )}
            {activeTask.status === "completed" && !isRunning && (
              <div className="flex items-center gap-1 text-xs text-emerald-400 shrink-0">
                <CheckCircle2 size={11} />
                <span>已完成</span>
              </div>
            )}
            {activeTask.status === "failed" && (
              <div className="flex items-center gap-1 text-xs text-red-400 shrink-0">
                <AlertCircle size={11} />
                <span>失败</span>
              </div>
            )}
          </>
        ) : (
          <h1 className="text-sm font-medium text-muted-foreground">新对话</h1>
        )}
      </div>

      {/* Backend status */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
        <div
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            backendOnline ? "bg-emerald-400 pulse-soft" : "bg-yellow-500",
          )}
        />
        <span>{backendOnline ? "已连接后端" : "模拟模式"}</span>
      </div>
    </div>
  );
}

// ── Main ChatArea ─────────────────────────────────────────────────────────────
export default function ChatArea() {
  const { activeTask } = useAgent();
  const { sendMessage } = useAgent();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeTask?.messages]);

  const isEmpty = !activeTask || activeTask.messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <ChatHeader />

      {/* Messages / Empty state */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isEmpty ? (
          <div className="flex flex-col h-full">
            <EmptyState onQuickTask={(prompt) => sendMessage(prompt)} />
          </div>
        ) : (
          <div className="py-6 max-w-3xl mx-auto w-full">
            {activeTask!.messages.map((msg) =>
              msg.role === "user" ? (
                <UserMessage key={msg.id} msg={msg} />
              ) : (
                <AssistantMessage key={msg.id} msg={msg} />
              ),
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="max-w-3xl mx-auto w-full">
        <InputBar />
      </div>
    </div>
  );
}
