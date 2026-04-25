"use client";

import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Split a text string on `#N` annotation-reference tokens and return an
 *  array mixing plain strings + styled chips. Used inside markdown text
 *  nodes so the chat visually marks references to agentation pins. */
function chipify(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(^|\s)#(\d+)\b/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const lead = m[1];
    const num = m[2];
    const start = m.index + lead.length;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <span key={`pin-${start}`} className="oc-pin-ref">
        #{num}
      </span>,
    );
    last = start + 1 + num.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : [text];
}

/** Walk react-markdown's children tree and replace any raw string node
 *  with its chipified version. Nested arrays/elements pass through
 *  unchanged — we only rewrite top-level string children. */
function withChips(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") return chipify(children);
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === "string"
        ? (
            <React.Fragment key={`chip-${i}`}>{chipify(c)}</React.Fragment>
          )
        : c,
    );
  }
  return children;
}

/**
 * Thin wrapper around react-markdown for chat message text. Handles:
 *  - GFM (tables, strikethrough, task lists, autolinks)
 *  - Incremental / streaming input: renders whatever's parseable right
 *    now, tolerates unclosed code fences mid-stream.
 *  - External links → open in new tab + rel=noopener for safety.
 *
 * All styling lives in CSS under `.oc-md-*` classes, applied via this
 * component's own wrapper className so we can theme markdown inside the
 * chat pane without leaking styles to Sandpack previews or inspector
 * markdown elsewhere.
 */

const components: Components = {
  // Let text blocks fall back to the regular `.oc-msg-text` cadence but
  // with heading and list spacing inherited from `.oc-md` below.
  p: ({ children, ...rest }) => <p {...rest}>{withChips(children)}</p>,
  li: ({ children, ...rest }) => <li {...rest}>{withChips(children)}</li>,
  h1: ({ children, ...rest }) => <h1 {...rest}>{withChips(children)}</h1>,
  h2: ({ children, ...rest }) => <h2 {...rest}>{withChips(children)}</h2>,
  h3: ({ children, ...rest }) => <h3 {...rest}>{withChips(children)}</h3>,
  h4: ({ children, ...rest }) => <h4 {...rest}>{withChips(children)}</h4>,
  blockquote: ({ children, ...rest }) => (
    <blockquote {...rest}>{withChips(children)}</blockquote>
  ),
  strong: ({ children, ...rest }) => <strong {...rest}>{withChips(children)}</strong>,
  em: ({ children, ...rest }) => <em {...rest}>{withChips(children)}</em>,
  a: ({ href, children, ...rest }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="oc-md-link"
      {...rest}
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    // react-markdown gives us block code and inline code on the same
    // component. We differentiate by whether a `language-*` className is
    // present (block) vs not (inline).
    const isBlock = typeof className === "string" && /language-/.test(className);
    if (isBlock) {
      return (
        <pre className="oc-md-code">
          <code>{String(children).replace(/\n$/, "")}</code>
        </pre>
      );
    }
    return <code className="oc-md-icode">{children}</code>;
  },
  // Prevent react-markdown from wrapping raw strings in <p>, which makes
  // paragraphs add extra vertical space inside single-line messages. Kept
  // as <p> so multi-line messages still get proper spacing.
  // (Defaulting — no override needed; just styled in CSS.)
};

export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="oc-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        // Security: react-markdown doesn't parse HTML by default (good —
        // we don't want to render arbitrary HTML from the model).
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
