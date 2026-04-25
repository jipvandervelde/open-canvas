import { streamText } from "ai";
import {
  CORE_RULES,
  pickPrinciplesForBrief,
} from "@/lib/design-principles";
import { kimi } from "@/lib/kimi";
import { buildAgentFraming } from "@/lib/agent-framing";

export const maxDuration = 60;

const SUB_AGENT_SYSTEM = `You are a focused React code generator. You output ONE screen's source for /App.js and NOTHING else — no prose, no code fences, no explanation. Your entire response must be valid JavaScript starting with either \`import\` or \`export default function\`.

IMPORTANT: you run without the thinking channel. The brief you receive IS your plan — the orchestrator (which does have thinking) has already decomposed the screen for you. Read every section of the brief carefully before writing. Do NOT invent structure the brief didn't specify. Do NOT substitute generic copy when the brief gave you exact strings — use those strings.

Expected brief format:

- **Structure**: top / body / bottom hierarchy. Render it literally.
- **Content**: exact user-visible strings. Use them verbatim.
- **Imports**: exact import paths the orchestrator has approved. Don't invent ones. Don't omit ones — if it's listed, use it.
- **Interactions**: every tap / input / navigation and its effect. Wire them up.
- **Visual**: tokens, spacing, motion presets. Reference them by the exact var() names listed.

If a section is missing from the brief, fall back to sensible defaults consistent with the principles files embedded in this prompt.

You are part of a team. The brief's Shared Context may list "Sibling screens" — screens being built right now by other sub-agents in parallel. When present, use this to make your output FEEL CONSISTENT with the rest of the batch: same top bar / tab bar pattern if the siblings have one, same card / list-row style, same typography hierarchy, same color usage, same spacing rhythm. The user's strongest quality signal is that the screens look like they belong together.

Rules:
- Plain React function component, default-exported: \`export default function App() { ... }\`.
- If you use any React hooks, the FIRST line MUST be \`import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';\` (import only the hooks you need, but always React itself).
- Inline styles via \`style={{ ... }}\`. No Tailwind. No CSS imports.
- Wrap the top-level element in \`<div style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column' }}>\` with the screen's background set on this wrapper so it bleeds edge-to-edge.
- Flex layout always. Never absolute positioning. Never margin-based horizontal alignment.
- When the shared context lists tokens, use them via \`var(--color-*)\`, \`var(--space-*)\`, \`var(--radius-*)\`, \`var(--font-*)\`.
- Import shared components (\`import Name from './components/Name';\`), services (\`import { useSession } from './services/session';\`, \`import { Link, useParams } from './services/router';\`, \`import { useToast } from './services/toast';\`), motion presets (\`import { Motion, MotionList } from './motion';\`), and data entities (\`import { recipes, findRecipe } from './data/recipes';\`) from the paths listed in the shared context. Do NOT invent imports — only use what's listed.
- For list screens, import the data entity and render rows from it. For detail screens, \`const { id } = useParams();\` then \`find{Singular}(id)\`. For list→detail links use querystring params: \`<Link to={\\\`/name-detail?id=\${item.id}\\\`}>\`.
- Default font: \`fontFamily: 'system-ui, -apple-system, sans-serif'\`.
- Mobile screens: edge-to-edge layout like a native app (top bar → content → bottom actions). Not centered cards.
- Use the full viewport intentionally: distribute content vertically, don't cluster in the middle with empty top/bottom.
- Realistic placeholder content, not Lorem ipsum.
- Semantic HTML where natural.
- No external packages beyond react, react-dom, framer-motion, and the project's local ./components, ./services, ./data, ./motion, ./routes.

Output ONLY the source code of /App.js. No markdown, no preamble, no closing commentary.`;

const VIEWPORT_LABELS: Record<string, string> = {
  "iphone-17": "393×852 (iPhone 17)",
  "iphone-17-pro": "402×874 (iPhone 17 Pro — default)",
  "iphone-17-pro-max": "440×956 (iPhone 17 Pro Max)",
  ipad: "820×1180 (iPad)",
  "desktop-1280": "1280×800 (Desktop)",
  "desktop-1536": "1536×960 (Desktop)",
  custom: "custom",
};

export async function POST(req: Request) {
  const {
    name,
    viewportId,
    brief,
    sharedContext,
    modelId,
    disabledSkills,
    projectDoc,
    designDoc,
    tokens,
    componentTokens,
    iconStyle,
  }: {
    name: string;
    viewportId: string;
    brief: string;
    sharedContext?: string;
    modelId?: string;
    disabledSkills?: string[];
    projectDoc?: string;
    designDoc?: string;
    tokens?: import("@/lib/agent-framing").TokensSnapshot;
    componentTokens?: import(
      "@/lib/design-component-tokens-store"
    ).ComponentTokens;
    iconStyle?: import("@/lib/agent-framing").IconStyleSnapshot;
  } = await req.json();
  const disabledSet = new Set(disabledSkills ?? []);

  // Pick the 1–2 principle files most relevant to this screen (mobile →
  // touch-accessibility; form-ish brief → forms-controls; list/feed →
  // performance; etc.). Full body gets embedded so the sub-agent can
  // apply specifics, not just headlines.
  const principles = await pickPrinciplesForBrief({
    viewportId,
    brief,
    sharedContext,
    disabledSkills: disabledSet,
  });
  const principlesBlock =
    principles.length > 0
      ? "\n\nDesign engineering principles to apply for this screen (READ BEFORE WRITING CODE — these are how the user evaluates quality):\n\n" +
        principles
          .map((p) => `=== ${p.title} (${p.slug}) ===\n${p.body}`)
          .join("\n\n---\n\n")
      : "";

  const prompt = [
    `Screen name: ${name}`,
    `Viewport: ${VIEWPORT_LABELS[viewportId] ?? viewportId}`,
    "",
    "Brief:",
    brief,
    sharedContext ? "\nShared context:\n" + sharedContext : "",
    principlesBlock,
  ]
    .filter(Boolean)
    .join("\n");

  // Sub-agents run Kimi K2.6 with thinking OFF — first-token latency matters
  // here because the user watches code stream into the screen live. Thinking
  // delays the first visible character by several seconds; better to stream
  // immediately and let the orchestrator (which keeps thinking ON) handle
  // any reflection before + after the batch. `modelId` is accepted but
  // ignored — the whole pipeline is locked on k2.6.
  void modelId;

  const result = streamText({
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
      SUB_AGENT_SYSTEM +
      "\n\n---\n\n" +
      CORE_RULES,
    prompt,
  });

  // Plain text stream — the client reads raw React source and pipes it into
  // the target screen's `code` prop live, so the Sandpack iframe compiles
  // and renders as the sub-agent writes.
  //
  // Usage piggyback: the orchestrator needs to know how many tokens this
  // sub-agent consumed for its running total. Since the stream payload is
  // raw JS source (not an envelope), we append a trailing comment sentinel
  // `/*__OC_USAGE__:{...}*/` after the code is done streaming. The client
  // strips this marker before normalization so it never reaches Sandpack.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of result.textStream) {
          controller.enqueue(encoder.encode(chunk));
        }
        try {
          const usage = await result.totalUsage;
          if (usage) {
            const payload = {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              reasoningTokens: usage.reasoningTokens,
              totalTokens: usage.totalTokens,
            };
            controller.enqueue(
              encoder.encode(
                `\n/*__OC_USAGE__:${JSON.stringify(payload)}*/\n`,
              ),
            );
          }
        } catch {
          /* usage unresolved — don't block the stream close */
        }
      } catch (err) {
        controller.error(err);
        return;
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
