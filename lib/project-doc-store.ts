/**
 * Project brief (`project.md`) — a user-authored single source of truth for
 * WHAT the current Open Canvas project is: the product being built, who
 * it's for, the core features, the design vibe, the data shape. The
 * orchestrator is GATED on this: no build tools fire until the brief has
 * meaningful content, because every tool call without project context is
 * a guess that wastes tokens and diverges from the user's intent.
 *
 * The brief is persisted to localStorage so it survives reloads. It can be
 * written by the orchestrator (via the `writeProjectDoc` tool) or edited
 * directly by the user in the Project tab. Both paths go through
 * `.set(markdown)` here and emit to subscribers.
 *
 * `isEstablished()` is the gate check: a rough heuristic based on the
 * rendered markdown length. We don't validate structure because users
 * phrase their briefs differently — a 3-paragraph description is
 * perfectly valid, and we'd rather let good-enough through than reject
 * a real brief on a schema detail.
 */

const STORAGE_KEY = "oc:project-doc:v1";

/** Default starter content shown in the Project tab before anything is set. */
export const PROJECT_DOC_TEMPLATE = `# Project brief

## What is this?
<One paragraph: the product, in plain English.>

## Who is this for?
<Target user — their role, their context, the problem you're solving.>

## Core features (V1)
- <feature 1 — one line>
- <feature 2 — one line>

## Vibe & tone
<Design aesthetic keywords, brand voice, inspiration refs.>

## Platforms
<web / mobile / universal — which viewports matter most.>

## Out of scope
<What you're explicitly NOT building in V1.>

## Data model
<Entities the app revolves around + rough fields.>
`;

/** ~100 chars of real content is a good "the user put thought in" floor. */
const ESTABLISHED_MIN_CHARS = 100;

/** Unfilled template slots look like `<placeholder>` — strip them from the
 *  established-ness check so a fully-default template doesn't count. */
const PLACEHOLDER_RE = /<[^>]{1,120}>/g;

type ProjectDoc = {
  markdown: string;
  /** Epoch ms of the last write. Null until the first real write lands. */
  updatedAt: number | null;
  /** Who touched it last — useful for future multi-user conflict hints. */
  lastWriter: "user" | "agent" | null;
};

type Listener = (doc: ProjectDoc) => void;

const EMPTY: ProjectDoc = {
  markdown: "",
  updatedAt: null,
  lastWriter: null,
};

function safeRead(): ProjectDoc {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<ProjectDoc>;
    return {
      markdown: typeof parsed.markdown === "string" ? parsed.markdown : "",
      updatedAt:
        typeof parsed.updatedAt === "number" ? parsed.updatedAt : null,
      lastWriter:
        parsed.lastWriter === "user" || parsed.lastWriter === "agent"
          ? parsed.lastWriter
          : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

function safeWrite(doc: ProjectDoc) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    /* quota / private-browsing — in-memory state still correct */
  }
}

let current: ProjectDoc = safeRead();
const listeners = new Set<Listener>();

function emit() {
  const snap = { ...current };
  for (const l of listeners) l(snap);
}

/** Effective content — the markdown minus placeholder tokens. Used for the
 *  gate threshold so the starter template doesn't accidentally establish. */
export function effectiveProjectDocContent(markdown: string): string {
  return markdown.replace(PLACEHOLDER_RE, "").trim();
}

export const projectDocStore = {
  get(): ProjectDoc {
    return current;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(markdown: string, writer: "user" | "agent") {
    current = {
      markdown,
      updatedAt: Date.now(),
      lastWriter: writer,
    };
    safeWrite(current);
    emit();
  },
  reset() {
    current = { ...EMPTY };
    safeWrite(current);
    emit();
  },
  /** The established check used by the orchestrator gate. */
  isEstablished(): boolean {
    return (
      effectiveProjectDocContent(current.markdown).length >=
      ESTABLISHED_MIN_CHARS
    );
  },
};
