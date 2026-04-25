/**
 * Canvas tool mode. Drives what pointer events do on a screen:
 *   - cursor    → clicks pass through into the live iframe (interactive)
 *   - hand      → drag anywhere to pan; no selection; no click-through
 *   - inspector → armed element selection inside the selected screen; edits
 *                 flow into the screen's JSX via Dialkit (design mode)
 *   - annotator → armed element selection like inspector, but clicking an
 *                 element opens a note/comment input instead of the style
 *                 editor. Uses the same in-iframe agent framework.
 *
 * Renamed from the old `design | interactive` pair. Old storage values are
 * migrated on hydrate so returning users don't lose their mode.
 */

export type CanvasMode =
  | "cursor"
  | "hand"
  | "inspector"
  | "annotator"
  | "agentation";

/** The iframe-protocol mode we post into every Sandpack. The in-iframe
 *  selection agent knows only this narrower set. */
export type IframeMode = "design" | "interactive" | "off" | "agentation";

export function toIframeMode(mode: CanvasMode): IframeMode {
  if (mode === "cursor") return "interactive";
  if (mode === "hand") return "off";
  if (mode === "agentation") return "agentation";
  return "design"; // inspector + annotator both arm element selection
}

const STORAGE_KEY = "oc:canvas-mode";

type Listener = (mode: CanvasMode) => void;

class CanvasModeStore {
  private current: CanvasMode = "inspector";
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): CanvasMode {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      // Accept new modes verbatim; migrate legacy values so existing users
      // don't get bounced back to the default after the rename.
      if (
        stored === "cursor" ||
        stored === "hand" ||
        stored === "inspector" ||
        stored === "annotator" ||
        stored === "agentation"
      ) {
        this.current = stored;
      } else if (stored === "design") {
        this.current = "inspector";
      } else if (stored === "interactive") {
        this.current = "cursor";
      }
      document.documentElement.setAttribute(
        "data-canvas-mode",
        this.current,
      );
    }
    return this.current;
  }

  get(): CanvasMode {
    if (!this.hydrated) this.hydrate();
    return this.current;
  }

  set(mode: CanvasMode) {
    if (this.current === mode) return;
    this.current = mode;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* noop */
    }
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-canvas-mode", mode);
    }
    for (const l of this.listeners) l(mode);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
}

export const canvasModeStore = new CanvasModeStore();

if (typeof window !== "undefined") {
  (window as unknown as { __canvasModeStore: CanvasModeStore }).__canvasModeStore =
    canvasModeStore;
  canvasModeStore.hydrate();
}
