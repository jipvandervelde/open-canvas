/**
 * Client-side store for skill toggles. Holds a Set of `disabled` skill
 * slugs. Used by:
 *   - The Skills panel UI for its enable/disable switches.
 *   - The chat transport, which sends `disabledSkills: string[]` in every
 *     request body so the server-side registry filters accordingly.
 *
 * Persists to localStorage. A disabled skill is hidden from the
 * orchestrator's skill index AND skipped by the sub-agent auto-injection
 * picker — effectively invisible to both agents for the session.
 */

const STORAGE_KEY = "oc:disabled-skills:v1";

type Listener = (disabled: Set<string>) => void;

class SkillsUiStore {
  private disabled = new Set<string>();
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): Set<string> {
    if (this.hydrated) return this.disabled;
    this.hydrated = true;
    if (typeof window === "undefined") return this.disabled;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          for (const s of parsed) if (typeof s === "string") this.disabled.add(s);
        }
      }
    } catch {
      /* storage disabled */
    }
    return this.disabled;
  }

  get(): Set<string> {
    if (!this.hydrated) this.hydrate();
    return this.disabled;
  }

  /** Return an array so it's trivially JSON-serializable for transport. */
  list(): string[] {
    return [...this.get()];
  }

  isEnabled(slug: string): boolean {
    return !this.get().has(slug);
  }

  setEnabled(slug: string, enabled: boolean) {
    const cur = this.get();
    if (enabled) {
      if (!cur.has(slug)) return;
      cur.delete(slug);
    } else {
      if (cur.has(slug)) return;
      cur.add(slug);
    }
    this.persist();
    this.notify();
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
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...this.disabled]),
      );
    } catch {
      /* ignore */
    }
  }

  private notify() {
    for (const l of this.listeners) l(new Set(this.disabled));
  }
}

export const skillsUiStore = new SkillsUiStore();

if (typeof window !== "undefined") {
  (window as unknown as { __skillsUiStore: SkillsUiStore }).__skillsUiStore =
    skillsUiStore;
  skillsUiStore.hydrate();
}
