/**
 * Project-wide icon style defaults. Like design-tokens-store but for the
 * `@central-icons-react` icon set: which variant (filled / outlined) the
 * agent reaches for by default, what size, what color.
 *
 * We only ship TWO variant packages — both round, radius 2, stroke 2 — so
 * the only "style" knob that actually varies between icons is filled vs
 * outlined. That's deliberate: the iOS convention is outlined for default
 * / inactive states, filled for active / primary. The agent picks per
 * usage; this store tells it what to pick when usage is ambiguous.
 *
 * Shape decisions:
 *
 * - `defaultVariant` is the fallback the agent uses when it can't decide
 *   from context. "outlined" matches the iOS default (nav bar items are
 *   outlined until you tap them).
 *
 * - `defaultSize` is in pixels. 24 is the icon's native viewBox.
 *
 * - `defaultColor` uses a token reference (`var(--color-fg-primary)`) by
 *   default so icons match the rest of the UI in both light and dark
 *   mode. A literal color is valid too.
 */

export type IconVariant = "filled" | "outlined";

export type IconStyle = {
  defaultVariant: IconVariant;
  defaultSize: number;
  defaultColor: string;
};

const STORAGE_KEY = "oc:icon-style:v1";

const DEFAULTS: IconStyle = {
  defaultVariant: "outlined",
  defaultSize: 24,
  defaultColor: "var(--color-fg-primary)",
};

type Listener = (style: IconStyle) => void;

class IconStyleStore {
  private current: IconStyle = { ...DEFAULTS };
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): IconStyle {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    if (typeof window === "undefined") return this.current;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<IconStyle>;
        this.current = {
          defaultVariant:
            parsed.defaultVariant === "filled" ? "filled" : "outlined",
          defaultSize:
            typeof parsed.defaultSize === "number" && parsed.defaultSize > 0
              ? parsed.defaultSize
              : DEFAULTS.defaultSize,
          defaultColor:
            typeof parsed.defaultColor === "string" && parsed.defaultColor
              ? parsed.defaultColor
              : DEFAULTS.defaultColor,
        };
      }
    } catch {
      /* ignore */
    }
    return this.current;
  }

  get(): IconStyle {
    if (!this.hydrated) this.hydrate();
    return this.current;
  }

  set(next: Partial<IconStyle>) {
    this.current = { ...this.current, ...next };
    this.persist();
    this.notify();
  }

  resetToDefaults() {
    this.current = { ...DEFAULTS };
    this.persist();
    this.notify();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  /** npm package name for the given variant. */
  packageFor(variant: IconVariant): string {
    return variant === "filled"
      ? "@central-icons-react/round-filled-radius-2-stroke-2"
      : "@central-icons-react/round-outlined-radius-2-stroke-2";
  }

  /** Compact snapshot for shipping in request bodies. */
  snapshot() {
    return {
      defaultVariant: this.current.defaultVariant,
      defaultSize: this.current.defaultSize,
      defaultColor: this.current.defaultColor,
      packages: {
        filled: this.packageFor("filled"),
        outlined: this.packageFor("outlined"),
      },
    };
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      /* ignore */
    }
  }

  private notify() {
    for (const l of this.listeners) l(this.current);
  }
}

export const iconStyleStore = new IconStyleStore();

if (typeof window !== "undefined") {
  (
    window as unknown as { __iconStyleStore: IconStyleStore }
  ).__iconStyleStore = iconStyleStore;
  iconStyleStore.hydrate();
}

/** Convert a user-typed icon name ("home", "Home", "IconHome") to the
 *  canonical PascalCase form the package exports (`IconHome`). Returns
 *  null if the input doesn't look like an icon name. */
export function normalizeIconName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Already IconXxx — keep as-is.
  if (/^Icon[A-Z0-9]/.test(trimmed)) return trimmed;
  // kebab-case or snake_case → PascalCase with Icon prefix
  const pascal = trimmed
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  if (!pascal) return null;
  return pascal.startsWith("Icon") ? pascal : `Icon${pascal}`;
}
