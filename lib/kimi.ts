/**
 * Kimi K2.6 (Moonshot) provider factory.
 *
 * Kimi is OpenAI-compatible but ships a few extensions the AI SDK's generic
 * openai-compatible provider doesn't natively surface — in particular the
 * `thinking` field that gates the model's reasoning output. We intercept
 * outbound requests via a custom fetch wrapper and patch the JSON body.
 *
 * Key facts (see https://platform.kimi.ai/docs):
 * - Base URL: https://api.moonshot.ai/v1
 * - Auth: `Authorization: Bearer $MOONSHOT_API_KEY`
 * - Model id: "kimi-k2.6" (with the dot)
 * - Context: 262K tokens
 * - `thinking: {type: "enabled"|"disabled", keep: "all"}` via extra_body
 * - `reasoning_content` streams BEFORE `content` in SSE deltas
 * - Temperature + top_p are fixed on k2.6; sending them warns at best
 * - Built-in `$web_search` tool REQUIRES thinking disabled; we don't wire
 *   web search yet, so every caller here runs with thinking on/off based
 *   on intent (chat + seeds = on, screen-gen = off for latency)
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// `LanguageModelV3` lives in `@ai-sdk/provider` (peer of openai-compatible),
// which isn't installed here. Derive the return type from the provider
// factory so we don't need the peer dep just for a type.
type LanguageModelV3 = ReturnType<
  ReturnType<typeof createOpenAICompatible>["chatModel"]
>;

const BASE_URL = "https://api.moonshot.ai/v1";
export const KIMI_MODEL_ID = "kimi-k2.6" as const;

function requireApiKey(): string {
  const key = process.env.MOONSHOT_API_KEY;
  if (!key) {
    throw new Error(
      "MOONSHOT_API_KEY is not set. Add it to .env.local at the project root.",
    );
  }
  return key;
}

/**
 * Returns a LanguageModel instance wired to Kimi K2.6. Pass `thinking: true`
 * to let the model reason before answering (emits `reasoning_content`);
 * false disables thinking (required when using `$web_search`, faster
 * first-token latency for code-generation sub-agents).
 *
 * The `thinking` flag is injected server-side via a fetch wrapper —
 * callers don't need to pass anything through `providerOptions`.
 */
export function kimi(opts?: { thinking?: boolean }): LanguageModelV3 {
  const thinking = opts?.thinking ?? true;

  const customFetch: typeof fetch = async (input, init) => {
    if (init?.body && typeof init.body === "string") {
      try {
        const parsed = JSON.parse(init.body);
        // Merge rather than overwrite so per-call provider options can still
        // take precedence if we ever wire them through.
        if (parsed && typeof parsed === "object" && !parsed.thinking) {
          parsed.thinking = thinking
            ? { type: "enabled", keep: "all" }
            : { type: "disabled" };
        }
        // Kimi warns/rejects if temperature or top_p are sent explicitly on
        // k2.6, and AI SDK's openai-compatible provider adds temperature=1
        // by default. Strip both so requests stay clean.
        if (parsed && typeof parsed === "object") {
          delete parsed.temperature;
          delete parsed.top_p;
        }
        init = { ...init, body: JSON.stringify(parsed) };
      } catch {
        /* leave body as-is; falls through to upstream error handling */
      }
    }
    return fetch(input as RequestInfo, init);
  };

  const provider = createOpenAICompatible({
    name: "kimi",
    baseURL: BASE_URL,
    apiKey: requireApiKey(),
    fetch: customFetch,
  });

  return provider.chatModel(KIMI_MODEL_ID);
}
