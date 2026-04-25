/**
 * Tracks the currently-selected element inside a screen's live iframe.
 * Populated by the in-iframe selection agent (see SANDPACK_INDEX_JS) via
 * postMessage, consumed by the Inspector + any on-canvas selection overlay.
 */

export type ElementStyles = {
  background: string;
  color: string;
  // Spacing/radius/fontSize accept raw pixel numbers OR CSS strings
  // (e.g. `"var(--space-md)"`) so the inspector can write tokens directly.
  paddingTop: number | string;
  paddingRight: number | string;
  paddingBottom: number | string;
  paddingLeft: number | string;
  borderRadius: number | string;
  fontSize: number | string;
  // Auto-layout (Figma-style) — Phase 1 surface for the frame work in
  // BRAINSTORM §7. These apply directly to the selected element so any
  // div/section/article can be made into a flex container without the
  // model having to rewrite the code.
  display: string; // "block" | "flex" | "grid" | "inline-block" | …
  flexDirection: string; // "row" | "column"
  gap: number | string;
  justifyContent: string; // "flex-start" | "center" | "flex-end" | "space-between" | …
  alignItems: string; // "stretch" | "flex-start" | "center" | "flex-end"
  flexWrap: string; // "nowrap" | "wrap"
  // Child-side controls — how this element behaves INSIDE its parent flex
  // container. Harmless on non-flex parents. Matches Figma's per-layer
  // "Align self", "Resizing", and "Spacing" fields on nested layers.
  alignSelf: string; // "auto" | "stretch" | "flex-start" | "center" | "flex-end"
  flexGrow: number; // 0 = hug, >=1 = fill
  flexShrink: number;
  order: number;
  marginTop: number | string;
  marginRight: number | string;
  marginBottom: number | string;
  marginLeft: number | string;
};

export type SelectedElement = {
  screenId: string;
  tag: string;
  text: string;
  className: string;
  id: string;
  path: string;
  ocId?: string;
  rect: { x: number; y: number; w: number; h: number };
  styles?: ElementStyles;
  directText?: string;
};

type Listener = (selection: SelectedElement | null) => void;

class SelectedElementStore {
  private current: SelectedElement | null = null;
  private listeners = new Set<Listener>();

  get(): SelectedElement | null {
    return this.current;
  }

  set(el: SelectedElement | null) {
    this.current = el;
    for (const l of this.listeners) l(el);
  }

  clearForScreen(screenId: string) {
    if (this.current?.screenId === screenId) this.set(null);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
}

export const selectedElementStore = new SelectedElementStore();

if (typeof window !== "undefined") {
  (window as unknown as { __selectedElementStore: SelectedElementStore }).__selectedElementStore =
    selectedElementStore;
}
