/**
 * Global light/dark theme store. Persists to localStorage, syncs a
 * `data-theme` attribute on <html> for CSS variable flips, and exposes a
 * subscribe API so tldraw + Sandpack can react to user changes.
 *
 * Kept deliberately tiny — no context, no React dependency in the store
 * itself so it can be imported from anywhere (including custom shape utils).
 */

export type Theme = "light" | "dark";

const STORAGE_KEY = "oc:theme";

function detectInitial(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

type Listener = (theme: Theme) => void;

class ThemeStore {
  private current: Theme = "light";
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): Theme {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    this.current = detectInitial();
    this.apply();
    return this.current;
  }

  get(): Theme {
    if (!this.hydrated) this.hydrate();
    return this.current;
  }

  set(theme: Theme) {
    if (this.current === theme) return;
    this.current = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* SSR or storage disabled */
    }
    this.apply();
    for (const l of this.listeners) l(theme);
  }

  toggle() {
    this.set(this.current === "dark" ? "light" : "dark");
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private apply() {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", this.current);
    document.documentElement.style.colorScheme = this.current;
  }
}

export const themeStore = new ThemeStore();

if (typeof window !== "undefined") {
  (window as unknown as { __themeStore: ThemeStore }).__themeStore = themeStore;
  // Hydrate eagerly on client so the first render already has a theme attr.
  themeStore.hydrate();
}
