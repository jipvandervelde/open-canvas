/**
 * Per-reviewScreen live transcript keyed by the orchestrator's toolCallId.
 *
 * The reviewer is an agent in its own right: it streams reasoning, emits
 * `think` chips, fires per-issue `flagIssue` tool calls, and can spawn
 * focused sub-reviewers in parallel. We mirror that shape here so the
 * chat card can render each artifact as it arrives instead of waiting
 * for the final JSON payload.
 *
 * The store's "done" state still carries the aggregated issues + summary
 * for backward compatibility with ReviewScreenCard consumers that read
 * `output.issues` from the tool result.
 */

export type ReviewIssue = {
  severity?: string;
  category?: string;
  location?: string;
  problem?: string;
  fix?: string;
};

export type ReviewThink = {
  topic: string;
  thought: string;
};

export type SubReviewer = {
  focus: string;
  status: "running" | "done" | "error";
  issueCount: number;
  error?: string;
};

type ReviewStream = {
  reasoning: string;
  text: string;
  status: "streaming" | "parsing" | "done" | "error";
  error?: string;
  /** Progressive thinks — each `think` tool call the reviewer emitted. */
  thinks: ReviewThink[];
  /** Progressive issues — accumulated from `flagIssue` tool calls. */
  issues: ReviewIssue[];
  /** Sub-reviewer activity keyed by focus. */
  subReviewers: SubReviewer[];
  /** Live summary text (populated by `finalize`). */
  summary?: string;
};

type Listener = (entry: ReviewStream) => void;

const EMPTY: ReviewStream = {
  reasoning: "",
  text: "",
  status: "streaming",
  thinks: [],
  issues: [],
  subReviewers: [],
};

class ReviewStreamStore {
  private byId = new Map<string, ReviewStream>();
  private listeners = new Map<string, Set<Listener>>();

  get(toolCallId: string): ReviewStream {
    return this.byId.get(toolCallId) ?? EMPTY;
  }

  private emit(toolCallId: string) {
    const entry = this.byId.get(toolCallId);
    if (!entry) return;
    const ls = this.listeners.get(toolCallId);
    if (ls) for (const l of ls) l(entry);
  }

  private update(toolCallId: string, patch: Partial<ReviewStream>) {
    const current = this.byId.get(toolCallId) ?? { ...EMPTY };
    this.byId.set(toolCallId, { ...current, ...patch });
    this.emit(toolCallId);
  }

  initFor(toolCallId: string) {
    if (!this.byId.has(toolCallId)) {
      this.byId.set(toolCallId, {
        reasoning: "",
        text: "",
        status: "streaming",
        thinks: [],
        issues: [],
        subReviewers: [],
      });
      this.emit(toolCallId);
    }
  }

  appendReasoning(toolCallId: string, delta: string) {
    const current = this.byId.get(toolCallId) ?? { ...EMPTY };
    this.update(toolCallId, { reasoning: current.reasoning + delta });
  }

  appendText(toolCallId: string, delta: string) {
    const current = this.byId.get(toolCallId) ?? { ...EMPTY };
    this.update(toolCallId, { text: current.text + delta });
  }

  addThink(toolCallId: string, think: ReviewThink) {
    const current = this.byId.get(toolCallId) ?? { ...EMPTY };
    this.update(toolCallId, { thinks: [...current.thinks, think] });
  }

  addIssue(toolCallId: string, issue: ReviewIssue) {
    const current = this.byId.get(toolCallId) ?? { ...EMPTY };
    this.update(toolCallId, { issues: [...current.issues, issue] });
  }

  setSummary(toolCallId: string, summary: string) {
    this.update(toolCallId, { summary });
  }

  startSubReviewer(toolCallId: string, focus: string) {
    const current = this.byId.get(toolCallId) ?? { ...EMPTY };
    // Replace existing entry for same focus (dedup on retry) or append.
    const rest = current.subReviewers.filter((s) => s.focus !== focus);
    this.update(toolCallId, {
      subReviewers: [
        ...rest,
        { focus, status: "running", issueCount: 0 },
      ],
    });
  }

  finishSubReviewer(
    toolCallId: string,
    focus: string,
    result: { issueCount: number; error?: string },
  ) {
    const current = this.byId.get(toolCallId) ?? { ...EMPTY };
    const next = current.subReviewers.map((s) =>
      s.focus === focus
        ? {
            ...s,
            status: (result.error ? "error" : "done") as
              | "running"
              | "done"
              | "error",
            issueCount: result.issueCount,
            error: result.error,
          }
        : s,
    );
    this.update(toolCallId, { subReviewers: next });
  }

  markStatus(
    toolCallId: string,
    status: ReviewStream["status"],
    error?: string,
  ) {
    const current = this.byId.get(toolCallId);
    if (!current) return;
    this.byId.set(toolCallId, { ...current, status, error });
    this.emit(toolCallId);
  }

  remove(toolCallId: string) {
    if (!this.byId.delete(toolCallId)) return;
    const ls = this.listeners.get(toolCallId);
    if (ls) for (const l of ls) l(EMPTY);
  }

  subscribe(toolCallId: string, listener: Listener): () => void {
    if (!this.listeners.has(toolCallId)) {
      this.listeners.set(toolCallId, new Set());
    }
    this.listeners.get(toolCallId)!.add(listener);
    return () => {
      const set = this.listeners.get(toolCallId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.listeners.delete(toolCallId);
      }
    };
  }
}

export const reviewStreamStore = new ReviewStreamStore();
export type { ReviewStream };
