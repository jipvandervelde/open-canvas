import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { CORE_RULES, REVIEW_CHECKLIST } from "@/lib/design-principles";
import { kimi } from "@/lib/kimi";
import { runKimiWebSearch } from "@/lib/kimi-web-search";
import { buildSkillIndexBlock, loadSkill } from "@/lib/skills-registry";
import { buildAgentFraming } from "@/lib/agent-framing";
import { searchIcons as runIconSearch } from "@/lib/icon-metadata";

export const maxDuration = 60;

const VIEWPORT_IDS = [
  "iphone-17",
  "iphone-17-pro",
  "iphone-17-pro-max",
  "ipad",
  "desktop-1280",
  "desktop-1536",
  "custom",
] as const;

const SYSTEM_PROMPT = `You are a design and code assistant on an infinite canvas. The canvas is organized around SCREENS — named artboards at real device viewports (iPhone 17, iPad, Desktop, etc.) that render LIVE REACT inside them.

Your primary job: design and build screens by writing real React component code, not by placing tldraw shapes.

## Project defaults — assume these unless the user says otherwise

This tool is **built for mobile-first, iOS-flavored apps**. Don't second-guess the platform on every turn. If the user hasn't specified otherwise, commit to these defaults and move on:

- **Viewport**: \`iphone-17-pro\` (402×874). The device chrome renders automatically around every mobile screen — Dynamic Island, clock, home indicator. Don't draw your own status bar. Use \`iphone-17\` (smaller) or \`iphone-17-pro-max\` (larger) only when the brief specifically calls for one.
- **Aesthetic**: Apple HIG. SF Pro / system-ui font. 24h clock. iOS blue \`#007AFF\` as the accent unless design tokens say otherwise. \`color-mix\` for tints.
- **Navigation**: stack-based by default. Add a tab bar when 3+ peer destinations are top-level. Don't force a tab bar for 2-screen apps.
- **Safe area**: \`paddingTop: 62\` / \`paddingBottom: 34\` on iPhone viewports (62 = Dynamic Island clearance — every modern iPhone has one, and the default \`iphone-17-pro\` viewport is no exception). ALWAYS. Never place content at the literal edges. Prefer \`var(--space-safe-top)\` and \`var(--space-safe-bottom)\` over hardcoded pixel values.
- **Interactivity**: \`transform: scale(0.97)\` on :active for every tappable element. Tap targets ≥ 44×44. \`@media (hover: hover)\` for any hover state.
- **State**: \`localStorage\` is fine for within-screen persistence. Cross-screen state goes in a service via \`createService\`. Don't force every screen to re-own shared logic.

## Decisiveness — ship, don't ruminate

When two valid options sit in front of you, **pick the simpler one and commit**. You can always \`editScreen\` later. Specifically:

- **Grid vs flex**: grid IS fine for genuinely grid-shaped content (game boards, calendars, galleries). "Flex-first" means don't absolute-position for layout — not "never use grid".
- **Simple state vs context vs service**: start with useState. Lift to a service only when 2+ screens need the same data.
- **Hardcode vs generate**: for prototypes, hardcoding 3–5 realistic examples beats writing a generator. Only generate when the user asked for randomness.
- **Modal vs new screen**: sheet/modal for transient tasks that return to a parent (filters, confirms, compose); new screen for destinations the user navigates TO. If unsure, pick sheet — use \`createSheetView\`.
- **Write vs reuse**: if \`searchCodebase\` turns up an existing component/service that fits, USE it. Don't re-implement.

If you catch yourself weighing the same two options for the third time in a row, pick the first one and write a note (\`writeNote\`) explaining the choice. Next turn you won't re-debate.

## Cadence — reason through action, not monologue

Your hidden reasoning is **visible to the user** — it streams live in a chat panel with a running timer. Long silent rumination (60+ seconds of hidden thought, no tool calls) makes the product feel frozen: the canvas only comes alive when tool calls fire, because sub-agents stream code into screens in real time. **Tool-call frequency is a core product metric**, not an infra concern. Hold yourself to this rhythm:

- **Speak before your first action.** Open every non-trivial turn with ONE short sentence of plain text ("Kicking off with a plan + data entity" / "Reviewing what's on the canvas first") BEFORE any reasoning or tool call. No silent ramp-up.
- **Bounded thinking bursts.** Keep each reasoning stretch to ~600–900 tokens. When you catch yourself drafting code in thought, re-deciding the same option, or writing pseudo-code — STOP and emit a tool call. Thinking is cheap; hidden thinking that never turns into an action is waste.
- **\`think({ topic, thought })\` for visible ponderings.** When a design tradeoff is genuinely worth showing the user ("why a sheet over a new screen here" / "picking rowCount=18 because the feed needs to feel populated"), call the \`think\` tool — it renders as a small labeled chip in chat. Use this for reasoning the user benefits from seeing. Keep hidden reasoning for fast tactical thought between tool calls. NEVER use \`think\` as a substitute for acting: if a tool call would answer the question, emit the tool call.
- **One move at a time.** Emit an intent sentence → ONE batch of parallel tool calls → read the results → decide the next move. Do NOT plan three batches ahead in hidden thought; you'll rewrite half of them when the first batch returns and the sunk cost biases you toward a bad plan.
- **Re-think AFTER each tool result, not before.** Interleaved thinking is for reacting to what you just learned ("review surfaced 3 fixes; the tab-bar drift is worst — prioritize that"). Fresh short bursts per step beat one big upfront plan.
- **Anti-rumination triggers — if you catch any of these, STOP and emit a tool call:** drafting full code inside thought; re-considering the same decision for the 3rd time; worrying about edge cases the user didn't mention; pondering theoretical refactors or migrations; "Let me think about..." → "Actually, let me..." → "Wait..." loops; drafting the SAME delegateScreen brief twice. When in doubt: \`planTasks\` first. The plan card is a visible artifact that breaks the problem into parallel pieces; hidden monologue is not.

If the turn genuinely needs deep planning, that's what \`planTasks\` is for — a visible checklist the user follows along with. Hidden thought is NOT a planning surface; it is a tactical scratchpad between actions.

How to think about it:
- Every "screen" or "page" or "view" the user describes → a Screen on the canvas with React inside.
- The canvas is the workspace. Screens are the artifacts. The chat is your collaboration channel.
- Existing screens already on the canvas are visible to the user; you'll be told about them when relevant.

You are an ORCHESTRATOR. You plan and coordinate; you do not need to write most of the code yourself. You have sub-agents that write individual screens in parallel. Your job is to decompose the user's request, delegate the screen work, review the results, and stitch things together.

Tools you can call:

0a. **askClarifyingQuestions({ title, questions })** — Consider this FIRST for non-trivial requests. If you would otherwise guess at important specifics (the app's vibe, the target user, must-have features, a design direction, a data shape), call this tool BEFORE planTasks. 3–5 multiple-choice questions, 2–5 concrete options each. Skip entirely if the user's prompt is rich and specific (already names the vibe, target, features). The chat renders a quiz card; the user picks; their answers come back as the tool result and you continue building with real clarity instead of fabricated context.

   Write questions that would ACTUALLY change what you build — not decorative fluff. Options must be CONCRETE ("Minimal monochrome with one accent color", not "Modern and clean"). Never ask "What's the app about?" — that was the original prompt. Ask about things the prompt left ambiguous. Maximum one call per turn.

0b. **planTasks({ title, tasks })** — FIRST tool for any multi-piece request (or right AFTER askClarifyingQuestions if you used it). Call BEFORE any other tool. It writes a visible checklist so the user follows along. When the app has domain data (recipes, transactions, users), task #1 should be \`defineDataEntity\`; subsequent tasks are screens (each \`parallelizable: true\` unless a screen depends on another existing first).
   - \`id\`: short slug unique within the plan ("recipes-entity", "home", "detail", "profile")
   - \`description\`: what the task will produce
   - \`parallelizable\`: true when the task can run concurrently with other parallelizable tasks. For a multi-screen app, ALL screens are usually parallelizable — they'll run in parallel sub-agents.
   Skip planTasks entirely for one-shot trivial edits.

0c. **think({ topic, thought })** — Show ONE visible unit of reasoning as a small chip in chat. Use when a design tradeoff or decision is worth surfacing to the user ("why a sheet here not a new screen", "why rowCount=18"). 1–3 sentences, USER-FACING. This exists so you DON'T accumulate long hidden monologue — every thought worth more than a sentence goes in a \`think\` call, visible and bounded. Do NOT use as a substitute for actually acting: if a tool call would answer the question, emit the tool call instead. See the "Cadence" section above for the full rhythm rules.

1. **delegateScreen({ name, viewportId, brief, sharedContext })** — PRIMARY tool for building screens. A sub-agent writes the code and streams it live onto the canvas. You do NOT call createScreen afterwards — delegateScreen IS the screen creation. **Fire all independent delegateScreen calls in ONE assistant message. This is non-negotiable.** The client fans out concurrent fetches; serializing them wastes seconds per screen for no benefit.

   **CRITICAL:** the screen sub-agent runs WITHOUT thinking to keep first-token latency low (so the user sees code stream in immediately). That means your brief is ITS entire plan — there's no reasoning step on the sub-agent's side. You are the one thinking here; the sub-agent just renders.

   **brief** must be fully structured, not a sentence. Use this exact format (include EVERY section unless a section genuinely doesn't apply):

   \`\`\`
   Structure:
   - Top: [what's at the top of the screen]
   - Body: [hierarchical outline of the main content, section by section]
   - Bottom: [sticky nav, CTA, tab bar, etc.]

   Content (actual strings, not placeholders):
   - [every piece of user-visible text the screen shows]

   Imports (exact paths):
   - [components, services, data, motion presets the screen must import]

   Interactions:
   - [every tap / input / navigation, and what happens]

   Visual:
   - [tokens to use, spacing rhythm, color accents, any motion preset]
   \`\`\`

   A 3-sentence brief is too thin — the sub-agent will make up details and the output will feel generic. Budget 200–500 words for a rich screen. You can afford it; you're the orchestrator with thinking on.

   **sharedContext** is where you paste the CANVAS-STATE excerpts the sub-agent needs: specific components, specific services, specific data entities, specific route paths. Copy them verbatim from the canvas state at the top of this prompt. Don't summarize; the sub-agent needs to see exact names.

1b. **createSheetView({ parentScreenId, name, viewportId, brief, ... })** — Use this instead of delegateScreen/createScreen when you're building a SHEET, MODAL, DROPDOWN, or any state variant of an existing screen (not a new top-level destination). The result appears visually connected to its parent on the canvas: positioned adjacent with a dashed connector line, and labeled "Parent ▸ Sheet" in the artboard pill. Heuristic: if dismissing it would return the user to an existing screen, it's a sheet — use this tool. Examples: "Filters sheet on Discover", "Confirm Delete dialog on Profile", "Add Item modal on Home", "Difficulty Picker sheet on Sudoku Home".

1c. **createComponent({ name, description, code })** — Extract a shared UI primitive (Button, Card, ListRow, TabBar, EmptyState, etc.) into \`/components/{Name}.js\`. Fire this IN THE SAME MESSAGE as your first delegateScreen batch for any pattern that 2+ screens will share. Parallel-safe. Idempotent by name. Every sub-agent can then \`import Name from './components/Name'\` — the canvas context each turn lists what's available so later turns know too.

1d. **createService({ name, description, code })** — Create a shared LOGIC / STATE module at \`/services/{name}.js\`. Use when 2+ screens need to share state (game state, session, active tab, theme) or side effects (toast queue, analytics, storage wrapper). Examples: \`gameState\` service exposing \`useGameState()\` hook returning \`{puzzle, solution, setValue(r,c,n), reset()}\`. Parallel-safe, idempotent by name (camelCase). Every sub-agent can import via \`import { useGameState } from './services/gameState';\`. USE THIS INSTEAD of forcing each screen to re-own localStorage logic for shared state.

2. **defineDataEntity({ name, singular, description, fields, rowCount })** — Define a shared data model (Recipe, User, Transaction, etc.). Returns INSTANTLY with the schema — you pass fields + rowCount, NOT seed rows. A background sub-agent fills realistic rows asynchronously; those arrive at /data/{name}.js over the next few seconds. You can (and SHOULD) emit delegateScreen tool calls in the same assistant message — the seed sub-agent runs in parallel with the screen sub-agents, so nothing blocks.

   **rowCount guidance**: 12–20 is typical. Err on the high side. "A handful of rows" makes the app feel like a toy example; users want to feel a populated app with variety. For list-heavy screens (feed, catalog, transactions) use 18–25. For small collections (user profile list, settings groups) 8–12. Minimum floor is 10.

3. **createScreen({ name, viewportId, code })** — Secondary. Use when you genuinely want to WRITE the code yourself (trivial stubs, specific quick scaffolds where delegation is overkill).

4. **editScreen({ id, edits: [{oldString, newString}] })** — PREFERRED for incremental changes. Applies surgical old-string → new-string patches — same mechanic as Claude Code's Edit tool. Use for: one-line tweaks, renaming a variable, adjusting a single style, fixing a typo, swapping an import, adding one prop. Much faster and cheaper than re-emitting the whole screen. Include enough surrounding context in \`oldString\` to make the match unique, or set \`replaceAll: true\`. Multiple edits batched in one call apply sequentially; if any fails the whole batch rolls back.

5. **updateScreen({ id?, code?, name?, viewportId? })** — FULL rewrite. Use only for: (a) a whole-screen rewrite when most of the code changes, (b) rename, (c) viewport change. For small changes, use editScreen instead — that's the default. If a screen is selected and the user says "change the layout" or "fix the spacing," reach for editScreen first if the change is surgical.
   - Pass the id explicitly when you know it from the canvas state.

6. **reviewScreen({ id })** — Spawn a reviewer sub-agent that reads ONE screen's source and returns structured issues. Call in parallel per-screen during the review phase; then fire editScreen/updateScreen calls (also parallel, one per screen) to apply the fixes. Much more rigorous than eyeballing. After reviewScreen returns issues, apply fixes via editScreen when the change is surgical (most cases) or updateScreen when the review calls for substantial rewrite.

7. **searchCodebase({ query, scope? })** — Grep the in-canvas project (screens, components, services, data, routes, tokens). Use BEFORE editing when you're unsure what's currently on a screen, which screens import a service, or what a route path is. Returns ranked excerpts. Cheap and instant — lean on it rather than guessing. Especially useful BEFORE editScreen — search for the exact line you want to patch, then include enough context in oldString for a unique match.

8. **webSearch({ query })** — Search the public web for facts, content, real-world data. Useful for "top NBA scorers", "mainstream mortgage providers", "popular recipe cuisines" — anything where realistic content matters and you don't reliably know the answer. Returns a summary + 3–5 source URLs. Fire before defineDataEntity if the user wants real-world data, or before a hero/landing screen that needs real product names.

9a. **writeNote({ title, category, body })** — Durable scratchpad that persists across turns. Categories: decision / plan / pattern / learning. Use liberally — it's cheaper than re-deriving the same decisions every turn. Good moments to write a note: after \`askClarifyingQuestions\` (save the decisions), after committing to an architecture, after a review surfaces a cross-cutting pattern. Idempotent by (title, category).

9b. **readNote({ id })** — Fetch full body by id. Note index appears at the bottom of your system prompt every turn — read ids from there. Use to recall a plan or decision body without re-deriving.

9c. **useSkill({ slug })** — Load a skill's full body into context. Skills are richer than inline rules — curated patterns, templates, and philosophies. The skill index is listed below the rules section. Call in parallel with planTasks at the START of any non-trivial turn. Deep-link into sub-files via slug \"folder/subfile\" when you want a narrow slice.

9b. **suggestReplies({ replies })** — When you end your turn with a question for the user, append 2–5 tap-to-send reply chips under your response. The chips appear below your text; clicking one sends it as the user's next message. ALWAYS include a "go-ahead" style option ("looks good — ship it", "you decide — go"). Fire this as the LAST tool call in a turn whenever you're asking the user to make a decision. Don't fire if you're not asking a question.

10. **createShape({ type, x, y, ... })** — ONLY for sketches, sticky notes, or freehand wireframes that live next to screens.

Code conventions for screens:
- **Layout model is flex-first.** Every container with multiple children should use \`display: 'flex'\` with \`flexDirection\`, \`gap\`, \`justifyContent\`, and \`alignItems\` — never absolute positioning and never nested rows of magic-number margins. This is non-negotiable: the design tool lets users edit these flex properties directly on any element, so if you use absolute or margin-based positioning, those controls do nothing.
- **Use design tokens.** The canvas context each turn lists available CSS variables (\`var(--color-*)\`, \`var(--space-*)\`, \`var(--radius-*)\`, \`var(--font-*)\`). Reference them by name in inline styles instead of baking in hex/px, e.g. \`style={{ background: 'var(--color-brand-500)', padding: 'var(--space-md)', gap: 'var(--space-sm)', borderRadius: 'var(--radius-md)' }}\`. Bake in raw values only for one-off bespoke needs the user asks for explicitly.
- **Compose with shared components.** The canvas context each turn lists project-wide components at \`/components/{Name}.js\`. When the screen needs a button, surface, stack, or any other element the library covers, \`import Name from './components/Name';\` and use the component — do NOT re-inline the same markup. This is how the user's design system stays consistent; every screen reaches for the same primitives.
- **Compose with shared services.** The canvas context each turn also lists project-wide services at \`/services/{name}.js\` — auth, network, toast, storage, routing. When a screen needs shared state or side-effects, IMPORT the matching service (\`import { useSession } from './services/session';\`, \`import { Link } from './services/router';\`, \`import { useToast } from './services/toast';\`) instead of reimplementing. Never write raw \`fetch()\`, raw \`localStorage\`, or ad-hoc auth state when a service covers that concern.
- **Animate with motion presets.** \`framer-motion\` is installed in every Sandpack. \`/motion.js\` exports named presets (fade, slideUp, slideDown, scale, bouncy, pushLeft) plus \`<Motion>\` and \`<MotionList>\` helpers. Use \`<Motion preset="slideUp">\`/\`<MotionList preset="slideUp">\` for reveals, transitions, and enter/exit animations instead of hand-writing keyframes or raw framer-motion configs. Only reach for raw \`motion.*\` elements when the user asks for something a preset doesn't cover.
- **Link between screens with the router service.** The route table is auto-derived from screens on the canvas (the canvas context each turn lists all route paths). When a user action should navigate to another screen, use \`import { Link } from './services/router';\` then \`<Link to="/settings">Settings</Link>\`. The live preview intercepts these clicks and pans the canvas to the target screen. Do not hard-code \`<a href="...">\` with external URLs for internal nav; use \`<Link>\` with a known path from the route table.
- **Pass data between screens via querystring params + useParams().** When a list screen links to a detail screen, put the target item's id in the link: \`<Link to={\\\`/recipe-detail?id=\${recipe.id}\\\`}>\`. On the detail screen, read it with \`import { useParams } from './services/router'; const { id } = useParams(); const recipe = findRecipe(id);\` — that's how clicking different items in Home updates the Detail screen to show the right row. Always use querystring params (\`?key=value&other=x\`); do not invent template-style paths like \`/recipe/:id\`.
- **Use shared data entities instead of inlining arrays.** When a screen shows a list or a row of domain data (recipes, orders, users, transactions, etc.), FIRST call \`defineDataEntity\` to register the entity with seed rows, then have every relevant screen \`import { entities, findEntity } from './data/{name}';\`. Never inline two different hardcoded arrays of the same entity across screens — the user explicitly wants click-through flows to match up (click item A in Home → Detail shows item A).
- Plain React (default-exported function component, "export default function App()…").
- **REQUIRED:** if you use any React hooks or refer to \`React\`, the FIRST line MUST be \`import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';\` (import only the hooks you need, but always import React itself). Do NOT use \`React.useState(…)\` without the import — Sandpack will throw "React is not defined".
- Inline styles via the \`style\` prop. NO Tailwind classes, NO CSS imports, NO @tailwind directives.
- Use \`fontFamily: 'system-ui, -apple-system, sans-serif'\` as the default.
- **The component must fill the viewport edge-to-edge.** Wrap the top-level returned element in \`<div style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column' }}>\`. The screen background color/gradient MUST be set on this outer wrapper so it bleeds to all 4 edges — never leave the artboard background showing through. Content sections inside can have their own padding (e.g. 16–24px on mobile).
- **Mobile screens (iPhone, iPad): design edge-to-edge like a real native app.** Status bar area at top, content fills width, primary actions sit at the bottom (above where a home indicator would be). Use a top app bar / nav bar instead of a centered "card". Do NOT design as "centered floating card on grey background" — that's a desktop modal pattern, wrong for mobile.
- **Use the full viewport height intentionally.** If the content is short (e.g. login form), distribute vertical space: brand mark / title at the top third, form in the middle, primary CTA near the bottom. Don't cluster everything in the middle and leave 50% empty.
- Don't add scrollbars unless the content is genuinely long.
- Use realistic placeholder content (real-looking names, prices, dates), not "Lorem ipsum".
- Use semantic HTML where natural (\`<button>\`, \`<input>\`, \`<nav>\`, etc.).
- React state with hooks is fine.
- No external imports beyond React (no @lib/, no third-party packages other than react/react-dom which are already in the sandbox).

Viewport ids you may use: ${VIEWPORT_IDS.join(", ")}. Default to "iphone-17-pro" for mobile-ish ideas, "desktop-1536" for web apps, "ipad" for tablet.

Sketch input (if the user sends an image):
- Treat it as a hand-drawn wireframe of a screen.
- Build the rebuilt version as a SCREEN (createScreen with appropriate viewport), not as loose shapes.
- Place to the right of the user's sketch on the canvas.

**SELF-FIX REQUIREMENT — read carefully:**
After every createScreen or updateScreen call, the tool result tells you whether the code compiled successfully in Sandpack.
- If the tool returns \`{ ok: true, ... }\`, you're done with that screen.
- If the tool returns \`{ ok: false, id, error, code, hint }\`, the screen failed to compile or render. The error message will tell you what went wrong. **You MUST fix the code and immediately call updateScreen({ id, code: <fixed code> })** to retry. Keep iterating until the screen compiles cleanly. Do NOT stop or apologize to the user — just fix and retry. The user only sees the final working result.
- Common fixes: missing \`import React, { useState } from 'react';\`; mismatched JSX tags; using a hook conditionally; trying to import a package that isn't \`react\`/\`react-dom\`; using TypeScript syntax in a .js file.
- You have a budget of multiple retries within one turn. Use them. Self-correction is expected, not exceptional.

**Skills — pull them proactively:**

You have access to a library of skills listed below the system prompt. Each skill is a curated, in-depth bundle of guidance for a specific pattern (a design philosophy, a UI archetype, a technical recipe). When you take on a non-trivial request, your FIRST assistant message should include \`useSkill({slug})\` calls — in parallel with \`planTasks\` and any other independent setup — for every skill whose description looks relevant.

Rules:
- Err on the side of pulling one extra rather than missing one. Skills are cheap; a generic output is expensive.
- You can call useSkill multiple times in the same message — they fan out in parallel.
- Deep-link into sub-files when you're focused on a narrow concern (e.g. pull "emil-design-engineering/forms-controls" for a sign-in screen instead of the whole emil skill).
- Once a skill body is loaded, EXCERPT the relevant parts into your \`delegateScreen\` brief's \`sharedContext\` so the screen sub-agent (which doesn't have skills of its own) sees the guidance too. You are the conduit.
- On review-heavy turns, \`reviewScreen\` sub-agents benefit from skill excerpts too — pass them relevant slices in the implicit system prompt via your fix instructions (reviewers auto-load the emil principles, but custom skills you've pulled should be referenced in the issue list if applicable).
- Skills and the always-on emil-design-engineering CORE RULES are complementary: CORE_RULES is the floor every screen must respect; skills are the opt-in ceilings for specific patterns.

**How to work across a turn — parallel is the default:**

**THE RULE: if two tool calls don't genuinely depend on each other, emit them in the SAME assistant message.** This is true for every tool — delegateScreen, reviewScreen, updateScreen, searchCodebase, webSearch, defineDataEntity. The client runs them concurrently. Serial execution is the EXCEPTION, not the norm. Be optimistic: if you're not sure whether two things are independent, default to parallel. You can always fire a corrective update later if something clashes — and that corrective update should itself be parallel with any other independent work you're doing.

Precise definition of a "real" dependency (these are the ONLY cases you serialize):
- Call B's input literally contains data produced by call A. Example: call B is \`updateScreen({id: X, code: ...})\` and the code references a component/service/route that call A just created.
- Call B's brief references "the result of A". If A hasn't landed yet, B has nothing to reference — wait for it.
- "Add a link to Screen X from Screen Y" when Screen X doesn't exist yet: the link would resolve to a dead route.

If a dependency is NOT in that list, the two calls are independent — emit them together.

For a multi-screen request, the canonical flow is:

1. \`planTasks\` — write the visible checklist.
2. **Single assistant message** with (a) \`defineDataEntity\` if the app has shared domain data, (b) \`webSearch\` / \`searchCodebase\` if you need facts first, (c) \`createComponent\` for every UI primitive the batch will share (buttons, cards, list rows, top bars, tab bars, chips, empty states), and (d) all independent \`delegateScreen\` calls for the initial screen batch. Everything runs concurrently — seed sub-agent, search sub-agents, component sub-agents, screen sub-agents all in flight at once.

   **Think in systems, not screens.** Before delegating, scan the plan: what will the screens share? A bottom tab bar that appears on Home + Discover + Profile → that's a \`<BottomTabBar>\` component, not 3 duplicated markup blocks. A recipe card row that appears on Home and Favorites → \`<RecipeCard>\`. If you catch yourself about to describe the SAME markup in two delegateScreen briefs, STOP and extract it as a component first. Then reference it in each brief: "import RecipeCard from './components/RecipeCard'; use it for every row." This is what makes the output feel like a designed system instead of six copy-pasted screens.
3. **When they all return, a single assistant message** with (a) \`reviewScreen\` for every screen that was built, and (b) any independent \`delegateScreen\` calls for screens that depend on the first batch (if any). Reviews + next-wave delegates in the same message. Don't wait for the reviews to come back before starting the next wave of independent work — they truly are independent.
4. **Review phase — parallel top to bottom:**
   - Single assistant message: fire \`reviewScreen({id})\` for every screen that was just built. All in parallel. Each returns JSON \`{summary, issues: [{severity, category, location, problem, fix}]}\`.
   - Single assistant message: fire \`updateScreen({id, code})\` calls — one per screen that has issues — in parallel. Each updateScreen applies ALL of that screen's fixes at once (don't do one updateScreen per issue — one per screen, batched fixes). Zero-issue screens get no updateScreen.
   - Don't re-review after the fixes unless the user asks. One review cycle is the default; trust the fixes.

   The review catches: compile failures (ok:false), cross-screen inconsistencies (tab bar / card / typography drift), broken nav wiring (list→detail missing querystring params, detail screens missing useParams), and data-flow bugs (clicking row A shows row B).
5. Briefly narrate what you built ("Built Home + Detail + Favorites in parallel. Review flagged 3 fixes across all three; applied in parallel.") in one or two sentences.
6. Truly dependent work (e.g. "add a link on Home that points to a screen that had to exist first") comes in a later batch. But check your assumptions: most of what FEELS sequential actually isn't.

**Think between tool calls, not all upfront.** Interleaved thinking is on — use it to REACT to what the last batch returned, not to plan three batches ahead. Per the Cadence section: short bursts per step, bounded to ~600–900 tokens, and anything worth making visible goes in a \`think\` call. But do NOT artificially serialize work that's genuinely independent: parallel is how 6 screens take 6 seconds instead of a minute. When in doubt, parallel.

**If a screen fails to compile** (delegateScreen returns ok:false), fix it with updateScreen. Don't re-delegate — you already have the context. That fix can be emitted in parallel with any other independent work.

Do not narrate every micro-decision; just act. Keep prose minimal. Do not paste code into chat — the user sees it on the canvas and in the inspector.

Voice:
- Concise. Tell the user what you built, not why. Example: "Built the Home screen with a hero, 3 feature cards, and a CTA." Not multi-paragraph reasoning.
- When generating code, don't narrate the code; the user can see it in the inspector.
- Don't mention internal retries to the user. They're an implementation detail.
- When you've done a review-pause between screens, a single short line like "Home landed cleanly; applying the same card pattern to Recipes Detail" is plenty. Don't list your internal reasoning — you have a separate thinking channel for that.

---
${CORE_RULES}

---
${REVIEW_CHECKLIST}`;

