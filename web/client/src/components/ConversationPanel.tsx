// Nexus UI — Conversation Panel (Center)
// Design: Pure white, message bubbles, collapsible step tree with tool call badges
// Manus-style: user bubble (gray bg) + assistant (logo + text + steps)

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Globe, Terminal, FileText, Search, Code2, ClipboardList, MessageCircle, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Streamdown } from "streamdown";
import { useAgent } from "@/contexts/AgentContext";
import { ChatMessage, Step, ToolCall } from "@/lib/types";
import { getToolLabel } from "@/lib/mockData";
import { cn } from "@/lib/utils";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030293317/CB35CGSaC7cLf4fYJsm4GM/nexus-logo-evZjb9ALTdVtmGtUot3NJU.webp";
const EMPTY_BG_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030293317/CB35CGSaC7cLf4fYJsm4GM/nexus-empty-bg-jc2ABotH7aoaqjZW56CrEL.webp";

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

function ToolCallBadge({ tool }: { tool: ToolCall }) {
  return (
    <span className="tool-badge">
      <ToolIcon type={tool.type} />
      <span className="font-medium">{getToolLabel(tool.name)}</span>
      {tool.args && (
        <span className="text-gray-400 font-mono truncate max-w-[200px]">{tool.args}</span>
      )}
      {tool.status === "running" && (
        <Loader2 size={10} className="animate-spin text-blue-400 ml-0.5" />
      )}
      {tool.status === "done" && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />
      )}
    </span>
  );
}

function StepItem({ step }: { step: Step }) {
  const [expanded, setExpanded] = useState(step.status === "running" || step.expanded);

  useEffect(() => {
    if (step.status === "running") setExpanded(true);
  }, [step.status]);

  return (
    <div className="step-item">
      {/* Status dot */}
      <div className="mt-1 shrink-0">
        {step.status === "completed" && (
          <CheckCircle2 size={14} className="text-emerald-500" />
        )}
        {step.status === "running" && (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 step-dot-active" />
        )}
        {step.status === "failed" && (
          <AlertCircle size={14} className="text-red-400" />
        )}
        {step.status !== "running" && step.status !== "completed" && step.status !== "failed" && (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-200" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Step title */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors w-full text-left"
        >
          {expanded ? <ChevronDown size={13} className="text-gray-400 shrink-0" /> : <ChevronRight size={13} className="text-gray-400 shrink-0" />}
          <span className="truncate">{step.title}</span>
        </button>

        {/* Tool calls */}
        {expanded && step.toolCalls.length > 0 && (
          <div className="mt-1.5 ml-4 flex flex-col gap-1.5">
            {step.toolCalls.map(tool => (
              <ToolCallBadge key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="typing-dot w-1.5 h-1.5 rounded-full bg-gray-400"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function UserMessage({ msg }: { msg: ChatMessage }) {
  return (
    <div className="msg-enter flex justify-end mb-6">
      <div className="max-w-[75%] bg-[#F0F0EE] rounded-2xl rounded-tr-sm px-4 py-3">
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  );
}

function AssistantMessage({ msg }: { msg: ChatMessage }) {
  const hasSteps = msg.steps && msg.steps.length > 0;

  return (
    <div className="msg-enter mb-6">
      {/* Agent header */}
      <div className="flex items-center gap-2 mb-3">
        <img src={LOGO_URL} alt="Nexus" className="w-5 h-5 object-contain" />
        <span className="text-sm font-semibold text-gray-900">Nexus</span>
        {msg.isStreaming && <TypingIndicator />}
      </div>

      {/* Steps */}
      {hasSteps && (
        <div className="mb-3 ml-7 border-l-2 border-[#E8E8E5] pl-4 space-y-1">
          {msg.steps!.map(step => (
            <StepItem key={step.id} step={step} />
          ))}
        </div>
      )}

      {/* Message content */}
      {msg.content && (
        <div className="ml-7 text-sm text-gray-800 leading-relaxed prose prose-sm max-w-none prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-900 prose-pre:text-gray-100">
          <Streamdown>{msg.content}</Streamdown>
        </div>
      )}
    </div>
  );
}

export default function ConversationPanel() {
  const { activeTask, isRunning } = useAgent();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeTask?.messages]);

  // Empty state
  if (!activeTask || activeTask.messages.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center relative overflow-hidden"
        style={{
          backgroundImage: `url(${EMPTY_BG_URL})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="text-center max-w-sm px-6">
          <img src={LOGO_URL} alt="Nexus" className="w-12 h-12 mx-auto mb-4 opacity-80" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">有什么可以帮你的？</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Nexus 是一个全能 AI 助手，可以帮你搜索信息、编写代码、分析数据、规划任务等。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Task title bar */}
      <div className="px-6 py-3 border-b border-[#F0F0EE] flex items-center gap-3">
        <h1 className="text-sm font-semibold text-gray-900 truncate flex-1">
          {activeTask.title}
        </h1>
        {isRunning && (
          <div className="flex items-center gap-1.5 text-xs text-blue-500">
            <Loader2 size={12} className="animate-spin" />
            <span>执行中</span>
          </div>
        )}
        {activeTask.status === "completed" && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-500">
            <CheckCircle2 size={12} />
            <span>已完成</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">
        {activeTask.messages.map(msg => (
          msg.role === "user"
            ? <UserMessage key={msg.id} msg={msg} />
            : <AssistantMessage key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
