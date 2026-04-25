/**
 * Session-level token accounting across all Kimi calls: the orchestrator,
 * reviewer, focused sub-reviewers, screen sub-agents, seed sub-agents.
 *
 * Every endpoint that wraps a Kimi request feeds usage back to the client
 * via its stream (NDJSON usage events, UIMessage metadata, or a trailing
 * sentinel on the generate-screen text stream). The client-side read
 * loops call `tokenUsageStore.add(...)` exactly once per completed call
 * so totals reflect real token consumption, not string-length heuristics.
 *
 * Scoped to the browser tab — no persistence. `reset()` is wired into the
 * project-level reset button in the chat header.
 */

export type UsageDelta = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  /** Which sub-system produced this usage — useful for a future breakdown. */
  source?:
    | "chat"
    | "review"
    | "review-focused"
    | "generate-screen"
    | "generate-seeds";
};

type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  callCount: number;
};

type Listener = (totals: UsageTotals) => void;

const EMPTY: UsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
  callCount: 0,
};

let totals: UsageTotals = { ...EMPTY };
/**
 * Ids we've already counted — keyed by an opaque string the caller
 * provides (e.g. the assistant messageId for the chat route, or the
 * toolCallId for sub-agent fetches). Prevents React re-renders from
 * double-accumulating usage from a metadata-bearing message.
 */
const seenIds = new Set<string>();
const listeners = new Set<Listener>();

function emit() {
  const snap = { ...totals };
  for (const l of listeners) l(snap);
}

export const tokenUsageStore = {
  get(): UsageTotals {
    return totals;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /**
   * Add a usage delta. Pass `id` when you want dedupe protection — the
   * store ignores subsequent `add` calls with the same id.
   */
  add(delta: UsageDelta, id?: string) {
    if (id) {
      if (seenIds.has(id)) return;
      seenIds.add(id);
    }
    const input = delta.inputTokens ?? 0;
    const output = delta.outputTokens ?? 0;
    const reasoning = delta.reasoningTokens ?? 0;
    // totalTokens may be provided authoritatively by the model; if not,
    // derive from inputs + outputs + reasoning so the counter still grows.
    const total = delta.totalTokens ?? input + output + reasoning;
    totals = {
      inputTokens: totals.inputTokens + input,
      outputTokens: totals.outputTokens + output,
      reasoningTokens: totals.reasoningTokens + reasoning,
      totalTokens: totals.totalTokens + total,
      callCount: totals.callCount + 1,
    };
    emit();
  },
  reset() {
    totals = { ...EMPTY };
    seenIds.clear();
    emit();
  },
};

/** Compact "12.3K" style formatter for chrome where vertical space is tight. */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(2)}K`;
  if (n < 100_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
