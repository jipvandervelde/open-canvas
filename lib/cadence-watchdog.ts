/**
 * Cadence watchdog — catches the rumination anti-pattern described in
 * BRAINSTORM.md §14.5 and nudges the model via a `<system-reminder>` on
 * the NEXT turn after a pathologically long hidden-reasoning block.
 *
 * The watchdog is a thin singleton: ReasoningBlock records the duration of
 * each completed hidden-reasoning segment; when the user submits their
 * next message, ChatPanel calls `consumeNudge()` — if the last block
 * exceeded the threshold, the return value is appended to the outgoing
 * request body as a `cadenceReminder` field. The /api/chat route then
 * suffixes the system prompt for JUST that turn with a short nudge.
 *
 * The store is deliberately in-memory only; it resets on page reload.
 * The goal is session-local self-correction, not persistent shaming.
 */
const LONG_REASONING_MS = 90_000;

type WatchdogState = {
  lastReasoningMs: number;
  lastRecordedAt: number;
  consumed: boolean;
};

let state: WatchdogState = {
  lastReasoningMs: 0,
  lastRecordedAt: 0,
  consumed: true,
};

export const cadenceWatchdog = {
  /**
   * Called from ReasoningBlock when a hidden-reasoning segment finishes.
   * Only the MOST RECENT recording matters — if a turn has several
   * reasoning segments, the last one wins (that's the freshest signal for
   * what the agent just did).
   */
  recordReasoningDuration(ms: number) {
    state = {
      lastReasoningMs: ms,
      lastRecordedAt: Date.now(),
      consumed: false,
    };
  },
  /**
   * Called at sendMessage time. Returns a nudge string if the last
   * reasoning segment exceeded the threshold and hasn't been consumed;
   * null otherwise. Consuming marks the state so we don't nudge twice
   * for the same event (e.g. user sends two messages in a row).
   */
  consumeNudge(): string | null {
    if (state.consumed) return null;
    if (state.lastReasoningMs <= LONG_REASONING_MS) return null;
    const secs = Math.round(state.lastReasoningMs / 1000);
    state = { ...state, consumed: true };
    return `The previous turn spent ${secs}s in a single hidden-reasoning block before emitting a tool call. That's the rumination anti-pattern from the Cadence section of your system prompt. On THIS turn, keep each reasoning burst under ~30s: as soon as you've decided the next action, emit the tool call. If you're weighing options, emit \`think({topic, thought})\` to turn hidden monologue into a visible chip — don't stall in silence.`;
  },
  /** For debug surfaces / tests. */
  peek(): { lastReasoningMs: number; consumed: boolean } {
    return {
      lastReasoningMs: state.lastReasoningMs,
      consumed: state.consumed,
    };
  },
};
