import { generateText } from "ai";
import { kimi } from "@/lib/kimi";
import { buildAgentFraming } from "@/lib/agent-framing";

export const maxDuration = 60;

type FlowScreen = {
  id: string;
  name: string;
  viewportId: string;
  code: string;
};

type FlowIssue = {
  severity: "high" | "medium" | "low";
  category: string;
  screens: string[];
  location: string;
  problem: string;
  fix: string;
};

const FLOW_REVIEW_SYSTEM = `You are a fast multi-screen flow reviewer. You do NOT review visual polish in depth. You only inspect whether a group of generated React screens behaves like one connected product flow.

Output ONLY valid JSON, no prose, no code fences:

{
  "summary": "one short flow summary",
  "issues": [
    {
      "severity": "high" | "medium" | "low",
      "category": "data-flow" | "navigation" | "shared-service" | "shared-component" | "state" | "content-consistency",
      "screens": ["screen names affected"],
      "location": "short location hint",
      "problem": "specific cross-screen mismatch",
      "fix": "one concrete instruction for the orchestrator"
    }
  ]
}

Rules:
- Max 10 issues. Prefer high-signal cross-screen bugs over local polish.
- HIGH: totals/order ids/address/payment/cart counts differ across screens, list→detail data cannot match, checkout/order state is hardcoded per screen, or route links are dead.
- MEDIUM: repeated inline arrays/components that should be shared, inconsistent navigation patterns, mismatched labels for the same entity/state, or screens ignore an available shared service.
- LOW: naming/content drift that is noticeable but not behavior-breaking.
- Do not report single-screen layout/accessibility issues unless they create a cross-screen inconsistency.
- If the flow is consistent, return an empty issues array.`;

