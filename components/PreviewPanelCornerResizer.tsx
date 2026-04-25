"use client";

import { useEffect, useRef, useState } from "react";
import { previewPanelStore } from "@/lib/preview-panel-store";

/**
 * Diagonal resize handle at the BOTTOM-LEFT corner of the Preview panel.
 * Dragging outward enlarges the panel; inward shrinks it. Width and height
 * stay locked to the device's aspect ratio — the panel always wraps the
 * device proportionally, so the preview never leaves awkward empty gutters.
 *
 * Also clamps against `previewPanelStore.getMinSize()` so the device never
 * drops below MIN_SCALE.
 */
export function PreviewPanelCornerResizer() {
  const startRef = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
    aspect: number; // w / h — the aspect we lock to during the drag
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const st = startRef.current;
      if (!st) return;
      // Dragging left/down grows. Translate both axes into a "desired" W/H.
      const desiredW = st.w - (e.clientX - st.x);
      const desiredH = st.h + (e.clientY - st.y);
      // Which axis is the user driving? Pick whichever moved more relative
      // to its starting dimension, then derive the other from the aspect.
      const relW = Math.abs(desiredW - st.w) / st.w;
      const relH = Math.abs(desiredH - st.h) / st.h;
      let nextW: number;
      let nextH: number;
      if (relW >= relH) {
        nextW = desiredW;
        nextH = desiredW / st.aspect;
      } else {
        nextH = desiredH;
        nextW = desiredH * st.aspect;
      }
      previewPanelStore.setSize(nextW, nextH);
    };
    const onUp = () => {
      setDragging(false);
      startRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.cursor = "nesw-resize";
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
    const s = previewPanelStore.get();
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: s.width,
      h: s.height,
      aspect: s.width / s.height,
    };
    setDragging(true);
  };

  return (
    <div
      role="separator"
      aria-label="Resize preview panel"
      className="oc-preview-corner-resizer"
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      title="Drag to resize the preview panel"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        {/* Bottom-LEFT corner grip — diagonals fanning out toward the
            bottom-left. (Mirror of the bottom-right convention.) */}
        <path
          d="M2 2L10 10M2 6L6 10"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
