/**
 * Component-level design tokens — a sibling to `design-tokens-store`
 * that defines the STYLING contract for each seeded component (and any
 * user-defined one). Follows the Google DESIGN.md `components` schema:
 *
 *   components:
 *     button-primary:
 *       backgroundColor: "{colors.brand}"
 *       textColor: "{colors.white}"
 *       rounded: "{radius.md}"
 *       padding: 0 var(--space-lg)
 *       typography: "{typography.body}"
 *     button-primary-pressed:
 *       backgroundColor: "{colors.brand}"
 *
 * Variants are sibling keys (`button-primary`, `button-primary-pressed`)
 * rather than nested state maps. Greppable, diffable, agent-friendly.
 *
 * The React components seeded in `design-components-store` READ from
 * this map rather than owning their styles. Agent-generated screens do
 * the same lookup so a token edit propagates to every instance without
 * a code change.
 *
 * Values are one of:
 *   - A token reference: `{colors.brand}`, `{radius.md}`, `{spacing.lg}`,
 *     `{typography.body}`. Resolved via the companion `resolveComponentTokens`
 *     to CSS-variable references.
 *   - A literal CSS value: `16px`, `#1A1C1E`, `0 2px 4px rgba(0,0,0,0.1)`.
 *   - A `var(--…)` expression for advanced cases the schema can't model.
 *
 * **`extra` after `typography`:** `resolveComponentTokens` applies `typography`
 * first (all five `font-*` props from the role), then merges `extra`. Any
 * key in `extra` overwrites the same key (e.g. `fontWeight` with any
 * `var(--font-*-weight)`). Use a second token entry or component state branch
 * (e.g. `text-field` + `text-field-filled`) for empty vs filled weight.
 */

import type { DesignTokens } from "@/lib/design-tokens-store";

/** A single component's properties. Each property value is a token
 *  reference (`{colors.brand}`), a literal CSS value, or a raw
 *  `var(--…)` expression. */
export type ComponentTokenProps = {
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  typography?: string;
  rounded?: string;
  padding?: string;
  size?: string;
  height?: string;
  width?: string;
  /** Merged after `typography` — overrides any of the same properties,
   *  e.g. `fontWeight` for a different weight than the type role. */
  extra?: Record<string, string>;
};

export type ComponentTokens = Record<string, ComponentTokenProps>;

// v15 — TextField placeholder: fg-tertiary at 50% (color-mix). v14: body
// + filled.
const STORAGE_KEY = "oc:design-component-tokens:v15";

/** Seeded defaults. Every key and variant the in-house React components
 *  look up. Edit these in the Design panel (future) or via
 *  `writeDesignDoc`; the React components read them at render time. */