function parseFlowReview(text: string): { summary: string; issues: FlowIssue[] } {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:\w+)?\n/, "").replace(/\n```\s*$/, "");
  }
  const open = cleaned.indexOf("{");
  const close = cleaned.lastIndexOf("}");
  if (open >= 0 && close > open) cleaned = cleaned.slice(open, close + 1);
  const parsed = JSON.parse(cleaned) as {
    summary?: unknown;
    issues?: unknown;
  };
  const issues = Array.isArray(parsed.issues)
    ? (parsed.issues as Array<Record<string, unknown>>)
        .map((issue) => {
          const severity: FlowIssue["severity"] =
            issue.severity === "high" ||
            issue.severity === "medium" ||
            issue.severity === "low"
              ? issue.severity
              : "low";
          return {
            severity,
            category:
              typeof issue.category === "string"
                ? issue.category
                : "content-consistency",
            screens: Array.isArray(issue.screens)
              ? issue.screens.filter((x): x is string => typeof x === "string")
              : [],
            location:
              typeof issue.location === "string" ? issue.location : "",
            problem:
              typeof issue.problem === "string" ? issue.problem : "",
            fix: typeof issue.fix === "string" ? issue.fix : "",
          };
        })
        .filter((issue) => issue.problem.trim() && issue.fix.trim())
        .slice(0, 10)
    : [];
  return {
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : `Reviewed ${issues.length} cross-screen issue${issues.length === 1 ? "" : "s"}.`,
    issues,
  };
}

function routePathsFromContext(sharedContext?: string): Set<string> {
  const paths = new Set<string>();
  if (!sharedContext) return paths;
  for (const match of sharedContext.matchAll(/\b(?:->|:|→)\s*(\/[a-z0-9][a-z0-9/-]*)/gi)) {
    paths.add(match[1]);
  }
  return paths;
}

function literalLinks(code: string): string[] {
  return Array.from(
    code.matchAll(/<Link\b[^>]*\bto=(?:"([^"]+)"|'([^']+)')/g),
  )
    .map((match) => (match[1] ?? match[2] ?? "").split("?")[0])
    .filter((path) => path.startsWith("/"));
}

function heuristicFlowReview(
  screens: FlowScreen[],
  sharedContext?: string,
): { summary: string; issues: FlowIssue[] } {
  const issues: FlowIssue[] = [];
  const routes = routePathsFromContext(sharedContext);
  const transactionalScreens = screens.filter((screen) =>
    /\b(cart|checkout|subtotal|tax|delivery fee|service fee|total|order id|payment|booking)\b/i.test(
      screen.code,
    ),
  );
  const transactionalWithoutService = transactionalScreens.filter(
    (screen) => !/from\s+['"]\.\/services\//.test(screen.code),
  );
  if (transactionalScreens.length >= 2 && transactionalWithoutService.length > 0) {
    issues.push({
      severity: "high",
      category: "shared-service",
      screens: transactionalWithoutService.map((screen) => screen.name),
      location: "transactional totals/state",
      problem:
        "Multiple flow screens display transactional state, but at least one does not import a shared service.",
      fix:
        "Create or import one shared flow service for cart/order state and render all totals, selections, and order ids from it.",
    });
  }

  for (const screen of screens) {
    if (/from\s+['"]\.\/data\//.test(screen.code) && /\bconst\s+\w+\s*=\s*\[\s*\{/.test(screen.code)) {
      issues.push({
        severity: "medium",
        category: "data-flow",
        screens: [screen.name],
        location: "inline object array",
        problem:
          "The screen imports shared data and also declares an inline object array, creating a second data source.",
        fix:
          "Render from the imported data entity only, or move the rows into defineDataEntity.",
      });
    }

    if (routes.size > 0) {
      for (const path of literalLinks(screen.code)) {
        if (!routes.has(path)) {
          issues.push({
            severity: "high",
            category: "navigation",
            screens: [screen.name],
            location: `Link to ${path}`,
            problem: `The screen links to "${path}", but that route is not present in the flow context.`,
            fix:
              "Use an existing route from the route table or create the target screen before linking to it.",
          });
        }
      }
    }
  }

  return {
    summary: `Heuristic flow review found ${issues.length} cross-screen issue${issues.length === 1 ? "" : "s"}.`,
    issues: issues.slice(0, 10),
  };
}

export async function POST(req: Request) {
  const {
    screens,
    sharedContext,
    projectDoc,
    designDoc,
    tokens,
    componentTokens,
    iconStyle,
  }: {
    screens: FlowScreen[];
    sharedContext?: string;
    projectDoc?: string;
    designDoc?: string;
    tokens?: import("@/lib/agent-framing").TokensSnapshot;
    componentTokens?: import(
      "@/lib/design-component-tokens-store"
    ).ComponentTokens;
    iconStyle?: import("@/lib/agent-framing").IconStyleSnapshot;
  } = await req.json();

  if (!Array.isArray(screens) || screens.length < 2) {
    return Response.json(
      { ok: false, error: "reviewFlow requires at least two screens." },
      { status: 400 },
    );
  }

  const screenBlock = screens
    .slice(0, 12)
    .map(
      (screen) => `=== ${screen.name} (${screen.id}, ${screen.viewportId}) ===
${screen.code}`,
    )
    .join("\n\n---\n\n");

  try {
    const result = await generateText({
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
        FLOW_REVIEW_SYSTEM,
      prompt: `${sharedContext ? `Shared project context:\n${sharedContext}\n\n` : ""}Review these screens as one flow:\n\n${screenBlock}`,
    });
    const parsed = parseFlowReview(result.text);
    return Response.json({
      ok: true,
      ...parsed,
      usage: result.usage
        ? {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            reasoningTokens: result.usage.reasoningTokens,
            totalTokens: result.usage.totalTokens,
          }
        : undefined,
    });
  } catch (err) {
    const fallback = heuristicFlowReview(screens.slice(0, 12), sharedContext);
    return Response.json(
      {
        ok: true,
        fallback: true,
        modelError: String(err),
        ...fallback,
      },
      { status: 200 },
    );
  }
}
