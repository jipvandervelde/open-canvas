/**
 * Message queue store — lets the user type and "send" follow-up messages
 * while the agent is already streaming. Each queued message is drained
 * (one at a time) as soon as the chat status flips back to `ready`.
 *
 * The store is intentionally dumb: no persistence, no cross-tab sync, no
 * rate-limiting. It's just a FIFO list of user-typed texts paired with any
 * `#N` annotation tokens already expanded at enqueue time. The canvas
 * context snapshot is deferred until drain time — the whole point of
 * queueing is that what's on the canvas will keep changing, and the next
 * message should see the fresh state.
 */
export type QueuedMessage = {
  id: string;
  /** The raw user input, already expanded for `#N` annotation references. */
  text: string;
  /** Monotonically increasing insertion timestamp, handy for debug logs. */
  enqueuedAt: number;
};

type Listener = (queue: readonly QueuedMessage[]) => void;

let queue: QueuedMessage[] = [];
const listeners = new Set<Listener>();

function emit() {
  const snap = [...queue];
  for (const l of listeners) l(snap);
}

function genId(): string {
  return (
    "q_" +
    Math.random().toString(36).slice(2, 8) +
    Date.now().toString(36).slice(-4)
  );
}

export const messageQueueStore = {
  get(): readonly QueuedMessage[] {
    return queue;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  enqueue(text: string): QueuedMessage {
    const msg: QueuedMessage = { id: genId(), text, enqueuedAt: Date.now() };
    queue = [...queue, msg];
    emit();
    return msg;
  },
  /** Remove and return the head of the queue; null if empty. */
  shift(): QueuedMessage | null {
    if (queue.length === 0) return null;
    const [head, ...rest] = queue;
    queue = rest;
    emit();
    return head;
  },
  remove(id: string) {
    const next = queue.filter((m) => m.id !== id);
    if (next.length !== queue.length) {
      queue = next;
      emit();
    }
  },
  clear() {
    if (queue.length === 0) return;
    queue = [];
    emit();
  },
  size(): number {
    return queue.length;
  },
};
