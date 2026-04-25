"use client";

import { useEffect, useRef, useState } from "react";
import {
  leftPanelWidthStore,
  MIN_WIDTH,
  MAX_WIDTH,
} from "@/lib/left-panel-width-store";

/**
 * Thin vertical drag handle that sits on the right edge of the left panel.
 * Drag to resize the panel horizontally; value is clamped to
 * [MIN_WIDTH, MAX_WIDTH], persisted to localStorage, and applied via the
 * `--left-panel-w` CSS variable that both the panel and the Tldraw canvas
 * wrapper read.
 */
export function LeftPanelResizer() {
  const startRef = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // Width comes from localStorage, which differs from the SSR default. Track
  // a post-mount flag so we only publish the actual value once the client has
  // hydrated — otherwise React flags an aria-valuenow mismatch on first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.x;
      leftPanelWidthStore.set(startRef.current.w + dx);
    };
    const onUp = () => {
      setDragging(false);
      startRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // Lock the cursor + prevent text selection globally while dragging so
    // the drag feels native even when the pointer leaves the thin handle.
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    startRef.current = { x: e.clientX, w: leftPanelWidthStore.get() };
    setDragging(true);
  };

  const onDoubleClick = () => {
    // Reset to the minimum on double-click as a quick escape hatch.
    leftPanelWidthStore.set(MIN_WIDTH);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      {...(mounted
        ? { "aria-valuenow": leftPanelWidthStore.get() }
        : {})}
      suppressHydrationWarning
      className="oc-left-resizer"
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize · double-click to reset"
    />
  );
}
