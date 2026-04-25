/**
 * Focused sub-reviewer — narrow, thinking-OFF, single-category pass over
 * ONE screen. Spawned by the top-level reviewer's `spawnSubReviewer` tool
 * call so the top-level agent can fan out several focused reviews in
 * parallel (accessibility, motion, forms, layout, visual-consistency,
 * navigation) and merge the results instead of one long monolithic
 * reasoning block.
 *
 * This endpoint is non-streaming: it runs a short `generateText` call and
 * returns the parsed issues as JSON. The parent reviewer receives this
 * JSON as the tool result and decides whether to flagIssue() each one
 * into its own aggregate list (deduping by location+problem).
 *
 * Thinking is OFF here on purpose — the focus is narrow enough that
 * lengthy reasoning is net-negative. The parent reviewer carries the
 * thinking budget; the children are cheap, fast, parallel workers.
 */

import { generateText } from "ai";
import { kimi } from "@/lib/kimi";
import { buildAgentFraming } from "@/lib/agent-framing";

export const maxDuration = 60;

/**
 * Narrow rubric definitions — each focus slot maps to a tight subset of the
 * CORE_RULES checklist. Keeping these inline (not pulling the skills
 * registry) keeps the sub-reviewer's prompt short and its output focused.
 */
const FOCUS_RUBRICS: Record<string, { title: string; rubric: string }> = {
  accessibility: {
    title: "Accessibility",
    rubric: `Check ONLY these:
- Tap targets ≥ 44px for every button, tab-bar item, list row tap area.
- Icon-only buttons have aria-label.
- Visible focus state on every interactive element (outline, ring, or equivalent).
- Hover effects gated behind @media (hover: hover) so they don't stick on touch.
- Inputs have font-size ≥ 16px (prevents iOS zoom) and correct input types.
- Images have alt (or alt="" for decorative).
- Color contrast reads as intentional (ignore if you can't verify from source).`,
  },
  motion: {
    title: "Motion",
    rubric: `Check ONLY these:
- Animations run on transform/opacity only, not layout properties (width/height/top/left/margin).
- No \`transition: all\` — transitions list explicit properties.
- Easing is correct: ease-out for enters, ease-in for exits, ease-in-out for movement.
- prefers-reduced-motion is respected (skip or shorten animations).
- Framer-motion uses project presets (Motion/MotionList with preset="…") not hand-rolled configs when the preset library covers the case.`,
  },
  forms: {
    title: "Forms & controls",
    rubric: `Check ONLY these:
- Inputs use correct type= (email, tel, number, search, password).
- Text inputs have font-size ≥ 16px to prevent iOS zoom-on-focus.
- Forms submit on Enter / Cmd+Enter where appropriate (form element present, submit button present).
- Buttons have explicit type ("button" / "submit") — missing type defaults to submit inside a form and causes accidental submits.
- Labels are associated (htmlFor or wrapping <label>).
- Disabled states are clearly distinct (opacity + cursor:not-allowed + aria-disabled).`,
  },
  layout: {
    title: "Layout & shift",
    rubric: `Check ONLY these:
- Flex layout everywhere — no absolute positioning for structural layout.
- No magic-number margins for horizontal alignment; use gap and justify/align.
- Dynamic numbers use font-variant-numeric: tabular-nums (timers, counts, prices).
- Images and dynamic-height containers have explicit width/height or aspect-ratio to prevent CLS.
- The top-level wrapper fills the viewport (minHeight: 100vh, width: 100%, flex column) with the background set on it so it bleeds edge-to-edge.
- Mobile screens respect safe-area padding — prefer the tokens var(--space-safe-top) (62px on Dynamic Island iPhones) and var(--space-safe-bottom) (34px) over hardcoded literals.`,
  },
  "visual-consistency": {
    title: "Visual consistency",
    rubric: `Check ONLY these:
- Design tokens are used via var(--color-*), var(--space-*), var(--radius-*), var(--font-*) — not raw hex/px everywhere.
- Typography hierarchy is clear (distinct sizes/weights for headings vs body vs captions).
- Spacing rhythm is consistent (don't mix 13px and 16px gaps without reason).
- Default font stack: system-ui, -apple-system, sans-serif.
- Status-bar-style matches the screen background (light on dark, dark on light).`,
  },
  navigation: {
    title: "Navigation & data flow",
    rubric: `Check ONLY these:
- List → detail links use querystring params: <Link to={\`/detail?id=\${item.id}\`}>.
- Detail screens read params with \`const { id } = useParams();\` from './services/router'.
- Internal navigation uses <Link> from './services/router', NOT <a href>.
- Shared data comes from './data/{entity}' imports — not inlined arrays that would drift between screens.
- Route paths used actually exist in the project (don't link to dead routes).`,
  },
};

