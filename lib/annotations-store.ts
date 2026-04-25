/**
 * Persistent annotations tied to specific JSX elements inside a screen.
 * Each annotation is addressed by (screenId + elementPath) where elementPath
 * is the same CSS-selector-ish path the in-iframe selection agent reports.
 *
 * Annotations are author-only notes — they don't change the generated code.
 * They surface as a count badge on the artboard pill and as an overlay dot
 * at the element's position while the annotator tool is active.
 */

export type Annotation = {
  id: string;
  screenId: string;
  path: string; // element selector path from the in-iframe agent
  note: string;
  createdAt: number;
};

const STORAGE_KEY = "oc:annotations-v1";

type Listener = (all: Annotation[]) => void;

class AnnotationsStore {
  private all: Annotation[] = [];
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate() {
    if (this.hydrated) return;
    this.hydrated = true;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Annotation[];
      if (Array.isArray(parsed)) this.all = parsed;
    } catch {
      /* ignore */
    }
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.all));
    } catch {
      /* ignore */
    }
  }

  private emit() {
    for (const l of this.listeners) l(this.all);
  }

  get(): Annotation[] {
    if (!this.hydrated) this.hydrate();
    return this.all;
  }

  listForScreen(screenId: string): Annotation[] {
    return this.get().filter((a) => a.screenId === screenId);
  }

  listForElement(screenId: string, path: string): Annotation[] {
    return this.get().filter(
      (a) => a.screenId === screenId && a.path === path,
    );
  }

  add(screenId: string, path: string, note: string) {
    const entry: Annotation = {
      id: `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      screenId,
      path,
      note,
      createdAt: Date.now(),
    };
    this.all = [...this.all, entry];
    this.persist();
    this.emit();
    return entry;
  }

  remove(id: string) {
    const next = this.all.filter((a) => a.id !== id);
    if (next.length === this.all.length) return;
    this.all = next;
    this.persist();
    this.emit();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
}

export const annotationsStore = new AnnotationsStore();

if (typeof window !== "undefined") {
  annotationsStore.hydrate();
}
