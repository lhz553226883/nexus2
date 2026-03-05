// Nexus UI — Terminal Panel (right side, dark theme)
// Shows real-time agent execution logs and tool calls

import { useRef, useEffect } from "react";
import { X, Minimize2, Globe, Terminal, FileText } from "lucide-react";
import { useAgent } from "@/contexts/AgentContext";
import type { TerminalLine } from "@/lib/types";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663030293317/CB35CGSaC7cLf4fYJsm4GM/nexus-logo-evZjb9ALTdVtmGtUot3NJU.webp";

// ── Panel type icon ───────────────────────────────────────────────────────────
function PanelTypeIcon({ type }: { type: string }) {
  const cls = "w-3.5 h-3.5";
  if (type === "browser") return <Globe className={cls} />;
  if (type === "file") return <FileText className={cls} />;
  return <Terminal className={cls} />;
}

// ── Terminal line ─────────────────────────────────────────────────────────────
function TerminalLineItem({ line }: { line: TerminalLine }) {
  if (line.type === "command") {
    return (
      <div className="flex items-start gap-1.5 font-mono text-xs">
        <span className="text-[#4EC9B0] shrink-0">$</span>
        <span className="text-[#9CDCFE] break-all">{line.content}</span>
      </div>
    );
  }
  if (line.type === "error") {
    return (
      <div className="font-mono text-xs text-[#F44747] pl-4 break-all">
        {line.content}
      </div>
    );
  }
  if (line.type === "prompt") {
    return (
      <div className="flex items-center gap-1 font-mono text-xs">
        <span className="text-[#4EC9B0]">{line.content}</span>
        <span className="terminal-cursor inline-block w-2 h-3.5 bg-[#4EC9B0] ml-0.5" />
      </div>
    );
  }
  return (
    <div className="font-mono text-xs text-[#9CDCFE]/80 pl-4 leading-relaxed break-all">
      {line.content}
    </div>
  );
}

// ── Idle view ─────────────────────────────────────────────────────────────────
function IdleView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-25">
      <img
        src={LOGO_URL}
        alt="Nexus"
        className="w-10 h-10 object-contain invert"
      />
      <div className="text-center">
        <p className="text-xs text-gray-400 font-mono">等待任务执行...</p>
        <p className="text-[10px] text-gray-600 mt-1">工具调用时将在此显示</p>
      </div>
    </div>
  );
}

// ── Terminal view ─────────────────────────────────────────────────────────────
function TerminalView() {
  const { computerPanel } = useAgent();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [computerPanel.terminalLines]);

  const lines = computerPanel.terminalLines || [];

  return (
    <div className="flex-1 overflow-y-auto terminal-scrollbar p-4 space-y-1.5">
      {lines.length === 0 ? (
        <div className="flex items-center gap-1 font-mono text-xs">
          <span className="text-[#4EC9B0]">ubuntu@nexus:~$</span>
          <span className="terminal-cursor inline-block w-2 h-3.5 bg-[#4EC9B0] ml-1" />
        </div>
      ) : (
        lines.map((line) => <TerminalLineItem key={line.id} line={line} />)
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Main TerminalPanel ────────────────────────────────────────────────────────
export default function TerminalPanel() {
  const { computerPanel, togglePanel } = useAgent();

  return (
    <div
      className="panel-enter flex flex-col h-full border-l shrink-0"
      style={{
        width: 440,
        minWidth: 440,
        background: "oklch(0.09 0.004 260)",
        borderColor: "oklch(0.18 0.006 260)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: "oklch(0.18 0.006 260)" }}
      >
        <div className="flex items-center gap-2.5">
          {/* macOS traffic lights */}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#FF5F57] hover:brightness-90 transition-all cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E] hover:brightness-90 transition-all cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-[#28C840] hover:brightness-90 transition-all cursor-pointer" />
          </div>
          <span className="text-xs font-semibold text-gray-300 ml-1">
            Nexus's Computer
          </span>
        </div>
        <button
          onClick={togglePanel}
          className="p-1 rounded text-gray-600 hover:text-gray-400 transition-colors"
          title="关闭终端"
        >
          <X size={13} />
        </button>
      </div>

      {/* Tool status bar */}
      {computerPanel.type !== "idle" && (
        <div
          className="flex items-center gap-2 px-4 py-2 border-b shrink-0"
          style={{
            borderColor: "oklch(0.15 0.005 260)",
            background: "oklch(0.07 0.003 260)",
          }}
        >
          <div
            className="w-5 h-5 rounded flex items-center justify-center"
            style={{ background: "oklch(0.15 0.005 260)" }}
          >
            <PanelTypeIcon type={computerPanel.type} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 leading-tight">
              Nexus is using{" "}
              <span className="text-gray-200 font-medium capitalize">
                {computerPanel.type === "terminal"
                  ? "Terminal"
                  : computerPanel.type === "browser"
                    ? "Browser"
                    : "File Editor"}
              </span>
            </p>
            {computerPanel.subtitle && (
              <p className="text-[10px] text-gray-600 font-mono truncate mt-0.5">
                {computerPanel.subtitle}
              </p>
            )}
          </div>
          {/* Running indicator */}
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 pulse-soft shrink-0" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {computerPanel.type === "idle" ? <IdleView /> : <TerminalView />}
      </div>

      {/* Footer status bar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-t shrink-0"
        style={{
          borderColor: "oklch(0.15 0.005 260)",
          background: "oklch(0.07 0.003 260)",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-[10px] text-gray-600 font-mono">
            nexus-agent
          </span>
        </div>
        <span className="text-[10px] text-gray-700 font-mono">
          {computerPanel.terminalLines?.length ?? 0} lines
        </span>
      </div>
    </div>
  );
}
