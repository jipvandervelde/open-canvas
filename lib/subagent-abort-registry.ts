/**
 * Abort registry for in-flight sub-agent fetches (delegateScreen,
 * reviewScreen, generate-seeds, etc). When the user hits the stop button
 * in the composer, we call `abortAll()` to cancel every streaming sub-agent
 * response alongside the main `useChat.stop()`.
 *
 * Each controller is registered with a scope string (usually the tool call
 * id so we can dedupe if the same sub-agent is re-attempted) and is
 * automatically unregistered when the caller invokes the returned
 * `release()` callback — typically in a `finally` block after the fetch
 * resolves or errors.
 */
export type AbortScope = string;

const controllers = new Map<AbortScope, AbortController>();

export const subAgentAbortRegistry = {
  register(scope: AbortScope): { controller: AbortController; release: () => void } {
    // If a previous controller was already registered under this scope
    // (e.g. the same toolCallId retried), abort it first so we don't leak
    // two live fetches tied to the same logical operation.
    const existing = controllers.get(scope);
    if (existing) {
      try {
        existing.abort();
      } catch {
        /* ignore — AbortController.abort() never throws in practice */
      }
    }
    const controller = new AbortController();
    controllers.set(scope, controller);
    return {
      controller,
      release: () => {
        const cur = controllers.get(scope);
        if (cur === controller) controllers.delete(scope);
      },
    };
  },
  abortAll() {
    for (const [, c] of controllers) {
      try {
        c.abort();
      } catch {
        /* ignore */
      }
    }
    controllers.clear();
  },
  size(): number {
    return controllers.size;
  },
};
