/**
 * Tracks which screens are currently being streamed into by the agent, so the
 * ArtboardOverlay can render a floating "agent cursor" near the active screen.
 * Keyed by toolCallId so each in-flight tool call gets its own marker.
 */

export type StreamingMarker = {
  toolCallId: string;
  screenId: string;
  screenName: string;
  kind: "create" | "update";
  /**
   * Short friendly name ("Henk", "May", "Pim") assigned to this sub-agent so
   * the cursor and chat tool card can label its work personally. Populated
   * only for delegateScreen markers; legacy create/updateScreen markers
   * leave this undefined and the UI falls back to generic copy.
   */
  agentName?: string;
  /**
   * Iframe-local bounds of the most recently rendered element, in CSS pixels.
   * The parent uses this to position the "Claude is writing" agent cursor near
   * whatever the model just produced instead of leaving it in the top-left.
   * Undefined until the in-iframe agent sends its first `oc:agent-pos` message.
   */
  rect?: { x: number; y: number; w: number; h: number };
};

type Listener = (markers: StreamingMarker[]) => void;

class StreamingStore {
  private markers = new Map<string, StreamingMarker>();
  private listeners = new Set<Listener>();

  list(): StreamingMarker[] {
    return Array.from(this.markers.values());
  }

  upsert(marker: StreamingMarker) {
    const existing = this.markers.get(marker.toolCallId);
    if (
      existing &&
      existing.screenId === marker.screenId &&
      existing.screenName === marker.screenName &&
      existing.kind === marker.kind
    ) {
      return;
    }
    // Preserve the last-known rect across upserts so the cursor doesn't jump
    // back to origin on every partial-code update.
    const next: StreamingMarker =
      existing?.rect && !marker.rect
        ? { ...marker, rect: existing.rect }
        : marker;
    this.markers.set(marker.toolCallId, next);
    this.notify();
  }

  /**
   * Update the iframe-local position for every marker whose screenId matches.
   * Called from ElementSelectionBridge in response to `oc:agent-pos` messages.
   */
  updatePositionByScreen(
    screenId: string,
    rect: { x: number; y: number; w: number; h: number },
  ) {
    let changed = false;
    for (const [id, m] of this.markers) {
      if (m.screenId !== screenId) continue;
      const prev = m.rect;
      if (
        prev &&
        prev.x === rect.x &&
        prev.y === rect.y &&
        prev.w === rect.w &&
        prev.h === rect.h
      ) {
        continue;
      }
      this.markers.set(id, { ...m, rect });
      changed = true;
    }
    if (changed) this.notify();
  }

  remove(toolCallId: string) {
    if (this.markers.delete(toolCallId)) this.notify();
  }

  clear() {
    if (this.markers.size === 0) return;
    this.markers.clear();
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const snap = this.list();
    // Toggle a body-level data attribute so CSS can hide Sandpack's error
    // overlay on all screens during streaming without us wiring a prop
    // through every child.
    if (typeof document !== "undefined") {
      if (snap.length > 0) {
        document.body.setAttribute("data-oc-streaming", "true");
      } else {
        document.body.removeAttribute("data-oc-streaming");
      }
    }
    for (const l of this.listeners) l(snap);
  }
}

export const streamingStore = new StreamingStore();

if (typeof window !== "undefined") {
  (window as unknown as { __streamingStore: StreamingStore }).__streamingStore =
    streamingStore;
}