export async function POST(req: Request) {
  const {
    screenName,
    viewportId,
    code,
    focus,
    projectDoc,
    designDoc,
    tokens,
    componentTokens,
    iconStyle,
  }: {
    screenName: string;
    viewportId: string;
    code: string;
    focus: string;
    projectDoc?: string;
    designDoc?: string;
    tokens?: import("@/lib/agent-framing").TokensSnapshot;
    componentTokens?: import(
      "@/lib/design-component-tokens-store"
    ).ComponentTokens;
    iconStyle?: import("@/lib/agent-framing").IconStyleSnapshot;
  } = await req.json();

  const rubric = FOCUS_RUBRICS[focus];
  if (!rubric) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Unknown focus "${focus}". Valid focuses: ${Object.keys(FOCUS_RUBRICS).join(", ")}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const system = `You are a focused code reviewer. You ONLY check for ${rubric.title.toUpperCase()} issues on one React screen. Ignore everything else — other reviewers are handling other categories in parallel.

${rubric.rubric}

Output format — MUST be valid JSON, no prose outside it, no code fences:

{
  "focus": "${focus}",
  "issues": [
    {
      "severity": "high" | "medium" | "low",
      "location": "<short hint, e.g. 'submit button', 'recipe card row'>",
      "problem": "<what's wrong, specific>",
      "fix": "<one-line concrete instruction for the orchestrator's updateScreen>"
    }
  ]
}

Rules:
- Max 4 issues. Be picky, not exhaustive. Surface the WORST offenders only.
- If the screen is clean for ${rubric.title}, return an empty issues array.
- Every fix must be a concrete one-liner, not "improve X".
- Do NOT flag issues outside the ${rubric.title} focus area.`;

  const prompt = `Screen: ${screenName}
Viewport: ${viewportId}

--- /App.js ---
${code}

Return the JSON now.`;

  try {
    // Thinking OFF — narrow focus, no need for a reasoning pass.
    const { text, usage } = await generateText({
      model: kimi({ thinking: false }),
      system:
        buildAgentFraming({
          projectDoc,
          designDoc,
          tokens,
          componentTokens,
          iconStyle,
        }) +
        "\n\n---\n\n" +
        system,
      prompt,
    });

    // Strip accidental code fences and parse the outermost JSON object.
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:\w+)?\n/, "").replace(/\n```\s*$/, "");
    }
    const open = cleaned.indexOf("{");
    const close = cleaned.lastIndexOf("}");
    if (open < 0 || close <= open) {
      return new Response(
        JSON.stringify({
          ok: false,
          focus,
          error: "Sub-reviewer did not return JSON",
          raw: text.slice(0, 500),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    let parsed: { focus?: string; issues?: unknown[] } = {};
    try {
      parsed = JSON.parse(cleaned.slice(open, close + 1));
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          focus,
          error: `Sub-reviewer JSON invalid: ${String(err)}`,
          raw: text.slice(0, 500),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    const issues = Array.isArray(parsed.issues)
      ? (parsed.issues as Array<Record<string, unknown>>).map((iss) => ({
          severity: (iss.severity as string) ?? "low",
          // Force the category to the parent focus slot — sub-reviewers
          // sometimes emit their own category label and we want the merge
          // step to see a consistent value.
          category: focus,
          location: (iss.location as string) ?? "",
          problem: (iss.problem as string) ?? "",
          fix: (iss.fix as string) ?? "",
        }))
      : [];

    return new Response(
      JSON.stringify({
        ok: true,
        focus,
        issues,
        usage: usage
          ? {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              reasoningTokens: usage.reasoningTokens,
              totalTokens: usage.totalTokens,
            }
          : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, focus, error: String(err) }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const FOCUS_SLUGS = Object.keys(FOCUS_RUBRICS);
