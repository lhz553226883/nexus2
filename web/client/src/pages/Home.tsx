// Nexus UI — Main Page (open-webui style)
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import TerminalPanel from "@/components/TerminalPanel";
import { useAgent } from "@/contexts/AgentContext";

export default function Home() {
  const { isPanelOpen } = useAgent();
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <ChatArea />
      </div>
      {isPanelOpen && <TerminalPanel />}
    </div>
  );
}
