/**
 * Reviewer orchestration.
 *
 * The top-level reviewer is intentionally shallow: one thinking-OFF scout
 * pass chooses the relevant focus lanes, then focused thinking-OFF reviewers
 * run in parallel. This avoids the old failure mode where one reviewer spent
 * most of the wall time inside its own thinking context before delegating.
 */

import { generateText } from "ai";
import { kimi } from "@/lib/kimi";
import {
  CORE_RULES,
  REVIEW_CHECKLIST,
  pickPrinciplesForBrief,
} from "@/lib/design-principles";
import { buildAgentFraming } from "@/lib/agent-framing";

export const maxDuration = 90;

const FOCUS_SLUGS = [
  "accessibility",
  "motion",
  "forms",
  "layout",
  "visual-consistency",
  "navigation",
] as const;
type FocusSlug = (typeof FOCUS_SLUGS)[number];

type Issue = {
  severity: string;
  category: string;
  location: string;
  problem: string;
  fix: string;
};

type Usage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

type ScoutResult = {
  summary: string;
  focuses: Array<{ focus: FocusSlug; reason: string }>;
};

const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
};

const SCOUT_SYSTEM = `You are a fast review scout for ONE React screen.

Your job is NOT to fully review the screen. Do one quick pass and choose the focused reviewers that should inspect it further.

Output ONLY valid JSON, no prose, no code fences:

{
  "summary": "one short scout summary",
  "focuses": [
    { "focus": "accessibility" | "motion" | "forms" | "layout" | "visual-consistency" | "navigation", "reason": "why this lane matters for this screen" }
  ]
}

Rules:
- Choose 2-4 focus lanes normally; choose 5 only for complex screens with forms + navigation + animation.
- Include "forms" when the screen has inputs, controls, or submit flows.
- Include "navigation" when it imports router/data, links to other screens, is part of checkout/onboarding/detail flows, or displays shared transactional values.
- Include "motion" only when the code uses framer-motion, transitions, animations, pressed transforms, or dynamic show/hide states.
- Include "layout" for dense mobile screens, long lists, sticky bottom actions, images, or dynamic numeric content.
- Include "accessibility" for icon-only controls, forms, images, tappable list rows, or unclear buttons.
- Include "visual-consistency" when the screen uses many raw values, repeated surfaces, token-heavy styling, or should match siblings.
- Do not list duplicate focuses.`;

function isFocus(value: unknown): value is FocusSlug {
  return (
    typeof value === "string" &&
    (FOCUS_SLUGS as readonly string[]).includes(value)
  );
}

function addUsage(total: Usage, next?: Partial<Usage>) {
  if (!next) return;
  total.inputTokens += next.inputTokens ?? 0;
  total.outputTokens += next.outputTokens ?? 0;
  total.reasoningTokens += next.reasoningTokens ?? 0;
  total.totalTokens += next.totalTokens ?? 0;
}

