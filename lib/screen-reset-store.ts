/**
 * Per-screen "reset" counter. Bumping this for a given screen flips its
 * Sandpack key downstream, which tears down and re-mounts the preview — all
 * internal React state (navigation stacks, accordion open/closed, form
 * drafts, toast queues, etc.) resets to initial values without touching the
 * screen's code.
 *
 * Kept separate from screen-status-store's mountVersion so that the agent's
 * code-change compile cycle and the user's manual "reset preview" action
 * don't step on each other.
 */

type Listener = (count: number) => void;

class ScreenResetStore {
  private counts = new Map<string, number>();
  private listeners = new Map<string, Set<Listener>>();

  get(id: string): number {
    return this.counts.get(id) ?? 0;
  }

  bump(id: string): number {
    const next = this.get(id) + 1;
    this.counts.set(id, next);
    const ls = this.listeners.get(id);
    if (ls) for (const l of ls) l(next);
    return next;
  }

  subscribe(id: string, listener: Listener): () => void {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id)!.add(listener);
    return () => {
      const set = this.listeners.get(id);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.listeners.delete(id);
      }
    };
  }
}

export const screenResetStore = new ScreenResetStore();
