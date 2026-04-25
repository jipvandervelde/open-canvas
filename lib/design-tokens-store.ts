/**
 * Project-wide design tokens: named colors (with light + dark variants),
 * spacings with conventional iOS-rooted semantic names, radii, and font
 * sizes. Both the AI and the user reference them by CSS variable name
 * instead of baking in raw values.
 *
 * Shape decisions:
 *
 * - Color tokens carry BOTH a light and a dark value. The CSS emitter
 *   writes the light values under `:root { ... }` and dark values under
 *   `[data-theme="dark"] { ... }` + `@media (prefers-color-scheme: dark)`.
 *   That lets the host app explicitly override via the data-theme
 *   attribute while still auto-matching standalone previews to the user's
 *   OS preference.
 *
 * - The color palette is intentionally small — 3 backgrounds + 3
 *   foregrounds + brand + 3 state — so the agent has to choose from a
 *   constrained set. More tokens = more slop.
 *
 * - Spacing has a numeric scale (xs..2xl) PLUS conventional semantic
 *   tokens (screen.px, safe.top, safe.bottom, inset, stack.gap,
 *   section.gap). The semantic names map directly to iOS-native
 *   concepts so generated screens read as if they were built in
 *   SwiftUI.
 *
 * The storage key is bumped to v2 since the shape is incompatible with
 * the v1 single-value color format. Users with v1 data get fresh v2
 * defaults — that's fine; customization was minimal and the new system
 * is a strict upgrade.
 */

export type TokenKind = "color" | "spacing" | "radius" | "typography";

/** Color tokens carry light + dark values — they're the only kind that
 *  theme-aware emitters care about. */
export type ColorToken = {
  id: string;
  name: string;
  light: string;
  dark: string;
};

/** Scalar tokens (spacing, radius) have a single value that applies in
 *  both light and dark modes. */
export type ScalarToken = {
  id: string;
  name: string;
  value: string;
};

/** Typography tokens bundle every property a text role needs: family,
 *  size, weight, line-height, tracking. Modeled on the Google DESIGN.md
 *  typography object so the same token can project to YAML / CSS /
 *  tokens.json without a translation layer.
 *
 *  `lineHeight` accepts either a dimension (`24px`) or a unitless
 *  number (`1.5`) per CSS best practice. We store as a string either
 *  way and let the consumer parse. */
export type TypographyToken = {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: number;
  lineHeight: string;
  letterSpacing: string;
};

export type DesignToken = ColorToken | ScalarToken | TypographyToken;

export type DesignTokens = {
  color: ColorToken[];
  spacing: ScalarToken[];
  radius: ScalarToken[];
  typography: TypographyToken[];
};

// v4 — added `brand.secondary` decorative accent and retuned the state
// palette (success/warning/error) to a single mode-invariant value each,
// replacing the prior iOS-HIG light/dark pair. Bumping the key replaces
// existing v3 data with fresh v4 defaults so the new values land cleanly.
const STORAGE_KEY = "oc:design-tokens:v4";

/**
 * Defaults chosen to read iOS-native out of the box. Light values match
 * Apple's System Colors (UIColor.systemBackground, label, systemBlue, etc).
 * Dark values match the Dark-mode counterparts in Apple's HIG.
 */
