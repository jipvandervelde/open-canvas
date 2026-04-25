"use client";

import { useEffect, useMemo, useState } from "react";
import {
  projectDocStore,
  PROJECT_DOC_TEMPLATE,
  effectiveProjectDocContent,
} from "@/lib/project-doc-store";
import { ChatMarkdown } from "@/components/ChatMarkdown";

/**
 * Project brief panel — user-authored `project.md` the orchestrator is
 * gated on. Renders the markdown in a nicely-styled read view by default
 * with an "Edit" toggle that swaps in a textarea. This mirrors how
 * product specs are viewed in docs tools: you read the formatted version,
 * only flip to raw markdown when you want to change something.
 *
 * Fills the full height of its slot via `.oc-project-panel` which is a
 * flex column with `flex: 1` + `min-height: 0`, matching how NotesPanel
 * handles the same sizing challenge.
 */
export function ProjectPanel() {
  const [doc, setDoc] = useState(() => projectDocStore.get());
  useEffect(() => {
    setDoc(projectDocStore.get());
    return projectDocStore.subscribe(setDoc);
  }, []);

  const [mode, setMode] = useState<"view" | "edit">(() =>
    doc.markdown.trim().length === 0 ? "edit" : "view",
  );
  const [draft, setDraft] = useState(doc.markdown);
  const [dirty, setDirty] = useState(false);

  // External writes (e.g. the agent called writeProjectDoc while the user
  // wasn't editing) should refresh the draft — but we never stomp
  // in-flight local edits.
  useEffect(() => {
    if (!dirty) setDraft(doc.markdown);
  }, [doc.markdown, dirty]);

  const established = useMemo(
    () => effectiveProjectDocContent(doc.markdown).length >= 100,
    [doc.markdown],
  );
  const updatedAgo = useMemo(() => {
    if (!doc.updatedAt) return null;
    const s = Math.round((Date.now() - doc.updatedAt) / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    return `${d}d ago`;
  }, [doc.updatedAt]);

  const save = () => {
    projectDocStore.set(draft, "user");
    setDirty(false);
    setMode("view");
  };

  const cancelEdit = () => {
    setDraft(doc.markdown);
    setDirty(false);
    setMode("view");
  };

  const startEdit = () => {
    setDraft(doc.markdown || PROJECT_DOC_TEMPLATE);
    setDirty(doc.markdown !== (doc.markdown || PROJECT_DOC_TEMPLATE));
    setMode("edit");
  };

  const clear = () => {
    if (
      !window.confirm(
        "Clear the project brief? The orchestrator will refuse to build until a new brief is set.",
      )
    ) {
      return;
    }
    projectDocStore.reset();
    setDraft("");
    setDirty(false);
    setMode("edit");
  };

  const hasBody = doc.markdown.trim().length > 0;

  return (
    <div className="oc-project-panel">
      <header className="oc-project-head">
        <div className="oc-project-head-main">
          <div className="oc-project-title">Project brief</div>
          <div className="oc-project-subtitle">
            The <code>project.md</code> every agent reads before acting —
            gates all build tools until established.
          </div>
        </div>
        <span
          className="oc-project-state"
          data-state={established ? "established" : "empty"}
          title={
            established
              ? "Brief has enough content — orchestrator will build freely"
              : "Brief is empty — orchestrator is gated on filling this in"
          }
        >
          <span className="oc-project-state-dot" />
          {established ? "Established" : "Empty"}
        </span>
      </header>

      <div className="oc-project-toolbar">
        {mode === "view" ? (
          <>
            <button
              type="button"
              className="oc-project-btn oc-project-btn--primary"
              onClick={startEdit}
            >
              {hasBody ? "Edit" : "Start writing"}
            </button>
            {hasBody && (
              <button
                type="button"
                className="oc-project-btn"
                onClick={clear}
                title="Wipe the brief (re-gates the orchestrator)"
              >
                Clear
              </button>
            )}
            <span className="oc-project-meta">
              {doc.lastWriter === "agent"
                ? `Written by agent · ${updatedAgo}`
                : doc.lastWriter === "user"
                  ? `Edited by you · ${updatedAgo}`
                  : "Not yet saved"}
            </span>
          </>
        ) : (
          <>
            <button
              type="button"
              className="oc-project-btn oc-project-btn--primary"
              onClick={save}
              disabled={!dirty}
            >
              {dirty ? "Save" : "Saved"}
            </button>
            <button
              type="button"
              className="oc-project-btn"
              onClick={cancelEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              className="oc-project-btn"
              onClick={() => {
                setDraft(PROJECT_DOC_TEMPLATE);
                setDirty(true);
              }}
              title="Replace the draft with the starter template"
            >
              Reset to template
            </button>
            <span className="oc-project-meta">
              Markdown · auto-saves on blur
            </span>
          </>
        )}
      </div>

      <div className="oc-project-body">
        {mode === "view" ? (
          hasBody ? (
            <div className="oc-project-rendered">
              <ChatMarkdown>{doc.markdown}</ChatMarkdown>
            </div>
          ) : (
            <div className="oc-project-empty">
              <div className="oc-project-empty-title">No brief yet</div>
              <div className="oc-project-empty-body">
                The orchestrator won&rsquo;t start building until the brief is
                written. Either describe the project in chat (the agent will
                synthesize + save it) or click <strong>Start writing</strong>
                {" "}
                to write it yourself.
              </div>
            </div>
          )
        ) : (
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            onBlur={() => {
              if (dirty) {
                projectDocStore.set(draft, "user");
                setDirty(false);
              }
            }}
            placeholder={PROJECT_DOC_TEMPLATE}
            spellCheck={false}
            className="oc-project-editor"
            autoFocus
          />
        )}
      </div>
    </div>
  );
}
