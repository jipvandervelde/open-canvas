# Open Canvas

A merger of Figma and Claude Code into a single multiplayer canvas where designers and engineers collaborate on a **real product** — not a mockup, not an export. Output is a deployed web app (Vercel/Cloudflare) and/or mobile app (TestFlight/Play via EAS), with a real GitHub repo and real React/RN code.

---

## Vision

Today, designing and shipping requires moving between Figma (design) and Claude Code/Cursor (implementation). Handoff is lossy, two sources of truth. Open Canvas collapses both into one tool.

**Test for any feature:** does it produce something deployable, or just a prettier mockup?

**Targets:** web AND mobile (React Native / Expo) are first-class — not "web first, mobile later." Universal mode uses Expo Router.

---

## Persona

**Primary user:** Jip — design-prompter.

- 10+ years Figma fluency (auto-layout, vectors, frames, groups, components, variants, constraints — all muscle memory).
- 3 years coding with AI (Claude Code, Cursor) — fluent at prompting and directing an LLM to build.
- Not a hand-coding frontend developer; designs from a designer-first perspective.
- Builds real products with technical collaborators (backend/infra engineers who own APIs). AI fills the frontend gap neither writes by hand.

**Collaboration archetype:** designer-prompter + technical-but-not-frontend collaborator.

When framing recommendations: design lens first, then code. "Maps to auto-layout / components / variants" lands better than framework jargon.

---

## Operating principles

Set in session 6 (2026-04-19). These are ground rules for every decision:

1. **Built for one, opened to many.** Decisions optimize for Jip's use case first. Buildable so others *can* eventually use it, but no decision waits on hypothetical-user research.
2. **No feasibility constraint, only sequencing.** Anything in the brainstorm can be built. Question is never "can we?" — only "in what order?" Reframe risk as phasing.
3. **Competitors are inspiration, not constraints.** Study UX patterns, steal good ideas. Don't position against, don't copy roadmaps. Anchor in "what serves Jip's persona dyad better."
4. **The design brain is the soul.** `design.md` is a living model of the user's taste, not a static reference. See "Design brain" below.

---

## Current stage

**BUILD MODE** (since session 9, 2026-04-19). Sprint 0 (walking skeleton: Next.js + tldraw + Claude + agent loop on localhost) shipped. Sprint 1 shipped. Now iterating.

`BRAINSTORM.md` at the repo root is the architectural source of truth — append-only with dated changelog entries per session. Keep it updated as decisions land in code.

---

## Stack

- **Next.js 15** (App Router) — host application
- **tldraw SDK** — multiplayer canvas
- **Vercel AI SDK** — agent loop and streaming
- **Sandpack** — sandboxed iframe rendering of generated React (cross-origin from `codesandbox.io`)
- **Tailwind v4** + custom CSS in [globals.css](app/globals.css) — tool chrome
- **TypeScript** end to end

---

## Where things live

- [BRAINSTORM.md](BRAINSTORM.md) — architectural source of truth, 16 sections (vision, stack, canvas, AI, multiplayer, versioning, choreography, targets, publish, etc.)
- [README.md](README.md) — public-facing
- [app/](app/) — Next.js routes, API handlers, global styles
  - [app/globals.css](app/globals.css) — **all tool chrome design tokens** + component styles
  - [app/page.tsx](app/page.tsx) — canvas root
- [components/](components/) — UI surface (panels, canvas, inspector, theme toggle, etc.)
  - [OpenCanvas.tsx](components/OpenCanvas.tsx) — top-level shell
  - [Canvas.tsx](components/Canvas.tsx) — tldraw canvas
  - [ChatPanel.tsx](components/ChatPanel.tsx) / [PreviewPanel.tsx](components/PreviewPanel.tsx) — left/right panels
  - [ScreenShapeUtil.tsx](components/ScreenShapeUtil.tsx) — on-canvas screen shape
  - [Inspector.tsx](components/Inspector.tsx) — Dialkit-modeled inspector
