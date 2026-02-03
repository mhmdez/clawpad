import { Sidebar } from "@/components/sidebar/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { NewPageDialog } from "@/components/new-page-dialog";
import { ChatPanel } from "@/components/chat/chat-panel";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <ChatPanel />
      <CommandPalette />
      <NewPageDialog />
    </div>
  );
}
