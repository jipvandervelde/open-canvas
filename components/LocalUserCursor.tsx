"use client";

/**
 * LocalUserCursor — renders a `PresenceCursor` at the local pointer
 * position everywhere across the tool. Mounts on the page root and
 * listens to `pointermove` on the document. Sandpack iframes hide their
 * OS cursor (see `screen-runtime.tsx`) and relay their internal pointer
 * coords via `postMessage({ __oc: "oc:cursor" })`; we translate those
 * iframe-relative coords back to viewport pixels (using the iframe's
 * bounding rect + intrinsic vs visual scale) so the cursor keeps
 * tracking smoothly when the mouse crosses an iframe boundary.
 *
 * Hidden when:
 *   - the pointer leaves the document (window blur, tab hidden),
 *   - input is touch-based (no hover cursor concept on touch).
 *
 * The OS cursor is hidden tool-wide via `html, body, body *
 * { cursor: none !important }` (see `globals.css`).
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Pos = { x: number; y: number };
type CursorMessage = {
  __oc?: string;
  x?: number;
  y?: number;
  pointerType?: string;
};

export function LocalUserCursor() {
  const [mounted, setMounted] = useState(false);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // The cursor is portaled to <body>. Delaying portal creation until after
    // hydration keeps the server tree and first client render identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (typeof window === "undefined") return;

    const layer = layerRef.current;
    const cursor = cursorRef.current;
    if (!layer || !cursor) return;

    let raf = 0;
    let pending: Pos | null = null;
    const iframeCache = new WeakMap<object, HTMLIFrameElement>();
    const bringToFront = () => {
      if (layer.parentNode === document.body && layer.nextSibling) {
        document.body.appendChild(layer);
      }
    };

    const hide = () => {
      pending = null;
      cursor.style.visibility = "hidden";
    };

    const paint = () => {
      raf = 0;
      if (!pending) return;
      const { x, y } = pending;
      pending = null;
      cursor.style.visibility = "visible";
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    const schedulePaint = (x: number, y: number) => {
      bringToFront();
      pending = { x, y };
      if (raf === 0) raf = window.requestAnimationFrame(paint);
    };

    const resolveIframe = (source: MessageEventSource | null) => {
      if (!source || typeof source !== "object") return null;
      const cached = iframeCache.get(source);
      if (cached?.isConnected && cached.contentWindow === source) {
        return cached;
      }

      const iframes = document.querySelectorAll<HTMLIFrameElement>("iframe");
      for (const iframe of Array.from(iframes)) {
        if (iframe.contentWindow !== source) continue;
        iframeCache.set(source, iframe);
        return iframe;
      }
      return null;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        hide();
        return;
      }
      schedulePaint(e.clientX, e.clientY);
    };

    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as CursorMessage;
      if (!data || typeof data !== "object") return;
      if (data.__oc === "oc:cursor-leave") {
        // Don't blank the cursor — the pointer is most likely now over
        // a non-iframe DOM node which will fire its own pointermove. If
        // we cleared here, the cursor would flicker every time the
        // mouse crossed an iframe boundary.
        return;
      }
      if (data.__oc !== "oc:cursor") return;
      if (data.pointerType === "touch") return;
      if (typeof data.x !== "number" || typeof data.y !== "number") return;

      // Translate iframe-local client coords into parent viewport coords.
      // The iframe source is cached because this path runs for every move.
      const iframe = resolveIframe(ev.source);
      if (!iframe) return;
      const rect = iframe.getBoundingClientRect();
      const ow = iframe.offsetWidth || rect.width || 1;
      const oh = iframe.offsetHeight || rect.height || 1;
      const scaleX = rect.width / ow;
      const scaleY = rect.height / oh;
      schedulePaint(rect.left + data.x * scaleX, rect.top + data.y * scaleY);
    };

    const onLeave = () => hide();
    const onBlur = () => hide();
    const onVisibility = () => {
      if (document.visibilityState !== "visible") hide();
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onBlur);
    window.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf !== 0) window.cancelAnimationFrame(raf);
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={layerRef}
      // Full-viewport overlay so the absolute child can use viewport-relative
      // coordinates (the same numbers `pointermove` reports). Pointer-events
      // disabled so it never intercepts a click.
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2147483647,
        contain: "layout style paint",
        isolation: "isolate",
      }}
      aria-hidden
    >
      <div
        ref={cursorRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          visibility: "hidden",
          transform: "translate3d(0, 0, 0)",
          willChange: "transform",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            display: "block",
            width: 16,
            height: 16,
            background: "var(--text-primary)",
            maskImage: "url('/cursors/cursor.svg')",
            maskPosition: "center",
            maskRepeat: "no-repeat",
            maskSize: "contain",
            WebkitMaskImage: "url('/cursors/cursor.svg')",
            WebkitMaskPosition: "center",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskSize: "contain",
            filter:
              "drop-shadow(0 1px 1px rgba(0, 0, 0, 0.28)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.14))",
            transform: "translate(-2px, -2px)",
            userSelect: "none",
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
