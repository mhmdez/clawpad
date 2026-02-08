import type { PageMeta } from "@/lib/files";
import { ROOT_SPACE_PATH } from "@/lib/files/constants";

export type PageTreeNode =
  | {
      type: "folder";
      name: string;
      path: string;
      children: PageTreeNode[];
    }
  | {
      type: "page";
      name: string;
      path: string;
      page: PageMeta;
    };

function toRelativeWithinSpace(pagePath: string, spacePath: string): string {
  const normalized = pagePath.replace(/\\/g, "/").replace(/\.md$/, "");
  if (spacePath === ROOT_SPACE_PATH) {
    return normalized;
  }
  const prefix = `${spacePath}/`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}

export function buildPageTree(pages: PageMeta[], spacePath: string): PageTreeNode[] {
  const root: PageTreeNode & { type: "folder"; children: PageTreeNode[] } = {
    type: "folder",
    name: "",
    path: "",
    children: [],
  };
  const folders = new Map<string, typeof root>();
  folders.set("", root);

  for (const page of pages) {
    const relative = toRelativeWithinSpace(page.path, spacePath);
    const parts = relative.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    const fileName = parts.pop() as string;

    let current = root;
    let currentPath = "";

    for (const part of parts) {
      const nextPath = currentPath ? `${currentPath}/${part}` : part;
      let folder = folders.get(nextPath);
      if (!folder) {
        folder = {
          type: "folder",
          name: part,
          path: nextPath,
          children: [],
        };
        folders.set(nextPath, folder);
        current.children.push(folder);
      }
      current = folder;
      currentPath = nextPath;
    }

    current.children.push({
      type: "page",
      name: fileName,
      path: relative,
      page,
    });
  }

  return root.children;
}
