/**
 * Project Notes — the orchestrator's durable scratchpad. Survives across
 * turns so the agent doesn't re-derive decisions, plans, patterns, or
 * learnings every time. Written to by `writeNote` tool calls; read back
 * as an index injected into every turn's system prompt.
 *
 * Four categories, chosen from analyzing chain-of-thought transcripts:
 *   - **decision** — "going with stack nav over tabs"
 *   - **plan**     — "4 screens: Home / Game / Profile / Settings"
 *   - **pattern**  — "every screen uses 48px bottom CTA above home indicator"
 *   - **learning** — "Sandpack requires statusBarStyle in shape props"
 *
 * Stored in localStorage under a single JSON blob — simple, fast, fits
 * the project-scoped model (no cross-project leakage since localStorage
 * is per-origin and each project runs in the same origin anyway).
 */

export type NoteCategory = "decision" | "plan" | "pattern" | "learning";

export type ProjectNote = {
  id: string;
  title: string;
  category: NoteCategory;
  body: string;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "oc:project-notes";

type Listener = (notes: ProjectNote[]) => void;

class ProjectNotesStore {
  private current: ProjectNote[] = [];
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): ProjectNote[] {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    if (typeof window === "undefined") return this.current;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ProjectNote[];
        if (Array.isArray(parsed)) this.current = parsed;
      }
    } catch {
      /* storage disabled */
    }
    return this.current;
  }

  get(): ProjectNote[] {
    if (!this.hydrated) this.hydrate();
    return this.current;
  }

  /** Newest first — the form the orchestrator benefits from most. */
  getRecent(limit: number): ProjectNote[] {
    return [...this.get()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  findById(id: string): ProjectNote | undefined {
    return this.get().find((n) => n.id === id);
  }

  upsert(note: ProjectNote) {
    const i = this.current.findIndex((n) => n.id === note.id);
    if (i >= 0) this.current = this.current.map((n, j) => (j === i ? note : n));
    else this.current = [...this.current, note];
    this.persist();
    this.notify();
  }

  /** Upsert by title within a category — prevents duplicate "plan" notes. */
  upsertByTitle(partial: Omit<ProjectNote, "id" | "createdAt" | "updatedAt">) {
    const existing = this.current.find(
      (n) => n.title === partial.title && n.category === partial.category,
    );
    const now = Date.now();
    const note: ProjectNote = {
      id: existing?.id ?? `n_${now.toString(36)}`,
      title: partial.title,
      category: partial.category,
      body: partial.body,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.upsert(note);
    return note;
  }

  remove(id: string) {
    this.current = this.current.filter((n) => n.id !== id);
    this.persist();
    this.notify();
  }

  clearAll() {
    this.current = [];
    this.persist();
    this.notify();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  /**
   * Short, model-scannable index of the N most recent notes for injection
   * into the orchestrator's system prompt. Each entry is ~1 line +
   * body preview. The full body can be pulled via `readNote` tool.
   */
  toPromptIndex(limit = 12): string {
    const recent = this.getRecent(limit);
    if (recent.length === 0) return "";
    const lines = [
      "Project notes (your own durable scratchpad — call readNote({id}) to fetch a full body):",
    ];
    for (const n of recent) {
      const preview = n.body.split("\n")[0].slice(0, 120);
      lines.push(`- [${n.category}] "${n.title}" (id: ${n.id}) — ${preview}`);
    }
    return lines.join("\n");
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      /* ignore */
    }
  }

  private notify() {
    for (const l of this.listeners) l(this.current);
  }
}

export const projectNotesStore = new ProjectNotesStore();

if (typeof window !== "undefined") {
  (
    window as unknown as { __projectNotesStore: ProjectNotesStore }
  ).__projectNotesStore = projectNotesStore;
  projectNotesStore.hydrate();
}
