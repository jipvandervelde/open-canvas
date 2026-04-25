/**
 * Reviewer — runs as an AGENT, not a one-shot streamText call.
 *
 * The old implementation was a single generate-and-emit-JSON pass: the model
 * reasoned silently for tens of seconds and only spoke at the very end. That
 * matched exactly the "monolithic thinking" anti-pattern the BRAINSTORM §14.5
 * calls out. The fix is to let the reviewer drive its own cadence via tools
 * — think, flagIssue, spawnSubReviewer, finalize — so each artifact becomes
 * a visible streaming event instead of hidden rumination.
 *
 * Pipeline shape:
 *   1. streamText({ thinking: true, stopWhen: stepCountIs(20), tools: {...} })
 *   2. Walk fullStream — forward reasoning / text deltas, and detect
 *      tool-call events (think / flagIssue / finalize / spawnSubReviewer).
 *   3. Each tool with `execute` runs server-side and the result flows back
 *      to the model automatically for the next step (AI SDK handles the
 *      multi-step loop, preserving Kimi's `reasoning_content` between
 *      turns — required by K2.6 when thinking is on).
 *   4. At end, emit the aggregated { summary, issues } payload in the
 *      backward-compatible `done` event so ReviewScreenCard still works.
 *
 * Sub-reviewers: spawnSubReviewer({focus}) POSTs to
 * /api/review-screen/focused, which runs a thinking-OFF focused pass and
 * returns JSON issues. The parent reviewer then decides which of those
 * to promote into its own aggregate (via flagIssue) — it doesn't blindly
 * merge, because the parent has the cross-cutting context and can drop
 * low-value duplicates.
 *
 * NDJSON events the client consumes:
 *   { kind: "reasoning", delta }                             // hidden thought
 *   { kind: "text", delta }                                  // visible text (rare)
 *   { kind: "think", topic, thought }                        // visible chip
 *   { kind: "issue", issue: { severity, category, ... } }    // accumulate live
 *   { kind: "sub-reviewer-start", focus }                    // card decoration
 *   { kind: "sub-reviewer-done", focus, issueCount, error? }
 *   { kind: "summary", summary }                             // finalize tool
 *   { kind: "done", ok, reasoning, text, parsed }            // final payload
 *   { kind: "error", error }
 */

