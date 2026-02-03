"use client";

import { useCallback } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

interface EditorProps {
  initialContent?: string;
  onChange?: (markdown: string) => void;
  editable?: boolean;
}

export function Editor({ initialContent, onChange, editable = true }: EditorProps) {
  const editor = useCreateBlockNote({
    domAttributes: {
      editor: {
        class: "clawpad-editor",
      },
    },
  });

  const handleChange = useCallback(() => {
    if (!onChange) return;
    const markdown = editor.blocksToMarkdownLossy(editor.document);
    onChange(markdown);
  }, [editor, onChange]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <BlockNoteView
        editor={editor}
        editable={editable}
        onChange={handleChange}
        theme="light"
      />
    </div>
  );
}
