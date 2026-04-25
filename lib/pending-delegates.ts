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
  private listeners = new Set<() => void>();

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

  markClientToolCallObserved() {
    for (const listener of this.listeners) listener();
  }

  /**
   * Shared artifacts (components, services, data entities) can be emitted in
   * the same assistant message as delegateScreen calls. Delegates stream in a
   * background task, so they wait for a short quiet window across both client
   * tool-call observation and artifact-ready events before snapshotting project
   * context; otherwise a service created by a neighboring tool call might miss
   * the sub-agent prompt.
   */
  markProjectArtifactReady() {
    for (const listener of this.listeners) listener();
  }

  waitForProjectArtifactQuiet(quietMs = 260, maxWaitMs = 1200): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      let quietTimer: ReturnType<typeof setTimeout> | null = null;
      let maxTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (quietTimer) clearTimeout(quietTimer);
        if (maxTimer) clearTimeout(maxTimer);
        this.listeners.delete(onChange);
        resolve();
      };

      const armQuietTimer = () => {
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(cleanup, quietMs);
      };

      const onChange = () => armQuietTimer();

      this.listeners.add(onChange);
      maxTimer = setTimeout(cleanup, maxWaitMs);
      armQuietTimer();
    });
  }
}

export const pendingDelegates = new PendingDelegatesStore();
