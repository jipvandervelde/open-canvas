/**
 * Nuclear reset for the testing environment — wipes every persisted store
 * and reloads the page so we start from a pristine state. Wired into the
 * "Reset" button in the chat header.
 *
 * Every client-side store in this project uses `localStorage` keys
 * prefixed with `oc:`. We iterate keys instead of hard-coding the list so
 * new stores are automatically covered as they land. For good measure we
 * also clear Sandpack's cache keys (it doesn't prefix, but the known
 * patterns are narrow).
 *
 * After clearing we `window.location.reload()` so in-memory stores
 * (token usage, message queue, review streams, cadence watchdog, etc.)
 * reset automatically as the bundle re-executes. This avoids the
 * whack-a-mole of remembering to manually reset every singleton.
 */

export function resetProject() {
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith("oc:") ||
        k.startsWith("sandpack:") ||
        k.startsWith("tldraw:")
      ) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      window.localStorage.removeItem(k);
    }
  } catch {
    /* private-browsing or quota errors — we still want the reload */
  }

  try {
    window.sessionStorage.clear();
  } catch {
    /* ignore */
  }

  // Hard reload — simplest correct reset. All in-memory singletons
  // (tokenUsageStore, messageQueueStore, reviewStreamStore, etc.)
  // reinitialize when the bundle re-runs.
  window.location.reload();
}
