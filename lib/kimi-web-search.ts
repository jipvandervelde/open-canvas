/**
 * Server-side wrapper around Kimi K2.6's built-in `$web_search` tool.
 *
 * Kimi's docs specify:
 *   - $web_search is a `builtin_function` the model calls internally
 *   - When ANY call uses $web_search, thinking MUST be disabled on that call
 *   - Each search costs $0.005 on top of token usage
 *
 * We sandbox this inside a dedicated Kimi call so the orchestrator — which
 * runs with thinking ON — never has to swap thinking off itself. The tool
 * result the orchestrator sees is just a summary + source URLs.
 *
 * We hand-roll this against the raw Kimi HTTP API rather than going through
 * `@ai-sdk/openai-compatible` because `$web_search` is a `builtin_function`
 * type that the AI SDK's tools array doesn't support natively.
 */

const BASE_URL = "https://api.moonshot.ai/v1";
const MODEL_ID = "kimi-k2.6";

export type WebSearchResult = {
  summary: string;
  sources: Array<{ title: string; url: string; snippet?: string }>;
};

type KimiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

export async function runKimiWebSearch(
  query: string,
): Promise<WebSearchResult> {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) throw new Error("MOONSHOT_API_KEY not set");

  const messages: KimiMessage[] = [
    {
      role: "system",
      content:
        "You are a concise web-search assistant. When the user asks a question, use the $web_search tool once or twice to gather facts, then reply with:\n" +
        "1. A 2–5 sentence summary answering the question.\n" +
        "2. A short list of source URLs you actually drew from (with titles).\n" +
        "Format the final reply as JSON: {\"summary\": string, \"sources\": [{\"title\": string, \"url\": string, \"snippet\": string}]}.\n" +
        "Do NOT add prose outside the JSON.",
    },
    { role: "user", content: query },
  ];

  const tools = [
    {
      type: "builtin_function",
      function: { name: "$web_search" },
    },
  ];

  // Kimi can fire $web_search multiple times before producing a final answer.
  // Loop until we see a non-tool-call response or hit a safety cap.
  const MAX_ITERATIONS = 4;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages,
        tools,
        // $web_search requires thinking off — per Kimi docs.
        thinking: { type: "disabled" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Kimi returned ${res.status}: ${body.slice(0, 400)}`);
    }

    const data = (await res.json()) as {
      choices: Array<{
        message: KimiMessage;
        finish_reason: string;
      }>;
    };
    const choice = data.choices?.[0];
    if (!choice) throw new Error("Kimi returned no choices");
    const msg = choice.message;

    // Tool-call turn: Kimi is executing $web_search internally. We just
    // bounce the result back so the model can see what it searched for.
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: msg.tool_calls,
      });
      for (const call of msg.tool_calls) {
        // For builtin_function, Kimi executes the search and delivers the
        // result via the tool_calls loop; per docs, we return the function
        // arguments directly as the tool response.
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: call.function.arguments,
        });
      }
      continue;
    }

    // Final answer turn — parse the JSON payload.
    const content = (msg.content ?? "").trim();
    const parsed = parseJsonPayload(content);
    if (parsed) return parsed;
    // If Kimi didn't return valid JSON, return the raw content as a summary
    // with empty sources rather than failing the tool call.
    return { summary: content.slice(0, 800), sources: [] };
  }

  throw new Error("Web search exceeded iteration cap");
}

function parseJsonPayload(text: string): WebSearchResult | null {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:\w+)?\n/, "").replace(/\n```\s*$/, "");
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(t.slice(start, end + 1)) as WebSearchResult;
    if (typeof obj?.summary !== "string") return null;
    if (!Array.isArray(obj?.sources)) return null;
    return {
      summary: obj.summary,
      sources: obj.sources
        .filter(
          (s): s is { title: string; url: string; snippet?: string } =>
            !!s && typeof s.url === "string",
        )
        .slice(0, 6),
    };
  } catch {
    return null;
  }
}
