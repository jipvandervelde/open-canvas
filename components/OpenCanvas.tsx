"use client";

/**
 * Native infinite canvas — the replacement for TldrawCanvas. Handles:
 *   - Pan (two-finger scroll, spacebar + drag, middle-mouse drag)
 *   - Zoom (ctrl/⌘ + wheel, pinch gesture, ±10% shortcut)
 *   - Click-to-select (+ shift/cmd to toggle, marquee drag on empty)
 *   - Drag-to-move selected shapes (with cross-screen snapping lines)
 *   - 8-point resize handles on single selection
 *   - Auto-reposition on overlap (ports the old tldraw post-resize shuffle)
 *   - Theme sync, route-table rebuild, Cmd+0 "zoom to selection / fit"
 *
 * Renders screens via a single world-coordinate layer that we CSS-transform
 * for pan/zoom — one transform, every shape in one paint pass.
 */

import { useEffect, useRef, useState } from "react";
import { canvasStore, useValue, useCanvasTick } from "@/lib/canvas-store";
import { editor } from "@/lib/editor-shim";
import { useEditorRef } from "@/lib/editor-context";
import { ScreenBody } from "@/lib/screen-runtime";
import { themeStore } from "@/lib/theme-store";
import { canvasModeStore } from "@/lib/canvas-mode-store";
import { leftPanelWidthStore } from "@/lib/left-panel-width-store";
import { previewPanelStore } from "@/lib/preview-panel-store";
import { routeTableStore, nameToPath } from "@/lib/route-table-store";
import { zoomToFitCapped } from "@/lib/zoom";
import type { ScreenShape, ShapeId } from "@/lib/shape-types";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
const SCREEN_GAP = 40; // snap / auto-reposition buffer between shapes

type InteractionState =
  | { kind: "idle" }
  | { kind: "pan"; startX: number; startY: number; startCam: { x: number; y: number } }
  | { kind: "marquee"; startPage: { x: number; y: number }; currentPage: { x: number; y: number }; additive: boolean }
  | {
      kind: "drag-shapes";
      startPage: { x: number; y: number };
      currentPage: { x: number; y: number };
      initial: Map<ShapeId, { x: number; y: number }>;
      moved: boolean;
    }
  | {
      kind: "resize";
      handle: HandleId;
      shapeId: ShapeId;
      startPage: { x: number; y: number };
      initial: { x: number; y: number; w: number; h: number };
    };

type HandleId = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";

