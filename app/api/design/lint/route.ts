/**
 * Design-lint endpoint. Takes the current tokens + component tokens +
 * design.md prose and returns a structured LintReport (findings +
 * summary). Pure function under the hood — see `lib/design-lint.ts`.
 *
 * Client-side the Design panel wires a "Lint" button to this route.
 * Server-side we keep the endpoint small so it can later be called
 * from CI / build hooks / pre-commit without touching the UI.
 */

import { lintDesignSystem, type LintInput } from "@/lib/design-lint";

export async function POST(req: Request) {
  let body: Partial<LintInput>;
  try {
    body = (await req.json()) as Partial<LintInput>;
  } catch {
    return Response.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }
  if (!body.tokens || !body.componentTokens) {
    return Response.json(
      {
        error:
          "Missing `tokens` and/or `componentTokens` — send the full snapshot from the client-side stores.",
      },
      { status: 400 },
    );
  }
  const report = lintDesignSystem({
    tokens: body.tokens,
    componentTokens: body.componentTokens,
    designDoc: body.designDoc,
  });
  return Response.json(report);
}
