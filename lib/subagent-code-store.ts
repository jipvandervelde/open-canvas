/**
 * Tracks the live accumulating React source being streamed from each
 * in-flight `delegateScreen` sub-agent, keyed by the orchestrator's
 * toolCallId. The in-chat tool card subscribes to this so it can render a
 * rolling "code tail" exactly like streaming createScreen used to show —
 * but with text that comes from our own client-side fetch stream, not the
 * AI SDK's tool-input stream.
 *
 * Separate from streamingStore because this fires MUCH more often (every
 * few tokens of JS) and its subscribers are mounted per-tool-card rather
 * than per-canvas. Mixing them would bog down the agent-cursor path.
 */

type Listener = (code: string) => void;

class SubAgentCodeStore {
  private codeByToolCallId = new Map<string, string>();
  private listeners = new Map<string, Set<Listener>>();

  get(toolCallId: string): string {
    return this.codeByToolCallId.get(toolCallId) ?? "";
  }

  set(toolCallId: string, code: string) {
    if (this.codeByToolCallId.get(toolCallId) === code) return;
    this.codeByToolCallId.set(toolCallId, code);
    const ls = this.listeners.get(toolCallId);
    if (ls) for (const l of ls) l(code);
  }

  remove(toolCallId: string) {
    if (!this.codeByToolCallId.delete(toolCallId)) return;
    const ls = this.listeners.get(toolCallId);
    if (ls) for (const l of ls) l("");
  }

  subscribe(toolCallId: string, listener: Listener): () => void {
    if (!this.listeners.has(toolCallId)) this.listeners.set(toolCallId, new Set());
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

export const subAgentCodeStore = new SubAgentCodeStore();
