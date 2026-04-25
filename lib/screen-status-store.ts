/**
 * Tracks per-screen Sandpack compile status so the AI tool handlers can
 * await the verdict before returning a result to the model. This is what
 * lets the agent self-fix: a failed compile returns ok:false to the model,
 * which then fixes the code and calls the tool again.
 */

export type ScreenCompileStatus =
  | { kind: "pending" }
  | { kind: "success" }
  | { kind: "error"; message: string };

type Listener = (status: ScreenCompileStatus) => void;
type AllListener = (snapshot: Map<string, ScreenCompileStatus>) => void;

class ScreenStatusStore {
  private statuses = new Map<string, ScreenCompileStatus>();
  private listeners = new Map<string, Set<Listener>>();
  private allListeners = new Set<AllListener>();
  private mountVersion = new Map<string, number>();

  /** Bump version on every code change so awaiters know "this is a fresh compile". */
  bumpVersion(id: string): number {
    const next = (this.mountVersion.get(id) ?? 0) + 1;
    this.mountVersion.set(id, next);
    this.set(id, { kind: "pending" });
    return next;
  }

  set(id: string, status: ScreenCompileStatus) {
    this.statuses.set(id, status);
    const ls = this.listeners.get(id);
    if (ls) for (const l of ls) l(status);
    const snap = new Map(this.statuses);
    for (const l of this.allListeners) l(snap);
  }

  getAll(): Map<string, ScreenCompileStatus> {
    return new Map(this.statuses);
  }

  subscribeAll(listener: AllListener): () => void {
    this.allListeners.add(listener);
    return () => {
      this.allListeners.delete(listener);
    };
  }

  get(id: string): ScreenCompileStatus | undefined {
    return this.statuses.get(id);
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

  /**
   * Wait for the screen's compile to finish (success or error) or for the
   * timeout to elapse. Returns the final status, or `pending` on timeout.
   */
  async waitForCompletion(
    id: string,
    timeoutMs: number,
  ): Promise<ScreenCompileStatus> {
    const current = this.statuses.get(id);
    if (current && current.kind !== "pending") return current;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        unsub();
        const final = this.statuses.get(id) ?? { kind: "pending" };
        resolve(final);
      }, timeoutMs);

      const unsub = this.subscribe(id, (status) => {
        if (status.kind !== "pending") {
          clearTimeout(timer);
          unsub();
          resolve(status);
        }
      });
    });
  }
}

export const screenStatusStore = new ScreenStatusStore();

if (typeof window !== "undefined") {
  (window as unknown as { __screenStatusStore: ScreenStatusStore }).__screenStatusStore =
    screenStatusStore;
}