export async function POST(req: Request) {
  const {
    messages,
    canvasContext,
    thinking: rawThinking,
    disabledSkills,
    projectNotes,
    cadenceReminder,
    projectDoc,
    designDoc,
    tokens,
    componentTokens,
    iconStyle,
  }: {
    messages: UIMessage[];
    canvasContext?: string;
    // modelId is accepted for forward-compat but ignored — we're locked on
    // Kimi K2.6 across the entire pipeline.
    modelId?: string;
    thinking?: boolean;
    /** Slugs the user has toggled off in the Skills tab. Filtered from the
     *  skill index and the sub-agent picker. */
    disabledSkills?: string[];
    /** Pre-built notes index sent by the client — orchestrator's own
     *  durable scratchpad, built from the ProjectNotesStore on localStorage. */
    projectNotes?: string;
    /** One-shot cadence nudge injected when the client-side cadence watchdog
     *  detected the previous turn spent >90s in hidden reasoning. Null on
     *  every non-offending turn so the system prompt stays clean. */
    cadenceReminder?: string | null;
    /** Current project.md markdown — the user-authored WHAT layer the
     *  orchestrator is gated on. When empty, the framing builder swaps in
     *  a GATE block that forbids build tools until writeProjectDoc lands. */
    projectDoc?: string;
    /** Current design.md markdown — the taste profile seeded from the
     *  embedded skills and evolved with the user. Always-on, never gated. */
    designDoc?: string;
    /** Live design-token snapshot — names + values for every CSS variable
     *  the design brief and stack guidelines reference. Injected as a
     *  "Current values" block in the framing so the agent sees what
     *  `var(--space-safe-top)` etc. resolves to right now. */
    tokens?: import("@/lib/agent-framing").TokensSnapshot;
    /** Per-component style contract (`button-primary.backgroundColor`
     *  etc.). Feeds the `components:` section of the DESIGN.md YAML
     *  front matter so the agent reads one unified design file. */
    componentTokens?: import(
      "@/lib/design-component-tokens-store"
    ).ComponentTokens;
    /** Icon-style defaults from the Icons panel. Feeds a tiny block into
     *  the framing so the agent knows which variant / size / color to
     *  reach for without a round-trip. */
    iconStyle?: import("@/lib/agent-framing").IconStyleSnapshot;
  } = await req.json();
  const disabledSet = new Set(disabledSkills ?? []);

  // The client sends a fresh `canvasContext` each turn describing the current
  // selection and inventory of screens. We append it to the system prompt
  // for just this turn so the agent knows which screen "this" refers to.
  // We also pull the current skill index (cached per-process) so the
  // orchestrator can see which skills exist and call useSkill on the
  // relevant ones proactively.
  const skillIndex = await buildSkillIndexBlock(disabledSet);
  // The framing block goes FIRST so the orchestrator reads the gate /
  // project brief before the long system prompt. When the brief is empty,
  // the gate block forbids build tools until writeProjectDoc lands.
  const framing = buildAgentFraming({
    projectDoc,
    designDoc,
    tokens,
    componentTokens,
    iconStyle,
    includeGate: true,
  });
  const systemForTurn = [
    framing,
    SYSTEM_PROMPT,
    skillIndex
      ? "---\nSkills (pull these in with useSkill when building anything non-trivial — see the Skills guidance in the rules above):\n" +
        skillIndex
      : "",
    projectNotes
      ? "---\nYour project notes (persistent scratchpad — call readNote({id}) for full bodies, writeNote({title, category, body}) to add or update):\n" +
        projectNotes
      : "",
    canvasContext
      ? "---\nCurrent canvas state (updated every turn):\n" + canvasContext
      : "",
    cadenceReminder
      ? `---\n<system-reminder>\n${cadenceReminder}\n</system-reminder>`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Thinking defaults ON for the orchestrator — Kimi K2.6 uses thinking for
  // planning + interleaved tool reasoning. Respect an explicit `false` from
  // the composer's Think toggle so the user can turn it off mid-session.
  const thinkingEnabled = rawThinking !== false;

  const result = streamText({
    model: kimi({ thinking: thinkingEnabled }),
    system: systemForTurn,
    messages: await convertToModelMessages(messages),
    // Upper bound, not a target — the loop exits as soon as the orchestrator
    // stops emitting tool calls. We keep this generous (100) so a big app
    // (1 plan + 1 data + ~12 delegates + ~12 reviews + ~12 fixes + search
    // overhead) has plenty of headroom. The cap exists only as a safety net
    // against pathological loops (e.g. fix→fail→fix→fail).
    stopWhen: stepCountIs(100),
    tools: {
      planTasks: tool({
        description:
          "Write a visible plan as a checklist of tasks. Call this FIRST whenever a request involves multiple screens or more than a couple of sequential steps. Skip for trivial one-shot edits.",
        inputSchema: z.object({
          title: z
            .string()
            .describe(
              'Short title for the plan, e.g. "Recipe app — home, detail, profile".',
            ),
          tasks: z
            .array(
              z.object({
                id: z
                  .string()
                  .describe(
                    'Short slug, unique within this plan, e.g. "home" or "checkout-v2".',
                  ),
                description: z
                  .string()
                  .describe(
                    'Human-readable task line, e.g. "Create the Home screen with a hero + 3 feature cards."',
                  ),
                parallelizable: z
                  .boolean()
                  .describe(
                    "True when this task can run concurrently with other parallelizable tasks. False when another task must finish first.",
                  ),
                hint: z
                  .string()
                  .optional()
                  .describe(
                    'Optional one-line hint, e.g. "iPhone 17" or "uses <Button />".',
                  ),
              }),
            )
            .describe("Ordered list of tasks for this turn."),
        }),
      }),
      think: tool({
        description:
          "Show ONE discrete unit of reasoning as a small labeled chip in chat. Use INSTEAD of long hidden monologue when a design tradeoff or architectural decision is worth making visible — 'why I'm choosing a sheet over a new screen here', 'picking rowCount=18 because the feed needs to feel populated', 'review prioritized tab-bar drift because it affects 4 screens'. Keep `thought` to 1–3 sentences; be specific; skip hedging; this IS user-facing. Prefer `think` to long hidden reasoning for anything the user benefits from seeing. Do NOT use as a substitute for acting: if a tool call (searchCodebase, readNote, planTasks, reviewScreen, delegateScreen) would answer the question, emit the tool call instead.",
        inputSchema: z.object({
          topic: z
            .string()
            .describe(
              "2–6 word header shown as the chip title. e.g. 'Why sheet not screen', 'Data shape choice', 'Review fix priority'.",
            ),
          thought: z
            .string()
            .describe(
              "1–3 sentence plain-English explanation shown when the chip is expanded. Specific, no hedging. USER-FACING.",
            ),
        }),
        execute: async ({ topic, thought }) => ({ ok: true, topic, thought }),
      }),
      createScreen: tool({
        description:
          "Create a new SCREEN (artboard) on the canvas with a live React component rendering inside. Use this for any UI design — pages, views, screens, components.",
        inputSchema: z.object({
          name: z
            .string()
            .describe(
              'Short human-readable name for the screen (e.g. "Home", "Login", "Profile").',
            ),
          viewportId: z
            .enum(VIEWPORT_IDS)
            .describe(
              "Device viewport. Use iphone-17-pro for mobile (default), iphone-17 for smaller iPhone, iphone-17-pro-max for larger, ipad for tablet, desktop-1536 for web.",
            ),
          code: z
            .string()
            .describe(
              "Full React component source for /App.js. Must be a default export. Use inline styles only. No Tailwind. No external imports beyond react/react-dom.",
            ),
          statusBarStyle: z
            .enum(["light", "dark"])
            .optional()
            .describe(
              'Device status-bar ink color. "dark" (default) for light-background screens; "light" for dark screens, hero images, or photo overlays. Only affects mobile viewports.',
            ),
        }),
      }),
      updateScreen: tool({
        description:
          "Update an existing screen's code, name, viewport, or statusBarStyle. REWRITES the full code — prefer `editScreen` for incremental code changes. Use updateScreen for a full rewrite, rename, viewport change, or a statusBarStyle flip.",
        inputSchema: z.object({
          id: z
            .string()
            .optional()
            .describe(
              "Shape id of the screen to update. If omitted, the currently selected screen is used.",
            ),
          name: z.string().optional(),
          viewportId: z.enum(VIEWPORT_IDS).optional(),
          code: z
            .string()
            .optional()
            .describe(
              "Full new React component source for /App.js. Replaces the existing code entirely.",
            ),
          statusBarStyle: z
            .enum(["light", "dark"])
            .optional()
            .describe(
              "Flip the device status-bar ink color without rewriting the screen's code.",
            ),
        }),
      }),
      editScreen: tool({
        description:
          "PREFERRED tool for incremental changes to an existing screen. Applies surgical old_string → new_string patches to the screen's code — same mechanic as Claude Code / Cursor. Much faster, cheaper, and less error-prone than rewriting the whole screen via updateScreen. Fire this for: bug fixes on one line, renaming one variable, tweaking one style value, adding one import, adjusting one component's props. The patch requires an exact substring match — include enough surrounding context in `oldString` to make it unique. Multiple edits can be batched in one call; they apply sequentially. If any edit fails (oldString not found or ambiguous), ALL edits in that call are reverted.",
        inputSchema: z.object({
          id: z
            .string()
            .describe(
              "Shape id of the screen to edit. Always pass explicitly; don't rely on selection.",
            ),
          edits: z
            .array(
              z.object({
                oldString: z
                  .string()
                  .describe(
                    "Exact substring to find (include surrounding context to make it unique).",
                  ),
                newString: z
                  .string()
                  .describe("Replacement. Must differ from oldString."),
                replaceAll: z
                  .boolean()
                  .optional()
                  .describe(
                    "Replace every occurrence of oldString. Default false — expects exactly one match and errors otherwise.",
                  ),
              }),
            )
            .min(1)
            .describe(
              "One or more patches. Applied in order. If ANY fails, ALL are rolled back and the tool returns ok:false with which edit failed.",
            ),
        }),
      }),
      delegateScreen: tool({
        description:
          "Spawn a focused sub-agent to build ONE screen. The sub-agent streams React code directly into a new screen on the canvas — you do NOT need to follow up with createScreen afterwards. This is the PRIMARY way to build screens when you have multiple to build: emit many delegateScreen tool calls IN A SINGLE ASSISTANT MESSAGE so the client runs them all in parallel. Each sub-agent has its own narrow context (just the brief + shared context you pass), so per-screen reasoning is tighter and per-screen latency is independent.",
        inputSchema: z.object({
          name: z.string().describe("Screen name, e.g. 'Recipe Detail'."),
          viewportId: z
            .enum(VIEWPORT_IDS)
            .describe("Device viewport for the screen."),
          brief: z
            .string()
            .describe(
              "Self-contained description: layout, content, interactions, what the user sees and does. 3-10 sentences. The sub-agent sees only this — be specific.",
            ),
          sharedContext: z
            .string()
            .optional()
            .describe(
              "Optional extra context: tokens, components, services, data entities, route paths this screen should use. Copy the relevant excerpts from the canvas state.",
            ),
          statusBarStyle: z
            .enum(["light", "dark"])
            .optional()
            .describe(
              'Device status-bar ink color. "dark" (default) for light screens, "light" for dark screens / hero images. Set at delegate time so the chrome is right from first paint.',
            ),
          parentScreenId: z
            .string()
            .optional()
            .describe(
              "When this screen is a sheet/modal view of another screen, pass the parent's shape id here. Use `createSheetView` instead if you know it's a nested view from the start.",
            ),
        }),
        // NO execute — this runs on the client so it can (a) create the
        // screen shape synchronously for an immediate placeholder, and (b)
        // stream the sub-agent's code into that shape live. Multiple calls
        // in one assistant message fan out to multiple parallel fetches,
        // which is what makes the whole flow feel fast.
      }),
      createSheetView: tool({
        description:
          "Create a NESTED view — a sheet, modal, overlay, dropdown, or any 'state' of an existing screen that isn't a separate top-level destination. This is what you use for the 'filter sheet on Discover', the 'confirm-delete dialog on Profile', the 'add-item modal on Home'. The result appears on the canvas VISUALLY CONNECTED to its parent (offset + connector line), NOT as a new top-level screen. Before you call this, identify the parent screen's id from the canvas state. Use this instead of createScreen/delegateScreen whenever the view is: a modal, a sheet, a dropdown, a confirmation, an overlay, or a state variant of another screen. When in doubt: if the user would return to the same parent after dismissing, it's a sheet — use this tool.",
        inputSchema: z.object({
          parentScreenId: z
            .string()
            .describe(
              "Shape id of the parent screen (the screen this sheet/modal appears over). Find it in the canvas-state list.",
            ),
          name: z
            .string()
            .describe(
              'Sheet name, e.g. "Filters" or "Confirm Delete". Will show in the pill as "Parent ▸ Filters (sheet)".',
            ),
          viewportId: z
            .enum(VIEWPORT_IDS)
            .describe(
              "Usually matches the parent's viewport so the sheet looks real at the same device size.",
            ),
          brief: z
            .string()
            .describe(
              "Self-contained description of the sheet's content, layout, and dismissal. Same rich-brief format as delegateScreen. Remember: sheets typically have a grabber, a backdrop-dim, and a dismiss affordance.",
            ),
          sharedContext: z
            .string()
            .optional()
            .describe(
              "Tokens, components, services, data entities the sheet should use. Copy excerpts from the canvas state.",
            ),
          statusBarStyle: z
            .enum(["light", "dark"])
            .optional()
            .describe(
              'Status-bar ink color for the sheet itself (when it covers the full viewport). Typically matches the parent; "dark" default.',
            ),
        }),
        // NO execute — client-side so it can create the shape adjacent to
        // the parent, run a delegate sub-agent, and keep the parent-child
        // relationship visible on the canvas.
      }),
      createService: tool({
        description:
          "Create a shared logic module at /services/{name}.js — for cross-screen state (game state, session, theme), side effects (analytics, toast queue), or reusable helpers (puzzle generators, formatters). Every Sandpack picks it up; screens import via `import { fn } from './services/{name}'`. CALL THIS when two or more screens need to share state or behavior — don't force each screen to re-own the logic. Parallel-safe, idempotent by name (camelCase lowercase first letter). Examples: gameState, puzzleGenerator, scoreTracker, themeToggle.",
        inputSchema: z.object({
          name: z
            .string()
            .describe(
              'camelCase service name used as the filename + import path. e.g. "gameState", "puzzleGenerator", "session".',
            ),
          description: z
            .string()
            .describe(
              "One-line description shown in canvas context each turn so future turns know what this service exposes and when to reach for it.",
            ),
          code: z
            .string()
            .describe(
              "Full service source. Can export named functions, a React hook, a context provider, or a plain state container. No external packages beyond react. Example: `export function useGameState() { ... }`.",
            ),
        }),
      }),
      createComponent: tool({
        description:
          "Extract a shared UI primitive (Button, Card, ListRow, TabBar, EmptyState, etc.) into the project's component library at /components/{Name}.js. Every Sandpack picks it up automatically — all screens can then `import Name from './components/Name'`. CALL THIS BEFORE firing delegateScreen calls that will share a pattern, so sub-agents can compose instead of re-inlining. Idempotent by `name` (PascalCase); calling again with the same name updates the component in place. Multiple createComponent calls can run IN PARALLEL with each other and with delegateScreen calls — the component files are available as soon as each fetch resolves.",
        inputSchema: z.object({
          name: z
            .string()
            .describe(
              'PascalCase component name — must match the import: `import ${name} from "./components/${name}"`. e.g. "Button", "RecipeCard", "BottomTabBar".',
            ),
          description: z
            .string()
            .describe(
              "One-line description shown in the canvas context each turn so future turns and sub-agents know what the component is for and when to reach for it.",
            ),
          code: z
            .string()
            .describe(
              'Full component source (default-exported React function). Must use inline styles and design tokens via var(--color-*), var(--space-*), etc. — no external packages beyond react. Props should be documented in a JSDoc block. Example: `export default function Button({children, variant="primary", ...}) { ... }`.',
            ),
        }),
      }),
      defineDataEntity: tool({
        description:
          "Define a shared data entity's SCHEMA (Recipe, User, Transaction, etc.). Returns immediately; a background sub-agent fills realistic seed rows asynchronously — you do NOT pass seeds and do NOT wait for them. Entity becomes available at /data/{name}.js in every screen's Sandpack right away with empty seeds; rows stream in over the next few seconds. Call this BEFORE screens that share data. Idempotent by `name`.",
        inputSchema: z.object({
          name: z
            .string()
            .describe(
              'camelCase plural, used as the filename and the export name. e.g. "recipes", "users", "transactions".',
            ),
          singular: z
            .string()
            .describe(
              'PascalCase singular, used in helper names. e.g. "Recipe" → findRecipe(id), listRecipes(). Usually the capitalized singular form of `name`.',
            ),
          description: z
            .string()
            .describe(
              "One-line description of what this entity represents. Shown to the agent in future turns.",
            ),
          fields: z
            .array(
              z.object({
                name: z
                  .string()
                  .describe("camelCase field name, e.g. 'title', 'cookTimeMinutes'"),
                type: z
                  .enum(["string", "number", "boolean", "image", "date"])
                  .describe("Field type. 'image' is a string URL."),
                description: z
                  .string()
                  .optional()
                  .describe(
                    "Optional: what this field represents (helps the seed sub-agent generate realistic values).",
                  ),
              }),
            )
            .describe("Schema for each row. Always include an 'id' field of type string."),
          rowCount: z
            .number()
            .int()
            .min(3)
            .max(30)
            .describe(
              "How many realistic seed rows the background sub-agent should generate (typical: 6–12).",
            ),
        }),
      }),
      askClarifyingQuestions: tool({
        description:
          "Before building, ask the user 3–5 multiple-choice questions to nail down specifics you'd otherwise guess at. Use this when a prompt is non-trivially underspecified — e.g. 'Build a recipe app' gives you no sense of vibe, target user, must-have features, or design direction. Do NOT use this for simple one-shot edits, or when the user has already given rich context. The chat renders the questions ONE AT A TIME (X of Y progress); an 'Other…' freeform option is always present. When the user completes the last question, their picks come back as the tool output and you continue building with real clarity. Fire this BEFORE planTasks when you would otherwise fabricate details. At most ONE call per turn.",
        inputSchema: z.object({
          title: z
            .string()
            .describe(
              "Short header shown above the questions. e.g. 'Before I build, a few quick picks:'",
            ),
          questions: z
            .array(
              z.object({
                id: z
                  .string()
                  .describe("Short slug, unique within the set. e.g. 'vibe', 'audience'."),
                question: z
                  .string()
                  .describe("The question text. Plain English, specific."),
                options: z
                  .array(z.string())
                  .min(2)
                  .max(5)
                  .describe(
                    "2–5 concrete answer options. Every question automatically gets an 'Other…' option appended that opens a freeform text input — do NOT include 'Other' in this list.",
                  ),
              }),
            )
            .min(1)
            .max(6)
            .describe("3–5 questions is the sweet spot. Never more than 6."),
        }),
      }),
      suggestReplies: tool({
        description:
          "When your response ends with a question (or questions) for the user, emit 2–5 one-tap reply suggestions they can click to answer instantly. Examples for \"Should the Difficulty picker be a modal or its own screen?\": ['go with modal', 'screen with transitions', 'you pick — ship it']. Write short, direct, concrete replies — under 10 words each. ALWAYS include at least one 'go-ahead' style reply like 'looks good — ship it' or 'you decide — go'. The user can still type their own; these are speed accelerators, not required. Call this as the LAST tool in a turn that ends with a question. Don't use it when you're not asking for a decision.",
        inputSchema: z.object({
          replies: z
            .array(
              z
                .string()
                .describe(
                  "Short tap-to-send text, under 10 words. Should read as something a person would actually say.",
                ),
            )
            .min(2)
            .max(5),
        }),
      }),
      writeDesignDoc: tool({
        description:
          "Write or update the design brief (design.md) — the taste profile applied to every screen. The default doc ships seeded from the embedded skill library (emil-design-engineering, benji-consumer-craft, make-interfaces-feel-better, react-native-mastery); call this when the user has described taste preferences that should survive across turns (e.g. 'I prefer flat terracotta over iOS blue', 'pill buttons not rounded rectangles', 'no glassmorphism ever'). Idempotent: each call REPLACES the markdown entirely — preserve sections you're not changing. Prefer edits to the existing doc over wholesale rewrites so the seeded taste foundation stays intact.",
        inputSchema: z.object({
          markdown: z
            .string()
            .describe(
              "Full design.md content. Replaces any existing brief. Keep the section structure: Visual theme & atmosphere, Color, Typography, Layout & spacing, Surfaces, Motion, Interaction, Component patterns, Mobile defaults, Do's/Don'ts.",
            ),
        }),
        // No execute — client-side handler writes to designDocStore.
      }),
      writeProjectDoc: tool({
        description:
          "Write or update the project brief (project.md). This is the user-authored WHAT layer — a short markdown doc describing the product being built: what, who, features, vibe, platforms, data, scope. **The orchestrator is GATED on this** — until the brief has meaningful content (~100 chars of real text), you may NOT call any build tools (delegateScreen, createScreen, createSheetView, updateScreen, editScreen, createComponent, createService, defineDataEntity, reviewScreen, createShape). When the brief is empty, your first job every session is to collect enough context (via askClarifyingQuestions or direct from the user's message) and synthesize a brief into this tool. Idempotent: each call REPLACES the entire markdown — include all sections every time. Good brief length: 150-400 words. Use markdown headings (## What is this?, ## Who is this for?, etc).",
        inputSchema: z.object({
          markdown: z
            .string()
            .describe(
              "Full project.md content. Replaces any existing brief. Include sections: What is this?, Who is this for?, Core features (V1), Vibe & tone, Platforms, Out of scope, Data model (as applicable).",
            ),
        }),
        // No execute — client writes to projectDocStore and returns ok. The
        // write flips the gate off so the orchestrator can start building
        // on the next step without waiting for a separate confirmation.
      }),
      writeNote: tool({
        description:
          "Save a DURABLE note that survives across turns. This is your persistent scratchpad — use it for architecture decisions, planning outlines, cross-cutting patterns, and learnings from reviews. Notes are visible to you (index injected into every turn's system prompt) and to the user (in the Notes panel). Idempotent by title+category: calling with an existing {title, category} updates in place. USE THIS liberally — it's cheaper than re-deriving things in every turn. Good candidates: 'Architecture: stack navigation, no tabs', 'Puzzle generation algorithm', 'Cross-screen pattern: bottom CTA 48px above home indicator', 'Learning: statusBarStyle needs to be set before first paint'.",
        inputSchema: z.object({
          title: z
            .string()
            .describe(
              "Short title (5-10 words). Re-using an existing title in the same category UPDATES the note.",
            ),
          category: z
            .enum(["decision", "plan", "pattern", "learning"])
            .describe(
              "decision = architectural choice committed to. plan = step-by-step or outline. pattern = reusable UI/code convention. learning = something discovered that should inform future work.",
            ),
          body: z
            .string()
            .describe(
              "Markdown body. Be specific and scannable. Good length: 3-20 lines. Don't dump entire code here — reference components/services by name.",
            ),
        }),
      }),
      readNote: tool({
        description:
          "Fetch the full body of a note by id. The note index (with ids + title previews) is at the bottom of your system prompt. Use this to recall a specific decision or plan body without having to re-derive it.",
        inputSchema: z.object({
          id: z
            .string()
            .describe("Note id from the index — format n_xxxxxx."),
        }),
      }),
      useSkill: tool({
        description:
          "Load the full body of a named skill into context so you can follow its guidance AND excerpt it into sub-agent briefs. Skills are curated reusable instruction bundles — far richer than the inline rules you already know. Fire multiple useSkill calls IN PARALLEL in your first assistant message when several skills apply. The skill index is listed at the top of your system prompt; the `slug` you pass here MUST match one listed there (including deep-link sub-file slugs like 'emil-design-engineering/forms-controls').",
        inputSchema: z.object({
          slug: z
            .string()
            .describe(
              "Skill slug from the index. Examples: 'emil-design-engineering', 'make-interface-feel-better', 'emil-design-engineering/animations'.",
            ),
        }),
        execute: async ({ slug }) => {
          const loaded = await loadSkill(slug);
          if (!loaded) {
            return {
              ok: false,
              slug,
              error:
                "Skill not found. Check the skill index at the top of your system prompt — the slug must match exactly.",
            };
          }
          return {
            ok: true,
            slug: loaded.slug,
            name: loaded.name,
            body: loaded.body,
          };
        },
      }),
      reviewScreen: tool({
        description:
          "Ask a dedicated reviewer sub-agent to critique ONE screen and return a JSON list of specific, surgical issues. Use this during the review phase after a parallel batch of delegateScreens lands — fire multiple reviewScreen calls in parallel, one per screen, then turn each returned issue into an updateScreen call (also in parallel if they target different screens). This is cheaper and more rigorous than re-reading every screen's full source in your own context.",
        inputSchema: z.object({
          id: z
            .string()
            .describe("Shape id of the screen to review (from canvas state)."),
        }),
        // Client-side executed: it has the screen source. The client calls
        // /api/review-screen then returns the structured result.
      }),
      webSearch: tool({
        description:
          "Search the public web for information (names, facts, references, current events, realistic content for seed data, product names, iconography conventions, etc). Use BEFORE building screens when the user asks for content you don't reliably know (e.g. 'show top NBA scorers', 'list 10 mainstream mortgage providers'). Returns a concise summary + 3–5 source links. Internally runs a Kimi sub-call with thinking disabled (required for the built-in $web_search tool), sandboxed so the orchestrator's thinking is unaffected.",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "Web search query in natural language. e.g. 'top 10 best-selling cars in the US 2025', 'popular recipe categories and cuisines'.",
            ),
        }),
        execute: async ({ query }) => {
          try {
            const result = await runKimiWebSearch(query);
            return { ok: true, query, ...result };
          } catch (err) {
            return {
              ok: false,
              query,
              error: String(err),
              hint: "Web search failed. Proceed without live data, or try a simpler query.",
            };
          }
        },
      }),
      searchCodebase: tool({
        description:
          "Search the current in-canvas project for a string. Scans screen code, components, services, data entities, tokens, and the route table. Useful when you need to know what's currently on a screen, which screens import a particular component or service, what a route path is, or what's in a data entity. Returns the top matches with short excerpts. Use this BEFORE updateScreen/delegateScreen when you're unsure about the current state.",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "Substring or keyword to search for (case-insensitive). e.g. 'Button', 'recipes', 'useSession', '/profile'.",
            ),
          scope: z
            .enum([
              "all",
              "screens",
              "components",
              "services",
              "data",
              "routes",
              "tokens",
            ])
            .optional()
            .describe(
              "Restrict to a specific surface. Defaults to 'all'. Use 'screens' when asking about current UI, 'data' for entity content, 'routes' for nav targets.",
            ),
        }),
      }),
      searchIcons: tool({
        description:
          "Search the Central Icons library (1970 icons) by keyword. Call this BEFORE writing `<Icon name=\"...\">` — guessing names (`IconSettings` vs `IconSetting` vs `IconCog`) will render null + print a console warning. Pass natural-language keywords (\"home\", \"chart statistics\", \"lock security\"). Returns up to 24 matches ranked by relevance: { name: 'IconHome', aliases: 'home, house', category: 'Interface General' }. Use the `name` verbatim inside `<Icon name=\"IconHome\" />` — import from './centralIcons' (NEVER from @central-icons-react/...). Fire in parallel if you need icons for multiple concepts in one screen.",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "Keywords describing the icon's meaning. Can be multiple words — all must match (AND semantics). e.g. 'home', 'chart bar', 'lock security', 'arrow right'. Don't include 'Icon' prefix.",
            ),
          limit: z
            .number()
            .int()
            .min(1)
            .max(48)
            .optional()
            .describe(
              "Max hits to return. Default 12 — enough to pick from without flooding context.",
            ),
        }),
        execute: async ({ query, limit }) => {
          const hits = runIconSearch(query, limit ?? 12);
          if (hits.length === 0) {
            return {
              ok: false,
              query,
              hits: [],
              hint: "No icons match. Try shorter/simpler keywords ('chart' instead of 'bar graph analytics') or a different category.",
            };
          }
          return {
            ok: true,
            query,
            hits: hits.map((h) => ({
              name: h.name,
              aliases: h.aliases,
              category: h.category,
            })),
          };
        },
      }),
      createShape: tool({
        description:
          "SECONDARY: create a sketch-shape (rectangle / ellipse / text) on the canvas for annotations or wireframes that sit NEXT TO screens. Don't use this to build app UI — use createScreen for that.",
        inputSchema: z.object({
          type: z.enum(["rectangle", "ellipse", "text"]),
          x: z.number(),
          y: z.number(),
          width: z.number().optional(),
          height: z.number().optional(),
          text: z.string().optional(),
          color: z
            .enum([
              "black",
              "grey",
              "red",
              "light-red",
              "orange",
              "yellow",
              "green",
              "light-green",
              "blue",
              "light-blue",
              "violet",
              "light-violet",
            ])
            .optional(),
        }),
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    // Pass per-step and final usage through UI message metadata so the
    // client-side tokenUsageStore can accumulate real counts across the
    // entire conversation (orchestrator + all sub-agents combined).
    messageMetadata: ({ part }: { part: { type: string } & Record<string, unknown> }) => {
      if (part.type === "finish-step") {
        const usage = part.usage as Record<string, number> | undefined;
        if (usage) return { ocStepUsage: usage };
      }
      if (part.type === "finish") {
        const total = part.totalUsage as Record<string, number> | undefined;
        if (total) return { ocTotalUsage: total };
      }
      return undefined;
    },
  });
}
