import { create } from "zustand";

export type FontSize = "small" | "medium" | "large";
export type EditorWidth = "narrow" | "medium" | "full";

const FONT_SIZE_MAP: Record<FontSize, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
};

const EDITOR_WIDTH_MAP: Record<EditorWidth, string> = {
  narrow: "640px",
  medium: "720px",
  full: "none",
};

interface AppearanceState {
  fontSize: FontSize;
  editorWidth: EditorWidth;
  setFontSize: (size: FontSize) => void;
  setEditorWidth: (width: EditorWidth) => void;
  hydrated: boolean;
  hydrate: () => void;
}

function applyToDOM(fontSize: FontSize, editorWidth: EditorWidth) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(
    "--clawpad-font-size",
    FONT_SIZE_MAP[fontSize],
  );
  document.documentElement.style.setProperty(
    "--clawpad-editor-width",
    EDITOR_WIDTH_MAP[editorWidth],
  );
}

function loadFromStorage(): { fontSize: FontSize; editorWidth: EditorWidth } {
  if (typeof window === "undefined") {
    return { fontSize: "medium", editorWidth: "medium" };
  }
  try {
    const stored = localStorage.getItem("clawpad-appearance");
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        fontSize: normalizeFontSize(parsed.fontSize),
        editorWidth: normalizeEditorWidth(parsed.editorWidth),
      };
    }
  } catch {
    // ignore
  }
  return { fontSize: "medium", editorWidth: "medium" };
}

function normalizeFontSize(value: unknown): FontSize {
  if (value === "small" || value === "medium" || value === "large") {
    return value;
  }
  return "medium";
}

function normalizeEditorWidth(value: unknown): EditorWidth {
  // Backward compatibility with previously saved "wide" option.
  if (value === "wide") return "full";
  if (value === "narrow" || value === "medium" || value === "full") {
    return value;
  }
  return "medium";
}

function saveToStorage(fontSize: FontSize, editorWidth: EditorWidth) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      "clawpad-appearance",
      JSON.stringify({ fontSize, editorWidth }),
    );
  } catch {
    // ignore
  }
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  fontSize: "medium",
  editorWidth: "medium",
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    const { fontSize, editorWidth } = loadFromStorage();
    applyToDOM(fontSize, editorWidth);
    set({ fontSize, editorWidth, hydrated: true });
  },

  setFontSize: (fontSize: FontSize) => {
    const { editorWidth } = get();
    applyToDOM(fontSize, editorWidth);
    saveToStorage(fontSize, editorWidth);
    set({ fontSize });
  },

  setEditorWidth: (editorWidth: EditorWidth) => {
    const { fontSize } = get();
    applyToDOM(fontSize, editorWidth);
    saveToStorage(fontSize, editorWidth);
    set({ editorWidth });
  },
}));