- [lib/](lib/) — stores, agents, runtimes, registries
  - [lib/design-tokens-store.ts](lib/design-tokens-store.ts) — **project token defaults** (the brand of the apps being built)
  - [lib/screen-runtime.tsx](lib/screen-runtime.tsx) — Sandpack iframe orchestration
  - [lib/theme-store.ts](lib/theme-store.ts) — light/dark theme singleton
- Existing project workspaces (sample data): `benji-consumer-craft/`, `emil-design-engineering/`, `make-interfaces-feel-better/`, `react-native-mastery/`

---

## Design tokens — two layers

There are **two independent token layers** that are kept aligned by default:

### 1. Project tokens — the brand of the app being built

Source: [lib/design-tokens-store.ts](lib/design-tokens-store.ts). Emitted via `toCss()` into Sandpack iframes so generated React renders with the user's brand. Storage key versioned (`oc:design-tokens:vN`) — bump when schema changes to force fresh defaults.

Current defaults (v4):
- `bg.primary / secondary / tertiary` — light/dark
- `fg.primary / secondary / tertiary` — light/dark
- `brand` — `#009FFF`
- `brand.secondary` — `#772DFF` (decorative; added v4)
- `white`, `black`
- `state.success` — `#00C54C` (mode-invariant)
- `state.warning` — `#FF893A` (mode-invariant)
- `state.error` — `#FF4236` (mode-invariant)

### 2. Tool chrome tokens — Open Canvas's own UI

Source: [app/globals.css](app/globals.css) (`:root` + `[data-theme="dark"]` + `prefers-color-scheme: dark` blocks). Applied to the chat panel, preview panel, canvas background, on-canvas screen shells.

Token families:
- `--surface-0 / 1 / 2 / 3 / inverse`
- `--text-primary / secondary / tertiary / muted`
- `--accent-base / hover / subtle / on` (hover/subtle derived via `color-mix`)
- `--state-error / warn / success` (+ `--state-error-subtle` derived)
- `--border-subtle / strong / focus`
- `--chat-user-bg / composer-bg`

The two layers use the same value set so the tool's chrome reads as a natural extension of the brand the user is designing with.

### Theme propagation

- [lib/theme-store.ts](lib/theme-store.ts) singleton sets `data-theme` on `<html>`.
- Sandpack iframes (cross-origin) get theme via the `SANDPACK_INDEX_JS_FOR_THEME(theme)` boot script, which runs once at mount.
- **Theme flips require iframe remount** — `SandpackProvider` `key` includes `theme` (see [lib/screen-runtime.tsx](lib/screen-runtime.tsx)). Trade-off: brief flash; reliable propagation.

### Chrome recipe (unified)

Chat panel, preview panel, and on-canvas screens share the same card chrome:
- `border-radius: 20px` (panels) / `12px` (screens)
- `1px solid var(--border-subtle)`
- `box-shadow: 0 4px 12px rgba(0,0,0, 0.06 light / 0.22 dark)`
- Selected screen overlays a 2px `--accent-base` ring

---

## Design brain — the soul

Every Open Canvas project has a `design/` directory that is a **living model of the user's design taste** — a personal design intelligence that grows with every project. The agent reads it before every mutation and proposes updates after. Over time it operates "as if it's the user making decisions."

This is the deepest moat in the product. Without the brain, the AI is a generic React/RN code generator with vague aesthetic taste — same output for everyone. With the brain, the AI is *Jip's* AI.

### Captures conscious + subconscious
- **Conscious** = user explicitly declares (principles, tokens, components).
- **Subconscious** = patterns the agent observes the user repeating across mutations and proposes for codification.

Stores **why and how**, not just what. Decisions include chain-of-thought; patterns include rationale.

### Hierarchy — two tiers (decided session 7)
- **Org/team brain** — separate repo, shared across all projects in an org/team. Solo user = "org of one" (personal cross-project memory). Team = company design system.
- **Project brain** — single brain per project, shared multiplayer by all collaborators. Inherits from org brain; project overrides win on conflict.
- No "personal" tier inside a project, no separate brain per role.

### Structure (nested files, not monolith — agent loads slices per-task)

