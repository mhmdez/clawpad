"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { ROOT_SPACE_NAME, ROOT_SPACE_PATH } from "@/lib/files/constants";
import { toast } from "sonner";
import { toWorkspacePath } from "@/lib/utils/workspace-route";

type CreateMode = "document" | "space";

interface OpenCreateDetail {
  mode?: CreateMode | "page" | "folder";
  location?: string;
  space?: string;
  folderPath?: string;
  title?: string;
}

interface ParsedLocation {
  space: string;
  folderPath?: string;
}

const LOCATION_SUGGESTIONS_ID = "clawpad-create-location-suggestions";

function parseLocation(
  rawLocation: string,
  knownSpaces: Set<string>,
): ParsedLocation | null {
  const trimmed = rawLocation.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/^\/+|\/+$/g, "");
  if (!normalized) return null;

  if (
    normalized === ROOT_SPACE_PATH ||
    normalized.toLowerCase() === "root" ||
    normalized.toLowerCase() === ROOT_SPACE_NAME.toLowerCase()
  ) {
    return { space: ROOT_SPACE_PATH };
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const [space, ...folder] = segments;
  if (!knownSpaces.has(space)) return null;
  const folderPath = folder.length > 0 ? folder.join("/") : undefined;
  return { space, folderPath };
}

export function NewPageDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CreateMode>("document");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const { spaces, createPage, createSpace } = useWorkspaceStore();

  const knownSpaces = useMemo(() => new Set(spaces.map((space) => space.path)), [spaces]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenCreateDetail>)?.detail;
      if (detail?.mode === "space" || detail?.mode === "folder") {
        setMode("space");
      } else {
        setMode("document");
      }

      if (typeof detail?.title === "string") {
        setTitle(detail.title);
      } else {
        setTitle("");
      }

      if (typeof detail?.location === "string") {
        setLocation(detail.location);
      } else if (typeof detail?.space === "string" && detail.space.trim()) {
        const nextLocation = detail.folderPath
          ? `${detail.space}/${detail.folderPath}`.replace(/^\/+|\/+$/g, "")
          : detail.space;
        setLocation(nextLocation);
      } else {
        setLocation("");
      }

      setOpen(true);
    };

    window.addEventListener("clawpad:open-new-page", handleOpen as EventListener);
    window.addEventListener("clawpad:new-page", handleOpen as EventListener);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "n" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setMode("document");
        setTitle("");
        setLocation("");
        setOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("clawpad:open-new-page", handleOpen as EventListener);
      window.removeEventListener("clawpad:new-page", handleOpen as EventListener);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    if (mode !== "document") return;
    if (location.trim()) return;
    const preferred =
      spaces.find((space) => space.path !== ROOT_SPACE_PATH)?.path ??
      spaces[0]?.path ??
      "";
    if (preferred) setLocation(preferred);
  }, [location, mode, open, spaces]);

  const resetForm = () => {
    setMode("document");
    setTitle("");
    setLocation("");
    setCreating(false);
  };

  const handleCreate = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setCreating(true);
    try {
      if (mode === "space") {
        await createSpace(trimmedTitle);
        setOpen(false);
        resetForm();
        toast.success("Space created");
        router.push("/workspace");
        return;
      }

      const parsed = parseLocation(location, knownSpaces);
      if (!parsed) {
        throw new Error("Choose a valid location (space or space/folder path).");
      }

      const pagePath = await createPage(parsed.space, trimmedTitle, {
        folderPath: parsed.folderPath,
      });
      setOpen(false);
      resetForm();
      router.push(toWorkspacePath(pagePath));
      toast.success("Document created");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : mode === "space"
            ? "Failed to create space."
            : "Failed to create document.";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }, [createPage, createSpace, knownSpaces, location, mode, router, title]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !creating) {
        event.preventDefault();
        void handleCreate();
      }
    },
    [creating, handleCreate],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetForm();
        }
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{mode === "space" ? "New Space" : "New Document"}</DialogTitle>
          <DialogDescription>
            {mode === "space"
              ? "Create a top-level space in your workspace."
              : "Create a document in a space or nested folder path."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setMode("document")}
              className={`rounded-md px-2 py-1.5 text-xs ${
                mode === "document"
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              Document
            </button>
            <button
              type="button"
              onClick={() => setMode("space")}
              className={`rounded-md px-2 py-1.5 text-xs ${
                mode === "space"
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              Space
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="create-title" className="text-sm font-medium leading-none">
              {mode === "space" ? "Space Name" : "Document Name"}
            </label>
            <Input
              id="create-title"
              placeholder={mode === "space" ? "e.g. client-work" : "Document title…"}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

          {mode === "document" && (
            <div className="space-y-2">
              <label htmlFor="create-location" className="text-sm font-medium leading-none">
                Location
              </label>
              <Input
                id="create-location"
                list={LOCATION_SUGGESTIONS_ID}
                placeholder="space or space/folder/path"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                onKeyDown={handleKeyDown}
              />
              <datalist id={LOCATION_SUGGESTIONS_ID}>
                {spaces.map((space) => (
                  <option key={space.path} value={space.path}>
                    {space.name}
                  </option>
                ))}
              </datalist>
              <p className="text-[11px] text-muted-foreground">
                Example: <code>projects/q1/roadmap</code>
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={!title.trim() || creating}
          >
            {creating ? "Creating…" : mode === "space" ? "Create Space" : "Create Document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