export const COMPONENT_TOKENS_DEFAULT: ComponentTokens = {
  // ── Button — 3 variants × (default, pressed, disabled) ──────────────
  "button-primary": {
    backgroundColor: "{colors.brand}",
    textColor: "{colors.white}",
    rounded: "{radius.md}",
    padding: "0 var(--space-lg)",
    typography: "{typography.action}",
    height: "44px",
  },
  "button-primary-pressed": {
    backgroundColor: "{colors.brand}",
    textColor: "{colors.white}",
  },
  // Disabled fill is bg-tertiary (surface ramp), not fg-tertiary.
  "button-primary-disabled": {
    backgroundColor: "{colors.bg-tertiary}",
    textColor: "{colors.fg-secondary}",
  },
  "button-secondary": {
    backgroundColor: "{colors.fg-tertiary}",
    textColor: "{colors.fg-primary}",
    rounded: "{radius.md}",
    padding: "0 var(--space-lg)",
    typography: "{typography.action}",
    height: "44px",
  },
  "button-secondary-pressed": {
    backgroundColor: "{colors.bg-tertiary}",
    textColor: "{colors.fg-primary}",
  },
  "button-secondary-disabled": {
    backgroundColor: "{colors.bg-tertiary}",
    textColor: "{colors.fg-tertiary}",
  },
  "button-ghost": {
    backgroundColor: "transparent",
    textColor: "{colors.brand}",
    rounded: "{radius.md}",
    padding: "0 var(--space-lg)",
    typography: "{typography.action}",
    height: "44px",
  },
  "button-ghost-pressed": {
    backgroundColor: "{colors.bg-secondary}",
    textColor: "{colors.brand}",
  },
  "button-ghost-disabled": {
    // Ghost is borderless by design; disabled keeps it transparent so
    // it doesn't suddenly grow a fill — only the ink mutes.
    backgroundColor: "transparent",
    textColor: "{colors.fg-tertiary}",
  },

  // ── Card ────────────────────────────────────────────────────────────
  card: {
    backgroundColor: "{colors.bg-secondary}",
    textColor: "{colors.fg-primary}",
    rounded: "{radius.lg}",
    padding: "var(--space-lg)",
  },
  "card-interactive-pressed": {
    backgroundColor: "{colors.bg-tertiary}",
  },

  // ── Text field ──────────────────────────────────────────────────────
  "text-field": {
    backgroundColor: "{colors.bg-secondary}",
    textColor: "{colors.fg-primary}",
    rounded: "{radius.md}",
    padding: "0 var(--space-md)",
    height: "44px",
    // `body` = 16px/400: primary text + meets iOS no-zoom. Filled →
    // `text-field-filled` (`--font-callout-weight` = 500) merged in
    // component code.
    typography: "{typography.body}",
  },
  "text-field-filled": {
    extra: { fontWeight: "var(--font-callout-weight)" },
  },
  "text-field-label": {
    textColor: "{colors.fg-secondary}",
    typography: "{typography.footnote}",
    padding: "0 4px",
  },
  "text-field-placeholder": {
    textColor:
      "color-mix(in oklch, var(--color-fg-tertiary) 50%, transparent)",
  },
  "text-field-focus-ring": {
    // 2px inset brand ring on focus. Emitted as `boxShadow`.
    extra: { boxShadow: "inset 0 0 0 2px var(--color-brand)" },
  },
  "text-field-error-ring": {
    extra: { boxShadow: "inset 0 0 0 1.5px var(--color-state-error)" },
  },
  "text-field-error-message": {
    textColor: "{colors.state-error}",
    typography: "{typography.footnote}",
  },
  "text-field-helper-message": {
    textColor: "{colors.fg-secondary}",
    typography: "{typography.footnote}",
  },

  // ── Switch (iOS toggle) ─────────────────────────────────────────────
  "switch-track-off": {
    backgroundColor: "{colors.bg-tertiary}",
    width: "51px",
    height: "31px",
    rounded: "999px",
  },
  "switch-track-on": {
    backgroundColor: "{colors.brand}",
    width: "51px",
    height: "31px",
    rounded: "999px",
  },
  "switch-thumb": {
    backgroundColor: "{colors.white}",
    width: "25px",
    height: "25px",
    rounded: "50%",
    extra: {
      boxShadow:
        "0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)",
    },
  },

  // ── SegmentedControl ────────────────────────────────────────────────
  "segmented-control": {
    backgroundColor: "{colors.bg-tertiary}",
    rounded: "{radius.pill}",
    padding: "2px",
  },
  "segmented-control-pill": {
    backgroundColor: "{colors.bg-primary}",
    rounded: "calc(var(--radius-pill) - 2px)",
    extra: {
      boxShadow:
        "0 1px 2px rgba(0,0,0,0.04), 0 3px 8px -2px rgba(0,0,0,0.10)",
    },
  },
  // Segmented-control labels use body size + semibold (600) so the
  // segments read as control affordances. Same weight on active +
  // inactive (no layout shift on selection); only color changes.
  "segmented-control-label-active": {
    textColor: "{colors.fg-primary}",
    typography: "{typography.body}",
    extra: { fontWeight: "var(--font-title-weight)" },
  },
  "segmented-control-label-inactive": {
    textColor: "{colors.fg-secondary}",
    typography: "{typography.body}",
    extra: { fontWeight: "var(--font-title-weight)" },
  },

  // ── Tab bar ─────────────────────────────────────────────────────────
  "tab-bar": {
    backgroundColor: "{colors.bg-primary}",
    height: "83px",
  },
  // Tab bar labels: `caption2` (9px) + title-weight (600). Same on active +
  // inactive so only color flips. Child label inherits the button’s font.
  "tab-item-active": {
    textColor: "{colors.brand}",
    typography: "{typography.caption2}",
    extra: { fontWeight: "var(--font-title-weight)" },
  },
  "tab-item-inactive": {
    textColor: "{colors.fg-secondary}",
    typography: "{typography.caption2}",
    extra: { fontWeight: "var(--font-title-weight)" },
  },

  // ── Focus ring (shared) ─────────────────────────────────────────────
  "focus-ring": {
    extra: {
      outline: "2px solid var(--color-fg-primary)",
      outlineOffset: "2px",
    },
  },
};

