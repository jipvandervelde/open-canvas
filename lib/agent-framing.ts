/**
 * Shared builder for the project + stack "framing" block prepended to
 * every agent's system prompt. Keeps the injection logic in one place
 * so the orchestrator, reviewer, focused reviewer, screen sub-agent, and
 * seed sub-agent all see the SAME brief and the SAME conventions.
 *
 * The orchestrator additionally gets a GATE block when the project.md
 * is empty — it's instructed not to fire any build tools until it has
 * collected a brief via askClarifyingQuestions + writeProjectDoc.
 *
 * This file is server-safe: it takes markdown as a string input, so the
 * server never needs to know about the client-side project-doc-store. The
 * client ships the current doc in every request body.
 */

import { STACK_GUIDELINES } from "./stack-guidelines";
import { effectiveProjectDocContent } from "./project-doc-store";
import {
  buildDesignMdFrontMatter,
  prefixDesignMdWithYaml,
} from "./design-md-yaml";
import type {
  ComponentTokens,
} from "./design-component-tokens-store";

/**
 * Shape of a token snapshot the client ships in every request body. Kept
 * narrow on purpose — the server doesn't need full `DesignToken` typing,
 * just enough to render a "current values" block each agent can read.
 */
export type TokensSnapshot = {
  color: Array<{ name: string; light: string; dark: string }>;
  spacing: Array<{ name: string; value: string }>;
  radius: Array<{ name: string; value: string }>;
  typography: Array<{
    name: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: number;
    lineHeight: string;
    letterSpacing: string;
  }>;
};

/**
 * Compact snapshot of the user's icon-style defaults (variant / size /
 * color). The actual icon catalog is not included here — the agent
 * queries it via the `searchIcons` tool — but these defaults let the
 * agent pick the right variant + tint without a round-trip.
 */
export type IconStyleSnapshot = {
  defaultVariant: "filled" | "outlined";
  defaultSize: number;
  defaultColor: string;
  packages: { filled: string; outlined: string };
};

export type AgentFramingInput = {
  /** Current project.md markdown as sent by the client. */
  projectDoc?: string;
  /** Current design.md markdown as sent by the client — the taste
   *  manifesto. Pre-seeded from the embedded skills, evolves with use.
   *  At render time we prepend a YAML front-matter block projecting
   *  the live tokens + component-tokens onto Google's DESIGN.md
   *  schema so the agent sees one unified file. */
  designDoc?: string;
  /** Current design-token snapshot — the LIVE values for every CSS variable
   *  the design.md and stack guidelines reference by name. Feeds the
   *  YAML front matter that precedes the prose design doc. */
  tokens?: TokensSnapshot;
  /** Current component-token map — per-component style contract
   *  (`button-primary.backgroundColor = {colors.brand}`). Projects to
   *  the `components:` section of the YAML front matter. */
  componentTokens?: ComponentTokens;
  /** Current icon-style defaults — which variant to reach for by default,
   *  what size, what color. Flows into a compact block right after the
   *  tokens block. */
  iconStyle?: IconStyleSnapshot;
  /** When true, adds the GATE instruction for the orchestrator. Sub-agents
   *  don't get the gate — they only run after the orchestrator decides to
   *  fire them, and the orchestrator is the one respecting the gate. */
  includeGate?: boolean;
};

/**
 * Render the live token snapshot as a compact reference block. Sits right
 * below the design brief so the agent sees taste rules + live values as
 * one coherent section — no duplication, no drift.
 */
