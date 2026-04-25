/**
 * Debug-only route — surfaces the principle picker's output for a given
 * brief/viewport without actually invoking the LLM. Used for verifying
 * routing logic during development.
 */

import { pickPrinciplesForBrief } from "@/lib/design-principles";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    viewportId: string;
    brief: string;
    sharedContext?: string;
  };
  const picked = await pickPrinciplesForBrief(body);
  return Response.json({
    picked: picked.map((p) => ({
      slug: p.slug,
      title: p.title,
      bodyBytes: p.body.length,
      bodyPreview: p.body.slice(0, 200),
    })),
    totalBytes: picked.reduce((a, p) => a + p.body.length, 0),
  });
}
