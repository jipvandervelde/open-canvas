"use client";

import { useEffect, useMemo, useState } from "react";
import {
  projectNotesStore,
  type NoteCategory,
  type ProjectNote,
} from "@/lib/project-notes-store";
import { ChatMarkdown } from "@/components/ChatMarkdown";

/**
 * Project Notes panel — the orchestrator's durable scratchpad, visible
 * to the user. Lists all notes by category, expands into a markdown-
 * rendered body, and lets the user edit/delete inline.
 *
 * Notes get injected into every agent turn's system prompt (see the
 * `projectNotes` transport body field), so tweaking a note here steers
 * the agent on the NEXT turn without requiring a new prompt from the user.
 */

const CATEGORIES: NoteCategory[] = ["decision", "plan", "pattern", "learning"];

export function NotesPanel() {
  const [notes, setNotes] = useState<ProjectNote[]>(() =>
    projectNotesStore.get(),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setNotes(projectNotesStore.get());
    return projectNotesStore.subscribe(setNotes);
  }, []);

  const grouped = useMemo(() => {
    const out: Record<NoteCategory, ProjectNote[]> = {
      decision: [],
      plan: [],
      pattern: [],
      learning: [],
    };
    for (const n of notes) out[n.category].push(n);
    // Within each category: newest first.
    for (const k of CATEGORIES) {
      out[k].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return out;
  }, [notes]);

  function startEdit(note: ProjectNote) {
    setEditing(note.id);
    setDraft(note.body);
    setExpanded(note.id);
  }

  function saveEdit(note: ProjectNote) {
    projectNotesStore.upsert({ ...note, body: draft, updatedAt: Date.now() });
    setEditing(null);
    setDraft("");
  }

  function cancelEdit() {
    setEditing(null);
    setDraft("");
  }

  function deleteNote(note: ProjectNote) {
    if (
      !window.confirm(
        `Delete note "${note.title}"? The agent will re-derive its contents from scratch next time it's relevant.`,
      )
    )
      return;
    projectNotesStore.remove(note.id);
    if (expanded === note.id) setExpanded(null);
  }

  function addBlankNote(category: NoteCategory) {
    const note = projectNotesStore.upsertByTitle({
      title: "New note",
      category,
      body: "Write something for the agent to remember…",
    });
    setExpanded(note.id);
    startEdit(note);
  }

  if (notes.length === 0) {
    return (
      <div className="oc-notes">
        <header className="oc-notes-head">
          <div>
            <div className="oc-notes-title">Notes</div>
            <div className="oc-notes-subtitle">
              The agent&apos;s durable scratchpad. Empty for now — the orchestrator
              writes here as it plans, decides, and learns across turns.
            </div>
          </div>
        </header>
        <div className="oc-notes-seed">
          <div className="oc-notes-seed-hint">Add a note manually:</div>
          <div className="oc-notes-seed-row">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className="oc-notes-seed-btn"
                onClick={() => addBlankNote(c)}
              >
                + {c}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="oc-notes">
      <header className="oc-notes-head">
        <div>
          <div className="oc-notes-title">Notes</div>
          <div className="oc-notes-subtitle oc-tabular">
            {notes.length} · agent scratchpad across turns
          </div>
        </div>
      </header>

      {CATEGORIES.map((cat) => {
        const group = grouped[cat];
        if (group.length === 0) return null;
        return (
          <section key={cat} className="oc-notes-group">
            <div className="oc-notes-group-head">
              <span className="oc-notes-group-label">{cat}</span>
              <span className="oc-notes-group-count oc-tabular">
                {group.length}
              </span>
              <button
                type="button"
                className="oc-notes-group-add"
                onClick={() => addBlankNote(cat)}
                title={`Add a ${cat} note`}
              >
                +
              </button>
            </div>
            <ul className="oc-notes-list">
              {group.map((n) => {
                const isOpen = expanded === n.id;
                const isEditing = editing === n.id;
                return (
                  <li key={n.id} className="oc-notes-item">
                    <button
                      type="button"
                      className="oc-notes-item-head"
                      onClick={() =>
                        setExpanded((cur) => (cur === n.id ? null : n.id))
                      }
                      aria-expanded={isOpen}
                    >
                      <span
                        className="oc-notes-caret"
                        data-open={isOpen || undefined}
                        aria-hidden
                      >
                        ›
                      </span>
                      <span className="oc-notes-item-title">{n.title}</span>
                      <span className="oc-notes-item-meta oc-tabular">
                        {relTime(n.updatedAt)}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="oc-notes-body">
                        {isEditing ? (
                          <>
                            <textarea
                              className="oc-notes-edit-textarea"
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              rows={Math.max(
                                4,
                                Math.min(20, draft.split("\n").length + 1),
                              )}
                              autoFocus
                              onKeyDown={(e) => {
                                if (
                                  (e.metaKey || e.ctrlKey) &&
                                  e.key === "Enter"
                                ) {
                                  e.preventDefault();
                                  saveEdit(n);
                                } else if (e.key === "Escape") {
                                  cancelEdit();
                                }
                              }}
                            />
                            <div className="oc-notes-edit-actions">
                              <button
                                type="button"
                                className="oc-notes-btn oc-notes-btn--ghost"
                                onClick={cancelEdit}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="oc-notes-btn"
                                onClick={() => saveEdit(n)}
                              >
                                Save · ⌘↵
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="oc-notes-md">
                              <ChatMarkdown>{n.body}</ChatMarkdown>
                            </div>
                            <div className="oc-notes-body-actions">
                              <button
                                type="button"
                                className="oc-notes-btn oc-notes-btn--ghost"
                                onClick={() => deleteNote(n)}
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                className="oc-notes-btn"
                                onClick={() => startEdit(n)}
                              >
                                Edit
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function relTime(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`;
  return `${Math.round(d / 86_400_000)}d ago`;
}
