"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Editor } from "@/lib/editor-shim";

type EditorContextValue = {
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
};

const EditorContext = createContext<EditorContextValue>({
  editor: null,
  setEditor: () => {},
});

export function EditorProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  return (
    <EditorContext.Provider value={{ editor, setEditor }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditorRef() {
  return useContext(EditorContext);
}
