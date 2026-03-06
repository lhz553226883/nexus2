// Nexus UI — Computer Panel (Right)
// Design: Dark charcoal #0F0F1A, terminal green text, real terminal feel
// Shows: terminal output, browser preview, file content

import { useRef, useEffect } from "react";
import { X, Minimize2, Globe, Terminal, FileText, Maximize2 } from "lucide-react";
import { useAgent } from "@/contexts/AgentContext";
import { TerminalLine } from "@/lib/types";
import { cn } from "@/lib/utils";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030293317/CB35CGSaC7cLf4fYJsm4GM/nexus-logo-evZjb9ALTdVtmGtUot3NJU.webp";

function PanelTypeIcon({ type }: { type: string }) {
  if (type === "browser") return <Globe size={13} className="text-gray-400" />;
  if (type === "terminal") return <Terminal size={13} className="text-gray-400" />;
  if (type === "file") return <FileText size={13} className="text-gray-400" />;
  return <Terminal size={13} className="text-gray-400" />;
}

function TerminalLineItem({ line }: { line: TerminalLine }) {
  if (line.type === "command") {
    return (
      <div className="flex items-start gap-2 font-mono text-xs leading-relaxed">
        <span className="text-[#4EC9B0] shrink-0 select-none">ubuntu@nexus:~$</span>
        <span className="text-[#D4D4D4]">{line.content.replace(/^\$\s*/, "")}</span>
      </div>
    );
  }
  if (line.type === "error") {
    return (
      <div className="font-mono text-xs text-[#F44747] leading-relaxed pl-4">
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
    <div className="font-mono text-xs text-[#9CDCFE] leading-relaxed pl-4">
      {line.content}
    </div>
  );
}

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
        lines.map(line => <TerminalLineItem key={line.id} line={line} />)
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function BrowserView() {
  const { computerPanel } = useAgent();
  const screenshot = computerPanel.screenshot;

  if (!screenshot) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-40">
        <Globe size={28} className="text-gray-500" />
        <p className="text-xs text-gray-500 font-mono">等待浏览器截图...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <img
        src={`data:image/jpeg;base64,${screenshot}`}
        alt="Browser screenshot"
        className="w-full h-auto block"
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
}

function IdleView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-30">
      <img src={LOGO_URL} alt="Nexus" className="w-10 h-10 object-contain invert" />
      <div className="text-center">
        <p className="text-xs text-gray-500 font-mono">等待任务执行...</p>
        <p className="text-[10px] text-gray-600 mt-1">工具调用时将在此显示</p>
      </div>
    </div>
  );
}

export default function ComputerPanel() {
  const { computerPanel, isPanelOpen, togglePanel } = useAgent();

  if (!isPanelOpen) return null;

  return (
    <div
      className="panel-enter flex flex-col h-full border-l border-[#1E1E2E]"
      style={{
        width: 480,
        minWidth: 480,
        background: "oklch(0.11 0.005 260)",
      }}
    >
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "#1E1E2E" }}
      >
        <div className="flex items-center gap-2">
          {/* macOS-style traffic lights */}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#FF5F57] hover:bg-[#FF3B30] transition-colors cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E] hover:bg-[#FF9500] transition-colors cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-[#28C840] hover:bg-[#34C759] transition-colors cursor-pointer" />
          </div>
          <span className="text-xs font-semibold text-gray-300 ml-2">Nexus's Computer</span>
        </div>
        <button
          onClick={togglePanel}
          className="p-1 rounded text-gray-600 hover:text-gray-400 transition-colors"
        >
          <Minimize2 size={13} />
        </button>
      </div>

      {/* Tool status bar */}
      {computerPanel.type !== "idle" && (
        <div
          className="flex items-center gap-2 px-4 py-2 border-b shrink-0"
          style={{ borderColor: "#1A1A2A", background: "#0D0D1A" }}
        >
          <div className="w-5 h-5 rounded bg-[#1E1E2E] flex items-center justify-center">
            <PanelTypeIcon type={computerPanel.type} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 leading-tight">
              Nexus is using{" "}
              <span className="text-gray-200 font-medium capitalize">
                {computerPanel.type === "terminal" ? "Terminal" : computerPanel.type === "browser" ? "Browser" : "File Editor"}
              </span>
            </p>
            {computerPanel.subtitle && (
              <p className="text-[10px] text-gray-600 font-mono truncate mt-0.5">
                {computerPanel.subtitle}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {computerPanel.type === "idle" ? (
          <IdleView />
        ) : computerPanel.type === "browser" ? (
          <BrowserView />
        ) : (
          <TerminalView />
        )}
      </div>

      {/* Bottom status bar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-t shrink-0"
        style={{ borderColor: "#1A1A2A", background: "#0A0A14" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-[10px] text-gray-600 font-mono">nexus-agent</span>
        </div>
        <span className="text-[10px] text-gray-700 font-mono">
          {computerPanel.terminalLines?.length ?? 0} lines
        </span>
      </div>
    </div>
  );
}
