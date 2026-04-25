/**
 * design.md linter — pure server-side checks against the current tokens
 * + component tokens + prose. Three classes of finding:
 *
 *   1. **Structural** — duplicate `##` section headings in the prose,
 *      per the Google DESIGN.md spec (duplicate headings = reject).
 *
 *   2. **Reference integrity** — every `{group.name}` reference (in
 *      component-token values OR the prose) and every `var(--…)`
 *      reference (in the prose) must resolve to a defined token. Dual
 *      syntax is supported symmetrically.
 *
 *   3. **Accessibility** — for every component that declares BOTH a
 *      `backgroundColor` and a `textColor` token, we resolve both sides
 *      to concrete hex values in LIGHT and DARK modes and compute the
 *      WCAG 2.1 relative-luminance contrast ratio. Fail AA when <4.5:1
 *      (normal text), warn when <3:1 (large text floor).
 *
 * The module has zero dependencies — pure TS/JS, safe to import from
 * any route, edge or node. The API route just wraps it.
 */

import type { TokensSnapshot } from "@/lib/agent-framing";
import type { ComponentTokens } from "@/lib/design-component-tokens-store";

export type LintSeverity = "error" | "warning" | "info";

export type LintFinding = {
  severity: LintSeverity;
  /** Dotted path to the offending location, e.g.
   *  `components.button-primary.textColor` or `prose.section.Colors`. */
  path: string;
  message: string;
  /** Optional extra context (ratios, resolved values) that clients
   *  can show without re-running the computation. */
  meta?: Record<string, string | number | boolean>;
};

export type LintReport = {
  findings: LintFinding[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
};

export type LintInput = {
  tokens: TokensSnapshot;
  componentTokens: ComponentTokens;
  designDoc?: string;
};

export function lintDesignSystem(input: LintInput): LintReport {
  const findings: LintFinding[] = [];
  findings.push(...lintDuplicateSections(input.designDoc ?? ""));
  findings.push(...lintProseTokenRefs(input.designDoc ?? "", input.tokens));
  findings.push(...lintComponentTokenRefs(input.componentTokens, input.tokens));
  findings.push(...lintComponentContrast(input.componentTokens, input.tokens));

  return {
    findings,
    summary: {
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
  };
}

// ─── Structural: duplicate section headings ──────────────────────────

function lintDuplicateSections(prose: string): LintFinding[] {
  // Strip the front matter first; heading duplicates only apply to the
  // prose body.
  const body = prose.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
  const seen = new Map<string, number>();
  const out: LintFinding[] = [];
  const headingRe = /^##\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(body)) != null) {
    const name = m[1].trim().toLowerCase();
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) {
      out.push({
        severity: "error",
        path: `prose.section.${name}`,
        message: `Duplicate \`## ${name}\` heading appears ${count} times. The DESIGN.md spec rejects duplicate section headings.`,
        meta: { count },
      });
    }
  }
  return out;
}

// ─── Reference integrity ─────────────────────────────────────────────

function lintProseTokenRefs(
  prose: string,
  tokens: TokensSnapshot,
): LintFinding[] {
  const out: LintFinding[] = [];

  // `{group.name}` references anywhere in prose.
  const braceRe = /\{([a-z-]+)\.([a-z0-9.-]+)\}/gi;
  let m: RegExpExecArray | null;
  while ((m = braceRe.exec(prose)) != null) {
    const [full, group, name] = m;
    if (!isKnownToken(group, name, tokens)) {
      out.push({
        severity: "error",
        path: `prose.ref.${full}`,
        message: `Unknown token reference \`${full}\` in prose.`,
        meta: { group, name },
      });
    }
  }

  // `var(--group-name)` references. Only flag the groups we own —
  // ignore leaked third-party vars like `var(--tw-*)`.
  const varRe = /var\(--(color|space|radius|font)-([a-z0-9-]+)(?:-family|-size|-weight|-line-height|-letter-spacing)?\)/gi;
  while ((m = varRe.exec(prose)) != null) {
    const [full, cssGroup, name] = m;
    const tokenGroup =
      cssGroup === "color"
        ? "colors"
        : cssGroup === "space"
          ? "spacing"
          : cssGroup === "radius"
            ? "radius"
            : "typography";
    // Typography vars have suffixes (-family / -size / etc.). The base
    // name before the suffix is what we look up.
    const base = stripTypographySuffix(name);
    if (!isKnownToken(tokenGroup, base, tokens)) {
      out.push({
        severity: "warning",
        path: `prose.var.${full}`,
        message: `\`${full}\` references an unknown ${tokenGroup} token \`${base}\`. Typo, or a token that was renamed?`,
        meta: { group: tokenGroup, name: base },
      });
    }
  }

  return out;
}

