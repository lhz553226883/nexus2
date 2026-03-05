// Nexus UI — Main Page
// Design: Neo-Minimalism, three-panel layout
// Left: TaskSidebar (240px fixed) | Center: ConversationPanel (flex-1) | Right: ComputerPanel (480px fixed)

import TaskSidebar from "@/components/TaskSidebar";
import ConversationPanel from "@/components/ConversationPanel";
import ComputerPanel from "@/components/ComputerPanel";
import InputBar from "@/components/InputBar";

export default function Home() {
  return (
    <div className="flex h-screen overflow-hidden bg-white select-none">
      {/* Left: Task History Sidebar */}
      <TaskSidebar />

      {/* Center: Conversation + Input */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ConversationPanel />
        <InputBar />
      </div>

      {/* Right: Computer Panel */}
      <ComputerPanel />
    </div>
  );
}