type Listener = (tokens: ComponentTokens) => void;

class DesignComponentTokensStore {
  private current: ComponentTokens = cloneDefaults();
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): ComponentTokens {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    if (typeof window === "undefined") return this.current;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ComponentTokens;
        if (parsed && typeof parsed === "object") {
          // Merge parsed data with defaults — a new seed added in a
          // later version still shows up for existing stores without
          // needing a storage-key bump.
          this.current = { ...COMPONENT_TOKENS_DEFAULT, ...parsed };
        }
      }
    } catch {
      /* ignore */
    }
    return this.current;
  }

  get(): ComponentTokens {
    if (!this.hydrated) this.hydrate();
    return this.current;
  }

  set(next: ComponentTokens) {
    this.current = next;
    this.persist();
    this.notify();
  }

  upsert(name: string, props: ComponentTokenProps) {
    this.current = { ...this.current, [name]: props };
    this.persist();
    this.notify();
  }

  remove(name: string) {
    const next = { ...this.current };
    delete next[name];
    this.current = next;
    this.persist();
    this.notify();
  }

  resetToDefaults() {
    this.current = cloneDefaults();
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      /* ignore */
    }
  }

  private notify() {
    for (const l of this.listeners) l(this.current);
  }
}

function cloneDefaults(): ComponentTokens {
  const out: ComponentTokens = {};
  for (const [k, v] of Object.entries(COMPONENT_TOKENS_DEFAULT)) {
    out[k] = { ...v, extra: v.extra ? { ...v.extra } : undefined };
  }
  return out;
}

export const designComponentTokensStore = new DesignComponentTokensStore();

if (typeof window !== "undefined") {
  (
    window as unknown as {
      __designComponentTokensStore: DesignComponentTokensStore;
    }
  ).__designComponentTokensStore = designComponentTokensStore;
  designComponentTokensStore.hydrate();
}

// ─── Resolution ──────────────────────────────────────────────────────
//
// Component-token values can be either literals (`"16px"`, `"#FFF"`),
// CSS var expressions (`"var(--color-brand)"`), or token references
// (`"{colors.brand}"`, `"{typography.body}"`). The resolver turns refs
// into CSS var references so they work inside the Sandpack iframe.
//
// For `typography` references specifically, a single ref fans out into
// FIVE CSS properties — fontFamily/Size/Weight/LineHeight/LetterSpacing.
// The caller gets back a flat React-style style object with all five
// properties spread in, ready to drop into `style={{ ... }}`.

/** Turn a token reference like `{colors.brand}` into `var(--color-brand)`.
 *  Literals pass through unchanged. Returns null if the input looks like
 *  a reference but doesn't match any known token group (handled so the
 *  caller can warn rather than silently emit broken CSS). */
function resolveRef(value: string): string | null {
  const m = /^\{([a-z-]+)\.([a-z0-9.-]+)\}$/i.exec(value.trim());
  if (!m) return value; // literal — pass through
  const [, group, name] = m;
  const dashed = name.replace(/\./g, "-");
  switch (group) {
    case "colors":
      return `var(--color-${dashed})`;
    case "radius":
    case "rounded":
      return `var(--radius-${dashed})`;
    case "spacing":
      return `var(--space-${dashed})`;
    case "typography":
      // Return a sentinel the caller recognizes — the resolver that
      // expands to 5 properties needs to handle this specially.
      return `__TYPOGRAPHY_REF__:${dashed}`;
    default:
      return null;
  }
}

