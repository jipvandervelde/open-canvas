/**
 * Module-level registry of in-flight `delegateScreen` tool calls. When the
 * orchestrator emits several delegates in one assistant message, each one's
 * client handler registers itself here synchronously, then waits a moment
 * to let concurrent handlers also register, THEN reads the sibling list to
 * inject into its own sub-agent's sharedContext.
 *
 * The payoff: each sub-agent writes with awareness of what its siblings are
 * building in parallel, so the batch comes out visually + structurally
 * cohesive (shared tab bar, same card pattern, consistent typography).
 */

export type PendingDelegate = {
  toolCallId: string;
  name: string;
  viewportId: string;
  brief: string;
};

class PendingDelegatesStore {
  private pending = new Map<string, PendingDelegate>();

  register(d: PendingDelegate) {
    this.pending.set(d.toolCallId, d);
  }

  unregister(toolCallId: string) {
    this.pending.delete(toolCallId);
  }

  siblings(selfToolCallId: string): PendingDelegate[] {
    const out: PendingDelegate[] = [];
    for (const d of this.pending.values()) {
      if (d.toolCallId !== selfToolCallId) out.push(d);
    }
    return out;
  }
}

export const pendingDelegates = new PendingDelegatesStore();
