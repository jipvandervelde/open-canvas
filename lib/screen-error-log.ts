/**
 * Collects errors raised by any screen's preview pipeline so the user can
 * inspect them after the fact — even if the final render "looks fine" and
 * the tool call reported success. Covers three sources:
 *
 *   - "compile": Babel / bundler errors surfaced by Sandpack's show-error
 *     messages (the SandpackStatusReporter forwards them here).
 *   - "runtime": React render errors caught by the in-iframe
 *     `__OcErrorBoundary` and posted back as `oc:runtime-error`.
 *   - "tool": the chat tool handler rejected the final code (compile
 *     timeout, persistent compile failure, etc.).
 *
 * Keyed by shape id, ring-buffered per screen so we don't grow unbounded.
 */

export type ScreenErrorSource = "compile" | "runtime" | "tool";

export type ScreenErrorEntry = {
  id: string;
  screenId: string;
  source: ScreenErrorSource;
  message: string;
  at: number;
};

type Listener = (errors: ScreenErrorEntry[]) => void;
type AllListener = (all: Map<string, ScreenErrorEntry[]>) => void;

const MAX_PER_SCREEN = 25;

class ScreenErrorLog {
  private byScreen = new Map<string, ScreenErrorEntry[]>();
  private listeners = new Map<string, Set<Listener>>();
  private allListeners = new Set<AllListener>();
  private counter = 0;

  record(
    screenId: string,
    source: ScreenErrorSource,
    message: string,
  ): ScreenErrorEntry | null {
    if (!screenId || !message) return null;
    // De-dupe against the most recent entry with the same source+message —
    // compilers and error boundaries love to re-fire the identical error
    // multiple times for a single compile.
    const list = this.byScreen.get(screenId) ?? [];
    const last = list[list.length - 1];
    if (last && last.source === source && last.message === message) {
      return last;
    }
    const entry: ScreenErrorEntry = {
      id: `e_${++this.counter}_${Date.now().toString(36)}`,
      screenId,
      source,
      message,
      at: Date.now(),
    };
    list.push(entry);
    if (list.length > MAX_PER_SCREEN) list.shift();
    this.byScreen.set(screenId, list);
    this.notify(screenId);
    // Console mirror so you can tail errors from devtools regardless of UI.
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(
        `[oc-error][${source}] screen=${screenId.slice(-6)}`,
        message,
      );
    }
    return entry;
  }

  getForScreen(screenId: string): ScreenErrorEntry[] {
    return this.byScreen.get(screenId) ?? [];
  }

  getAll(): Map<string, ScreenErrorEntry[]> {
    return new Map(this.byScreen);
  }

  clearForScreen(screenId: string): void {
    if (!this.byScreen.has(screenId)) return;
    this.byScreen.delete(screenId);
    this.notify(screenId);
  }

  subscribe(screenId: string, listener: Listener): () => void {
    if (!this.listeners.has(screenId)) this.listeners.set(screenId, new Set());
    this.listeners.get(screenId)!.add(listener);
    return () => {
      const set = this.listeners.get(screenId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.listeners.delete(screenId);
      }
    };
  }

  subscribeAll(listener: AllListener): () => void {
    this.allListeners.add(listener);
    return () => {
      this.allListeners.delete(listener);
    };
  }

  private notify(screenId: string) {
    const list = this.byScreen.get(screenId) ?? [];
    const ls = this.listeners.get(screenId);
    if (ls) for (const l of ls) l(list);
    const snap = this.getAll();
    for (const l of this.allListeners) l(snap);
  }
}

export const screenErrorLog = new ScreenErrorLog();

if (typeof window !== "undefined") {
  (window as unknown as { __screenErrorLog: ScreenErrorLog }).__screenErrorLog =
    screenErrorLog;
}
