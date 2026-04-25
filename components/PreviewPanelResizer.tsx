"use client";

import { useEffect, useRef, useState } from "react";
import { previewPanelStore, MAX_WIDTH } from "@/lib/preview-panel-store";

/**
 * Thin vertical drag handle on the LEFT edge of the Preview panel. Mirror of
 * LeftPanelResizer but inverted: dragging left increases width (pulls the
 * panel wider into the canvas), dragging right shrinks it.
 */
export function PreviewPanelResizer() {
  const startRef = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.x;
      // Inverted: moving the handle left (negative dx) widens the panel.
      previewPanelStore.setWidth(startRef.current.w - dx);
    };
    const onUp = () => {
      setDragging(false);
      startRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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
    startRef.current = {
      x: e.clientX,
      w: previewPanelStore.get().width,
    };
    setDragging(true);
  };

  const onDoubleClick = () => {
    // Reset to the device-wrapping default (100% fit, panel hugs the device).
    previewPanelStore.resetSize();
  };

  const minW = previewPanelStore.getMinSize().w;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={minW}
      aria-valuemax={MAX_WIDTH}
      aria-valuenow={previewPanelStore.get().width}
      className="oc-right-resizer"
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize · double-click to reset"
    />
  );
}
