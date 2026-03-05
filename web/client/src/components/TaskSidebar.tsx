// Nexus UI — Task Sidebar (Left Panel)
// Design: Neo-Minimalism, warm gray #F7F7F5, thin border separator
// Task list with status indicators, New Task button at top

import { Plus, Search, CheckCircle2, Clock, AlertCircle, Loader2, Wifi, WifiOff } from "lucide-react";
import { useAgent } from "@/contexts/AgentContext";
import { Task } from "@/lib/types";
import { formatTimestamp } from "@/lib/mockData";
import { cn } from "@/lib/utils";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030293317/CB35CGSaC7cLf4fYJsm4GM/nexus-logo-evZjb9ALTdVtmGtUot3NJU.webp";

function TaskStatusIcon({ status }: { status: Task["status"] }) {
  if (status === "completed") return <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />;
  if (status === "running") return <Loader2 size={12} className="text-blue-500 shrink-0 animate-spin" />;
  if (status === "failed") return <AlertCircle size={12} className="text-red-400 shrink-0" />;
  return <Clock size={12} className="text-gray-300 shrink-0" />;
}

export default function TaskSidebar() {
  const { tasks, activeTaskId, setActiveTaskId, createNewTask, backendOnline } = useAgent();

  return (
    <aside className="flex flex-col h-full border-r border-[#E8E8E5]" style={{ width: 240, minWidth: 240, background: "oklch(0.972 0.002 60)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <img src={LOGO_URL} alt="Nexus" className="w-6 h-6 object-contain" />
          <span className="text-sm font-semibold text-gray-900 tracking-tight">nexus</span>
        </div>
        <button
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-[#EBEBEA] transition-colors"
          title="搜索任务"
        >
          <Search size={14} />
        </button>
      </div>

      {/* New Task Button */}
      <div className="px-2 pb-2">
        <button
          onClick={createNewTask}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-[#EBEBEA] hover:text-gray-900 transition-all duration-150 group"
        >
          <div className="w-5 h-5 rounded-md bg-white border border-[#E0E0DC] flex items-center justify-center shadow-sm group-hover:border-gray-300 transition-colors">
            <Plus size={12} className="text-gray-500" />
          </div>
          <span>新任务</span>
          <span className="ml-auto text-xs text-gray-300 font-mono">⌘K</span>
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-[#E8E8E5] mb-1" />

      {/* Task List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-1">
        {tasks.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-gray-400">还没有任务</p>
            <p className="text-xs text-gray-300 mt-1">点击上方按钮开始</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {tasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                isActive={task.id === activeTaskId}
                onClick={() => setActiveTaskId(task.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Backend Status */}
      <div className="mx-3 border-t border-[#E8E8E5] py-2">
        <div className="flex items-center gap-1.5 px-1">
          {backendOnline ? (
            <>
              <Wifi size={11} className="text-emerald-500 status-online" />
              <span className="text-[10px] text-emerald-600 font-medium">已连接后端</span>
            </>
          ) : (
            <>
              <WifiOff size={11} className="text-gray-400" />
              <span className="text-[10px] text-gray-400">演示模式</span>
            </>
          )}
        </div>
      </div>

      {/* User Footer */}
      <div className="border-t border-[#E8E8E5] px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-semibold">N</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800 truncate">Nexus User</p>
            <p className="text-[10px] text-gray-400 truncate">本地部署</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TaskItem({ task, isActive, onClick }: { task: Task; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 group",
        isActive
          ? "bg-white shadow-sm border border-[#E0E0DC]"
          : "hover:bg-[#EBEBEA]"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5">
          <TaskStatusIcon status={task.status} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-xs font-medium truncate leading-tight",
            isActive ? "text-gray-900" : "text-gray-700 group-hover:text-gray-900"
          )}>
            {task.title}
          </p>
          {task.summary && (
            <p className="text-[10px] text-gray-400 truncate mt-0.5 leading-tight">
              {task.summary}
            </p>
          )}
          <p className="text-[10px] text-gray-300 mt-1">
            {formatTimestamp(task.updatedAt)}
          </p>
        </div>
      </div>
    </button>
  );
}
