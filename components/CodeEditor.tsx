"use client";

import { useEffect, useMemo, useRef } from "react";
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";

const mutedCodeHighlight = HighlightStyle.define([
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.moduleKeyword,
      tags.operatorKeyword,
    ],
    color: "var(--code-token-keyword)",
    fontWeight: "500",
  },
  {
    tag: [
      tags.string,
      tags.regexp,
      tags.escape,
      tags.special(tags.string),
    ],
    color: "var(--code-token-string)",
  },
  {
    tag: [
      tags.number,
      tags.atom,
      tags.bool,
      tags.null,
      tags.unit,
      tags.literal,
    ],
    color: "var(--code-token-literal)",
  },
  {
    tag: [
      tags.typeName,
      tags.namespace,
      tags.className,
      tags.tagName,
      tags.heading,
    ],
    color: "var(--code-token-type)",
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.definition(tags.function(tags.variableName)),
      tags.definition(tags.function(tags.propertyName)),
    ],
    color: "var(--code-token-function)",
  },
  {
    tag: [
      tags.propertyName,
      tags.attributeName,
      tags.labelName,
      tags.definition(tags.propertyName),
    ],
    color: "var(--code-token-property)",
  },
  {
    tag: [
      tags.variableName,
      tags.definition(tags.variableName),
      tags.special(tags.variableName),
      tags.macroName,
    ],
    color: "var(--code-token-base)",
  },
  {
    tag: [tags.comment, tags.docComment, tags.lineComment, tags.blockComment],
    color: "var(--code-token-comment)",
    fontStyle: "italic",
  },
  {
    tag: [tags.meta, tags.processingInstruction, tags.annotation],
    color: "var(--code-token-muted)",
  },
  {
    tag: [tags.punctuation, tags.bracket, tags.paren, tags.operator],
    color: "var(--code-token-faint)",
  },
  {
    tag: tags.invalid,
    color: "var(--code-token-invalid)",
    textDecoration: "none",
  },
]);

/**
 * CodeMirror 6 editor styled to sit inside the Inspector as a native panel
 * rather than a bolted-in iframe. Theme is tuned to our design tokens:
 * hairline inner border, tabular-nums, tight leading, small mono font.
 */
export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  placeholder,
  minHeight = 180,
  maxHeight = 360,
  fillParent = false,
}: {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  /**
   * When true, the editor stretches to fill its flex-sized parent (instead
   * of the fixed pixel heights). Use this when the editor sits inside a
   * full-height panel like the Components tab.
   */
  fillParent?: boolean;
}) {
  const ref = useRef<ReactCodeMirrorRef>(null);

  // Build extensions once — recreating them on every render flickers the editor.
  const extensions = useMemo(
    () => [
      javascript({ jsx: true, typescript: true }),
      syntaxHighlighting(mutedCodeHighlight),
      EditorView.lineWrapping,
    ],
    [],
  );

  // Keep external code updates from fighting user typing — only rewrite the
  // view when the external value actually differs from the editor buffer.
  useEffect(() => {
    const view = ref.current?.view;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      className="oc-code-editor"
      data-readonly={readOnly || undefined}
      data-fill={fillParent || undefined}
    >
      <CodeMirror
        ref={ref}
        value={value}
        onChange={onChange}
        extensions={extensions}
        readOnly={readOnly}
        placeholder={placeholder}
        theme="none"
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          syntaxHighlighting: false,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          searchKeymap: false,
        }}
        style={{
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          fontVariantLigatures: "none",
          height: fillParent ? "100%" : undefined,
        }}
        indentWithTab
        height={fillParent ? "100%" : `${minHeight}px`}
        minHeight={fillParent ? "100%" : `${minHeight}px`}
        maxHeight={fillParent ? "100%" : `${maxHeight}px`}
      />
    </div>
  );
}
