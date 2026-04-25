/**
 * Width of the left panel (Chat / Code / Tokens / Components). Persisted to
 * localStorage; applied by writing to the `--left-panel-w` CSS variable on
 * <html>, which both the panel's `width` style and TldrawCanvas's `left`
 * style read. Clamped to [MIN, MAX] so the user can't shrink the panel
 * below a usable width or push the canvas off-screen.
 */

const STORAGE_KEY = "oc:left-panel-w";
export const MIN_WIDTH = 440;
export const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 440;

type Listener = (width: number) => void;

class LeftPanelWidthStore {
  private current: number = DEFAULT_WIDTH;
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): number {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    if (typeof window === "undefined") return this.current;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw != null ? parseInt(raw, 10) : NaN;
      if (!isNaN(parsed)) this.current = clamp(parsed);
    } catch {
      /* ignore */
    }
    this.apply();
    return this.current;
  }

  get(): number {
    if (!this.hydrated) this.hydrate();
    return this.current;
  }

  set(width: number) {
    const next = clamp(width);
    if (next === this.current) return;
    this.current = next;
    this.persist();
    this.apply();
    for (const l of this.listeners) l(next);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(this.current));
    } catch {
      /* ignore */
    }
  }

  private apply() {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty(
      "--left-panel-w",
      `${this.current}px`,
    );
  }
}

function clamp(w: number): number {
  if (!isFinite(w)) return DEFAULT_WIDTH;
  return Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)));
}

export const leftPanelWidthStore = new LeftPanelWidthStore();

if (typeof window !== "undefined") {
  (
    window as unknown as { __leftPanelWidthStore: LeftPanelWidthStore }
  ).__leftPanelWidthStore = leftPanelWidthStore;
  leftPanelWidthStore.hydrate();
}
