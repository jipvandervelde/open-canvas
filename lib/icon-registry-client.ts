/**
 * Client-side fetcher + memoizer for the centralIcons.js module.
 *
 * PreviewPanel calls `getIconRegistryJs()` on mount. The first call
 * starts the fetch and returns the promise; every subsequent call
 * returns the already-resolved (or in-flight) promise. The result is
 * a JS source string that PreviewPanel injects as a Sandpack virtual
 * file at `/centralIcons.js`.
 *
 * Fallback: if the fetch fails (dev server down, network blip), we
 * resolve to a tiny stub module exporting a no-op `<Icon>` that logs
 * the missing-icon warning and renders an empty span. That way agent-
 * generated screens still compile — they just render icon-shaped
 * voids instead of crashing the whole preview.
 */

const FALLBACK_STUB = `import React from 'react';

export function Icon(props) {
  if (typeof console !== 'undefined') {
    console.warn('[centralIcons] registry unavailable; rendering stub for', props.name);
  }
  const size = typeof props.size === 'number' ? props.size + 'px' : (props.size || '24px');
  return React.createElement('span', {
    'aria-hidden': true,
    style: { display: 'inline-block', width: size, height: size },
  });
}
export const ICONS = {};
export function hasIcon() { return false; }
export function listIcons() { return []; }
export default Icon;
`;

let pending: Promise<string> | null = null;
let cached: string | null = null;

export function getIconRegistryJs(): Promise<string> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch("/api/icons/registry");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const js = await res.text();
      cached = js;
      return js;
    } catch (err) {
      console.error("[centralIcons] failed to load registry — using stub", err);
      cached = FALLBACK_STUB;
      return cached;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Synchronous accessor — returns the stub until the fetch resolves. */
export function getIconRegistryJsSync(): string {
  return cached ?? FALLBACK_STUB;
}

/** Kick off the fetch without awaiting — call early in app mount so the
 *  registry is ready by the time the first preview renders. */
export function primeIconRegistry(): void {
  void getIconRegistryJs();
}
