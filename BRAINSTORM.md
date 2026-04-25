# Open Canvas — Brainstorm & Research

> Living doc. Append new findings, decisions, and open questions at the bottom of each section. Date entries when things change.

**Last updated:** 2026-04-19

**Build state:** Sprint 0 + Sprint 1 done. Sprint 0 = walking skeleton (Next.js 16 + tldraw 4.5 + AI SDK v6 + Anthropic Haiku 4.5; `createShape` client-side tool). Sprint 1 = sketch-to-build (vision input via `editor.toImage` → PNG → `sendMessage({ files })` → Claude vision → rebuild as clean shapes). Both validated in browser end-to-end.

---

## 1. North star — Figma × Claude Code, as one tool

A single multiplayer canvas where designers and engineers collaborate live on a **real product** — not a mockup, not an export — with the canvas itself as the editor and a shippable codebase as the output.

### The two-tool problem we're collapsing

Today, designing and shipping a serious app requires moving between at least two tools:

- **Figma** for visual design — auto-layout, vector editing, frames, groups, components, prototyping.
- **Claude Code / Cursor / Lovable / v0 / etc.** for translating designs into running code.

The handoff is lossy. Designs lose fidelity in implementation. Engineering changes drift from design. Two sources of truth, two histories, two collaboration models, two mental contexts to switch between.

**Open Canvas merges these into one tool.** The canvas IS the editor. The repo IS the artifact. Multiplayer collaboration spans both surfaces.

### North star scenario

> A designer-founder is building a financial app for a friend.
>
> The designer is a 10+ year Figma veteran and a 3-year AI-coding prompter — fluent in design and at directing AI, but not a frontend developer. The friend is an infrastructure engineer — owns APIs and backend, doesn't write frontend.
>
> They open one Open Canvas project together. The designer lays out screens, components, and flows directly on the canvas with the same fluency they'd have in Figma. The friend wires up the data layer and writes API contracts. The AI agent fills the gap — turning design into production-quality React (web) and React Native (mobile) code, binding it to the friend's APIs, keeping everything in sync as both edit live.
>
> One click: GitHub repo provisioned. Vercel deploys the web app. EAS builds the mobile app and pushes to TestFlight. Friends and family scan a QR code, install, use the real product.

This is the test for every feature we consider: does it move that scenario forward, or is it canvas/AI window-dressing?

### Persona — design-prompter

The primary user is **design-fluent + AI-fluent + non-coding** — someone who:
- Moves through Figma "with their eyes closed" — auto-layout, vector editing, frames, groups, components, variants are muscle memory.
- Has been prompting AI to build for years — knows how to direct an LLM, course-correct, and iterate.
- Doesn't write frontend code by hand and doesn't want to.

They are typically paired with a **technical-but-not-frontend collaborator** — a backend / infra / data engineer who owns APIs and ships the non-visual half of a product but doesn't want to do React/React Native either.

Open Canvas is the surface where these two people meet. **AI is the third teammate that fills in the work neither of them does manually.**

This is a much narrower target than "anyone who wants to build apps with AI" — and that narrowness is the bet. The tool is shaped for this dyad, not for solo coders, traditional dev teams, or pure no-code beginners.

### What "real product" actually means

Not an export. Not a mockup. The output is:

