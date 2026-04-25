import { generateText } from "ai";
import { kimi } from "@/lib/kimi";
import { buildAgentFraming } from "@/lib/agent-framing";

export const maxDuration = 60;

type FieldSpec = {
  name: string;
  type: "string" | "number" | "boolean" | "image" | "date";
  description?: string;
};

const SEED_SYSTEM = `You generate realistic, varied seed data for prototype apps. Output ONLY a JSON array of rows — no prose, no code fences, no commentary. The array must be valid JSON that \`JSON.parse\` accepts.

Before writing the array, think through:
- What's the variety and distribution that would make this dataset feel real? (price spread, geographic spread, category spread, time spread.) If every row looks like a near-variant of every other row, the dataset feels fake.
- What edge cases should be represented? (A very cheap and a very expensive item; a very old and a very new one; a long name and a short name; categories with 1 item and categories with many.)
- What content would actually appear in a shipped app? Use real-sounding names, real brands where appropriate, realistic prices, realistic dates (ISO 8601 like "2026-03-14"), actual-feeling descriptions with 1-2 sentences of flavor.

Rules for the output:
- Each row is an object with exactly the fields declared in the schema — no extras, no missing fields.
- Every row must have a unique \`id\` (short slug or number string: "r1", "r2", or "abc-stew").
- For \`image\` fields, use real-looking URLs. Prefer Unsplash-style URLs like \`https://images.unsplash.com/photo-<random-id>?w=600&q=80\` — make up plausible 11-char photo ids. NEVER "example.com" or "placeholder".
- For \`boolean\` fields, mix values realistically — not all true, not all false.
- For \`date\` fields, spread across a realistic range.
- No Lorem ipsum. No "Example 1 / Example 2". No repeating the field name as the value.
- The minimum row count requested is a HARD FLOOR — generate AT LEAST that many. More is fine. The user wants to feel like a populated app, not a toy example. Err on the side of more variety.`;

export async function POST(req: Request) {
  const {
    entityName,
    singular,
    description,
    fields,
    rowCount,
    existingRows,
    modelId,
    projectDoc,
    designDoc,
    tokens,
    componentTokens,
    iconStyle,
  }: {
    entityName: string;
    singular: string;
    description: string;
    fields: FieldSpec[];
    rowCount: number;
    existingRows?: Record<string, unknown>[];
    modelId?: string;
    projectDoc?: string;
    designDoc?: string;
    tokens?: import("@/lib/agent-framing").TokensSnapshot;
    componentTokens?: import(
      "@/lib/design-component-tokens-store"
    ).ComponentTokens;
    iconStyle?: import("@/lib/agent-framing").IconStyleSnapshot;
  } = await req.json();

  // Entire pipeline is locked on Kimi K2.6. modelId is accepted but ignored.
  // Thinking stays ON here: the seed sub-agent's whole value is reasoning
  // about variety + distribution before emitting JSON — without thinking
  // the output regresses to "a handful of close-variant rows."
  void modelId;

  // Sanitize + bump floor. A "handful" of items is what felt too sparse
  // to the user — default to at least 10 unless explicitly lower.
  const requested = Math.max(1, Math.min(rowCount ?? 12, 60));
  const minimum = Math.max(10, requested);

  const schemaDesc = fields
    .map(
      (f) =>
        `- ${f.name}: ${f.type}${f.description ? ` — ${f.description}` : ""}`,
    )
    .join("\n");

  const existingBlock =
    existingRows && existingRows.length > 0
      ? `\nExisting rows already in the dataset (DO NOT duplicate these, DO NOT regenerate them; produce additional rows that complement them stylistically):\n${JSON.stringify(existingRows, null, 2)}\n`
      : "";

  const basePrompt = `Entity: ${singular} (collection: ${entityName})
${description ? `Purpose: ${description}\n` : ""}
Schema:
${schemaDesc}
${existingBlock}
Generate AT LEAST ${minimum} rows as a JSON array. More is welcome. Think about variety and distribution BEFORE writing the array. Output only the JSON array, no prose.`;

  // Accumulate usage across potentially multiple tryGenerate passes (the
  // "not enough rows, nudge for more" branch below calls tryGenerate twice)
  // so the caller sees total tokens for this entity's seed generation.
  const combinedUsage = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };

  async function tryGenerate(extraHint = ""): Promise<unknown[] | null> {
    const prompt = extraHint ? `${basePrompt}\n\n${extraHint}` : basePrompt;
    try {
      const res = await generateText({
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
          SEED_SYSTEM,
        prompt,
      });
      if (res.usage) {
        combinedUsage.inputTokens += res.usage.inputTokens ?? 0;
        combinedUsage.outputTokens += res.usage.outputTokens ?? 0;
        combinedUsage.reasoningTokens += res.usage.reasoningTokens ?? 0;
        combinedUsage.totalTokens += res.usage.totalTokens ?? 0;
      }
      let text = res.text.trim();
      if (text.startsWith("```")) {
        text = text.replace(/^```(?:\w+)?\n/, "").replace(/\n```\s*$/, "");
      }
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start >= 0 && end > start) text = text.slice(start, end + 1);
      const parsed = JSON.parse(text) as unknown;
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  try {
    let rows = await tryGenerate();
    // If the first pass came up short, nudge for more and merge. We dedupe
    // on `id` so the follow-up doesn't double-count.
    if (rows && rows.length < minimum) {
      const needed = minimum - rows.length;
      const extraIds = rows
        .map((r) => (r as Record<string, unknown>).id)
        .filter((x): x is string => typeof x === "string")
        .slice(0, 30);
      const more = await tryGenerate(
        `You already returned ${rows.length} rows; I need at least ${minimum}. Generate ${needed} ADDITIONAL rows (not duplicates). Use ids that don't collide with these: ${JSON.stringify(extraIds)}. Output ONLY the new rows as a JSON array.`,
      );
      if (more && more.length > 0) {
        const seen = new Set<string>();
        const merged: unknown[] = [];
        for (const r of [...rows, ...more]) {
          const id = String(
            (r as Record<string, unknown>).id ?? Math.random().toString(36),
          );
          if (seen.has(id)) continue;
          seen.add(id);
          merged.push(r);
        }
        rows = merged;
      }
    }
    if (!rows) {
      return Response.json(
        {
          ok: false,
          error: "Sub-agent returned invalid JSON",
          usage: combinedUsage.totalTokens > 0 ? combinedUsage : undefined,
        },
        { status: 500 },
      );
    }
    return Response.json({
      ok: true,
      rows,
      usage: combinedUsage.totalTokens > 0 ? combinedUsage : undefined,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: String(err),
        usage: combinedUsage.totalTokens > 0 ? combinedUsage : undefined,
      },
      { status: 500 },
    );
  }
}