export function OpenCanvas() {
  const { setEditor } = useEditorRef();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<InteractionState>({ kind: "idle" });
  const [interactionTick, setInteractionTick] = useState(0);
  const spaceHeldRef = useRef(false);

  // Register our editor shim with the app-wide context exactly once.
  useEffect(() => {
    setEditor(editor);
    return () => setEditor(null);
  }, [setEditor]);

  // Theme sync — the Sandpack iframes subscribe to themeStore directly, so we
  // only need to track it here for our canvas backdrop.
  const [theme, setTheme] = useState(() => themeStore.get());
  useEffect(() => themeStore.subscribe(setTheme), []);

  // Keep the viewport bounds in the store in sync with the container's rect.
  // The canvas is now edge-to-edge; the floating panels sit on top, so we
  // must subtract their widths (read from CSS vars) to get the *visible*
  // canvas region. Zoom math and the starter-centering use that region so
  // shapes don't end up hidden behind a panel.
  const initialCenteredRef = useRef(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const css = getComputedStyle(document.documentElement);
      const leftW = parseFloat(css.getPropertyValue("--left-panel-w")) || 0;
      const rightW = parseFloat(css.getPropertyValue("--right-panel-w")) || 0;
      // The "top/bottom inset" for the floating panels is cosmetic — pills
      // and zoom math still use the full canvas height.
      canvasStore.setViewport({
        x: r.left + leftW,
        y: r.top,
        w: Math.max(0, r.width - leftW - rightW),
        h: r.height,
      });
      if (!initialCenteredRef.current && r.width > 0 && r.height > 0) {
        initialCenteredRef.current = true;
        zoomToFitCapped(editor);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    // Panel resize events tick `--left-panel-w` / `--right-panel-w` on the
    // documentElement; subscribe to both panel-width stores so we stay in
    // sync during drags (our container's size won't change, since the canvas
    // is edge-to-edge).
    const unsubLeft = leftPanelWidthStore.subscribe(measure);
    const unsubRight = previewPanelStore.subscribe(measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      unsubLeft();
      unsubRight();
    };
  }, []);

  // Route table — regenerate whenever the screen inventory changes.
  useEffect(() => {
    function rebuild() {
      const screens = canvasStore.getAllShapes();
      routeTableStore.setRoutes(
        screens.map((s) => ({
          id: s.id,
          name: s.props.name,
          path: nameToPath(s.props.name),
        })),
      );
    }
    rebuild();
    return canvasStore.listen(rebuild, { source: "all", scope: "document" });
  }, []);

  // Auto-reposition: when a screen grows or moves into a neighbor, push the
  // neighbor out. Runs on user-driven geometry changes only so programmatic
  // agent updates (which pick their own coords) aren't disturbed.
  useEffect(() => {
    let pending = false;
    return canvasStore.listen(
      (entry) => {
        if (pending) return;
        for (const pair of Object.values(entry.changes.updated)) {
          const [prev, next] = pair;
          const geomChanged =
            next.x !== prev.x ||
            next.y !== prev.y ||
            next.props.w !== prev.props.w ||
            next.props.h !== prev.props.h;
          if (!geomChanged) continue;
          pending = true;
          requestAnimationFrame(() => {
            pending = false;
            autoReposition(next.id);
          });
          return;
        }
      },
      { source: "user", scope: "document" },
    );
  }, []);

  // Keyboard shortcuts. Cmd/Ctrl+0 or Shift+0 zooms to selection / fit.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === " " && !inInput) {
        spaceHeldRef.current = true;
      }

      if (e.key === "0") {
        const metaLike = e.metaKey || e.ctrlKey;
        const shiftOnly = e.shiftKey && !metaLike && !e.altKey;
        if (!metaLike && !shiftOnly) return;
        if (inInput) return;
        e.preventDefault();
        const selectedIds = canvasStore.getSelectedIds();
        const screens = selectedIds
          .map((id) => canvasStore.getShape(id))
          .filter((s): s is ScreenShape => !!s);
        if (screens.length > 0) {
          const s = screens[0];
          const cx = s.x + s.props.w / 2;
          const cy = s.y + s.props.h / 2;
          const vp = canvasStore.getViewport();
          canvasStore.setCamera({
            x: vp.w / 2 - cx,
            y: vp.h / 2 - cy,
            z: 1,
          });
        } else {
          zoomToFitCapped(editor);
        }
        return;
      }

      // Delete selected screens
      if ((e.key === "Backspace" || e.key === "Delete") && !inInput) {
        const ids = canvasStore.getSelectedIds();
        if (ids.length === 0) return;
        e.preventDefault();
        canvasStore.deleteShapes(ids, "user");
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === " ") spaceHeldRef.current = false;
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Wheel — pan when unmodified, zoom when ctrl/⌘ held. Trackpad pinch comes
  // through as ctrlKey-wheel events on macOS.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rootEl = el;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const cam = canvasStore.getCamera();
      if (e.ctrlKey || e.metaKey) {
        const rect = rootEl.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        // Convert the point under the cursor from screen → page coords before
        // the zoom change so we can keep it pinned after.
        const pagePtX = (px - cam.x * cam.z) / cam.z;
        const pagePtY = (py - cam.y * cam.z) / cam.z;
        const factor = Math.exp(-e.deltaY * 0.01);
        const nextZ = clamp(cam.z * factor, MIN_ZOOM, MAX_ZOOM);
        const nx = px / nextZ - pagePtX;
        const ny = py / nextZ - pagePtY;
        canvasStore.setCamera({ x: nx, y: ny, z: nextZ });
      } else {
        canvasStore.setCamera({
          x: cam.x - e.deltaX / cam.z,
          y: cam.y - e.deltaY / cam.z,
          z: cam.z,
        });
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Root pointer handlers — decide what interaction is starting based on
  // target + modifiers.
  function onRootPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const tool = canvasModeStore.get();
    // Hand tool: drag anywhere pans; no selection, no click-through. Also
    // applies when the user holds space or middle-clicks in any other mode.
    if (tool === "hand" || e.button === 1 || spaceHeldRef.current) {
      const cam = canvasStore.getCamera();
      interactionRef.current = {
        kind: "pan",
        startX: e.clientX,
        startY: e.clientY,
        startCam: { x: cam.x, y: cam.y },
      };
      setInteractionTick((t) => t + 1);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Was the click on a handle or a shape?
    const handleEl = (e.target as HTMLElement).closest(
      "[data-oc-handle]",
    ) as HTMLElement | null;
    const shapeEl = (e.target as HTMLElement).closest(
      "[data-oc-shape]",
    ) as HTMLElement | null;

    if (handleEl && !shapeEl) {
      // Handle clicks are handled inside ResizeHandles — don't swallow them.
    }

    if (shapeEl) {
      const shapeId = shapeEl.getAttribute("data-oc-shape") as ShapeId | null;
      if (!shapeId) return;
      const selected = canvasStore.getSelectedIds();
      const isSelected = selected.includes(shapeId);
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        canvasStore.toggleInSelection(shapeId);
      } else if (!isSelected) {
        canvasStore.select(shapeId);
      }
      // Start dragging whichever shapes are now selected.
      const ids = canvasStore.getSelectedIds();
      const initial = new Map<ShapeId, { x: number; y: number }>();
      for (const id of ids) {
        const s = canvasStore.getShape(id);
        if (s) initial.set(id, { x: s.x, y: s.y });
      }
      const pagePt = screenToPage(rootRef.current, e.clientX, e.clientY);
      interactionRef.current = {
        kind: "drag-shapes",
        startPage: pagePt,
        currentPage: pagePt,
        initial,
        moved: false,
      };
      setInteractionTick((t) => t + 1);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Click on empty canvas → marquee / clear selection.
    const pagePt = screenToPage(rootRef.current, e.clientX, e.clientY);
    interactionRef.current = {
      kind: "marquee",
      startPage: pagePt,
      currentPage: pagePt,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
    };
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
      canvasStore.clearSelection();
    }
    setInteractionTick((t) => t + 1);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onRootPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const st = interactionRef.current;
    if (st.kind === "idle") return;
    if (st.kind === "pan") {
      const cam = canvasStore.getCamera();
      const dx = (e.clientX - st.startX) / cam.z;
      const dy = (e.clientY - st.startY) / cam.z;
      canvasStore.setCamera({
        x: st.startCam.x + dx,
        y: st.startCam.y + dy,
        z: cam.z,
      });
      return;
    }
    if (st.kind === "marquee") {
      st.currentPage = screenToPage(rootRef.current, e.clientX, e.clientY);
      setInteractionTick((t) => t + 1);
      return;
    }
    if (st.kind === "drag-shapes") {
      const pt = screenToPage(rootRef.current, e.clientX, e.clientY);
      const dx = pt.x - st.startPage.x;
      const dy = pt.y - st.startPage.y;
      if (!st.moved && Math.hypot(dx, dy) > 2) st.moved = true;
      st.currentPage = pt;
      if (st.moved) {
        const patches: Array<{ id: ShapeId; x: number; y: number }> = [];
        for (const [id, origin] of st.initial) {
          patches.push({ id, x: origin.x + dx, y: origin.y + dy });
        }
        // Snap to other screens' edges while dragging a single selection.
        let snappedDx = dx;
        let snappedDy = dy;
        if (st.initial.size === 1) {
          const [only] = [...st.initial.keys()];
          const shape = canvasStore.getShape(only);
          if (shape) {
            const snap = computeSnap(
              only,
              { x: shape.x + dx, y: shape.y + dy, w: shape.props.w, h: shape.props.h },
            );
            snappedDx = dx + snap.dx;
            snappedDy = dy + snap.dy;
            patches[0] = {
              id: only,
              x: st.initial.get(only)!.x + snappedDx,
              y: st.initial.get(only)!.y + snappedDy,
            };
          }
        }
        canvasStore.updateShapes(
          patches.map((p) => ({ id: p.id, type: "screen" as const, x: p.x, y: p.y })),
          "user",
        );
      }
      return;
    }
    if (st.kind === "resize") {
      const pt = screenToPage(rootRef.current, e.clientX, e.clientY);
      const dx = pt.x - st.startPage.x;
      const dy = pt.y - st.startPage.y;
      const next = resizeByHandle(st.handle, st.initial, dx, dy, e.shiftKey);
      canvasStore.updateShape(
        {
          id: st.shapeId,
          type: "screen",
          x: next.x,
          y: next.y,
          props: { w: next.w, h: next.h, viewportId: "custom" as const },
        },
        "user",
      );
      return;
    }
  }

  function onRootPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const st = interactionRef.current;
    if (st.kind === "marquee") {
      const rect = rectFromPoints(st.startPage, st.currentPage);
      // Tiny marquee (barely moved) counts as a simple background click — keep
      // the selection cleared from pointerdown and do nothing else.
      if (rect.w > 3 || rect.h > 3) {
        const hit: ShapeId[] = [];
        for (const s of canvasStore.getAllShapes()) {
          if (
            s.x < rect.x + rect.w &&
            s.x + s.props.w > rect.x &&
            s.y < rect.y + rect.h &&
            s.y + s.props.h > rect.y
          ) {
            hit.push(s.id);
          }
        }
        if (st.additive) {
          const prev = canvasStore.getSelectedIds();
          canvasStore.setSelected([...new Set([...prev, ...hit])]);
        } else {
          canvasStore.setSelected(hit);
        }
      }
    }
    if (st.kind === "drag-shapes" && st.moved) {
      // Bring the dragged shapes to front so they draw above static siblings.
      canvasStore.bringToFront([...st.initial.keys()]);
    }
    interactionRef.current = { kind: "idle" };
    setInteractionTick((t) => t + 1);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function startResize(
    handle: HandleId,
    shapeId: ShapeId,
    e: React.PointerEvent<HTMLDivElement>,
  ) {
    e.stopPropagation();
    const s = canvasStore.getShape(shapeId);
    if (!s) return;
    const pagePt = screenToPage(rootRef.current, e.clientX, e.clientY);
    interactionRef.current = {
      kind: "resize",
      handle,
      shapeId,
      startPage: pagePt,
      initial: { x: s.x, y: s.y, w: s.props.w, h: s.props.h },
    };
    setInteractionTick((t) => t + 1);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  const shapes = useValue("shapes", () => canvasStore.getAllShapes(), []);
  const selectedIds = useValue(
    "selected-ids",
    () => canvasStore.getSelectedIds(),
    [],
  );
  const camera = useValue("camera", () => canvasStore.getCamera(), []);
  useCanvasTick(); // also re-render on any store tick (for marquee live update)

  // Re-render this component on tool changes so the cursor + hit-test
  // behavior respond immediately when the toolbar flips modes.
  const [tool, setTool] = useState(() => canvasModeStore.get());
  useEffect(() => canvasModeStore.subscribe(setTool), []);

  const selectedSet = new Set(selectedIds);
  const interaction = interactionRef.current;

  // Dot grid tracks the camera: background-size scales with zoom so the
  // grid spacing stays 24 world-units, and background-position is the camera
  // translation in screen space, so pan visibly shifts the dots.
  const dotSize = 24 * camera.z;
  return (
    <div
      ref={rootRef}
      className="oc-canvas-root"
      data-theme={theme}

      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        backgroundSize: `${dotSize}px ${dotSize}px`,
        backgroundPosition: `${camera.x * camera.z}px ${camera.y * camera.z}px`,
        cursor:
          interaction.kind === "pan"
            ? "grabbing"
            : tool === "hand" || spaceHeldRef.current
              ? "grab"
              : tool === "annotator"
                ? "crosshair"
                : "default",
        touchAction: "none",
      }}
      onPointerDown={onRootPointerDown}
      onPointerMove={onRootPointerMove}
      onPointerUp={onRootPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
        {/* World layer — every shape lives in page coordinates inside this
            transformed box. One transform, one paint. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transformOrigin: "0 0",
            transform: `scale(${camera.z}) translate(${camera.x}px, ${camera.y}px)`,
            willChange: "transform",
          }}
        >
          {shapes.map((s) => (
            <div
              key={s.id}
              data-oc-shape={s.id}
              style={{
                position: "absolute",
                left: s.x,
                top: s.y,
                width: s.props.w,
                height: s.props.h,
                // The ScreenBody handles its own internal sizing; the wrapper
                // just places it in world coords.
              }}
            >
              <ScreenBody shape={s} />
              {selectedSet.has(s.id) && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    boxShadow: `0 0 0 ${1.5 / camera.z}px var(--accent-base)`,
                    borderRadius: 12,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Resize handles — screen coords (always the same visual size). */}
        {selectedIds.length === 1 &&
          (() => {
            const s = canvasStore.getShape(selectedIds[0]);
            if (!s) return null;
            const x = (s.x + camera.x) * camera.z;
            const y = (s.y + camera.y) * camera.z;
            const w = s.props.w * camera.z;
            const h = s.props.h * camera.z;
            return (
              <ResizeHandles
                x={x}
                y={y}
                w={w}
                h={h}
                onStart={(handle, e) => startResize(handle, s.id, e)}
              />
            );
          })()}

        {/* Marquee rectangle. */}
        {interaction.kind === "marquee" &&
          (() => {
            const rect = rectFromPoints(
              interaction.startPage,
              interaction.currentPage,
            );
            if (rect.w < 2 && rect.h < 2) return null;
            const sx = (rect.x + camera.x) * camera.z;
            const sy = (rect.y + camera.y) * camera.z;
            return (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: sx,
                  top: sy,
                  width: rect.w * camera.z,
                  height: rect.h * camera.z,
                  background:
                    "color-mix(in oklch, var(--accent-base) 10%, transparent)",
                  border: "1px solid var(--accent-base)",
                  borderRadius: 2,
                  pointerEvents: "none",
                }}
              />
            );
          })()}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Resize handles — 8 corner/edge handles rendered in screen coords.  */