function parseScout(text: string): ScoutResult | null {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:\w+)?\n/, "").replace(/\n```\s*$/, "");
  }
  const open = cleaned.indexOf("{");
  const close = cleaned.lastIndexOf("}");
  if (open < 0 || close <= open) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(open, close + 1)) as {
      summary?: unknown;
      focuses?: unknown;
    };
    if (!Array.isArray(parsed.focuses)) return null;
    const seen = new Set<FocusSlug>();
    const focuses: ScoutResult["focuses"] = [];
    for (const item of parsed.focuses) {
      const row = item as { focus?: unknown; reason?: unknown };
      if (!isFocus(row.focus) || seen.has(row.focus)) continue;
      seen.add(row.focus);
      focuses.push({
        focus: row.focus,
        reason:
          typeof row.reason === "string" && row.reason.trim()
            ? row.reason.trim()
            : "Relevant to this screen.",
      });
    }
    if (focuses.length === 0) return null;
    return {
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : "Scout selected focused review lanes.",
      focuses,
    };
  } catch {
    return null;
  }
}

function heuristicScout(code: string, brief?: string): ScoutResult {
  const haystack = `${brief ?? ""}\n${code}`.toLowerCase();
  const picks: ScoutResult["focuses"] = [
    {
      focus: "layout",
      reason: "Baseline layout, safe-area, numeric, and image checks apply to every generated screen.",
    },
    {
      focus: "visual-consistency",
      reason: "Generated screens often drift on tokens, surfaces, spacing, and typography.",
    },
  ];

  if (
    /\b(input|textarea|select|form|checkbox|switch|radio|password|email|submit)\b/.test(
      haystack,
    )
  ) {
    picks.push({
      focus: "forms",
      reason: "The code appears to include form fields or submit/control behavior.",
    });
  }
  if (
    /\b(link|navigate|useparams|router|href|detail|checkout|cart|order|confirmation|payment|data\/)\b/.test(
      haystack,
    )
  ) {
    picks.push({
      focus: "navigation",
      reason: "The screen appears to participate in navigation, shared data, or a transactional flow.",
    });
  }
  if (/\b(framer|motion|transition|animation|transform|opacity)\b/.test(haystack)) {
    picks.push({
      focus: "motion",
      reason: "The code includes motion or transition-related behavior.",
    });
  }
  if (/\b(button|aria-|img|image|icon|onclick|role=|alt=)\b/.test(haystack)) {
    picks.push({
      focus: "accessibility",
      reason: "The screen has interactive controls, icons, or images that need accessibility checks.",
    });
  }

  const seen = new Set<FocusSlug>();
  return {
    summary: "Heuristic scout selected focused review lanes.",
    focuses: picks.filter((p) => {
      if (seen.has(p.focus)) return false;
      seen.add(p.focus);
      return true;
    }).slice(0, 5),
  };
}

function dedupeIssues(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  const severityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  for (const issue of issues.sort(
    (a, b) =>
      (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3),
  )) {
    const key = `${issue.category}:${issue.location}:${issue.problem}`
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
    if (out.length >= 8) break;
  }
  return out;
}

export async function POST(req: Request) {
  const {
    screenName,
    viewportId,
    code,
    memoryContext,
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
    memoryContext?: string;
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

  const principles = await pickPrinciplesForBrief({
    viewportId,
    brief: brief ?? screenName,
    disabledSkills: new Set(disabledSkills ?? []),
  });
  const principlesBlock = principles
    .map((p) => `=== ${p.title} (${p.slug}) ===\n${p.body}`)
    .join("\n\n---\n\n");

  const encoder = new TextEncoder();
  const originHint = req.headers.get("origin") ?? new URL(req.url).origin;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* controller may already be closed */
        }
      };

      const totalUsage: Usage = { ...EMPTY_USAGE };

      try {
        emit({
          kind: "think",
          topic: "scouting",
          thought:
            "Running a quick pass to choose focused review lanes, then delegating those checks in parallel.",
        });

        let scout = heuristicScout(code, brief);
        try {
          const scoutPrompt = `Screen name: ${screenName}
Viewport: ${viewportId}
${brief ? `\nBuilder brief:\n${brief}\n` : ""}
${memoryContext ? `\nStructured screen/flow memory:\n${memoryContext}\n` : ""}

--- /App.js ---
${code}

--- Review rules available to focused reviewers ---
${CORE_RULES}

${REVIEW_CHECKLIST}

${principlesBlock}

Choose the focused review lanes now.`;

          const scoutRes = await generateText({
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
              SCOUT_SYSTEM,
            prompt: scoutPrompt,
          });
          addUsage(totalUsage, scoutRes.usage);
          scout = parseScout(scoutRes.text) ?? scout;
        } catch {
          /* heuristic scout is good enough */
        }

        emit({
          kind: "think",
          topic: "delegating",
          thought: `${scout.summary} Delegating: ${scout.focuses
            .map((f) => f.focus)
            .join(", ")}.`,
        });

        const issues: Issue[] = [];
        await Promise.all(
          scout.focuses.map(async ({ focus, reason }) => {
            emit({ kind: "sub-reviewer-start", focus, reason });
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
                    memoryContext,
                    focus,
                    brief,
                    hint: reason,
                    projectDoc,
                    designDoc,
                    tokens,
                    componentTokens,
                    iconStyle,
                  }),
                },
              );
              const data = (await subRes.json()) as {
                ok: boolean;
                focus: string;
                issues?: Array<Partial<Issue>>;
                error?: string;
                usage?: Partial<Usage>;
              };
              addUsage(totalUsage, data.usage);
              if (!data.ok) {
                emit({
                  kind: "sub-reviewer-done",
                  focus,
                  issueCount: 0,
                  error: data.error ?? "sub-reviewer failed",
                });
                return;
              }
              const found = (data.issues ?? [])
                .map((issue): Issue => ({
                  severity: issue.severity ?? "low",
                  category: issue.category ?? focus,
                  location: issue.location ?? "",
                  problem: issue.problem ?? "",
                  fix: issue.fix ?? "",
                }))
                .filter((issue) => issue.problem && issue.fix);
              issues.push(...found);
              emit({
                kind: "sub-reviewer-done",
                focus,
                issueCount: found.length,
              });
              for (const issue of found) {
                emit({ kind: "issue", issue });
              }
            } catch (err) {
              emit({
                kind: "sub-reviewer-done",
                focus,
                issueCount: 0,
                error: String(err),
              });
            }
          }),
        );

        const aggregate = dedupeIssues(issues);
        const summary =
          aggregate.length > 0
            ? `Review complete: ${aggregate.length} issue${aggregate.length === 1 ? "" : "s"} found across ${scout.focuses.length} focused pass${scout.focuses.length === 1 ? "" : "es"}.`
            : `Review complete: no material issues found across ${scout.focuses.length} focused pass${scout.focuses.length === 1 ? "" : "es"}.`;

        emit({ kind: "summary", summary });
        emit({ kind: "usage", usage: totalUsage });
        emit({
          kind: "done",
          ok: true,
          reasoning: "",
          text: "",
          parsed: {
            summary,
            issues: aggregate,
          },
        });
      } catch (err) {
        emit({ kind: "error", error: String(err) });
        emit({
          kind: "done",
          ok: false,
          error: String(err),
          parsed: { summary: "Review failed.", issues: [] },
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
