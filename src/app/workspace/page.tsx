import { FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkspacePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome to ClawPad
          </h1>
          <p className="text-sm text-muted-foreground">
            Your workspace for OpenClaw. Select a page from the sidebar or
            create a new one to get started.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Page
          </Button>
          <Button variant="outline">
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
        </div>
      </div>
    </div>
  );
}