```
my-app/                          — project repo
  design/
    org-ref.json                 — optional: points to org-brain repo/path
    brain/                       — project-specific brain (overrides + new)
      principles.md, voice.md, aesthetic.md, influences.md
      decisions/                 — dated chain-of-thought
      patterns/                  — observed + named (conscious + AI-detected)
    systems/
      tokens/, components/
      hierarchy.md, animations.md, spacing.md, typography.md
    artifacts/<screen-or-flow>/  — per-screen records

org-brand-design-system/         — separate org-level repo
  brain/, systems/               — shared across all org projects
```

### How the agent loads it (token-budget-aware)
1. Always loaded: org principles + voice + aesthetic merged with project overrides.
2. Task-relevant slices: components/<name> + patterns/ for component work; hierarchy + spacing + typography for new screens; animations for motion work.
3. Project artifacts when in-context.

### Bootstrapping (light + continuous)
- Light start — user picks: import references, inherit from org brain, or start blank with default templates. No heavy upfront Q&A.
- Continuous learning — brain accumulates passively (agent observes mutations, proposes patterns) and actively (user writes directly into brain files anytime).
- Pattern promotion: project pattern → org pattern (user-initiated or AI-suggested when a pattern recurs).

### Properties
- **Versioned via the same commit DAG** as the canvas/code (BRAINSTORM.md §9). Forkable, time-travelable, diffable.
- **Mode-aware** — web vocabulary (hover, scroll-driven, cursor) vs mobile (gestures, haptics, safe areas) with shared roots and per-platform overrides.
- **Read/write at any time** — Brain panel in the UI is a markdown editor view of the brain file tree. Multiplayer-shared, versioned. Full mutation rights, not just inspector.

### How to evaluate features against the brain
When proposing a feature, ask: does this contribute to **building** the brain, **using** the brain, or is it **indifferent** to the brain? Indifferent features are suspect.

---

## Confirmed feature concepts (sessions 7–8)

- **Roles:** viewer / editor / owner. All roles see the same UI; differs only in mutation rights. No siloed sub-UIs by job title.
- **First-run flow:** "what are you building?" → mode pick (web / mobile / universal — Expo Router supports this) → empty canvas with starter screens scaffolded → chat sidebar primed.
- **Comments + notes** are first-class peer-to-design-tools. Pinnable, threaded, **assignable to humans OR AI** (agent picks them up as async tasks). In-progress / resolved status auto-updates as agent works.
- **Inspector** modeled on [Dialkit by Josh Puckett](https://github.com/joshpuckett/dialkit) — declarative config, auto-detected control types, sliders/toggles/color pickers/spring/easing editors, keyboard shortcuts on every control, popover or embedded modes.
- **Web terminal** (xterm.js + WebContainer) is first-class for ops work — Firebase/Supabase/Stripe CLIs accessed via chat (`/run …`) or direct typing. Faster than custom wrappers.
- **Hosting strategy + org brain physical form** = deferred to a dedicated brainstorm session.

---

## Conventions

- **Edit existing files over creating new ones.** Tokens, stores, and component patterns already exist — extend them.
- **Don't bypass tokens.** No hardcoded `#hex` in component files. If a color is missing from the token system, add it to the token system first.
- **Two-layer alignment.** When project tokens change, consider whether tool chrome tokens should track. They are kept aligned by default but are independently editable.
- **Theme-aware everything.** Any new surface that uses color must work in both light and dark. Use `color-mix(in oklab, ...)` for derived shades so they auto-flip.
- **Versioned localStorage.** When changing project token schema, bump `STORAGE_KEY` (`oc:design-tokens:vN`) so existing users get fresh defaults.
- **Sandpack remount on theme change.** `SandpackProvider` `key` must include `theme`.
- **Card chrome recipe is shared.** Panels and on-canvas screens use the same border + shadow values; if you change one, change both.

---

## What this doc is for

Quick orientation for any new agent or collaborator joining the project. Not a substitute for [BRAINSTORM.md](BRAINSTORM.md) (which is the deep architectural document) or the design brain itself (which is the user's taste model). When in doubt about *direction*, BRAINSTORM.md wins. When in doubt about *taste*, the design brain wins.