/** Resolve all props in a component-token entry to a React-style
 *  `CSSProperties` object suitable for `style={{ ... }}`. Maps the
 *  Google-schema property names to their React camelCase equivalents
 *  and fans out typography refs into the five font-* properties. */
export function resolveComponentTokens(
  name: string,
  tokens: ComponentTokens = designComponentTokensStore.get(),
): React.CSSProperties {
  const entry = tokens[name];
  if (!entry) return {};
  const style: Record<string, string | number> = {};

  const assignLiteralOrVar = (cssKey: string, raw: string | undefined) => {
    if (!raw) return;
    const resolved = resolveRef(raw);
    if (resolved == null) return;
    style[cssKey] = resolved;
  };

  assignLiteralOrVar("background", entry.backgroundColor);
  assignLiteralOrVar("color", entry.textColor);
  assignLiteralOrVar("borderColor", entry.borderColor);
  assignLiteralOrVar("borderRadius", entry.rounded);
  assignLiteralOrVar("padding", entry.padding);
  assignLiteralOrVar("width", entry.width);
  assignLiteralOrVar("height", entry.height);
  // `size` is shorthand for both width + height (per Google spec).
  if (entry.size) {
    const resolved = resolveRef(entry.size);
    if (resolved != null) {
      style.width = resolved;
      style.height = resolved;
    }
  }

  if (entry.typography) {
    const resolved = resolveRef(entry.typography);
    if (typeof resolved === "string" && resolved.startsWith("__TYPOGRAPHY_REF__:")) {
      const role = resolved.slice("__TYPOGRAPHY_REF__:".length);
      style.fontFamily = `var(--font-${role}-family)`;
      style.fontSize = `var(--font-${role}-size)`;
      style.fontWeight = `var(--font-${role}-weight)`;
      style.lineHeight = `var(--font-${role}-line-height)`;
      style.letterSpacing = `var(--font-${role}-letter-spacing)`;
    } else if (typeof resolved === "string" && resolved.length > 0) {
      // Literal (unusual) — drop into fontFamily as the most useful
      // single-property fallback.
      style.fontFamily = resolved;
    }
  }

  if (entry.extra) {
    for (const [k, v] of Object.entries(entry.extra)) {
      const resolved = resolveRef(v);
      if (resolved != null) style[k] = resolved;
    }
  }
  // `extra` is intentionally last so `fontWeight` / etc. can override
  // the five properties expanded from `typography` above.

  return style as React.CSSProperties;
}

/**
 * Build a Sandpack virtual file exposing the resolved component-token
 * styles to the iframe. Seeded React components + agent-generated
 * screens both `import { STYLE } from './component-tokens';` and
 * spread the right entry into their inline styles.
 *
 * Outputs ESM JS. No external deps. Keeping this as a string means
 * Sandpack gets a single stable file rather than a dynamic import
 * chain, and agents can see/predict the contents from the schema.
 */
export function buildComponentTokensJs(
  tokens: ComponentTokens = designComponentTokensStore.get(),
): string {
  const entries = Object.entries(tokens)
    .map(([name, _]) => {
      const styleObj = resolveComponentTokens(name, tokens);
      const body = Object.entries(styleObj)
        .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
        .join(",\n");
      return `  ${JSON.stringify(name)}: {\n${body}\n  }`;
    })
    .join(",\n");
  return `/**
 * Component tokens — generated from the project's design system.
 * Each key is a component name (and optional variant). Drop the value
 * into a React \`style={{ ... }}\` prop to apply the current token
 * resolution. Re-generates whenever tokens change.
 */
export const STYLE = {
${entries}
};

export default STYLE;
`;
}

/**
 * Compact snapshot for shipping in request bodies. The agent receives
 * the REFERENCES (not the resolved CSS) so it can understand the
 * contract; actual resolution happens in the Sandpack iframe.
 */
export function componentTokensSnapshot(
  tokens: ComponentTokens = designComponentTokensStore.get(),
): Record<string, ComponentTokenProps> {
  return { ...tokens };
}

// Intentionally no barrel export — callers import the store, resolver,
// and JS builder individually to keep the surface area grep-friendly.

// We need to re-export the resolver to provide a stable alias.
export type { DesignTokens };