function renderTokensBlock(tokens: TokensSnapshot): string {
  const colorLines = tokens.color
    .map(
      (t) =>
        `- \`var(--color-${t.name.replace(/\./g, "-")})\` → light ${t.light} · dark ${t.dark}`,
    )
    .join("\n");
  const scalarLines = (prefix: string, items: Array<{ name: string; value: string }>) =>
    items
      .map(
        (t) =>
          `- \`var(--${prefix}-${t.name.replace(/\./g, "-")})\` = ${t.value}`,
      )
      .join("\n");
  const parts = [
    "# Current design-token values (live from the Tokens panel — source of truth for every CSS variable referenced in the design brief and stack guidelines)",
  ];
  if (tokens.color.length > 0) {
    parts.push(`## Colors (light / dark)\n${colorLines}`);
  }
  if (tokens.spacing.length > 0) {
    parts.push(`## Spacing\n${scalarLines("space", tokens.spacing)}`);
  }
  if (tokens.radius.length > 0) {
    parts.push(`## Radius\n${scalarLines("radius", tokens.radius)}`);
  }
  if (tokens.typography.length > 0) {
    const typographyLines = tokens.typography
      .map(
        (t) =>
          `- \`${t.name}\` — ${t.fontSize} / ${t.fontWeight} / lh ${t.lineHeight} / tracking ${t.letterSpacing} (${t.fontFamily.split(",")[0].trim()})`,
      )
      .join("\n");
    parts.push(
      `## Typography (each role emits 5 vars: \`--font-<role>-family\`, \`-size\`, \`-weight\`, \`-line-height\`, \`-letter-spacing\`; \`--font-<role>\` alone is the size)\n${typographyLines}`,
    );
  }
  parts.push(
    "These values swap automatically under `[data-theme=\"dark\"]` or `@media (prefers-color-scheme: dark)`. Never hardcode the raw value — always use the `var(--…)` reference so edits in the Tokens panel propagate to every screen.",
  );
  return parts.join("\n\n");
}

/**
 * Compact block naming the user's preferred icon defaults. The agent has
 * full discretion to override per-usage (filled for active states,
 * outlined for inactive is ALWAYS the iOS default regardless of what's
 * configured) — this is just the fallback when nothing in context
 * dictates otherwise.
 */
function renderIconStyleBlock(style: IconStyleSnapshot): string {
  return [
    "# Icon defaults (live from the Icons panel)",
    `- Default variant: **${style.defaultVariant}** — use this when the usage is ambiguous. Override per-usage: filled for active/selected/primary, outlined for default/inactive/decorative.`,
    `- Default size: **${style.defaultSize}px** — scale by role: 16 inline, 20 list accessory, 24 primary UI, 28 tab bar, 40+ hero.`,
    `- Default color: \`${style.defaultColor}\` — pass via the \`color\` prop. Switch to \`var(--color-brand)\` on active tab/nav icons, \`var(--color-state-error)\` on destructive.`,
    "- **Import path:** the icons module sits at the project root (`/centralIcons.js`). Use the right relative path: `./centralIcons` from a screen (`/App.js`), `../centralIcons` from a shared component (`/components/Foo.js`). DO NOT import from `@central-icons-react/…` (it will fail DependencyNotFoundError at runtime).",
    "- **Call `searchIcons({ query })` to find exact names before writing `<Icon name=\"…\">`, `IconSwap name`, or any icon prop.** Guessing will render null and surface a runtime error. When delegating, pass an \"Approved icons\" list when you already know the names; screen sub-agents can also call `searchIcons` before final code.",
  ].join("\n");
}

/**
 * Did the user supply enough content to consider the project established?
 * Uses the same heuristic as the client-side store so the two agree.
 */
export function isProjectEstablished(projectDoc: string | undefined): boolean {
  if (!projectDoc) return false;
  return effectiveProjectDocContent(projectDoc).length >= 100;
}