const DEFAULTS: DesignTokens = {
  color: [
    // Backgrounds — 3 layered surfaces. Primary = the screen. Secondary =
    // cards, grouped table rows. Tertiary = inputs inside cards, raised
    // controls on top of secondary.
    {
      id: "c_bg_primary",
      name: "bg.primary",
      light: "#FFFFFF",
      dark: "#181818",
    },
    {
      id: "c_bg_secondary",
      name: "bg.secondary",
      light: "#F2F3F3",
      dark: "#1F1F1F",
    },
    {
      id: "c_bg_tertiary",
      name: "bg.tertiary",
      light: "#EBECEC",
      dark: "#2D2D2D",
    },
    // Foregrounds — 3 ink weights. Primary = body copy and icons.
    // Secondary = muted labels. Tertiary = placeholder / disabled.
    {
      id: "c_fg_primary",
      name: "fg.primary",
      light: "#1A1C1F",
      dark: "#FFFFFF",
    },
    {
      id: "c_fg_secondary",
      name: "fg.secondary",
      light: "#8E8F90",
      dark: "#8B8B8B",
    },
    {
      id: "c_fg_tertiary",
      name: "fg.tertiary",
      light: "#D2D2D3",
      dark: "#464646",
    },
    // Brand — the single accent used sparingly. Mode-invariant because
    // the specified blue reads well against both light and dark surfaces
    // — override in the Tokens panel if a project brief demands a
    // different dark-mode tint.
    {
      id: "c_brand",
      name: "brand",
      light: "#009FFF",
      dark: "#009FFF",
    },
    // Secondary brand — decorative accent for gradients, illustration
    // highlights, and rare second-tier emphasis. Not for state. Mode-
    // invariant for the same reason as primary brand.
    {
      id: "c_brand_secondary",
      name: "brand.secondary",
      light: "#772DFF",
      dark: "#772DFF",
    },
    // Mode-invariant constants — same value in light and dark. Use for
    // ink on colored buttons (white on brand), backdrop fills, and any
    // place where the literal color is intentional regardless of theme.
    {
      id: "c_white",
      name: "white",
      light: "#FFFFFF",
      dark: "#FFFFFF",
    },
    {
      id: "c_black",
      name: "black",
      light: "#1A1C1F",
      dark: "#1A1C1F",
    },
    // State colours — intent-bearing semantic roles. Mode-invariant: each
    // state reads on both light and dark surfaces, so a single value keeps
    // the meaning unambiguous across themes.
    {
      id: "c_state_success",
      name: "state.success",
      light: "#00C54C",
      dark: "#00C54C",
    },
    {
      id: "c_state_warning",
      name: "state.warning",
      light: "#FF893A",
      dark: "#FF893A",
    },
    {
      id: "c_state_error",
      name: "state.error",
      light: "#FF4236",
      dark: "#FF4236",
    },
  ],
  spacing: [
    // Numeric scale — use for arbitrary gaps and padding inside components.
    { id: "s_xs", name: "xs", value: "4px" },
    { id: "s_sm", name: "sm", value: "8px" },
    { id: "s_md", name: "md", value: "12px" },
    { id: "s_lg", name: "lg", value: "16px" },
    { id: "s_xl", name: "xl", value: "24px" },
    { id: "s_2xl", name: "2xl", value: "32px" },
    { id: "s_3xl", name: "3xl", value: "48px" },
    // Semantic / conventional — iOS-native concepts. These are the ones
    // the agent should reach for first when laying out a screen.
    {
      id: "s_screen_px",
      name: "screen.px",
      value: "16px",
    },
    {
      id: "s_safe_top",
      name: "safe.top",
      // 62px is the Dynamic Island safe-area top on every modern iPhone
      // (14 Pro / 15 / 16 / 17). Older notch-only devices are ~47px; we
      // default to the Dynamic Island value because the default viewport
      // is iphone-17-pro (with Dynamic Island) and the taller inset is
      // the safer choice on a notched device too (slight over-padding
      // beats content under the Island).
      value: "62px",
    },
    {
      id: "s_safe_bottom",
      name: "safe.bottom",
      value: "34px",
    },
    {
      id: "s_inset",
      name: "inset",
      value: "16px",
    },
    {
      id: "s_stack_gap",
      name: "stack.gap",
      value: "12px",
    },
    {
      id: "s_section_gap",
      name: "section.gap",
      value: "24px",
    },
  ],
  radius: [
    { id: "r_xs", name: "xs", value: "4px" },
    { id: "r_sm", name: "sm", value: "8px" },
    { id: "r_md", name: "md", value: "12px" },
    { id: "r_lg", name: "lg", value: "16px" },
    { id: "r_xl", name: "xl", value: "20px" },
    { id: "r_pill", name: "pill", value: "999px" },
  ],
  typography: [
    // iOS HIG-derived text styles. System font stack everywhere; line-height
    // tightens for display sizes and loosens for body — standard typographic
    // rhythm. Letter spacing is near-0 for body, tightens for display.
    // Font weights follow HIG: 400 body, 500 controls, 600 headlines, 700
    // display.
    {
      id: "t_caption",
      name: "caption",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      fontSize: "11px",
      fontWeight: 500,
      lineHeight: "1.3",
      letterSpacing: "0.01em",
    },
    {
      id: "t_footnote",
      name: "footnote",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      fontSize: "13px",
      fontWeight: 400,
      lineHeight: "1.35",
      letterSpacing: "0.005em",
    },
    {
      id: "t_body",
      name: "body",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      fontSize: "15px",
      fontWeight: 400,
      lineHeight: "1.47",
      letterSpacing: "0",
    },
    {
      id: "t_callout",
      name: "callout",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      fontSize: "16px",
      fontWeight: 500,
      lineHeight: "1.4",
      letterSpacing: "-0.005em",
    },
    {
      id: "t_title",
      name: "title",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      fontSize: "20px",
      fontWeight: 600,
      lineHeight: "1.3",
      letterSpacing: "-0.01em",
    },
    {
      id: "t_headline",
      name: "headline",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      fontSize: "24px",
      fontWeight: 600,
      lineHeight: "1.25",
      letterSpacing: "-0.015em",
    },
    {
      id: "t_display",
      name: "display",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      fontSize: "34px",
      fontWeight: 700,
      lineHeight: "1.15",
      letterSpacing: "-0.02em",
    },
  ],
};

