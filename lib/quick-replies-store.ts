/**
 * Tracks which `suggestReplies` chip sets have been consumed (clicked) so
 * they disappear after use. Keyed by toolCallId; survives for the session
 * but not across reloads (chips are ephemeral UI).
 *
 * Also holds the send-reply callback the chips invoke — same module-ref
 * pattern as clarifying-questions-store so the component tree doesn't
 * need to thread `sendMessage` down through MessageRow → MessageParts.
 */

const consumed = new Set<string>();
const listeners = new Set<() => void>();

export function isQuickRepliesConsumed(toolCallId: string): boolean {
  return consumed.has(toolCallId);
}

export function markQuickRepliesConsumed(toolCallId: string) {
  if (consumed.has(toolCallId)) return;
  consumed.add(toolCallId);
  for (const l of listeners) l();
}

export function subscribeQuickReplies(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Module-level send hook so QuickReplies chips can `sendMessage` without
// threading the prop through.
let sendHook: ((text: string) => void) | null = null;

export function setQuickReplySender(fn: ((text: string) => void) | null) {
  sendHook = fn;
}

export function sendQuickReply(text: string) {
  sendHook?.(text);
}
