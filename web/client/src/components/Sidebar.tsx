// Nexus UI — Sidebar (open-webui style)
// Dark sidebar with: logo, new chat, search, chat history list, theme toggle, settings

import { useState } from "react";
import {
  PenSquare,
  Search,
  Settings,
  Sun,
  Moon,
  ChevronDown,
  Cpu,
  Terminal,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { useAgent } from "@/contexts/AgentContext";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "@/lib/mockData";
import type { Task } from "@/lib/types";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663030293317/CB35CGSaC7cLf4fYJsm4GM/nexus-logo-evZjb9ALTdVtmGtUot3NJU.webp";

// ── Task item ─────────────────────────────────────────────────────────────────
function TaskItem({ task, active }: { task: Task; active: boolean }) {
  const { setActiveTaskId } = useAgent();
  const [hover, setHover] = useState(false);

  const statusColor =
    task.status === "running"
      ? "bg-blue-400"
      : task.status === "completed"
        ? "bg-emerald-400"
        : task.status === "failed"
          ? "bg-red-400"
          : "bg-gray-500";

  return (
    <button
      onClick={() => setActiveTaskId(task.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all duration-100 group",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      {/* Status dot */}
      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0 mt-0.5", statusColor)} />

      {/* Title */}
      <span className="flex-1 text-sm truncate leading-snug">{task.title}</span>

      {/* Time / actions */}
      {hover ? (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground/80 transition-colors"
          >
            <MoreHorizontal size={13} />
          </button>
        </div>
      ) : (
        <span className="text-[10px] text-sidebar-foreground/30 shrink-0">
          {formatTimestamp(task.updatedAt)}
        </span>
      )}
    </button>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────
export default function Sidebar() {
  const { tasks, activeTaskId, createNewTask, backendOnline } = useAgent();
  const { theme, toggleTheme, switchable } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const filteredTasks = tasks.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Group by today / earlier
  const now = Date.now();
  const todayTasks = filteredTasks.filter(
    (t) => now - t.updatedAt < 86400000,
  );
  const earlierTasks = filteredTasks.filter(
    (t) => now - t.updatedAt >= 86400000,
  );

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 gap-3 bg-sidebar border-r border-sidebar-border w-14 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <Cpu size={18} />
        </button>
        <button
          onClick={createNewTask}
          className="p-2 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <PenSquare size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border w-64 shrink-0">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <img
            src={LOGO_URL}
            alt="Nexus"
            className="w-6 h-6 object-contain rounded"
          />
          <span className="text-sm font-semibold text-sidebar-foreground">
            Nexus
          </span>
          {/* Backend status */}
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              backendOnline
                ? "bg-emerald-400 pulse-soft"
                : "bg-gray-500",
            )}
            title={backendOnline ? "后端在线" : "后端离线（模拟模式）"}
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            title="折叠侧边栏"
          >
            <ChevronDown size={14} className="rotate-90" />
          </button>
          <button
            onClick={createNewTask}
            className="p-1.5 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            title="新建对话"
          >
            <PenSquare size={15} />
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-3 pb-2 shrink-0">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-sidebar-accent/50 border border-sidebar-border/50">
          <Search size={13} className="text-sidebar-foreground/40 shrink-0" />
          <input
            type="text"
            placeholder="搜索对话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 text-xs bg-transparent text-sidebar-foreground placeholder-sidebar-foreground/30 outline-none"
          />
        </div>
      </div>

      {/* ── Task List ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-sidebar-foreground/30">
            <Terminal size={28} strokeWidth={1.5} />
            <p className="text-xs text-center leading-relaxed">
              还没有对话
              <br />
              点击上方按钮开始
            </p>
          </div>
        ) : (
          <>
            {todayTasks.length > 0 && (
              <div className="mb-1">
                <p className="text-[10px] font-medium text-sidebar-foreground/30 uppercase tracking-wider px-3 py-1.5">
                  今天
                </p>
                {todayTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    active={task.id === activeTaskId}
                  />
                ))}
              </div>
            )}
            {earlierTasks.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-sidebar-foreground/30 uppercase tracking-wider px-3 py-1.5">
                  更早
                </p>
                {earlierTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    active={task.id === activeTaskId}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-sidebar-border px-3 py-3 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center">
            <span className="text-xs font-medium text-sidebar-foreground">N</span>
          </div>
          <span className="text-xs text-sidebar-foreground/60">Nexus Agent</span>
        </div>
        <div className="flex items-center gap-1">
          {switchable && (
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              title={theme === "dark" ? "切换到亮色" : "切换到暗色"}
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          )}
          <button className="p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
            <Settings size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