import { streamText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { kimi } from "@/lib/kimi";
import {
  CORE_RULES,
  REVIEW_CHECKLIST,
  pickPrinciplesForBrief,
} from "@/lib/design-principles";
import { buildAgentFraming } from "@/lib/agent-framing";

export const maxDuration = 120;

const FOCUS_SLUGS = [
  "accessibility",
  "motion",
  "forms",
  "layout",
  "visual-consistency",
  "navigation",
] as const;
type FocusSlug = (typeof FOCUS_SLUGS)[number];

const REVIEWER_SYSTEM = `You are a senior design engineer reviewing ONE React screen against a design-engineering rubric. You work as an AGENT — you do not dump a wall of JSON at the end. You drive the review via tool calls so each issue lands as a visible artifact the moment you find it.

## Your tools

- **think({ topic, thought })** — Surface ONE short unit of reasoning as a visible chip. Use when you just decided WHAT to focus on, found a pattern worth calling out, or explain your prioritization. 1–3 sentences. Not a replacement for flagIssue — think is a preamble, not an issue.
- **flagIssue({ severity, category, location, problem, fix })** — Emit ONE specific issue. Fire this AS SOON AS you spot an issue — don't wait until the end. Severity: high (actually broken / inaccessible), medium (clear polish miss), low (nit). Fix must be a concrete one-liner, not "improve X".
- **spawnSubReviewer({ focus })** — Fan out a narrower, thinking-OFF focused review on ONE category. Returns that category's issues. Use when the screen has enough surface area that a specialist will catch things you'd miss. Valid focuses: ${FOCUS_SLUGS.join(", ")}. You can fire multiple spawnSubReviewer calls in ONE turn to fan out in parallel.
- **finalize({ summary })** — Call this EXACTLY ONCE as your last action. One short sentence — overall verdict.

## Cadence rules — non-negotiable

1. **Don't ruminate.** If you catch yourself planning all the issues in hidden thought before emitting any tool call, STOP. Emit \`think({topic: "triaging", thought: "..."})\` or fire the first flagIssue right now.
2. **One issue per tool call.** Don't batch — each flagIssue is a separate streaming artifact. The user watches them arrive.
3. **Prefer spawning specialists when useful.** For a screen with a form, a tab bar, and animations, spawn the forms + motion focused reviewers early; they run in parallel while you scan for cross-cutting issues.
4. **Max 8 issues total** (your own flagIssue calls + sub-reviewer issues you keep). Be picky — surface the worst offenders.
5. **Always end with finalize({ summary })**. Without it the loop won't close cleanly.

## Prioritization

- High: accessibility blockers (no aria-label on icon-only, tap target < 44px, form input < 16px), navigation broken (list→detail params missing), data-flow bugs.
- Medium: visual inconsistency with siblings, \`transition: all\`, layout shift, missing focus state.
- Low: token drift, spacing nits, copy polish.

## Scope

Consider ONLY the screen you're looking at. Do not invent cross-screen issues unless the source itself makes them obvious.`;

export async function POST(req: Request) {
  const {
    screenName,
    viewportId,
    code,
    brief,
    disabledSkills,
    projectDoc,
    designDoc,
    tokens,
    componentTokens,
    iconStyle,
  }: {
    screenName: string;
    viewportId: string;
    code: string;
    brief?: string;
    disabledSkills?: string[];
    projectDoc?: string;
    designDoc?: string;
    tokens?: import("@/lib/agent-framing").TokensSnapshot;
    componentTokens?: import(
      "@/lib/design-component-tokens-store"
    ).ComponentTokens;
    iconStyle?: import("@/lib/agent-framing").IconStyleSnapshot;
  } = await req.json();

  // Pull the same contextual principle files the builder saw so the reviewer
  // checks against the right rubric (form screens get forms-controls, etc).
  const principles = await pickPrinciplesForBrief({
    viewportId,
    brief: brief ?? screenName,
    disabledSkills: new Set(disabledSkills ?? []),
  });
  const principlesBlock = principles
    .map((p) => `=== ${p.title} (${p.slug}) ===\n${p.body}`)
    .join("\n\n---\n\n");

  const prompt = `Screen name: ${screenName}
Viewport: ${viewportId}
${brief ? `\nBrief the builder received:\n${brief}\n` : ""}

--- Screen source (/App.js) ---
${code}

--- Principles (your rubric) ---
${CORE_RULES}

---

${REVIEW_CHECKLIST}

---

${principlesBlock}

Begin. Think → flagIssue → (maybe) spawnSubReviewer → more flagIssue → finalize.`;

  const encoder = new TextEncoder();

  // Deduce an origin for the sub-reviewer fetch. When deployed we can rely
  // on the request's origin; locally this resolves to http://localhost:3000.
  const originHint = req.headers.get("origin") ?? new URL(req.url).origin;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* controller may already be closed on abort — ignore */
        }
      };

      // The reviewer's aggregate of issues, accumulated across every
      // flagIssue call AND any sub-reviewer results the agent chose to
      // promote. We return this in the final `done` payload for the
      // backward-compatible ReviewScreenCard contract.
      const aggregate: Array<{
        severity: string;
        category: string;
        location: string;
        problem: string;
        fix: string;
      }> = [];
      let finalSummary = "";
      // Cumulative usage from every focused sub-reviewer fetch. Added on
      // top of the parent reviewer's own usage at the end so the client
      // sees one authoritative number for the whole review subtree.
      const subUsage = {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
      };

      try {
        const result = streamText({
          model: kimi({ thinking: true }),
          system:
            buildAgentFraming({
              projectDoc,
              designDoc,
              tokens,
              componentTokens,
              iconStyle,
            }) +
            "\n\n---\n\n" +
            REVIEWER_SYSTEM,
          prompt,
          stopWhen: stepCountIs(20),
          tools: {
            think: tool({
              description:
                "Show ONE discrete unit of reasoning as a visible chip. 1-3 sentences. User-facing.",
              inputSchema: z.object({
                topic: z.string().describe("2-6 word header."),
                thought: z
                  .string()
                  .describe("1-3 sentence specific, no-hedging thought."),
              }),
              execute: async ({ topic, thought }) => {
                emit({ kind: "think", topic, thought });
                return { ok: true };
              },
            }),
            flagIssue: tool({
              description:
                "Emit ONE specific issue immediately. Severity high|medium|low. Category should name the principle area. Fix must be a concrete one-liner.",
              inputSchema: z.object({
                severity: z.enum(["high", "medium", "low"]),
                category: z
                  .string()
                  .describe(
                    "Principle area — e.g. accessibility, layout, motion, forms, visual, consistency, data, navigation.",
                  ),
                location: z
                  .string()
                  .describe(
                    "Short hint: 'submit button', 'recipe card row', 'top app bar'.",
                  ),
                problem: z.string().describe("What's wrong — specific."),
                fix: z
                  .string()
                  .describe(
                    "Concrete one-line instruction for updateScreen / editScreen.",
                  ),
              }),
              execute: async (issue) => {
                aggregate.push(issue);
                emit({ kind: "issue", issue });
                return { ok: true, total: aggregate.length };
              },
            }),
            spawnSubReviewer: tool({
              description:
                "Fan out a focused, thinking-OFF sub-reviewer on ONE category. Returns that category's issues. Fire multiple in parallel when the screen has enough surface.",
              inputSchema: z.object({
                focus: z
                  .enum(FOCUS_SLUGS)
                  .describe(`Category for the sub-reviewer.`),
              }),
              execute: async ({ focus }) => {
                emit({ kind: "sub-reviewer-start", focus });
                try {
                  const subRes = await fetch(
                    `${originHint}/api/review-screen/focused`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        screenName,
                        viewportId,
                        code,
                        focus,
                      }),
                    },
                  );
                  const data = (await subRes.json()) as {
                    ok: boolean;
                    focus: string;
                    issues?: Array<{
                      severity?: string;
                      location?: string;
                      problem?: string;
                      fix?: string;
                    }>;
                    error?: string;
                    usage?: {
                      inputTokens?: number;
                      outputTokens?: number;
                      reasoningTokens?: number;
                      totalTokens?: number;
                    };
                  };
                  if (data.usage) {
                    subUsage.inputTokens += data.usage.inputTokens ?? 0;
                    subUsage.outputTokens += data.usage.outputTokens ?? 0;
                    subUsage.reasoningTokens += data.usage.reasoningTokens ?? 0;
                    subUsage.totalTokens += data.usage.totalTokens ?? 0;
                  }
                  if (!data.ok) {
                    emit({
                      kind: "sub-reviewer-done",
                      focus,
                      issueCount: 0,
                      error: data.error ?? "sub-reviewer failed",
                    });
                    return {
                      ok: false,
                      focus,
                      error: data.error ?? "sub-reviewer failed",
                      issues: [],
                    };
                  }
                  const issues = data.issues ?? [];
                  emit({
                    kind: "sub-reviewer-done",
                    focus,
                    issueCount: issues.length,
                  });
                  return { ok: true, focus, issues };
                } catch (err) {
                  const message = String(err);
                  emit({
                    kind: "sub-reviewer-done",
                    focus,
                    issueCount: 0,
                    error: message,
                  });
                  return { ok: false, focus, error: message, issues: [] };
                }
              },
            }),
            finalize: tool({
              description:
                "Call EXACTLY ONCE as your last action. One-sentence overall verdict.",
              inputSchema: z.object({
                summary: z.string().describe("One short sentence — verdict."),
              }),
              execute: async ({ summary }) => {
                finalSummary = summary;
                emit({ kind: "summary", summary });
                return { ok: true };
              },
            }),
          },
        });

        let reasoning = "";
        let text = "";

        for await (const part of result.fullStream) {
          const anyPart = part as unknown as {
            type: string;
            text?: string;
            delta?: string;
            error?: unknown;
          };
          if (anyPart.type === "text-delta") {
            const delta = anyPart.text ?? anyPart.delta ?? "";
            if (delta) {
              text += delta;
              emit({ kind: "text", delta });
            }
          } else if (anyPart.type === "reasoning-delta") {
            const delta = anyPart.text ?? anyPart.delta ?? "";
            if (delta) {
              reasoning += delta;
              emit({ kind: "reasoning", delta });
            }
          } else if (anyPart.type === "error") {
            emit({
              kind: "error",
              error: String(anyPart.error ?? "reviewer error"),
            });
          }
          // tool-call / tool-result / tool-input-delta events also flow
          // through fullStream, but we already surface them via each tool's
          // execute() → emit() call above. Skipping them here avoids
          // double-emission.
        }

        // Usage — resolved once the stream finishes. Emitted BEFORE `done`
        // so the client-side reader always has the usage line ahead of the
        // terminal event it keys off of. We combine the parent reviewer's
        // own usage with the sum of every focused sub-reviewer we spawned
        // so the client sees a single authoritative number for the whole
        // review subtree.
        try {
          const own = await result.totalUsage;
          const combined = {
            inputTokens:
              (own?.inputTokens ?? 0) + subUsage.inputTokens,
            outputTokens:
              (own?.outputTokens ?? 0) + subUsage.outputTokens,
            reasoningTokens:
              (own?.reasoningTokens ?? 0) + subUsage.reasoningTokens,
            totalTokens:
              (own?.totalTokens ?? 0) + subUsage.totalTokens,
          };
          emit({ kind: "usage", usage: combined });
        } catch {
          // If own usage fails to resolve, still report any sub-reviewer
          // usage we accumulated so totals don't silently regress.
          if (subUsage.totalTokens > 0) {
            emit({ kind: "usage", usage: subUsage });
          }
        }

        // Final payload: backward-compatible with the old `{summary, issues}`
        // contract so ReviewScreenCard keeps working without changes.
        emit({
          kind: "done",
          ok: true,
          reasoning,
          text,
          parsed: {
            summary: finalSummary || "Review complete.",
            issues: aggregate,
          },
        });
      } catch (err) {
        emit({ kind: "error", error: String(err) });
        // Also emit a best-effort done so the client doesn't hang on the
        // reviewStreamStore "streaming" status indefinitely.
        emit({
          kind: "done",
          ok: false,
          error: String(err),
          parsed: { summary: "Review failed.", issues: aggregate },
        });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
