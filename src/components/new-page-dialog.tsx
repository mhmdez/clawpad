"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { toast } from "sonner";
import { toWorkspacePath } from "@/lib/utils/workspace-route";

export function NewPageDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [space, setSpace] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const { spaces, createPage } = useWorkspaceStore();

  // Listen for open events from command palette & sidebar
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("clawpad:new-page", handleOpen);

    // Cmd+N shortcut
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "n" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("clawpad:new-page", handleOpen);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Default space selection
  useEffect(() => {
    if (open && spaces.length > 0 && !space) {
      setSpace(spaces[0].path);
    }
  }, [open, spaces, space]);

  const handleCreate = useCallback(async () => {
    if (!title.trim() || !space) return;
    setCreating(true);
    try {
      const pagePath = await createPage(space, title.trim());
      router.push(toWorkspacePath(pagePath));
      setOpen(false);
      setTitle("");
      setSpace("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create page.";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }, [title, space, createPage, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !creating) {
        e.preventDefault();
        handleCreate();
      }
    },
    [handleCreate, creating],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New Page</DialogTitle>
          <DialogDescription>
            Create a new page in your workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <label
              htmlFor="page-title"
              className="text-sm font-medium leading-none"
            >
              Title
            </label>
            <Input
              id="page-title"
              placeholder="Page title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Space</label>
            <Select value={space} onValueChange={setSpace}>
              <SelectTrigger>
                <SelectValue placeholder="Select a space" />
              </SelectTrigger>
              <SelectContent>
                {spaces.map((s) => (
                  <SelectItem key={s.path} value={s.path}>
                    {s.icon && `${s.icon} `}
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title.trim() || !space || creating}
          >
            {creating ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