- A live, deployed **web app** (Vercel / Cloudflare Pages) and/or **mobile app** (TestFlight / Play Store via EAS).
- A real **GitHub repo** with React / React Native / Expo source the team can pick up and edit anywhere — not a black box.
- Real **APIs** wired in (the collaborator's backend, third-party services).
- Real **users**, real **data**, real **revenue**.

The canvas is a **window** onto this real product, not a separate world that exports into one. See [§11 Targets](#11-targets--web-mobile-or-universal-app) and the publish flow for how the canvas → shipped-app loop closes.

### The fluency bar (the hardest non-obvious requirement)

Because the persona is a Figma veteran, the canvas must match Figma's depth on the things designers do every day. If the canvas feels worse than Figma at any of these, the persona will resent the tool.

| Figma capability | Must feel as native here |
|---|---|
| Auto-layout (with constraints, gaps, padding) | Yes |
| Vector editing (Bézier, boolean ops, path edits) | Yes |
| Frames & groups | Yes |
| Components, instances, variants, props | Yes |
| Constraints, snapping, smart guides | Yes |
| Spacing tokens, color styles, text styles | Yes |
| Multi-page files, sections | Yes |

tldraw gives us a strong base, but **bridging the gap to Figma's depth on auto-layout, vectors, and component variants is real work**. Not a feasibility question — a sequencing one (see [Operating principles](#operating-principles) below).

### How this lives alongside §1 from earlier sessions

The earlier vision points still hold and serve the north star above:

- **AI as native input, not sidecar.** Prompts attach to anything on the canvas.
- **Draw to visualize.** Sketch + prompt is a first-class input.
- **Interactive by default.** Embedded React previews, R3F scenes, shaders are canvas citizens.
- **Design-system-first.** [Design brain (§13)](#13-design-brain--the-soul-of-the-tool) + tokens drive every AI mutation.

### Operating principles

Four ground rules that shape every decision in this doc:

1. **Built for one, opened to many.** Primary user is the [design-prompter persona](#persona--design-prompter) — concretely, the user of this tool building real apps with technical collaborators. Decisions optimize for *that* use case first. The tool should be buildable in a way that others *can* eventually use it, but no decision waits on hypothetical-other-users research. If it makes the primary user's life better, ship it.

2. **No feasibility constraint, only sequencing.** Anything in this doc can be built. The question is never "can we do this?" — only "in what order?" Risk-flagging language ("delivery risk", "hard problem") should be reframed as phasing decisions ("V2", "V3", "after X"). The [fluency bar](#the-fluency-bar-the-hardest-non-obvious-requirement) above and AST-aware bidirectional sync in [§11](#11-targets--web-mobile-or-universal-app) are both "when, not if."

3. **Competitors are inspiration, not constraints.** Pencil.dev, Figma Make, Lovable, v0, openpencil, Cursor 3 — study their UX, steal their good patterns. Don't position against them, don't worry about being out-shipped, don't copy roadmaps. They all lack details that matter for the [north star scenario](#north-star-scenario). Anchor every decision in *what serves the persona dyad better*, not *what fills a competitive gap*.

4. **The design brain is the soul.** The `design/` system (full vision in [§13](#13-design-brain--the-soul-of-the-tool)) is not a static reference doc. It's a living model of the user's taste — a personal design intelligence that grows with every project. The agent reads it before every mutation and proposes updates to it after. This is the feature that makes the AI feel like *the user's* AI pair designer, not a generic LLM with React knowledge. It's the deepest moat in the product.

---

## 2. Stack decisions (current)

| Layer | Choice | Status |
|---|---|---|
| Canvas core | **tldraw SDK** | Leaning in |
| AI | **Vercel AI SDK + `@ai-sdk/anthropic`** (Claude Opus/Sonnet) | Leaning in |
| Agent loop | Claude Agent SDK or tldraw Agent Starter Kit pattern | Undecided |
| Drawing primitive | **perfect-freehand** (bundled in tldraw draw tool) | Confirmed |
| Live code preview | **Sandpack** (v1), WebContainers (v2) | Leaning in |
| 3D / shaders | **react-three-fiber + drei** (as custom tldraw shape) | Leaning in |
| Styling (web mode) | **Tailwind v4** (CSS-first config) | Leaning in |
| Styling (mobile/universal) | **NativeWind v5** (Tailwind for React Native) | Leaning in |
| Component primitives (web) | **shadcn/ui** | Leaning in |
| Component primitives (mobile/universal) | **gluestack** or **NativeWindUI** | Leaning in |
| Mobile framework | **Expo 52+ (React Native + Expo Router)** | Leaning in |
| Mobile preview | **Expo Snack embed** (v1), Expo-in-WebContainer (v2) | Leaning in |
| Mobile build pipeline | **EAS Build** + OTA updates | Leaning in |
| Code editor | **CodeMirror 6** (v1), Monaco (v2 option) | Leaning in |
| Design tokens | **Style Dictionary v4** (W3C DTCG JSON → CSS vars) | Leaning in |
| App framework | **Next.js 15 (App Router)** | Leaning in |
| State (UI chrome) | **Zustand** | Leaning in |
| State (canvas) | tldraw's built-in signal store | Confirmed |
| Multiplayer transport | **tldraw/sync on Cloudflare Durable Objects** | Leaning in — day-one pillar |
| Agent-as-collaborator | Server-side agent joins room as bot user, writes through sync | Leaning in |
| Versioning model | Custom commit DAG over `TLStoreSnapshot`s | Leaning in — day-one pillar |
| Commit / event log | **Postgres (Supabase)** | Leaning in |
| Snapshot blob storage | **R2 / S3** (content-addressed, compressed) | Leaning in |
| Client-side cache | IndexedDB via tldraw's persistence layer | Confirmed |

---

## 3. Canvas core — why tldraw

**[tldraw](https://tldraw.dev/)** is the strongest fit and the gap over alternatives is large.

**Wins:**
- React-native, signal-based reactive store.
- Custom shapes, tools, bindings are first-class extension points → we can embed arbitrary React (R3F, Sandpack, iframes) as canvas citizens.
- Ships the exact patterns we want:
  - **[Make Real](https://github.com/tldraw/make-real)** — sketch → working HTML via Claude/GPT vision.
  - **[Agent Starter Kit](https://tldraw.dev/starter-kits/agent)** — Cursor-style chat that reads and mutates canvas content.
- Draw tool uses **[perfect-freehand](https://github.com/steveruizok/perfect-freehand)** with pressure/stylus support → "draw to visualize" is built-in.
- SDK 4.x (April 2026) adds an MCP app mode where agents and users share the same canvas.

**Alternatives and why not:**
- **Excalidraw** — great aesthetic, weaker extensibility; custom shapes aren't first-class.
- **Konva / react-konva** — lower-level; we'd rebuild selection/snapping/undo/camera/serialization ourselves.
- **Fabric.js** — older, less React-native.

**Open question:** License. tldraw SDK is source-available with branding/watermark conditions — need to confirm terms match our distribution plans before committing.

---

## 4. AI layer

**Primary:** **[Vercel AI SDK](https://ai-sdk.dev/docs/introduction)** with `@ai-sdk/anthropic`.
- Streaming, multimodal inputs (send sketch + prompt as image + text), and generative UI (stream React components back).
- Good fit for prompt-on-element UX.

**For agentic flows** (multi-turn canvas edits): **Claude Agent SDK** with tool-calls against our shape API. This mirrors tldraw's Agent Starter Kit.

**Model picks:** `claude-opus-4-7` for heavy generation, `claude-sonnet-4-6` for fast iteration, `claude-haiku-4-5` for cheap tool calls.

**Why Claude specifically:** Vision is strong at sketch-to-UI — it's what powers Make Real. Also: recent [Claude Design (Anthropic Labs)](https://www.anthropic.com/news/claude-design-anthropic-labs) work signals ongoing investment in this space.

**Open questions:**
- Do we expose multi-provider support (OpenAI, Google) or stay Claude-only for focus?
- How do we surface the sketch layer to the model — composite onto a canvas screenshot, or send sketch as a separate image channel?

---

## 5. Live preview of generated code

**V1: [Sandpack](https://sandpack.codesandbox.io/)** (CodeSandbox)
- Iframe-sandboxed, bundles in-browser, no server.
- Ship as a `PreviewShape` custom tldraw shape that renders generated React/HTML inline.

**V2: [StackBlitz WebContainers](https://webcontainers.io/)**
- Full Node in the browser → `npm install`, Vite dev server, real tooling.
- Heavier; only worth it when we need real package installs or multi-file projects.

> For **mobile-mode** preview (Expo Snack + device frame chrome, build-to-device via EAS), see [§11 Targets](#11-targets--web-mobile-or-universal-app).

---

## 6. 3D / shaders — react-three-fiber as a custom shape

- `@react-three/fiber` + `drei` inside a tldraw custom shape = resizable R3F scenes on the canvas.
- Shadertoy-style shader cells via `shaderMaterial` from drei.
- **Open question:** Performance budget when many R3F shapes are on one canvas. May need to pause off-screen scenes.

---

## 7. Design system foundation

- **Tailwind v4** (CSS-first config via `@theme`).
- **[Style Dictionary v4](https://styledictionary.com/info/tokens/)** to transform tokens (W3C DTCG JSON) → CSS custom properties, TS constants, and platform-specific outputs.
- **shadcn/ui** for primitives (copy-in, fully themeable).
- **`design.md` as source of truth** — baked into both the repo and the AI's system prompt. Same pattern tldraw's Make Real uses with `CLAUDE.md`.

**The key bet (§13):** every AI mutation reads `design.md`, and accepted changes can propose updates back to it.

### Figma-fluency translation

Because the [§1](#1-north-star--figma--claude-code-as-one-tool) persona is a Figma veteran, design-system primitives need to translate cleanly between Figma-native concepts, our canvas, and code output. This table is a contract:

| Figma concept | Open Canvas surface | Code output |
|---|---|---|
| Color / text / number variables | Style Dictionary tokens | CSS vars (web) + RN StyleSheet (mobile) |
| Local styles | Token aliases | Same |
| Auto-layout (flex direction, gap, padding) | Frame with auto-layout properties | Tailwind `flex` / NativeWind `flex` classes |
| Constraints | Token-driven spacing + relative positioning | Tailwind / NativeWind spacing scale |
| Components | First-class canvas component shape | React component with typed props |
| Variants | Prop interface (size, state, theme) | Variant-driven `className` composition |
| Instances | Component usage on canvas | JSX render of the component |
| Boolean ops on vectors | Vector tool | SVG output (or design-time only, depending on platform) |
| Multi-page files | Multi-canvas project | Multi-screen routing (Next.js routes / Expo Router) |

**The goal:** a designer can think entirely in Figma terms and the code that gets generated is what a senior frontend engineer would have written by hand.

---

## 8. Multiplayer — day-one pillar

**Every layer of the app shell is live-multiplayer.** This is not an opt-in mode.

### What has to be live

| Surface | Mechanism |
|---|---|
| Canvas shapes & edits | tldraw/sync over WebSockets |
| Cursors, selections, camera | Presence (tldraw/sync) — supports "follow" mode |
| Prompt boxes (typing, attached sketches) | Presence + ephemeral room state |
| AI generation in progress | Agent is a **bot user** writing to the shared store |
| Comments / reactions | Presence + persisted comments in our store |
| Version history browsing | Presence — see who's inspecting which snapshot |
| Voice / video (future) | LiveKit, separate channel |

### Transport layer

**Primary: [tldraw sync](https://tldraw.dev/docs/sync), self-hosted on Cloudflare Durable Objects** — [official template](https://github.com/tldraw/tldraw-sync-cloudflare).
- Purpose-built for tldraw's store.
- Handles presence, cursors, selections, shapes out of the box.
- One Durable Object per canvas → strong per-document consistency.
- Caveat from tldraw docs: long-term snapshot history is *not* provided by default — we layer our own (see §9).

**Fallback: Liveblocks.** As of [Feb 2026 they open-sourced their sync engine](https://liveblocks.io/blog/whats-new-in-liveblocks-february-2026), which removes lock-in concerns. Their tldraw integration is mature. Keep as an option if Cloudflare self-hosting becomes a pain.

### The AI agent as a first-class multiplayer citizen

When Alice prompts "make the hero section bold" on a selected frame:
- Alice's prompt input is visible to Bob — typing indicator + prompt preview on the target.
- The agent "joins" the room as a presence — bot avatar, dedicated color, cursor hovering the target.
- Shapes mutate in real-time as the agent streams tool-calls; Bob watches it happen.
- Bob can interrupt, co-edit, drop in a comment mid-stream.

This is **Cursor-as-collaborator, applied to the canvas**. It's the flagship interaction.

**Implementation sketch:**
- Agent runs server-side (Cloudflare Worker or Node service).
- Agent opens a sync connection as a dedicated user ID per canvas.
- Tool-calls map to tldraw store mutations, written through the sync connection.
- Intermediate reasoning/streaming published on a dedicated "agent activity" channel clients subscribe to.

### Roles & permissions

Three role tiers, standard:

| Role | Can | Cannot |
|---|---|---|
| **Owner** | Everything: edit canvas/code/brain, manage roles, connect repos, configure deploys, delete project | — |
| **Editor** | Edit canvas/code/brain, run agents, push to deploys | Manage roles, destroy project |
| **Viewer** | Read everything, leave comments, prompt agent (whether agent acts is owner-policy) | Mutate canvas/code/brain directly |

**Key principle: every role sees the same UI.** The backend collaborator from [§1](#1-north-star--figma--claude-code-as-one-tool) doesn't get a "backend-only" sub-UI — they get the full canvas + chat + brain + terminal, and pick what to engage with. Mirrors how Figma works (everyone sees the canvas, role gates editing) and avoids siloing collaborators by job title.

Roles are per-project. The org/team brain ([§13](#13-design-brain--the-soul-of-the-tool)) has its own role model — typically a smaller "brand stewards" set who can edit the org brain plus a wider read-only set.

---

## 9. Versioning & history — day-one pillar

Requirements:
- Every change, prompt, and version stored.
- Any point in history is reversible or forkable.
- Fork = new canvas rooted at that point; original untouched.
- Reset = discard future work, continue from that point.

### Commit model — Git-for-design

A canvas has a **DAG of commits**. Commit = `{id, parent, author, timestamp, kind, payload, snapshot_ref}`.

**Commit kinds:**
- `prompt` — AI prompt boundary. Payload: prompt text, attached sketch, target shapes, model, response, token usage, shape diff.
- `named-save` — user-triggered "save version" with optional name/description.
- `autosave` — periodic micro-commit during active editing (every N seconds or N mutations).
- `fork-root` — first commit of a new branch; points to the commit it forked from.

**Snapshot strategy:**
- Full tldraw [`TLStoreSnapshot`](https://tldraw.dev/docs/persistence) captured at every semantic commit (prompt, named-save, fork-root).
- Autosaves store diffs against the previous snapshot to keep storage cheap; rehydrate by snapshot + replay.
- Metadata in Postgres (Supabase); snapshot blobs in R2/S3 (content-addressed, compressed).

### Prompt-as-commit

Every AI interaction produces a commit:

```
{
  kind: "prompt",
  prompt: { text, attachments: [sketch.png, ...], targetShapes: [...] },
  model: "claude-opus-4-7",
  response: { text, toolCalls: [...], tokensIn, tokensOut },
  diff: { added: [...], removed: [...], modified: [...] },
  snapshotBefore: <ref>,
  snapshotAfter: <ref>,
  parent: <commit-id>,
  author: <user-id>,
}
```

This gives us:
- `git log` for AI-assisted design.
- "Re-run this prompt" at any point in history.
- Blame: which shapes came from which prompt.
- Prompt diffing — what did the agent actually change?

### Time travel UX

**Preview mode by default.** Scrubbing the timeline shows a read-only overlay of that state on *your* screen; the live doc is untouched. This is how [Figma does it](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) — correct pattern for multiplayer.

Two destructive exits from preview:
- **Fork from here** — create a new canvas rooted at this commit. Original untouched. No confirmation from others needed.
- **Reset to here** — rewrites the branch HEAD. Everyone in the room sees the canvas jump. Requires confirmation; notifies all present users.

### Multiplayer-aware history

- Each user has their own history cursor (preview position). Broadcast via presence: "Alice is reviewing 2 minutes ago" is visible to everyone.
- Commits carry `author`; mixed-author branches are fine. The DAG is per-canvas, not per-user.

### Why not Automerge / Loro as the canonical store

[Automerge](https://automerge.org/) and [Loro](https://loro.dev/) natively do DAG-based versioning, time travel, and forking ([Loro's version deep dive](https://loro.dev/docs/advanced/version_deep_dive) is essentially git-for-JSON). Tempting. But:
- tldraw has its own signal store powering the UX. Replacing it means fighting the framework and losing the Agent Starter Kit and Make Real patterns.
- We capture 90% of the benefit by snapshotting tldraw's native `TLStoreSnapshot` at commit boundaries and owning a lightweight commit-graph around it.
- Revisit if we need real-time merge of divergent branches (v3+). See [Inkandswitch's Patchwork](https://www.inkandswitch.com/patchwork/notebook/08/) for the reference design.

### Reference architecture (Figma)

Figma's approach ([their blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)):
- One server process per doc, WebSockets, 30 FPS mutations.
- Journal (DynamoDB) as durable append-only log, periodic checkpoints.
- Last-write-wins on per-property mutations (not a full CRDT).
- 2.2B changes/day; 95% persisted in ~600ms.

Our architecture is the same shape, smaller scale: Cloudflare DO per doc + Postgres journal + R2 snapshots.

---

## 10. Live agent cursors & streaming choreography — the magic moment

Reference: [pencil.dev](https://www.pencil.dev/) — up to 6 AI agents work the canvas simultaneously, each with its own cursor. You watch them place elements, adjust layouts in parallel. This is the single most "wow" interaction and it's largely a **choreography + streaming** problem, not an AI problem.

Open-source reference implementation: **[openpencil](https://github.com/ZSeven-W/openpencil)** — "first open-source AI-native vector design tool with concurrent Agent Teams". Study this for the patterns.

### The three streams

Converting raw LLM output into a cinematic takes three layered streams:

```
 Claude streaming response              OUR CHOREOGRAPHER                tldraw/sync presence
 ──────────────────────────             ──────────────────────────       ──────────────────────
 intent stream                   →      micro-event stream          →    broadcast to all clients
 - text tokens                          - cursor.move(id, xy, ms)        - every viewer sees the
 - input_json_delta fragments           - cursor.hover(shapeId)            same cinematic
 - tool_use blocks                      - shape.ghost(placeholder)
 - content_block_stop                   - shape.commit(finalProps)
                                        - text.typeChar(char)
                                        - pause(ms)
```

### Layer 1 — Intent stream (from Claude)

- Claude's [fine-grained tool streaming](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming) emits `input_json_delta` events carrying `partial_json` fragments as the model types the tool arguments.
- Vercel AI SDK exposes this via [`streamObject` + `partialObjectStream`](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) — async iterable of typed partial objects against a Zod schema.
- **Unlock:** we know the tool name + first params within the first few tokens. Start animating *before* the full tool call has arrived.

### Layer 2 — Choreographer (our layer)

A pure library that takes intent streams and produces a timed micro-event stream:

| Micro-event | When |
|---|---|
| `cursor.move(agentId, {x,y}, ms)` | As soon as partial JSON hints at a target location |
| `cursor.hover(agentId, shapeId)` | On `selectShape` intent, before any mutation |
| `shape.ghost(agentId, placeholder)` | On `createShape` intent first glimpse — translucent placeholder |
| `shape.update(agentId, shapeId, props)` | Each new property arriving in the stream |
| `shape.commit(agentId, shapeId, final)` | On `content_block_stop` for that tool_use |
| `text.typeChar(agentId, shapeId, char)` | Token-by-token for text shapes |
| `pause(ms)` | Between tool calls / between plan steps |

**Pacing defaults (tunable):**
- Cursor hop: ease-in-out, 300–500ms; capped at 800ms for long distances.
- Shape "draw": 250–400ms, proportional to size.
- Text type: 20–40ms/char.
- Inter-step breath: 150–250ms.
- User controls: 1x / 2x / 4x / skip-to-final.

### Layer 3 — Presence broadcast

- Agent is already a bot user in the sync room (§8). Cursor gets programmatically moved.
- Introduce two new shape kinds on tldraw:
  - **GhostShape** — translucent, not persisted; represents in-flight agent work. Carries `agentId`, `targetKind`, partial props.
  - **AgentCursor** — a presence entity with color/avatar/label.
- On `shape.commit` the ghost is promoted to a real persisted shape and the commit gets logged to the event log (§9).
- Everyone in the room — humans and other agents — sees the same cinematic at the same time.

### Partial JSON → visible progress (the trick)

Without partial JSON parsing, the user waits for a complete tool call, then sees the shape *pop* into existence. That's boring.

With partial JSON parsing:
1. First 30 tokens: we know it's `createShape({type: "rect", ...`. Cursor starts moving.
2. Next 20 tokens: `x: 120, y: ...`. Cursor reaches roughly the right area.
3. Next 20 tokens: `width: 320, height: 180, ...`. Ghost rectangle begins drawing.
4. Next 20 tokens: `fill: "accent", ...`. Ghost colors in.
5. `content_block_stop`: Ghost promotes to real shape. Cursor moves to next target.

The human's eye sees fluid motion, not discrete jumps.

### Multi-agent choreography (v2)

Pencil's flagship: an **orchestrator** decomposes a prompt into spatial sub-tasks ("you take the header, you take the sidebar"), spawns N sub-agents, each a separate bot user with its own cursor color. They work in parallel.

For v1, ship single-agent. For v2, the orchestrator pattern:
- Orchestrator agent outputs a plan (JSON array of sub-tasks with target regions and prompts).
- Each sub-task spawns a sub-agent runner with a scoped tool surface.
- Sub-agents stream independently into the choreographer.
- Choreographer multiplexes their micro-events, keeping cursors disambiguated by color/id.

### Skip / instant mode

A toggle: "show agent working" (default, cinematic) vs "just apply" (results-now). Persist the preference per-user. Even in "just apply" mode, keep the agent cursor visible so collaborators still know the agent is active.

### Replay

Because every `prompt` commit (§9) stores the full tool-call payload — not just the diff — we can replay the choreography later. A "replay this prompt" control re-runs the cinematic against a historical snapshot without re-calling the LLM. Great for demos, onboarding, and "how did this get built?" UX.

### Where code lives

```
packages/
  agent-choreographer/   — pure lib: intent stream → micro-event stream
  agent-runner/          — server-side: runs Claude, feeds choreographer, publishes to sync
  sync-protocol/         — tldraw/sync extensions for AgentCursor and GhostShape
```

The choreographer is a pure data transform — no networking, no tldraw dependency. Easy to test deterministically with recorded intent streams.

### Open questions

- Do we animate *every* tool call, or allow certain "setup" tools (e.g. `batchUpdate`) to skip animation and commit silently?
- Ghost-shape collision: what if a human edits a shape the agent is mid-way through drawing?
- Cursor path-finding — straight lines, or "natural" curves that avoid existing shapes?
- How many sub-agents before the cinematic becomes noise? (pencil caps at 6 — likely the right ceiling.)

---

## 11. Targets — web, mobile, or universal app

The canvas, AI, choreography, multiplayer, and versioning layers are all platform-agnostic. What diverges is the **output target**: the preview, the component library, and the build pipeline. At project creation, the user picks a mode:

| Mode | Framework | Components | Styling | Preview | Deploy |
|---|---|---|---|---|---|
| **Web** | Next.js 15 | shadcn/ui | Tailwind v4 | [Sandpack](https://sandpack.codesandbox.io/) iframe | Vercel / Cloudflare |
| **Mobile** | Expo 52+ (React Native) | [NativeWindUI](https://nativewindui.com/) / [gluestack](https://gluestack.io/) | [NativeWind v5](https://www.nativewind.dev/) | [Expo Snack](https://snack.expo.dev/) + device frame chrome | EAS Build → TestFlight / Play Store |
| **Universal** | Expo Router (RN + react-native-web) | gluestack (primary) | NativeWind v5 (compiles to both) | Sandpack + Snack side-by-side | Vercel + EAS |

Mode is persisted in project metadata. Changeable later with AI migration help.

### First-run flow

The first 30 seconds shape the entire experience. The flow:

1. **"What are you building?"** — single input box. Examples shown: *"an app for tracking running splits," "a finance app for my friend," "a portfolio site."* The agent uses the answer to seed project name, the [design brain (§13)](#13-design-brain--the-soul-of-the-tool), and the initial structure.
2. **"For web, mobile, or both?"** — three buttons. Web (Next.js), Mobile (Expo), Universal (Expo Router — single codebase, runs web + iOS + Android).
   - **"Both" is real.** [Expo Router universal mode](https://expo.dev/router) is the answer to "can I do React + React Native at once?" — file-based routing shared across platforms, with platform-specific overrides at the route level. NativeWind handles styling for both. Apps like Showtime ship in production using this.
3. **Empty canvas opens** — with the first screen frame(s) already placed based on the description (e.g. *"finance app"* → home + transactions + transfer screens scaffolded as empty frames). Mode-appropriate device frame on each.
4. **Chat sidebar visible** — empty thread, primed with a greeting that references what the user said. The user can immediately prompt OR start designing directly with the Figma-side tools (shapes, frames, text, components).

The user is **in the canvas, with concrete starting frames, in under a minute**. No setup wizard, no template browser, no "create your first artboard" tutorial.

### What stays identical across modes

- tldraw canvas and all shape primitives.
- AI layer, [choreographer (§10)](#10-live-agent-cursors--streaming-choreography--the-magic-moment), agent-as-bot-user.
- Multiplayer transport ([§8](#8-multiplayer--day-one-pillar)).
- Commit DAG / versioning ([§9](#9-versioning--history--day-one-pillar)).
- `design.md` feedback loop ([§12](#12-the-one-non-obvious-bet--designmd-feedback-loop)) — mode-aware content.
- Tokens (Style Dictionary transforms per-platform: CSS vars for web, RN `StyleSheet` for mobile, both for universal).

### Mobile preview — the iPhone/Android mock

**V1: [Expo Snack](https://github.com/expo/snack/blob/main/docs/embedding-snacks.md) embedded**
- Snack is Expo's browser playground. Embeds via iframe using `data-snack-id` or `data-snack-code`; the SDK gives programmatic control.
- **Web preview** routes through `react-native-web` running inside the iframe — fast, free, no emulator.
- **iOS / Android preview** via [Appetize.io](https://appetize.io/) integration — real emulators in browser, $59–$2500/month depending on concurrency.
- We wrap the Snack iframe in a custom iPhone/Android **device frame chrome** (SVG bezel, status bar, dynamic island) so the mock looks like the real device — on our canvas, not Snack's default chrome.

**V2: Expo dev server in [WebContainer](https://webcontainers.io/)**
- StackBlitz's Bolt.new already runs Expo inside WebContainers. Proves it works.
- Gives us full `npm install`, real Metro bundler, no Appetize dependency.
- Heavier; Chromium/Firefox/Safari TP only.

**Build to real device**
- Every mobile-mode project has an Expo config under the hood.
- "**Open on my phone**" → [`qr.expo.dev`](https://docs.expo.dev/more/qr-codes/) generates a QR code, user scans with Expo Go, app launches with hot reload.
- "**Ship to TestFlight / Play Store**" → [EAS Build](https://docs.expo.dev/build/introduction/) pipeline in the cloud, submits to stores.
- [OTA updates](https://docs.expo.dev/eas-update/introduction/) push fixes without store review; **Hermes bytecode diffing** (new in 2026) makes deltas tiny.

### Preview panel layout

Three arrangeable panels:
- **Canvas** — the designer's work surface (shapes, screens as frames, components).
- **Live app preview** — one or more device frames showing the full running app. Multiple devices simultaneously (iPhone + Pixel side by side, different screen sizes).
- **Code editor** — scoped to the currently selected shape / screen / component.

Targeted edit flow: user selects a component in the canvas → preview highlights that component in the running app → code editor shows just that component's source → edits in any pane propagate to the others.

### Code editor — CodeMirror 6

Recommendation: **[CodeMirror 6](https://codemirror.net/)** over Monaco.
- **~300KB** modular core vs Monaco's ~5-10MB.
- **Best-in-class mobile UX** — uses native `contentEditable` instead of reimplementing text editing. We're building a mobile-app-builder; dogfooding matters.
- Extensions for React/TS/TSX are solid.
- Fits our philosophy: the editor is a scoped view on the canvas's output, not a full IDE.

Keep Monaco as a v2 option for code-first power users (Sandpack ships with Monaco by default, so the door is open).

### Two-way code ↔ canvas sync

**V1 (ship first):**
- **Canvas → code is generative.** AI compiles current canvas state to code on save or on demand. Code is an output, not the canvas's source-of-truth.
- **Code → canvas is read + annotate.** Editing code changes the preview, not the canvas geometry. Canvas elements tied to edited code display an "out of sync" badge.
- **AI as the mediator.** Select a code block, prompt: "make this a reusable component" or "change this button's press animation". The agent edits both code and canvas metadata in a single commit.

**V2:** AST-aware bi-directional sync. Parse generated JSX/RN back into canvas shape operations on write. Hard problem; punt until V1 UX validates the model.

### Design-as-code — the native format

Borrow from pencil's `.Pen` and [openpencil](https://github.com/ZSeven-W/openpencil): **canvas state lives in the user's repo as JSON, alongside the code**. Git is the storage layer for both. Our commit DAG ([§9](#9-versioning--history--day-one-pillar)) is a richer layer on top of the user's actual git history.

Proposed project structure:

```
my-app/
  design/
    design.md                — AI design brain
    tokens/                  — Style Dictionary inputs (W3C DTCG JSON)
    components/              — design-system metadata
    screens/
      home.canvas.json       — canvas state per screen
      ...
  app/                       — Next.js (web) or Expo (mobile) code
    screens/Home/index.tsx   — actual component code
  package.json, tsconfig.json, etc.
  eas.json                   — mobile mode only
  next.config.ts             — web mode only
  app.config.ts              — Expo config (mobile/universal)
```

Canvas and code are coequal views into the same git repo. The tool is a window onto both, not a silo beside them.

### Shared design system contract

For **universal mode**, the token pipeline is the critical contract:

```
design/tokens/*.json  (W3C DTCG)
          │
          ▼
   Style Dictionary
  ┌───────┼────────┐
  ▼       ▼        ▼
 CSS    RN StyleSheet  TS consts
 vars   (NativeWind)   (shared)
  │       │
  ▼       ▼
Tailwind  NativeWind
(web)     (mobile)
```

Same tokens → both platforms, zero drift. [NativeWind v5](https://www.nativewind.dev/v5) is the linchpin — it compiles Tailwind classes to native RN stylesheets, so a component written once with `className="..."` renders correctly in both.

### Ship — canvas to live product

The end of the loop, and the part that makes the [§1 north star](#1-north-star--figma--claude-code-as-one-tool) actually true. **One Open Canvas project = one git repo = one shippable product.**

**GitHub from day one.**
- Project creation provisions a GitHub repo (or attaches to an existing one).
- Canvas state, code, design tokens, `design.md` all live in the repo.
- Commits in our DAG ([§9](#9-versioning--history--day-one-pillar)) map onto real git commits with rich metadata.
- The team can clone, edit in their own IDE, and push back — the repo is not a black box.

**Web mode publish.**
- **Vercel** — connect via GitHub OAuth, push triggers preview deploys per branch, prod on main. Zero config for Next.js.
- **Cloudflare Pages / Workers** — same flow, edge-native, lower cost. Better fit for global apps with low latency requirements.
- One-click in the canvas: "Publish to Vercel" / "Publish to Cloudflare" sets up the connection and returns a live URL.
- Custom domains, env vars, branch previews surface in the canvas's project panel — no leaving the tool.

**Mobile mode publish.**
- **EAS Build** ([docs](https://docs.expo.dev/build/introduction/)) — compiles iOS + Android in the cloud, no Mac required, no local Xcode.
- **EAS Submit** — uploads to TestFlight / Play Console, handles signing, provisioning, store metadata.
- **EAS Update** — OTA pushes for JS-only changes, no store review. Hermes bytecode diffing (2026) keeps deltas tiny.
- One-click in the canvas: "Build for TestFlight" / "Push update". Build status and tester QR codes surface in the canvas's project panel.

**Universal mode publish** — both pipelines run on the same repo in parallel. One push triggers Vercel + EAS in parallel.

**Backend integration — the collaborator's half.**

For the dyad described in [§1](#1-north-star--figma--claude-code-as-one-tool) to work, the backend collaborator needs first-class surface area in the same project — not a separate repo to keep in sync.

- **Schema imports** — OpenAPI / GraphQL schemas drop into the project. AI generates typed clients and uses the schema to know what data is available when wiring screens.
- **Secrets & env vars** — managed per environment (dev, preview, prod) in the canvas's project panel.
- **Backend connections panel** — the collaborator manages routes, auth, rate-limits in their own surface, but it's visible to (and bindable from) the design surface.
- **Data bindings on canvas elements** — a list shape can bind to `GET /transactions`, a form can bind to `POST /transfer`. The binding becomes part of the generated code; the AI knows how to render loading/error/empty states for each binding.

The design surface and the infra surface are two halves of the same project, not two repos to keep in sync. This is the *operational* version of the [§1](#1-north-star--figma--claude-code-as-one-tool) two-tool collapse.

### Open questions

- Mobile-specific primitives (safe area, nav bar, tab bar, gestures) — teach the canvas, or render them only at preview time?
- Is gluestack enough for universal, or do we need per-platform overrides in the primitive system?
- Does every canvas project own a git repo from day one, or do we defer "write to disk"? (Leaning yes, day-one — see Ship subsection above.)
- Code editor as an inline canvas shape (edit-in-place) vs a dedicated panel — probably both.
- Appetize cost for iOS/Android previews — pass through, eat it, or gate behind a plan? Snack's free web preview covers ~80% of cases.
- Live-reload target latency: canvas edit → regen → bundler → preview. Sub-second for magic; what's realistic?
- Backend integration depth — is OpenAPI/GraphQL import enough, or do we need first-class connectors for common backends (Supabase, Convex, Hono, tRPC)?
- Schema-driven data bindings — how do we surface this in the canvas without making it feel like a low-code tool?

---

## 12. Suggested starter architecture

```
Next.js 15 (App Router)              — SSR + API routes for AI streaming
  tldraw SDK                         — canvas + draw tool + shape system (hot state)
    custom shapes:
      - PromptShape                  — attached prompt boxes on elements/frames
      - PreviewShape                 — Sandpack iframe for generated code
      - R3FShape                     — react-three-fiber scenes
      - SketchShape                  — perfect-freehand overlay (draw-to-visualize)
  tldraw/sync on Cloudflare DO       — live multiplayer transport (shapes, presence, cursors, follow)
  Vercel AI SDK + @ai-sdk/anthropic  — Claude streaming, vision, tool-calls
    Agent-as-bot-user                — joins room, writes through sync, visible presence
  Postgres (Supabase)                — event log + commit DAG (prompts, saves, autosaves, branches)
  R2 / S3                            — snapshot blob storage (content-addressed, compressed)
  Tailwind v4 + shadcn/ui            — UI chrome
  Style Dictionary                   — tokens → CSS vars consumed by Tailwind
  design.md                          — canonical design brain, read by AI on every prompt
  Zustand                            — UI chrome state (panels, modals, prompt inputs)

Later:
  LiveKit                            — voice/video overlay
  WebContainers                      — full Node previews
  Branch merging                     — when forks need to reconcile (consider Loro/Automerge then)
```

---

## 13. Design brain — the soul of the tool

The `design/` directory in every Open Canvas project is not a reference doc. It is a **living model of the designer's taste** — a personal design intelligence that grows with every project. The agent reads it before every mutation and proposes updates to it after. Over time, the brain calcifies into something that operates *like the user does*, not like a generic LLM.

Rough analogy: if `CLAUDE.md` is a project's *coding* context, the design brain is a designer's *taste* context — captured as machine-readable text the agent treats as the highest-priority instruction set.

This is the deepest moat in the product. The brain is genuinely personal and gets more valuable the longer the user uses the tool.

### What it captures

The brain captures **conscious** decisions (the user explicitly says "I want X") and **subconscious** ones (patterns the agent observes the user repeating). For both, it stores the **why and how**, not just the what.

| Layer | What it stores | Example |
|---|---|---|
| Principles | Core philosophy, immovable beliefs | "Motion supports meaning, not delight." • "Spacious over dense." |
| Voice | Copy, tone, language register | "Friendly but precise. No exclamation marks. Sentence case." |
| Aesthetic | Look-and-feel direction | "Monochrome with single warm accent. Heavy on negative space." |
| Influences | References, moodboards, designers/work that inspires | Links, screenshots, "what about this works for me" annotations |
| Tokens | Color, type, spacing, motion scales | Style Dictionary JSON ([§7](#7-design-system-foundation)) |
| Systems | Component primitives, variants, prop interfaces | "Button has 3 sizes, 4 intents. Pill-shaped, never square." |
| Hierarchy | IA, navigation patterns, screen flows | "Tab bar for top-level, drawer for settings. No deep modals." |
| Animations | Motion language, reusable curves and durations | "200ms ease-out for affirm. 350ms spring for celebrate." |
| Patterns | Observed-and-named patterns, conscious or AI-detected | "Cards always have 12px gap, 16px internal padding." |
| Decisions | Chain-of-thought records of major calls and why | "2026-04-19: chose stacked tab nav over bottom sheet because…" |

### Proposed structure

The brain is a **library of nested files**, not a monolith. The agent loads only the relevant slices for a given task.

```
design/
  brain/                          — the personal taste model
    principles.md
    voice.md
    aesthetic.md
    influences.md
    learnings.md                  — distilled rollup of recent decisions + patterns (agent-maintained, user-editable)
    decisions/                    — dated chain-of-thought records
      2026-04-19-color-system.md
      2026-04-22-tab-vs-drawer.md
      ...
    patterns/                     — observed + named patterns
      cards-spacing.md
      forms-inline-validation.md
      ...
  systems/
    tokens/                       — Style Dictionary inputs (W3C DTCG)
    components/                   — component metadata + variant matrices
    hierarchy.md                  — IA + navigation principles
    animations.md                 — motion vocabulary + reusable curves
    spacing.md                    — spacing scale + when to break it
    typography.md                 — type system + voice anchors
  artifacts/                      — per-app design records (project-specific)
    finance-app/
      decisions.md
      patterns.md
      screens/                    — *.canvas.json per-screen + rationale notes
    ...
```

### How the agent uses it

The agent has **full access**: every tool call (canvas mutations, code edits, brain reads/writes, terminal commands), vision (canvas screenshots, sketches, references), and brain reads. For every prompt, the system context is materialized in **four slices**:

1. **Always loaded** (cheap, small): `principles.md`, `voice.md`, `aesthetic.md`, `learnings.md`. These set the lens. `learnings.md` is the agent-maintained distillation — recent decisions + active patterns rolled up so the agent doesn't re-derive context from raw history every prompt.
2. **Task-relevant slices** (selected based on what's being touched):
   - Component work → `systems/components/<name>.md` + relevant `patterns/`.
   - New screen → `hierarchy.md` + `spacing.md` + `typography.md` + `artifacts/<app>/decisions.md`.
   - Motion work → `animations.md` + relevant component motion entries.
3. **Project artifacts** when in-context: everything under `artifacts/<current-app>/`.
4. **Visual context**: a current canvas screenshot of the selection + surrounding frames, attached as an image input. The agent literally *sees* what it's working on, not just the JSON.

The agent's chain-of-thought references the brain explicitly:

> *"This screen needs a tab bar (per `hierarchy.md`), pill-shaped buttons with the warm accent for the primary CTA (per `patterns/buttons.md` + `aesthetic.md`), and ease-out 200ms transitions on press (per `animations.md`). Stacking gap: 12px (per `patterns/cards-spacing.md`)."*

Every mutation has a rationale rooted in the user's own prior decisions.

### How the brain learns

**Conscious capture** is straightforward — the user types principles, declares tokens, names components. Standard.

**Subconscious capture** is the magic:

- The agent watches mutations across sessions. After N similar choices, it proposes:
  > *"I notice you consistently use 12px gap between cards across the last 4 screens. Codify this as `patterns/cards-spacing.md`?"*
- The user accepts, edits, or rejects. Accepted patterns become part of the brain and feed into future mutations.
- Subconscious detection runs as a slow background process on the [event log (§9)](#9-versioning--history--day-one-pillar). Not real-time analysis — periodic check-ins.
- The agent can also detect **inconsistencies** ("you use 12px gap on 9 screens but 8px on this one — was that intentional, or should this one match?").

The brain therefore grows two ways: by direct user edits, and by accepted AI-proposed observations. Both flow through the [versioning DAG (§9)](#9-versioning--history--day-one-pillar) so the brain itself is forkable, time-travelable, and diffable like everything else.

### Bootstrapping — light start, continuous learning

The brain is **filled by the user** at the start, then **appended and updated with learnings while using the app**. No heavy upfront ceremony — the user gets working fast and the brain accumulates as they design.

**Light start options at project creation:**
1. **Inherit from an org brain.** If the project belongs to an org/team with a brand brain, inherit it wholesale (see [Brain hierarchy](#brain-hierarchy--org-and-project) below).
2. **Import from references.** Drop in screenshots, Figma exports, links to live sites the user loves. Agent extracts initial principles, aesthetic, and type/color/spacing scales as a draft brain. User accepts/edits inline.
3. **Start blank with defaults.** Sensible neutral templates for principles, voice, aesthetic, tokens. User edits as they go.

**Continuous learning** is where the brain actually grows:
- Every accepted AI mutation adds to `decisions/`.
- The agent watches for repeated choices and proposes patterns into `patterns/`.
- The user writes directly into any brain file at any time (see [Brain access](#brain-access--always-readwrite) below).

The brain is never empty for long, and it's never "done."

### Mode-aware

The brain is platform-aware. Web design vocabulary (hover states, scroll-driven animations, cursor) differs from mobile (gestures, haptics, safe areas). For [universal mode (§11)](#11-targets--web-mobile-or-universal-app), the brain has both with shared roots and per-platform overrides.

### Brain hierarchy — org and project

There are **two tiers**, no more:

- **Project brain** (always present): a **single brain shared by all collaborators on the project**. There is no separate brain per role — designer and backend collaborator share the same one. It lives in the project repo under `design/`. It is multiplayer-edited like everything else (see [§8](#8-multiplayer--day-one-pillar), [§9](#9-versioning--history--day-one-pillar)).
- **Org / team brain** (optional, layered above): a separate repo containing the company's brand and design system — principles, voice, aesthetic, tokens, components shared across **all projects in the org**. For a solo user, it's an "org of one" — their personal cross-project taste memory. For a team, it's the company design system.

**Inheritance:** project brain references the org brain via `design/org-ref.json`. At load time the agent merges org → project, with project overrides winning on conflict. This lets each project specialize ("this is a finance app, gravity over delight") without losing the brand contract.

**Promotion:** a pattern that emerges in a project can be **promoted up** to the org brain when the user (or the agent, with user approval) decides it's universal. Suggested trigger: agent flags a pattern that recurs across N projects in the org and asks "promote to org brain?"

**Repo layout:**
```
my-app/                          — project repo
  design/
    org-ref.json                 — optional pointer to org-brain repo
    brain/                       — project-specific brain (overrides + new)
    systems/
    artifacts/
  ... rest of code

org-design-system/               — separate org-level repo (optional)
  brain/                         — shared org principles, voice, aesthetic
  systems/                       — shared tokens + components
```

For Jip's setup: a `jip-design-brain` repo accumulates personal taste across all his projects. Each project repo references it. The financial app + future personal projects all pull from the same root and specialize from there.

### Brain access — always read/write

The user can **directly read and write any brain file at any time**. Not just an inspector view — full mutation rights, surfaced as a first-class panel in the UI.

The **Brain panel** is a markdown editor view of the brain file tree:

- File tree on the left (mirrors the on-disk structure).
- Markdown editor on the right (same CodeMirror 6 from [§11](#11-targets--web-mobile-or-universal-app)).
- Edits are live-multiplayer (someone else editing `principles.md` is visible in real-time).
- Edits go through the [§9 commit DAG](#9-versioning--history--day-one-pillar) — diffable, time-travelable, fork-able like canvas commits.
- AI-proposed changes (from subconscious-detection) appear inline in the editor as suggested edits the user can accept/reject/modify, like a code review.

Side-effect: because the brain is plain markdown in the repo, the user can also edit it from their own IDE / terminal / phone — no canvas required. The Brain panel is the in-canvas affordance, but it's not the only path.

### Why this matters

Without the brain, the AI is a generic React/RN code generator with vague aesthetic taste — same output for everyone. With the brain, the AI is **the user's AI**, designing things the way the user would, referencing decisions the user has already made, repeating patterns the user has unconsciously settled into.

This is the feature that turns the tool from "AI that builds apps" into "AI pair designer that ships apps the user is proud to put their name on."

### Open questions

- File format — pure markdown, MDX with embedded examples, or a hybrid (frontmatter + markdown body)?
- How are subconscious-detected patterns surfaced — proactive notifications, a periodic "brain check-in" digest, both?
- Brain-vs-prompt conflict resolution — if the user prompts something contradicting the brain, does the agent push back, ask, or just comply?
- Token budget — full brain in every prompt is expensive. Aggressive slicing + retrieval is required. RAG over the brain, or hand-rolled context selection per task type?
- Brain commits — distinct commit kind from canvas commits in the [§9 DAG](#9-versioning--history--day-one-pillar)? Probably yes for filtering history.
- Pattern-detection model — does subconscious-detection run with the same model as the agent, or a cheaper one (e.g. `claude-haiku-4-5`) on a schedule?
- Brain *correction* path — when the agent makes a brain-inconsistent mutation and the user fixes it, does the fix get recorded as a counter-pattern automatically?
- **Org brain referencing** — git submodule, npm/jsr package, hosted service, or just a path? Submodules are friction; a hosted "org brain registry" feels right for v2.
- **Org override semantics** — does a project override *replace* an org rule, or *layer on top of* it? Probably layer-with-explicit-replace.
- **Org promotion ergonomics** — what's the UX for "promote this project pattern to org brain"? A button on the pattern, an agent suggestion, both?
- **Multiplayer brain conflicts** — two people editing `principles.md` at the same time. CRDT text merge via Yjs, or operational transform on the markdown? Likely the former.
- **Brain bankruptcy** — at some point the project brain accumulates contradictions. Is there an "audit my brain" agent action that flags inconsistencies and proposes consolidation?

---

## 14. Workspace UX — the actual UI of the tool

The user-facing surface area. Four primary regions, all multiplayer-shared, all designed around the [§1 design-prompter persona](#persona--design-prompter).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Top bar — project name, mode, deploy state, Brain, Settings, collaborators   │
├────────┬───────────────────────────────────────────────────┬─────────────────┤
│ Tools  │                                                   │ Inspector       │
│        │                  Canvas                           │  (selection-    │
│ Shapes │                                                   │   driven props) │
│ Vector │       [shapes, frames, screens, components]       │                 │
│ Text   │                                                   │ Comments        │
│ Frame  │                                                   │  (per-shape +   │
│ Pen    │                                                   │   per-canvas)   │
│ Sketch │                                                   │                 │
│ ...    │                                                   │                 │
├────────┴───────────────────────────────────────────────────┴─────────────────┤
│ Chat sidebar (threads)        │ Live preview (Sandpack /   │ Terminal        │
│  + multimodal + assignments   │   Snack with device frame) │  (xterm.js +    │
│                               │                            │   WebContainer) │
└───────────────────────────────┴────────────────────────────┴─────────────────┘
```

Panels are arrangeable, detachable, hideable. The default layout above is the starting point.

### Chat sidebar — the primary AI surface

- **Threaded conversations** — multiple parallel threads ("designing the home screen", "wiring auth", "fixing the transaction list"). Each thread has its own context window so contexts don't pollute each other.
- **Multimodal input** — text, voice, file/image attach, sketch (the [draw-to-visualize](#how-this-lives-alongside-1-from-earlier-sessions) pattern), screenshot of the canvas selection.
- **Assignment per message** — address to the AI agent (default) OR a specific collaborator (e.g. "@friend can you wire this to your transactions API?"). Acts like Slack mentions but threaded.
- **Streaming** — agent responses stream in, with the [§10 live cursor cinematic](#10-live-agent-cursors--streaming-choreography--the-magic-moment) playing on the canvas in parallel.
- **Inline brain reads/writes** — agent's chain-of-thought references brain files; the user can click through to inspect or edit them.
- **Slash commands** — `/run <terminal cmd>`, `/deploy`, `/brain edit principles`, `/preview iphone-15-pro`, etc. Power-user fast paths into other panels.

### Inspector — Dialkit-inspired properties panel

The selection-driven properties editor on the right rail. **Inspired by [DialKit by Josh Puckett](https://github.com/joshpuckett/dialkit)** — a floating control panel for React/Solid/Svelte/Vue with sliders, toggles, color pickers, spring editors, easing curves, keyboard shortcuts on every control, presets, and JSON export. Auto-detects control types from declarative config.

Two modes:
- **Embedded** in the right rail (default) — selection-aware, shows props for the selected shape/component/screen.
- **Floating popover** — pinnable to a control, draggable anywhere on the canvas. Useful for live-tuning during a design session.

We can either use DialKit directly (it has a React entry point) or build our inspector with its API and patterns as the model. Either way the lesson is the same: a comprehensive properties panel that surfaces every parameter without modal clicks. The bar is "every dial available immediately" — that's why a Figma-veteran user falls in love with it.

### Comments and notes — first-class, assignable to humans OR AI

Comments are a peer to design tools, not a feature buried in a panel.

- **Pinnable to anything** — a shape, a frame, a screen, a region, the whole canvas.
- **Threaded** with @-mentions, like Figma's model.
- **Assignable to a human** ("@friend please check the spacing here") OR **to the AI** ("@agent fix the contrast on this button per the brain's accessibility rules").
- **Status** — open / in-progress / resolved. Agent-assigned comments auto-update: in-progress when picked up, resolved when the agent commits the fix.
- **Inline notes** — lighter than comments; the designer's private scratchpad attached to a shape ("come back to this," "matches Stripe's invoice card pattern"). Optionally surfaced to collaborators.
- **Multiplayer** — all comments and notes broadcast through tldraw/sync ([§8](#8-multiplayer--day-one-pillar)) and live in the project's commit log ([§9](#9-versioning--history--day-one-pillar)).

The "**assign to AI**" pattern is uniquely powerful: comments become async tasks for the agent. The designer can leave 5 comments on a screen overnight and wake up to find them resolved with diffs to review. This turns the agent into a tireless overnight pair-designer.

### Web terminal — first-class for ops work

Working with third-party services (Firebase, Supabase, Stripe, Resend, etc.) is dramatically faster via their CLIs than via custom UI wrappers. The tool ships with a **first-class web terminal**, integrated into the conversational UI rather than tucked away as a developer feature.

- **Engine**: [xterm.js](https://xtermjs.org/) ([react-xtermjs](https://www.qovery.com/blog/react-xtermjs-a-react-library-to-build-terminals)) for the emulator + [WebContainer](https://webcontainers.io/) for the in-browser Node runtime. Real `npm`, real shells, real CLI invocations — all in the tab.
- **From chat** — `/run supabase migration new add_users` in the chat sidebar runs in the terminal panel. Output is visible in both surfaces. The agent can also issue terminal commands as tool calls and read their output.
- **From the terminal** — direct typing for power users.
- **Persistent per-project** — terminal session, cwd, env vars survive page reloads via WebContainer snapshot APIs.
- **Multiplayer-aware** — collaborators watch terminal output live (read-only for non-owners by default) or take turns at the prompt with explicit handoff.

This collapses another tool the user currently context-switches to (Terminal.app, iTerm) into the canvas. Combined with the live preview, the chat, and the inspector, the user genuinely doesn't have to leave the tool to design *and* ship.

### Open questions

- Inspector schema for components vs shapes vs screens — same panel layout with different config, or distinct schemas per kind?
- Voice input in chat — Whisper streaming or browser native? Probably the former for quality.
- Comment-to-AI conversion — does every "@agent" mention auto-queue a prompt, or does the user explicitly trigger?
- Terminal in mobile mode — does it run Expo CLI commands, EAS commands? Probably yes — that's a big unlock for the publish flow.
- Per-collaborator agent threads — does the friend have a separate thread with the agent, or shared threads with mentions?
- Use DialKit directly (and PR features upstream) vs build our own with its API as the model? Probably use directly for v1; fork later if needed.
- Sketch input in chat sidebar — same canvas as the main canvas (overlay), or a small dedicated sketch surface inside the chat?

---

## 14.5 Agent turn rhythm — the cognitive cadence

When the agent works, what does that feel like second-by-second? The §10 choreography covers what happens *on the canvas*; §14 covers the *chat sidebar surface*. This section covers the **shape of the LLM turn itself** — the interleaving of thinking, tool calls, speech, and tool results that make a turn feel alive instead of frozen.

**The problem this solves.** On 2026-04-21, a Sudoku-app build turn consumed 316 seconds inside a single reasoning block with zero tool calls emitted. The user saw a timer counting up and nothing else; the canvas never animated; the agent drafted the same service module twice in hidden thought; it re-decided `startGame('easy')` vs daily-challenge navigation five times; it wrote "OK, final answer, let me write the code now" four times without writing code. This is the "reasoning thinking" anti-pattern called out in [Junyang Lin's From Reasoning to Agentic Thinking](https://justinlin610.github.io/blog/from-reasoning-to-agentic-thinking/) — a monolithic internal monologue that never commits to action. For our product specifically this is catastrophic: the §10 cinematic is a *direct function* of tool-call cadence. Silent thinking = frozen canvas = dead product feel.

### Principle — reason through action, not monologue

Every thought worth more than a tactical aside becomes a visible artifact. Hidden reasoning stays short and snappy; anything deeper goes in a `think()` tool call, a `planTasks` checklist, or a `writeNote` entry. Tool-call frequency is a core product metric.

### The six levers (stacked, not alternatives)

| # | Lever | Surface | Mechanism |
|---|---|---|---|
| 1 | **Narration preamble** | system prompt | "Speak before your first action" rule — one short intent sentence before any tool call, no silent ramp-up. |
| 2 | **`think` as a callable tool** | API + UI | `think({topic, thought})` renders a small chip in chat (see §14). Discrete, visible, bounded. Replaces long hidden monologue for anything worth showing. |
| 3 | **Bounded reasoning bursts** | system prompt | Target ~600–900 reasoning tokens between actions. Longer = anti-pattern trigger. Enforced by prompt until Kimi/Claude expose a per-step `reasoning.max_tokens`. |
| 4 | **Interleaved thinking, not upfront** | API config | Think *after* each tool result, not all before the first one. "One move at a time" — one batch → read results → fresh short burst → next batch. |
| 5 | **Phase chips in the chat sidebar** | chat UI | Every turn decomposes into named, inspectable cards: plan → think → delegateScreen(×N) → reviewScreen → editScreen. The transcript *is* the progress indicator. |
| 6 | **Reasoning heartbeat** | chat UI | The hidden-reasoning block shows a live timer. After 15s it counts up; after 45s it shifts warning color; after 90s it reads "should act soon." Visual nudge back to cadence without interrupting. |

Kimi K2.6 does not expose a per-step reasoning budget, so lever 3 lives in the system prompt for now. If we port to Claude 4.7 later, `budget_tokens` per segment replaces the prompt rule cleanly. Lever 2 is the biggest unlock and is model-agnostic — a `think` tool is just a tool.

### Anti-patterns the agent should self-detect and break out of

- Drafting full code inside hidden thought that will be rewritten when actually emitted.
- Re-deciding the same option for the third time in one turn.
- Pondering edge cases the user didn't mention (e.g. mid-game save persistence on a prototype).
- "Let me think about…" → "Actually, let me…" → "Wait…" loops.
- Writing the same `delegateScreen` brief twice in hidden thought.

Escape hatch: when any of these fire, emit `planTasks` first (if not already planned) or `think({topic: "stuck picking X vs Y", thought: "committing to X because…"})` to convert the loop into an artifact. Then act.

### How this interlocks with the rest of the product

- **§10 choreography** — the cinematic is 100% downstream of cadence. When tool calls fire often, the canvas comes alive; when they don't, the choreographer has nothing to paint. Cadence is the upstream dependency of the magic moment.
- **§13 design brain** — "let me consult the brain" is a rumination trap if it stays hidden. Fix: brain reads are always explicit tool calls (`readNote`, future `readBrain`), visible as chips. Deep thought about brain content goes in `think`, not hidden reasoning.
- **§14 chat sidebar** — is the primary home of phase chips (lever 5). The ThinkCard, PlanCard, and ToolCallCard compose into a scannable turn transcript. Collapsed by default for completed turns; expandable for audit.
- **Design-prompter persona (§1)** — this persona lives on the canvas, not in a terminal. Unlike a coding-agent user who tolerates silence, Jip is watching every moment. Silence = dead product.

### What's shipped as of 2026-04-21 (session 11)

- **Lever 1** — Added `## Cadence — reason through action, not monologue` section to the orchestrator system prompt with six explicit rhythm rules and the anti-rumination trigger list. Updated the existing "Think between tool calls" line to point at the new rules.
- **Lever 2** — Added the `think` tool to the orchestrator tool surface (`app/api/chat/route.ts`). Client-side `ThinkCard` component renders it as a labeled chip in chat, topic always visible, thought body expandable. Added CSS (`oc-think-*`).
- **Lever 3 + 4** — Embedded in the prompt cadence rules (bounded bursts + interleaved-not-upfront + one-move-at-a-time). Waiting on a model-exposed per-step reasoning budget to enforce in code.
- **Lever 5** — `ThinkCard` joins the existing `PlanCard` and `ToolCallCard` as a phase-chip primitive. The message transcript is now the progress indicator.
- **Lever 6** — `ReasoningBlock` runs a 500ms heartbeat timer while streaming; label counts up after 15s; outer class escalates through `--warn-low / --warn-medium / --warn-high` at 15s / 45s / 90s thresholds (border color + text color shifts). Uses `--state-error` for the high level and accent-base for the earlier levels; no popups, just a visual nudge.

### Open questions

- What's the right default for "long" in the heartbeat? 15/45/90s is a guess; we should instrument and find out what real turns look like before tuning.
- Should the heartbeat *also* nudge the model via `<system-reminder>` after N seconds, or stay purely visual? A harness-level nudge is the Cline-style rejector; a visual-only one is the lighter Cursor-style. For a design tool, visual-only may be enough.
- Does `think` collapse or expand by default? Currently collapsed when streaming stops. For long turns with 4–6 think calls, should the last one stay open as "where the agent landed"?
- Sub-agent briefs — sub-agents run with thinking disabled for latency. Should the orchestrator be nudged (via prompt) to use `think` to WRITE the brief in chat *before* firing `delegateScreen`, so the user sees the reasoning?
- Retraining the model on our cadence is the Cursor path. Not on the table yet, but when is it?
- Heartbeat thresholds should probably be different per task class — a webSearch-heavy turn may take 30s legitimately; a trivial edit shouldn't hit 15s.
- Do we expose per-turn reasoning stats (tokens, tool calls, elapsed) as a post-turn footer so Jip can see the rhythm directly?

---

## 15. Open questions / parking lot

**Canvas / AI:**
- [ ] tldraw SDK license terms — confirm compatibility with our distribution plans.
- [ ] Multi-provider AI (Claude + OpenAI + Google) vs Claude-only for focus.
- [ ] How the sketch layer is serialized to the model (composited screenshot vs. separate image channel).
- [ ] R3F performance budget for many on-canvas 3D shapes.
- [ ] MCP integration — should the canvas itself be an MCP server so external agents can edit it?
- [ ] Export story — canvas → real React/Next.js project, Figma file, both?

**Multiplayer:**
- [ ] Cloudflare Durable Objects vs self-hosted Node for sync server (DO for v1, likely).
- [ ] Agent "bot user" identity — one global bot account, or per-canvas instance, or per-prompt ephemeral?
- [ ] Does the agent have a visible cursor/selection marker while working? (Probably yes — it's the point.)
- [ ] Rate-limiting AI tool-call mutations so they don't flood the sync channel during heavy generation.
- [ ] Conflict handling when the agent and a human edit the same shape simultaneously — who wins?

**Versioning:**
- [ ] Autosave frequency and retention policy — target storage cost per active canvas.
- [ ] DAG UI: visible git-graph vs linear timeline + named branches. Probably both views.
- [ ] Merge strategy for forked branches — punt to v2+; reconsider Loro/Automerge if this becomes essential.
- [ ] Per-user preview "head" pointer — broadcast via presence, or keep private?
- [ ] Can a commit be *partially* applied (cherry-pick a shape from a historical state)?

**Agent choreography:**
- [ ] Animate every tool call, or let "setup" tools (e.g. `batchUpdate`) commit silently?
- [ ] Ghost-shape collision: if a human edits the shape the agent is mid-drawing, who wins?
- [ ] Cursor path-finding — straight lines vs curves that avoid shapes. Start with straight lines.
- [ ] Max concurrent sub-agents before the cinematic becomes noise? Pencil caps at 6.
- [ ] Store full tool-call sequence in every `prompt` commit so cinematics can be replayed without re-calling the LLM.
- [ ] Is the choreographer deterministic enough for snapshot tests? Want yes.

**Hosting + org-brain physical form (deferred to dedicated session):**
- [ ] How is the tool itself hosted so a new user can "create a team" and have everything just work — single-tenant self-host vs multi-tenant SaaS vs hybrid?
- [ ] Where does the org/team brain physically live — git submodule, npm/jsr package, hosted "brain registry" service, just a path?
- [ ] How are project repos provisioned — auto-create on GitHub with our app installation, BYO repo, both?
- [ ] How are deploy connections (Vercel, Cloudflare, EAS) wired to a new org with zero friction?
- [ ] These four questions are entangled. Reserve a dedicated brainstorm session for the whole hosting/provisioning story rather than answering piecemeal.

**Target platforms (web / mobile / universal):**
- [ ] Mobile-specific primitives (safe area, nav bar, tab bar, gestures) — canvas-native shapes or render-at-preview-time only?
- [ ] Is gluestack enough for universal, or do we need per-platform overrides in the primitive system?
- [ ] Does every canvas project own a git repo from day one, or do we defer "write to disk"?
- [ ] Code editor as an inline canvas shape (edit-in-place) vs a dedicated panel. Probably both.
- [ ] Appetize cost for iOS/Android previews — pass through, eat it, or gate behind a plan? Snack's free web preview covers ~80% of cases.
- [ ] Live-reload target latency: canvas edit → regen → bundler → preview. Target sub-second.
- [ ] Two-way code ↔ canvas sync — V1 is generative one-way + AI-mediated. AST-aware bi-directional is V2.
- [ ] `design.md` is mode-aware — different template for web vs mobile vs universal? Different prompt injection rules per mode?

---

## 16. Changelog

- **2026-04-19** — Initial brainstorm doc. Researched canvas libraries, AI SDKs, preview runtimes, 3D embedding, design token tooling. Landed on tldraw + Vercel AI SDK + Claude + Sandpack + R3F + Tailwind v4 + shadcn/ui + Style Dictionary as the leaning stack.
- **2026-04-19 (session 2)** — Promoted multiplayer and versioning from "later" to day-one pillars. Transport: tldraw/sync on Cloudflare Durable Objects. Versioning: custom commit DAG over `TLStoreSnapshot`s, stored in Postgres + R2. Agent-as-bot-user becomes the flagship AI-multiplayer UX. Considered and rejected Automerge/Loro as the canonical store (would fight tldraw's framework); kept them as a future option for branch merging. Noted Liveblocks open-sourced their sync engine in Feb 2026, keeping them as a viable fallback.
- **2026-04-19 (session 3)** — Added §10 live agent cursors & streaming choreography. Three-stream architecture: Claude `input_json_delta` → our choreographer → tldraw/sync presence broadcast. Partial JSON parsing is the unlock — start animating cursor/ghost shapes before the tool call finishes. Defined `GhostShape` + `AgentCursor` primitives, pacing defaults, skip mode, and replay via stored tool-call payloads. Multi-agent orchestrator is v2 (cap at 6 agents per pencil.dev). Identified [openpencil](https://github.com/ZSeven-W/openpencil) as the closest open-source reference to study.
- **2026-04-19 (session 4)** — Added §11 "Targets: web, mobile, or universal app". Mode is picked at project creation and determines output framework (Next.js vs Expo vs Expo Router), component library (shadcn/ui vs gluestack vs gluestack), styling (Tailwind v4 vs NativeWind v5), preview (Sandpack vs Expo Snack with device-frame chrome), and deploy (Vercel vs EAS). Canvas, AI, choreographer, multiplayer, versioning are all mode-agnostic. Chose CodeMirror 6 over Monaco for the code editor (lighter, better mobile). Adopted "design-as-code" philosophy — canvas state lives as JSON in the user's repo alongside code, coequal views of the same git history. Two-way code↔canvas sync is V1 generative one-way + AI-mediated; AST-aware bi-directional is V2. Token pipeline via Style Dictionary + NativeWind v5 gives us zero-drift shared tokens for universal mode.
- **2026-04-19 (session 5)** — Vision crystallization, no implementation. Rewrote §1 as "North star — Figma × Claude Code, as one tool" with the full two-tool-collapse pitch, the financial-app north star scenario, the **design-prompter persona** (10+ yr Figma + 3 yr AI prompting + non-coding) paired with a **technical-but-not-frontend collaborator** (backend/infra eng), and the "real product, not artifact" output definition. Added a Figma-fluency translation table to §7 — auto-layout, vectors, frames, components, variants must feel as native here as in Figma. Added a "Ship — canvas to live product" subsection to §11 covering GitHub-from-day-one, Vercel/Cloudflare one-click web deploy, EAS Build/Submit/Update for mobile, and **backend integration via OpenAPI/GraphQL schema imports + data bindings on canvas elements** so the collaborator's APIs plug into the design surface. Explicitly noted: project is in **battle-test phase, not building yet** — focus all next sessions on validation, research, and refinement of BRAINSTORM.md, not scaffolding code.
- **2026-04-19 (session 6)** — Battle-test answers turned into operating principles + a major §13 rewrite. Added "Operating principles" subsection to §1 codifying the four ground rules: (1) built for one (Jip) opened to many; (2) no feasibility constraint, only sequencing — reframed all "delivery risk" language as phasing decisions; (3) competitors are inspiration not constraints; (4) the design brain is the soul. Softened the §1 fluency-bar callout from "biggest delivery risk" to "sequencing question." Replaced §13 entirely — was a 6-line "non-obvious bet" stub, now a full "Design brain — the soul of the tool" section: living model of the user's taste, captures conscious + subconscious decisions with the why and how, nested-file structure (brain/principles, voice, aesthetic, influences, decisions, patterns + systems/tokens, components, hierarchy, animations, spacing, typography + per-app artifacts/), three loading slices (always-on + task-relevant + project artifacts), two learning paths (direct edits + AI-detected pattern proposals via the §9 event log), three bootstrap paths (import references, inherit prior brain, Q&A interview), personal-vs-project brain distinction with promote-up flow. Eight new open questions on file format, conflict resolution, sharing model, token budget, brain-correction path. The brain is now framed as the deepest moat in the product.
- **2026-04-19 (session 7)** — Refined the §13 design brain model with four answers: (1) bootstrapping is **light start + continuous learning** — no heavy upfront Q&A, brain accumulates passively (AI-detected patterns) and actively (direct user writes); (2) the brain is **single-per-project, shared multiplayer by all collaborators** — no separate brain per role; (3) added an **org/team brain tier** (separate repo) layered above project brains, with project overrides winning on conflict and pattern-promotion flowing from project up to org — for solo users, an "org of one" carries personal taste across projects; (4) **direct read/write at any time** via a Brain panel (CodeMirror 6 markdown editor on the file tree, multiplayer-live, versioned through §9 DAG). Removed the previous "personal vs project brain" distinction — the org tier replaces it cleanly. Updated open questions: dropped the resolved sharing/v2-team question; added five new ones on org-referencing mechanics, override semantics, promotion UX, multiplayer markdown conflicts (likely Yjs text CRDT), and "brain bankruptcy" / consolidation audits.
- **2026-04-19 (session 9)** — **Switched out of brainstorm mode, started building.** Sprint 0 walking skeleton: Next.js 16.2 (Turbopack) + Tailwind v4 + tldraw 4.5 + AI SDK v6 + `@ai-sdk/anthropic` 3.0 scaffolded at the repo root. Single client-side `createShape` tool defined server-side (no `execute` → returns to client), handled via `useChat`'s `onToolCall` callback, applied through the tldraw `Editor` instance shared via React context (`EditorProvider` + `useEditorRef`). Server route uses `streamText` + `convertToModelMessages` (now async in v6) + `stepCountIs(8)` for multi-step tool loops. UI: full-screen tldraw canvas + floating chat panel (bottom-right). Type-check clean; dev server boots in 259ms; first page response 200 OK in 3s. Validated in-browser with Haiku 4.5: *"add three blue cards in a row"* → 3 blue rectangles at x=-212, 0, 212. *"a hero section with a big title, subtitle, and orange CTA"* → text + text + orange rect with "Get Started" label, vertically stacked. Loop confirmed end-to-end.
- **2026-04-19 (session 10)** — **Sprint 1: sketch-to-build.** Validates the §1 *draw-to-visualize* primitive. Added a "📎 Sketch" button in the chat panel that calls `editor.toImage(ids, { format: 'png', background: true, padding: 32, scale: 2 })` → blob → base64 data URL → attaches via AI SDK v6's `sendMessage({ text, files: [{ type: 'file', mediaType, url }] })`. Falls back to all shapes on the page if nothing selected. Updated system prompt to instruct Claude to read the sketch's layout/hierarchy/intent and rebuild it cleanly with shapes placed to the right of the original (around x=600). Chat-panel rendering now displays attached image thumbnails inline in the user-message bubble. Verified in-browser: drew a 4-shape wireframe (header / 2 cards / footer) → clicked Sketch → Claude correctly identified the structure ("a header bar at the top, two equal-width content boxes…") → emitted 4 createShape tool calls → rebuilt the layout cleanly to the right. Image thumbnail visible in chat bubble proves multimodal payload made it through cleanly. Haiku's structural fidelity is good; spacing/alignment is loose (would tighten with Sonnet/Opus). Next: Sprint 2 = live preview shape (Sandpack) so the canvas shows the actual running React next to the design.
- **2026-04-21 (session 11)** — **Agent turn rhythm.** Root-cause of a 316-second silent rumination turn while building a Sudoku app: hidden monolithic reasoning with zero tool calls, draft-code-in-thought, "OK final answer" repeated without writing code. Added new §14.5 **Agent turn rhythm — the cognitive cadence** capturing the diagnosis (reasoning-thinking vs agentic-thinking, Junyang Lin framing), the principle (reason through action, not monologue), the six levers, anti-patterns, and interlock with §10 choreography / §13 brain / §14 chat. Shipped five of six levers end-to-end: (1) added `## Cadence` section to the orchestrator system prompt with narrate-before-act rule + bounded-burst rule + one-move-at-a-time rule + anti-rumination triggers; (2) added `think({topic, thought})` tool to `app/api/chat/route.ts` + client-side `ThinkCard` + `oc-think-*` CSS — visible chip for every thought worth surfacing; (3, 4) embedded in prompt cadence rules (bounded bursts + interleaved-not-upfront), waiting on model-exposed per-step reasoning budget for code-level enforcement; (5) `ThinkCard` joins `PlanCard` and `ToolCallCard` as phase-chip primitives — transcript IS progress; (6) `ReasoningBlock` heartbeat: 500ms timer, elapsed seconds shown after 15s, outer class escalates through `--warn-low / --warn-medium / --warn-high` at 15s/45s/90s with border + text color shifts (accent-base → state-error). Tool-call frequency is now framed as a product metric, not an infra concern. Open questions: heartbeat threshold tuning, whether to add server-side `<system-reminder>` nudges, default expand state for the last `think` chip, whether to nudge the orchestrator to `think` before `delegateScreen` so the brief rationale is visible.
- **2026-04-19 (session 8)** — Big surface-area session. Added §8 **Roles & permissions** (viewer / editor / owner; every role sees the same UI, no siloed sub-UIs by job title). Added §11 **First-run flow** ("what are you building?" → mode pick → empty canvas with starter screens already scaffolded → chat sidebar primed; sub-minute time-to-first-canvas). Confirmed Expo Router universal mode for "build for web AND mobile from one codebase." Added `learnings.md` to the §13 brain structure (agent-maintained distillation rollup) and a fourth context slice (visual screenshot input — agent literally sees what it's working on). Created **NEW §14 "Workspace UX — the actual UI of the tool"** with four subsections: (a) chat sidebar with threads + multimodal + assignments + slash commands, (b) **inspector inspired by [DialKit by Josh Puckett](https://github.com/joshpuckett/dialkit)** — comprehensive properties panel, embedded or floating popover, (c) **comments + notes as first-class peer to design tools, assignable to humans OR AI** (agent-assigned comments auto-progress through open → in-progress → resolved as the agent works — turns the AI into a tireless overnight pair-designer), (d) **first-class web terminal** via xterm.js + WebContainer for working with third-party CLIs (Firebase/Supabase/Stripe/Resend), accessible via `/run` slash commands or direct typing, multiplayer-aware. Added a **Hosting + org-brain physical form** parking-lot block to §15 — entangled questions deferred to a dedicated session.

---

## 17. Sources

**Canvas / AI:**
- [tldraw SDK](https://tldraw.dev/)
- [tldraw GitHub](https://github.com/tldraw/tldraw)
- [Make Real — tldraw](https://github.com/tldraw/make-real)
- [Agent starter kit — tldraw](https://tldraw.dev/starter-kits/agent)
- [Make Real, the story so far](https://tldraw.dev/blog/make-real-the-story-so-far)
- [perfect-freehand](https://github.com/steveruizok/perfect-freehand)
- [Excalidraw vs tldraw vs Konva vs Fabric comparison](https://byby.dev/js-whiteboard-libs)
- [Vercel AI SDK](https://ai-sdk.dev/docs/introduction)
- [Vercel AI SDK 3 generative UI](https://vercel.com/blog/ai-sdk-3-generative-ui)
- [Claude Design by Anthropic Labs](https://www.anthropic.com/news/claude-design-anthropic-labs)

**Previews / 3D / design system:**
- [Sandpack](https://sandpack.codesandbox.io/)
- [StackBlitz WebContainers](https://webcontainers.io/)
- [react-three-fiber](https://github.com/pmndrs/react-three-fiber)
- [Style Dictionary](https://styledictionary.com/info/tokens/)
- [Tokens Studio](https://tokens.studio/blog/style-dictionary-v4-plan)

**Multiplayer:**
- [tldraw sync docs](https://tldraw.dev/docs/sync)
- [tldraw-sync-cloudflare template](https://github.com/tldraw/tldraw-sync-cloudflare)
- [Announcing tldraw sync](https://tldraw.dev/blog/announcing-tldraw-sync)
- [tldraw persistence docs](https://tldraw.dev/docs/persistence)
- [tldraw collaboration docs](https://tldraw.dev/docs/collaboration)
- [Liveblocks + tldraw example](https://liveblocks.io/examples/tldraw-whiteboard/nextjs-tldraw-whiteboard-storage)
- [What's new in Liveblocks — Feb 2026 (OSS sync engine)](https://liveblocks.io/blog/whats-new-in-liveblocks-february-2026)
- [How Figma's multiplayer technology works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)
- [Figma — Making multiplayer more reliable](https://www.figma.com/blog/making-multiplayer-more-reliable/)

**Workspace UX (chat / inspector / comments / terminal):**
- [DialKit by Josh Puckett](https://github.com/joshpuckett/dialkit) — floating control panel for React/Solid/Svelte/Vue, the inspector inspiration
- [Josh Puckett — DialKit page](https://joshpuckett.me/dialkit)
- [xterm.js](https://xtermjs.org/)
- [react-xtermjs (Qovery)](https://www.qovery.com/blog/react-xtermjs-a-react-library-to-build-terminals)
- [Figma — Guide to comments](https://help.figma.com/hc/en-us/articles/360039825314-Guide-to-comments-in-Figma)
- [Expo Router universal docs](https://expo.dev/router)

**Mobile / universal targets:**
- [Expo documentation](https://docs.expo.dev/)
- [Expo Snack — React Native in the browser](https://snack.expo.dev/)
- [Expo Snack — embedding docs](https://github.com/expo/snack/blob/main/docs/embedding-snacks.md)
- [Expo Snack — Appetize integration](https://deepwiki.com/expo/snack/6.2-appetize-integration)
- [Callstack — building the browser-based RN playground for Expo](https://www.callstack.com/case-studies/building-a-browser-based-react-native-playground-for-expo)
- [Appetize.io](https://appetize.io/)
- [EAS Update — OTA](https://docs.expo.dev/eas-update/introduction/)
- [qr.expo.dev — QR code generator](https://docs.expo.dev/more/qr-codes/)
- [5 Expo trends for 2026](https://www.xavor.com/blog/expo-framework-trends-for-react-native/)
- [NativeWind](https://www.nativewind.dev/)
- [NativeWind v5 overview](https://www.nativewind.dev/v5)
- [NativeWindUI](https://nativewindui.com/)
- [gluestack — universal RN + web components](https://gluestack.io/)
- [StackBlitz — Expo examples](https://stackblitz.com/edit/in-expo)
- [CodeMirror](https://codemirror.net/)
- [Monaco vs CodeMirror 6 comparison](https://agenthicks.com/research/codemirror-vs-monaco-editor-comparison)
- [Sourcegraph — migrating from Monaco to CodeMirror](https://sourcegraph.com/blog/migrating-monaco-codemirror)

**Agent choreography / streaming:**
- [pencil.dev](https://www.pencil.dev/)
- [openpencil — open-source AI-native canvas with agent teams](https://github.com/ZSeven-W/openpencil)
- [Pencil.dev review — "actually feels like magic"](https://mafazr.substack.com/p/pencildev-the-agentic-design-tool)
- [Tom Krcha — I watched 6 AI agents design an app together](https://creatoreconomy.so/p/i-watched-6-ai-agents-design-an-app-in-real-time-tom-krcha)
- [Claude — Fine-grained tool streaming (`input_json_delta`)](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming)
- [Claude — Streaming Messages](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Vercel AI SDK — Tools and Tool Calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [Streaming objects with Vercel AI SDK](https://www.aihero.dev/streaming-objects-with-vercel-ai-sdk)
- [AI SDK 3.3 — partialObjectStream improvements](https://vercel.com/blog/vercel-ai-sdk-3-3)
- [Figma — Agents, meet the Figma canvas](https://www.figma.com/blog/the-figma-canvas-is-now-open-to-agents/)

**Versioning / CRDT:**
- [Automerge](https://automerge.org/)
- [Automerge GitHub](https://github.com/automerge/automerge)
- [Automerge Repo](https://github.com/automerge/automerge-repo)
- [Loro homepage](https://loro.dev/)
- [Loro — versioning deep dive (DAG, frontiers, version vectors)](https://loro.dev/docs/advanced/version_deep_dive)
- [Loro GitHub](https://github.com/loro-dev/loro)
- [Yjs vs Loro comparison](https://discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567)
- [Inkandswitch Patchwork — history and diffs with Automerge](https://www.inkandswitch.com/patchwork/notebook/08/)
- [Rocicorp Zero](https://zero.rocicorp.dev/)
- [Replicache](https://replicache.dev/)