function cssVarName(kind: TokenKind, tokenName: string): string {
  const prefix =
    kind === "color"
      ? "color"
      : kind === "spacing"
        ? "space"
        : kind === "radius"
          ? "radius"
          : "font";
  return `--${prefix}-${tokenName.replace(/\./g, "-")}`;
}

/** Individual typography CSS vars for the five object properties. The
 *  name follows the same `--font-<role>-<prop>` convention for all. */
const TYPOGRAPHY_PROPS = [
  "family",
  "size",
  "weight",
  "line-height",
  "letter-spacing",
] as const;

function typographyVarName(
  tokenName: string,
  prop: (typeof TYPOGRAPHY_PROPS)[number],
): string {
  return `--font-${tokenName.replace(/\./g, "-")}-${prop}`;
}

function isColorToken(t: DesignToken): t is ColorToken {
  return (
    typeof (t as ColorToken).light === "string" &&
    typeof (t as ColorToken).dark === "string"
  );
}

function isTypographyToken(t: DesignToken): t is TypographyToken {
  const tt = t as TypographyToken;
  return (
    typeof tt.fontFamily === "string" &&
    typeof tt.fontSize === "string" &&
    typeof tt.fontWeight === "number"
  );
}

type Listener = (tokens: DesignTokens) => void;