export function buildAgentFraming(opts: AgentFramingInput): string {
  const established = isProjectEstablished(opts.projectDoc);
  const parts: string[] = [];

  // --- Project brief ---
  if (established && opts.projectDoc) {
    parts.push(
      `# Project brief (user-authored — the product you are building)\n\n${opts.projectDoc.trim()}`,
    );
  } else if (opts.includeGate) {
    parts.push(`# ⛔ PROJECT GATE — DO NOT BUILD YET

The project brief is empty. Before you create ANY screens, components, services, or data entities, you MUST establish the project. That grounds every downstream decision: screen names, copy, aesthetic, target viewport, data shape.

**How to establish — ONE turn, minimal friction:**

1. If the user's LATEST message already gave you enough detail to write a real brief (product idea + rough target user + vibe), call \`writeProjectDoc({ markdown })\` directly with a synthesized brief. Then \`askClarifyingQuestions\` to fill the most-ambiguous gaps if needed, then build.
2. If the user's message is thin ("a recipe app"), call \`askClarifyingQuestions\` first with 3-5 questions covering: vibe/aesthetic, target user, must-have features, platform (web/mobile/universal), and any domain-specific thing you'd otherwise guess. Synthesize the answers into markdown and call \`writeProjectDoc({ markdown })\` — only then start building.

**The brief markdown should contain** (these sections, roughly — phrasing is flexible):

- **What is this?** — 1 paragraph describing the product
- **Who is this for?** — target user, their context, problem being solved
- **Core features (V1)** — bullet list
- **Vibe & tone** — aesthetic + brand voice direction
- **Platforms** — web / mobile / universal, default viewport
- **Data model** — rough entities & fields (if applicable)
- **Out of scope** — what's explicitly NOT in V1

Keep it tight — the brief is CONTEXT, not a design spec. 150–400 words is a good target.

**While the gate is active, the ONLY tools you may call are:** askClarifyingQuestions, writeProjectDoc, think, readNote, writeNote, suggestReplies, useSkill.

**Do NOT call any of these until the gate releases:** delegateScreen, createScreen, createSheetView, updateScreen, editScreen, createComponent, createService, defineDataEntity, reviewScreen, createShape.

The gate releases automatically the moment \`writeProjectDoc\` lands enough content (~100 chars of real text).`);
  } else {
    // Sub-agent being called with no project doc — shouldn't happen because
    // the orchestrator gate prevents builds. If it does, include a terse
    // note so the sub-agent knows to rely on the brief it receives inline.
    parts.push(
      `# Project brief\n\n(No project brief is set yet. Rely on the brief you received from the orchestrator, not general assumptions.)`,
    );
  }

  // --- Design taste (always-on, seeded from embedded skills) ---
  // The prose gets a YAML front matter projection prepended so the
  // agent sees ONE file with machine-readable tokens + component
  // contracts at the top and human-readable rationale below. Google's
  // DESIGN.md schema; `design-md-yaml.ts` owns the projection. When
  // the YAML block is present, the separate "Live token values" block
  // is redundant — it IS the YAML.
  if (opts.designDoc && opts.designDoc.trim().length > 0) {
    const yaml =
      opts.tokens && opts.componentTokens
        ? buildDesignMdFrontMatter({
            tokens: opts.tokens,
            componentTokens: opts.componentTokens,
          })
        : "";
    const unified = yaml
      ? prefixDesignMdWithYaml(opts.designDoc.trim(), yaml)
      : opts.designDoc.trim();
    parts.push(
      `# Design brief (taste profile — apply to every screen)\n\n${unified}`,
    );
  } else if (opts.tokens) {
    // No prose design.md but tokens exist — still render the token
    // block so the agent has the current values.
    parts.push(renderTokensBlock(opts.tokens));
  }

  // --- Icon-style defaults ---
  // Tiny, static block reminding the agent which variant / size / color to
  // reach for when context doesn't dictate a specific choice. The full
  // 1970-icon catalog is accessed via the `searchIcons` tool.
  if (opts.iconStyle) {
    parts.push(renderIconStyleBlock(opts.iconStyle));
  }

  // --- Stack & conventions (always-on) ---
  parts.push(STACK_GUIDELINES);

  return parts.join("\n\n---\n\n");
}