function lintComponentTokenRefs(
  componentTokens: ComponentTokens,
  tokens: TokensSnapshot,
): LintFinding[] {
  const out: LintFinding[] = [];
  for (const [compName, props] of Object.entries(componentTokens)) {
    for (const [prop, value] of componentPropsIter(props)) {
      if (typeof value !== "string") continue;
      const m = /^\{([a-z-]+)\.([a-z0-9.-]+)\}$/i.exec(value.trim());
      if (!m) continue;
      const [full, group, name] = m;
      void full;
      if (!isKnownToken(group, name, tokens)) {
        out.push({
          severity: "error",
          path: `components.${compName}.${prop}`,
          message: `\`${compName}.${prop}\` references \`{${group}.${name}}\` which isn't a defined token.`,
          meta: { group, name },
        });
      }
    }
  }
  return out;
}

// ─── WCAG AA contrast ────────────────────────────────────────────────

function lintComponentContrast(
  componentTokens: ComponentTokens,
  tokens: TokensSnapshot,
): LintFinding[] {
  const out: LintFinding[] = [];
  for (const [compName, props] of Object.entries(componentTokens)) {
    if (!props.backgroundColor || !props.textColor) continue;
    for (const mode of ["light", "dark"] as const) {
      const bg = resolveColorRef(props.backgroundColor, tokens, mode);
      const fg = resolveColorRef(props.textColor, tokens, mode);
      if (!bg || !fg) continue;
      const ratio = contrastRatio(bg, fg);
      const ratioRounded = Math.round(ratio * 100) / 100;
      if (ratio >= 4.5) {
        // Pass — emit as info only for components that JUST pass (nice to know).
        if (ratio < 7) {
          out.push({
            severity: "info",
            path: `components.${compName}.contrast.${mode}`,
            message: `${compName} in ${mode} mode: ${ratioRounded}:1 — passes AA (4.5:1) for normal text, below AAA (7:1).`,
            meta: { ratio: ratioRounded, bg, fg, mode },
          });
        }
        continue;
      }
      if (ratio >= 3) {
        out.push({
          severity: "warning",
          path: `components.${compName}.contrast.${mode}`,
          message: `${compName} in ${mode} mode: ${ratioRounded}:1 — below AA for normal text (4.5:1). Passes as LARGE text (≥24px, or ≥18.66px bold) but will fail for body copy.`,
          meta: { ratio: ratioRounded, bg, fg, mode },
        });
        continue;
      }
      out.push({
        severity: "error",
        path: `components.${compName}.contrast.${mode}`,
        message: `${compName} in ${mode} mode: ${ratioRounded}:1 — fails WCAG AA at any text size. Adjust \`${props.textColor}\` or \`${props.backgroundColor}\`.`,
        meta: { ratio: ratioRounded, bg, fg, mode },
      });
    }
  }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function isKnownToken(
  group: string,
  name: string,
  tokens: TokensSnapshot,
): boolean {
  const dashedName = name.replace(/\./g, "-");
  // Callers pass either the natural name (`fg.primary`) or the
  // dashed form (`fg-primary`). Accept both by comparing both.
  const matches = (token: { name: string }) => {
    const n = token.name.replace(/\./g, "-");
    return n === dashedName;
  };
  switch (group) {
    case "colors":
      return tokens.color.some(matches);
    case "spacing":
      return tokens.spacing.some(matches);
    case "radius":
    case "rounded":
      return tokens.radius.some(matches);
    case "typography":
      return tokens.typography.some(matches);
    default:
      return false;
  }
}

function stripTypographySuffix(name: string): string {
  return name.replace(
    /-(family|size|weight|line-height|letter-spacing)$/,
    "",
  );
}

type TokenValue = { backgroundColor?: string; textColor?: string };
function componentPropsIter(
  props: TokenValue & Record<string, unknown>,
): Array<[string, string | undefined]> {
  // Flatten first-class props + extras into [propName, stringValue].
  const entries: Array<[string, string | undefined]> = [];
  for (const k of [
    "backgroundColor",
    "textColor",
    "borderColor",
    "typography",
    "rounded",
    "padding",
    "size",
    "height",
    "width",
  ]) {
    const v = (props as unknown as Record<string, unknown>)[k];
    if (typeof v === "string") entries.push([k, v]);
  }
  const extra = (props as unknown as { extra?: Record<string, string> })
    .extra;
  if (extra) {
    for (const [k, v] of Object.entries(extra)) entries.push([k, v]);
  }
  return entries;
}

/** Resolve a color value (literal hex or `{colors.name}`) against the
 *  current token snapshot for the given theme mode. Returns null if it
 *  can't be resolved (unknown ref, or a literal that isn't a sRGB hex). */
function resolveColorRef(
  value: string,
  tokens: TokensSnapshot,
  mode: "light" | "dark",
): string | null {
  const trimmed = value.trim();
  const m = /^\{colors\.([a-z0-9.-]+)\}$/i.exec(trimmed);
  if (m) {
    const name = m[1].replace(/\./g, "-");
    const token = tokens.color.find(
      (t) => t.name.replace(/\./g, "-") === name,
    );
    if (!token) return null;
    return mode === "dark" ? token.dark : token.light;
  }
  // Literal hex.
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const c = trimmed.slice(1);
    return "#" + c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return null;
}

/** Relative luminance per WCAG 2.1. Input: `#RRGGBB` (must be normalized). */
function relativeLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [bright, dark] = la >= lb ? [la, lb] : [lb, la];
  return (bright + 0.05) / (dark + 0.05);
}
