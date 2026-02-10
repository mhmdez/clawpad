import test from "node:test";
import assert from "node:assert/strict";
import type { Space } from "@/lib/files";
import { useWorkspaceStore } from "@/lib/stores/workspace";

function resetWorkspaceState() {
  useWorkspaceStore.setState({
    spaces: [],
    spacesStatus: "idle",
    spacesError: null,
    loadingSpaces: false,
    recentPages: [],
    recentStatus: "idle",
    recentError: null,
    pagesBySpace: new Map(),
    pagesStatusBySpace: new Map(),
    pagesErrorBySpace: new Map(),
    loadingPages: new Map(),
    lastError: null,
    chatPanelOpen: true,
  });
}

test("workspace store de-duplicates concurrent loadSpaces requests", async () => {
  resetWorkspaceState();
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/files/spaces")) {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response(JSON.stringify([{ name: "General", path: "__root__", pageCount: 1 } satisfies Space]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const store = useWorkspaceStore.getState();
    await Promise.all([store.loadSpaces(), store.loadSpaces()]);

    assert.equal(calls, 1, "expected concurrent requests to share the same fetch");
    assert.equal(useWorkspaceStore.getState().spacesStatus, "success");
    assert.equal(useWorkspaceStore.getState().spaces.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("workspace store preserves cached spaces when refresh fails", async () => {
  resetWorkspaceState();
  useWorkspaceStore.setState({
    spaces: [{ name: "General", path: "__root__", pageCount: 1 }],
    spacesStatus: "success",
  });

  const originalFetch = global.fetch;
  global.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  try {
    await useWorkspaceStore.getState().loadSpaces({ force: true, silent: true });
    const state = useWorkspaceStore.getState();
    assert.equal(state.spaces.length, 1, "cached spaces should remain available");
    assert.equal(state.spacesStatus, "success", "status should remain success when stale data exists");
    assert.equal(state.loadingSpaces, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("createPage supports nested folder paths", async () => {
  resetWorkspaceState();
  const originalFetch = global.fetch;
  const requestUrls: string[] = [];

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requestUrls.push(url);
    if (url.includes("/api/files/spaces")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/files/recent")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        meta: {
          title: "Design Doc",
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          size: 10,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const pagePath = await useWorkspaceStore
      .getState()
      .createPage("projects", "Design Doc", { folderPath: "alpha/notes" });

    assert.equal(pagePath, "projects/alpha/notes/design-doc");
    assert.equal(
      requestUrls.some((url) =>
        /\/api\/files\/pages\/projects\/alpha\/notes\/design-doc$/.test(url),
      ),
      true,
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("createFolder creates a starter README page", async () => {
  resetWorkspaceState();
  const originalFetch = global.fetch;
  const requestUrls: string[] = [];

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requestUrls.push(url);
    if (url.includes("/api/files/spaces")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/files/recent")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        meta: {
          title: "README",
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          size: 10,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const pagePath = await useWorkspaceStore
      .getState()
      .createFolder("projects", "Alpha Notes");

    assert.equal(pagePath, "projects/alpha-notes/readme");
    assert.equal(
      requestUrls.some((url) =>
        /\/api\/files\/pages\/projects\/alpha-notes\/readme$/.test(url),
      ),
      true,
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("toggleChatPanel toggles open and closed", () => {
  resetWorkspaceState();
  const store = useWorkspaceStore.getState();

  assert.equal(store.chatPanelOpen, true);
  store.toggleChatPanel();
  assert.equal(useWorkspaceStore.getState().chatPanelOpen, false);

  useWorkspaceStore.getState().toggleChatPanel();
  assert.equal(useWorkspaceStore.getState().chatPanelOpen, true);
});
