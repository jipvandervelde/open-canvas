/**
 * Design engineering CORE_RULES + REVIEW_CHECKLIST constants. These are the
 * always-on floor injected into every orchestrator + sub-agent system
 * prompt. Deep per-topic guidance (animations, forms, etc.) now lives in
 * the skill registry and is picked contextually — see
 * `pickPrinciplesForBrief`, which just delegates to the registry now.
 *
 * Server-only — this file is imported from API routes and must NOT be
 * pulled into client bundles.
 */

/**
 * The hard floor every screen must respect. Kept deliberately tight —
 * this gets repeated in every sub-agent prompt, so bloat here costs real
 * tokens. Deep detail lives in the contextual per-file injections.
 */
export const CORE_RULES = `# Design Engineering Core Rules (non-negotiable)

## Layout stability
- No layout shift on dynamic content. Use fixed dimensions for images and any dynamically-sized container.
- For numbers that change (counters, prices, timers, stats): set \`fontVariantNumeric: 'tabular-nums'\` on the element.
- Never change font-weight on hover / selected state — it causes reflow. Keep weight constant, change color/background instead.

## Animation
- Only animate \`transform\` and \`opacity\`. Never animate \`height\`, \`width\`, \`top\`, \`left\`, \`margin\`.
- Easing: \`ease-out\` for enter/exit, \`ease-in-out\` for movement on screen, \`ease\` for hover/color changes. Never \`linear\`.
- Duration: 150–250ms for micro-interactions, 300–400ms max for page transitions. If users see it 100+ times/day, don't animate at all — skip the delight.
- NEVER use \`transition: all\`. Specify exact properties (e.g. \`transition: transform 200ms ease-out, opacity 200ms ease-out\`).
- Respect reduced motion: gate non-essential animations behind \`@media (prefers-reduced-motion: no-preference)\`, or shorten/disable them when \`prefers-reduced-motion: reduce\`.

## Touch & accessibility
- Tap targets ≥ 44×44px. Use padding to grow the hit area if the visible element is smaller.
- Gate hover effects: \`@media (hover: hover) and (pointer: fine) { ... }\`. Never apply hover styles unconditionally — they stick on touch devices.
- Every icon-only button needs \`aria-label\`. Every image that carries meaning needs \`alt\`.
- Inputs must be ≥ 16px font-size (iOS Safari zooms otherwise).
- Add \`touch-action: manipulation\` to tappable elements to kill the 300ms click delay.
- Every interactive element has a visible focus state. Never \`outline: none\` without a replacement.
- Never rely on hover for core functionality.

## Forms & inputs
- Always \`<button type="button">\` unless the button actually submits a form.
- Associate \`<label htmlFor>\` with inputs by \`id\`, or wrap the input inside the label.
- Submit on Enter (single-line) or Cmd/Ctrl+Enter (multi-line textareas).
- Use correct input type for mobile keyboards: \`type="email"\`, \`type="tel"\`, \`type="number"\`, plus \`inputMode\`.
- Tune \`autocomplete\`, \`autoCapitalize\`, \`spellCheck\` per field (emails/usernames/code: off; names: words).
- Pressed state: \`:active { transform: scale(0.97); }\`. Small, snappy, under 150ms.

## Visual polish
- App shell should use \`-webkit-font-smoothing: antialiased\` and \`fontFeatureSettings\` where appropriate.
- Prefer hairline borders via \`box-shadow: 0 0 0 1px <color>\` over \`border: 1px solid\` where pixel precision + layout stability matter.
- Hover color shifts: \`color-mix(in oklch, <color> 10%, <base>)\` over hand-tuned variants.
- Z-index: use a fixed scale in your project (10/20/30/40/50). Never \`z-index: 9999\`. Reach for \`isolation: isolate\` to create local stacking contexts.
- Don't customize page-level scrollbars. Only customize scrollbars inside small bounded elements if at all.

## Performance
- Virtualize lists that can exceed ~100 rows.
- No layout-thrashing reads + writes in the same frame. Batch DOM reads before writes.
- Don't animate above-the-fold content on initial load (delays perceived paint).`;

/**
 * Explicit review criteria for the orchestrator's post-batch review phase.
 * Injected into the orchestrator system prompt only — sub-agents don't
 * need this; they follow the rules directly.
 */
export const REVIEW_CHECKLIST = `Review checklist (apply to every parallel batch before declaring the turn done):

Per-screen:
- No layout shift on dynamic content (tabular-nums on changing numbers, fixed dimensions on images and dynamic containers).
- Animations animate only transform/opacity; correct easing (ease-out enter/exit, ease-in-out movement); respect prefers-reduced-motion; no \`transition: all\`.
- Tap targets ≥ 44px on buttons, tab bar items, list row tap areas.
- Hover effects gated behind @media (hover: hover).
- Visible focus state on every interactive element.
- Icon-only buttons have aria-label.
- Inputs ≥ 16px font-size; forms submit on Enter/Cmd+Enter; correct input types.
- z-index uses the project's fixed scale.

Cross-screen (within the batch):
- Same navigation pattern (tab bar / app bar) across peer screens.
- Same card / list-row / button style.
- Same typography hierarchy.
- Same background treatment.
- Navigation actually wired: list items → Link with ?id= querystring, detail screens use useParams() from ./services/router.
- Data flow correct: clicking row A shows row A in the detail screen (verify by inspecting the generated code).

If ANY criterion fails, fire updateScreen(s) in parallel (where independent) to fix. Do not leave inconsistencies — the user notices.`;

/**
 * Principle routing used to be driven by a hardcoded table here. It's now
 * driven by the skill registry — each sub-file declares its own `scope`
 * and `triggers` in YAML frontmatter. This function remains as a thin
 * shim so callers don't have to change import paths.
 */
export async function pickPrinciplesForBrief(params: {
  viewportId: string;
  brief: string;
  sharedContext?: string;
  disabledSkills?: Set<string>;
}): Promise<Array<{ slug: string; title: string; body: string }>> {
  const { pickSubAgentResources } = await import("./skills-registry");
  return pickSubAgentResources({
    viewportId: params.viewportId,
    brief: params.brief,
    sharedContext: params.sharedContext,
    disabledSkills: params.disabledSkills,
    limit: 2,
  });
}