class DesignTokensStore {
  private current: DesignTokens = cloneDefaults();
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): DesignTokens {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    if (typeof window === "undefined") return this.current;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DesignTokens>;
        if (parsed && typeof parsed === "object") {
          this.current = {
            color: Array.isArray(parsed.color)
              ? (parsed.color as ColorToken[]).filter(isColorToken)
              : DEFAULTS.color,
            spacing: Array.isArray(parsed.spacing)
              ? (parsed.spacing as ScalarToken[])
              : DEFAULTS.spacing,
            radius: Array.isArray(parsed.radius)
              ? (parsed.radius as ScalarToken[])
              : DEFAULTS.radius,
            typography: Array.isArray(parsed.typography)
              ? (parsed.typography as TypographyToken[]).filter(
                  isTypographyToken,
                )
              : DEFAULTS.typography,
          };
        }
      }
    } catch {
      /* ignore */
    }
    return this.current;
  }

  get(): DesignTokens {
    if (!this.hydrated) this.hydrate();
    return this.current;
  }

  set(next: DesignTokens) {
    this.current = next;
    this.persist();
    this.notify();
  }

  upsertColorToken(token: ColorToken) {
    const list = [...this.current.color];
    const i = list.findIndex((t) => t.id === token.id);
    if (i >= 0) list[i] = token;
    else list.push(token);
    this.current = { ...this.current, color: list };
    this.persist();
    this.notify();
  }

  upsertScalarToken(kind: "spacing" | "radius", token: ScalarToken) {
    const list = [...this.current[kind]];
    const i = list.findIndex((t) => t.id === token.id);
    if (i >= 0) list[i] = token;
    else list.push(token);
    this.current = { ...this.current, [kind]: list };
    this.persist();
    this.notify();
  }

  upsertTypographyToken(token: TypographyToken) {
    const list = [...this.current.typography];
    const i = list.findIndex((t) => t.id === token.id);
    if (i >= 0) list[i] = token;
    else list.push(token);
    this.current = { ...this.current, typography: list };
    this.persist();
    this.notify();
  }

  removeToken(kind: TokenKind, id: string) {
    this.current = {
      ...this.current,
      [kind]: this.current[kind].filter((t) => t.id !== id),
    } as DesignTokens;
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

  /**
   * Serialize tokens as CSS. Emits light values under `:root`, dark
   * values under BOTH `[data-theme="dark"]` (for host-controlled dark
   * mode) and `@media (prefers-color-scheme: dark)` (for standalone
   * previews that follow OS preference). Scalar tokens (spacing, radius)
   * + typography aren't theme-aware so they live only under `:root`.
   *
   * Each typography token emits five individual CSS vars (family, size,
   * weight, line-height, letter-spacing) so agents can mix and match —
   * e.g. use the body family + display size for a hero. A back-compat
   * alias `--font-<name>` == `--font-<name>-size` keeps existing prose
   * that references `var(--font-body)` as just a size working.
   */
  toCss(): string {
    const lightLines: string[] = [":root {"];
    for (const t of this.current.color) {
      lightLines.push(`  ${cssVarName("color", t.name)}: ${t.light};`);
    }
    for (const t of this.current.spacing) {
      lightLines.push(`  ${cssVarName("spacing", t.name)}: ${t.value};`);
    }
    for (const t of this.current.radius) {
      lightLines.push(`  ${cssVarName("radius", t.name)}: ${t.value};`);
    }
    for (const t of this.current.typography) {
      lightLines.push(
        `  ${typographyVarName(t.name, "family")}: ${t.fontFamily};`,
      );
      lightLines.push(
        `  ${typographyVarName(t.name, "size")}: ${t.fontSize};`,
      );
      lightLines.push(
        `  ${typographyVarName(t.name, "weight")}: ${t.fontWeight};`,
      );
      lightLines.push(
        `  ${typographyVarName(t.name, "line-height")}: ${t.lineHeight};`,
      );
      lightLines.push(
        `  ${typographyVarName(t.name, "letter-spacing")}: ${t.letterSpacing};`,
      );
      // Back-compat alias — `var(--font-body)` still resolves to the
      // body size, matching the v2 single-value shape.
      lightLines.push(
        `  --font-${t.name.replace(/\./g, "-")}: ${t.fontSize};`,
      );
    }
    lightLines.push("}");

    const darkLines: string[] = [];
    for (const t of this.current.color) {
      darkLines.push(`  ${cssVarName("color", t.name)}: ${t.dark};`);
    }

    return [
      lightLines.join("\n"),
      `[data-theme="dark"] {\n${darkLines.join("\n")}\n}`,
      `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${darkLines
        .map((l) => "  " + l)
        .join("\n")}\n  }\n}`,
    ].join("\n\n");
  }

  /**
   * Compact snapshot for shipping in request bodies — only the fields the
   * server-side framing builder needs to render its "Current values"
   * block. Keeps the payload small (~1-2KB) even as the token count grows.
   */
  snapshot() {
    return {
      color: this.current.color.map((t) => ({
        name: t.name,
        light: t.light,
        dark: t.dark,
      })),
      spacing: this.current.spacing.map((t) => ({
        name: t.name,
        value: t.value,
      })),
      radius: this.current.radius.map((t) => ({
        name: t.name,
        value: t.value,
      })),
      typography: this.current.typography.map((t) => ({
        name: t.name,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        lineHeight: t.lineHeight,
        letterSpacing: t.letterSpacing,
      })),
    };
  }

  /**
   * Short human-readable list for the AI system prompt. Keeps the payload
   * small while giving the agent the full variable-name + value-pair map
   * so it never has to invent token names.
   */
  toPromptDescription(): string {
    const colorLines = this.current.color
      .map(
        (t) =>
          `  ${cssVarName("color", t.name)} → light ${t.light} · dark ${t.dark}`,
      )
      .join("\n");
    const fmt = (kind: "spacing" | "radius", ts: ScalarToken[]) =>
      ts.map((t) => `  ${cssVarName(kind, t.name)} = ${t.value}`).join("\n");
    const typographyLines = this.current.typography
      .map(
        (t) =>
          `  ${t.name}: ${t.fontSize} / ${t.fontWeight} / ${t.lineHeight} / ${t.letterSpacing} — ${t.fontFamily.split(",")[0].trim()}`,
      )
      .join("\n");
    return [
      "Colors (light / dark):",
      colorLines,
      "Spacing:",
      fmt("spacing", this.current.spacing),
      "Radius:",
      fmt("radius", this.current.radius),
      "Typography (size / weight / line-height / tracking — family):",
      typographyLines,
    ].join("\n");
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

function cloneDefaults(): DesignTokens {
  return {
    color: DEFAULTS.color.map((t) => ({ ...t })),
    spacing: DEFAULTS.spacing.map((t) => ({ ...t })),
    radius: DEFAULTS.radius.map((t) => ({ ...t })),
    typography: DEFAULTS.typography.map((t) => ({ ...t })),
  };
}

export const designTokensStore = new DesignTokensStore();

if (typeof window !== "undefined") {
  (
    window as unknown as { __designTokensStore: DesignTokensStore }
  ).__designTokensStore = designTokensStore;
  designTokensStore.hydrate();
}

export { cssVarName, typographyVarName, isColorToken, isTypographyToken };
