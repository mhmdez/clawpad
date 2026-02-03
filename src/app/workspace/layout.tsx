import { Sidebar } from "@/components/sidebar/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { NewPageDialog } from "@/components/new-page-dialog";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <CommandPalette />
      <NewPageDialog />
    </div>
  );
}