/* ------------------------------------------------------------------ */

function ResizeHandles({
  x,
  y,
  w,
  h,
  onStart,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  onStart: (handle: HandleId, e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const handles: Array<{ id: HandleId; cx: number; cy: number; cursor: string }> = [
    { id: "tl", cx: x, cy: y, cursor: "nwse-resize" },
    { id: "t", cx: x + w / 2, cy: y, cursor: "ns-resize" },
    { id: "tr", cx: x + w, cy: y, cursor: "nesw-resize" },
    { id: "r", cx: x + w, cy: y + h / 2, cursor: "ew-resize" },
    { id: "br", cx: x + w, cy: y + h, cursor: "nwse-resize" },
    { id: "b", cx: x + w / 2, cy: y + h, cursor: "ns-resize" },
    { id: "bl", cx: x, cy: y + h, cursor: "nesw-resize" },
    { id: "l", cx: x, cy: y + h / 2, cursor: "ew-resize" },
  ];
  const size = 10;
  return (
    <>
      {handles.map((h) => (
        <div
          key={h.id}
          data-oc-handle={h.id}
          onPointerDown={(e) => onStart(h.id, e)}
          style={{
            position: "absolute",
            left: h.cx - size / 2,
            top: h.cy - size / 2,
            width: size,
            height: size,
            background: "white",
            border: "1.5px solid var(--accent-base)",
            borderRadius: 3,
            cursor: h.cursor,
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            zIndex: 30,
          }}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                   */
/* ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function screenToPage(
  root: HTMLElement | null,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  if (!root) return { x: clientX, y: clientY };
  const r = root.getBoundingClientRect();
  const cam = canvasStore.getCamera();
  const px = clientX - r.left;
  const py = clientY - r.top;
  return { x: px / cam.z - cam.x, y: py / cam.z - cam.y };
}

function rectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

function resizeByHandle(
  handle: HandleId,
  initial: { x: number; y: number; w: number; h: number },
  dx: number,
  dy: number,
  preserveAspect: boolean,
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = initial;
  const MIN = 40;
  if (handle.includes("l")) {
    const maxDx = initial.w - MIN;
    const cdx = Math.min(dx, maxDx);
    x = initial.x + cdx;
    w = initial.w - cdx;
  }
  if (handle.includes("r")) {
    w = Math.max(MIN, initial.w + dx);
  }
  if (handle.includes("t")) {
    const maxDy = initial.h - MIN;
    const cdy = Math.min(dy, maxDy);
    y = initial.y + cdy;
    h = initial.h - cdy;
  }
  if (handle.includes("b")) {
    h = Math.max(MIN, initial.h + dy);
  }
  if (preserveAspect && (handle.length === 2)) {
    // Corner drag with shift → keep aspect ratio.
    const ratio = initial.w / initial.h;
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
  }
  return { x, y, w, h };
}

function computeSnap(
  ignoreId: ShapeId,
  dragRect: { x: number; y: number; w: number; h: number },
): { dx: number; dy: number } {
  const THRESH = 6; // px in page units
  let bestDx = 0;
  let bestDxDist = Infinity;
  let bestDy = 0;
  let bestDyDist = Infinity;
  const candidatesX = [dragRect.x, dragRect.x + dragRect.w / 2, dragRect.x + dragRect.w];
  const candidatesY = [dragRect.y, dragRect.y + dragRect.h / 2, dragRect.y + dragRect.h];
  for (const other of canvasStore.getAllShapes()) {
    if (other.id === ignoreId) continue;
    const edgesX = [other.x, other.x + other.props.w / 2, other.x + other.props.w];
    const edgesY = [other.y, other.y + other.props.h / 2, other.y + other.props.h];
    for (const cx of candidatesX) {
      for (const ex of edgesX) {
        const d = ex - cx;
        if (Math.abs(d) < THRESH && Math.abs(d) < bestDxDist) {
          bestDx = d;
          bestDxDist = Math.abs(d);
        }
      }
    }
    for (const cy of candidatesY) {
      for (const ey of edgesY) {
        const d = ey - cy;
        if (Math.abs(d) < THRESH && Math.abs(d) < bestDyDist) {
          bestDy = d;
          bestDyDist = Math.abs(d);
        }
      }
    }
  }
  return { dx: bestDx, dy: bestDy };
}

function autoReposition(changedId: ShapeId) {
  const me = canvasStore.getShape(changedId);
  if (!me) return;
  const all = canvasStore
    .getAllShapes()
    .filter((s) => s.id !== me.id);
  const meL = me.x - SCREEN_GAP;
  const meR = me.x + me.props.w + SCREEN_GAP;
  const meT = me.y - SCREEN_GAP;
  const meB = me.y + me.props.h + SCREEN_GAP;
  const moves: Array<{ id: ShapeId; x: number; y: number }> = [];
  for (const other of all) {
    const oL = other.x;
    const oR = other.x + other.props.w;
    const oT = other.y;
    const oB = other.y + other.props.h;
    if (!(oR > meL && oL < meR) || !(oB > meT && oT < meB)) continue;
    const pushRight = meR - oL;
    const pushLeft = oR - meL;
    const pushDown = meB - oT;
    const pushUp = oB - meT;
    const minH = Math.min(pushRight, pushLeft);
    const minV = Math.min(pushDown, pushUp);
    let nx = other.x;
    let ny = other.y;
    if (minH <= minV) {
      nx =
        pushRight <= pushLeft
          ? me.x + me.props.w + SCREEN_GAP
          : me.x - other.props.w - SCREEN_GAP;
    } else {
      ny =
        pushDown <= pushUp
          ? me.y + me.props.h + SCREEN_GAP
          : me.y - other.props.h - SCREEN_GAP;
    }
    if (nx !== other.x || ny !== other.y) {
      moves.push({ id: other.id, x: nx, y: ny });
    }
  }
  if (moves.length === 0) return;
  canvasStore.updateShapes(
    moves.map((m) => ({ id: m.id, type: "screen" as const, x: m.x, y: m.y })),
    "remote",
  );
}
