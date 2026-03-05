// Nexus UI — Input Bar (Bottom of Conversation Panel)
// Design: Clean white input with rounded border, send button, quick task chips
// Manus-style: multi-line, attachment icon, quick suggestions

import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { ArrowUp, Paperclip, Loader2, MonitorX, Monitor } from "lucide-react";
import { useAgent } from "@/contexts/AgentContext";
import { QUICK_TASKS } from "@/lib/mockData";
import { cn } from "@/lib/utils";

export default function InputBar() {
  const { sendMessage, isRunning, activeTask, isPanelOpen, togglePanel } = useAgent();
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
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const isEmpty = !activeTask || activeTask.messages.length === 0;

  return (
    <div className="border-t border-[#F0F0EE] bg-white px-4 py-3">
      {/* Quick task chips — only show when empty */}
      {isEmpty && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {QUICK_TASKS.map(qt => (
            <button
              key={qt.label}
              onClick={() => setInput(qt.prompt)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 bg-[#F5F5F3] hover:bg-[#EBEBEA] border border-[#E8E8E5] hover:border-gray-300 transition-all duration-150"
            >
              <span>{qt.icon}</span>
              <span>{qt.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className={cn(
        "flex items-end gap-2 rounded-xl border transition-all duration-150",
        "bg-white",
        input.length > 0 || isRunning
          ? "border-gray-300 shadow-sm"
          : "border-[#E8E8E5] hover:border-gray-300"
      )}>
        {/* Attachment button */}
        <button
          className="p-2.5 text-gray-400 hover:text-gray-600 transition-colors shrink-0 self-end mb-0.5"
          title="添加附件"
        >
          <Paperclip size={16} />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="分配任务或提出问题..."
          disabled={isRunning}
          rows={1}
          className={cn(
            "flex-1 resize-none bg-transparent text-sm text-gray-800 placeholder-gray-400",
            "py-2.5 outline-none leading-relaxed",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          style={{ maxHeight: 160 }}
        />

        {/* Right actions */}
        <div className="flex items-center gap-1 p-1.5 shrink-0 self-end">
          {/* Toggle computer panel */}
          <button
            onClick={togglePanel}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
            title={isPanelOpen ? "隐藏电脑面板" : "显示电脑面板"}
          >
            {isPanelOpen ? <MonitorX size={15} /> : <Monitor size={15} />}
          </button>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || isRunning}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150",
              input.trim() && !isRunning
                ? "bg-gray-900 text-white hover:bg-gray-700 shadow-sm"
                : "bg-gray-100 text-gray-300 cursor-not-allowed"
            )}
          >
            {isRunning ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ArrowUp size={14} />
            )}
          </button>
        </div>
      </div>

      {/* Hint */}
      <p className="text-[10px] text-gray-300 text-center mt-2">
        按 Enter 发送 · Shift+Enter 换行
      </p>
    </div>
  );
}
