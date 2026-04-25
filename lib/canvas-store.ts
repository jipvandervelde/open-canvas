/**
 * Native canvas store — replaces tldraw's editor.store. Holds every shape on
 * the canvas, the selection set, the editing shape, and the camera. Emits a
 * tick on every change; `useCanvasTick()` subscribes components that need to
 * re-render on any mutation.
 *
 * Shapes persist to localStorage so the canvas survives a reload. The camera
 * is session-only — tldraw behaved the same way.
 */

import { useEffect, useState } from "react";
import { DEFAULT_SCREEN_CODE, VIEWPORT_PRESETS_BY_ID } from "@/lib/viewports";
import type { ScreenShape, ShapeId } from "@/lib/shape-types";

const STORAGE_KEY_SHAPES = "oc:canvas-shapes-v1";

export type Camera = { x: number; y: number; z: number };
export type ViewportBounds = { x: number; y: number; w: number; h: number };

export type StoreChange = {
  source: "user" | "remote"; // "user" = drag/resize; "remote" = programmatic (agent)
  scope: "document" | "session";
  changes: {
    updated: Record<string, [ScreenShape, ScreenShape]>;
    added: Record<string, ScreenShape>;
    removed: Record<string, ScreenShape>;
  };
};

type StoreListener = (change: StoreChange) => void;

class CanvasStore {
  private shapes: Map<ShapeId, ScreenShape> = new Map();
  private order: ShapeId[] = [];
  private selected: Set<ShapeId> = new Set();
  private editingId: ShapeId | null = null;
  private camera: Camera = { x: 0, y: 0, z: 1 };
  private viewport: ViewportBounds = { x: 0, y: 0, w: 1, h: 1 };

  private tickListeners = new Set<() => void>();
  private storeListeners = new Set<{
    fn: StoreListener;
    opts: { source?: "user" | "remote" | "all"; scope?: "document" | "session" };
  }>();

  private hydrated = false;

  hydrate(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_SHAPES);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ScreenShape[];
      if (!Array.isArray(parsed)) return;
      for (const s of parsed) {
        if (s && s.id && s.type === "screen" && s.props) {
          this.shapes.set(s.id, s);
          this.order.push(s.id);
        }
      }
    } catch {
      /* ignore */
    }
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      const arr = this.order
        .map((id) => this.shapes.get(id))
        .filter((s): s is ScreenShape => !!s);
      window.localStorage.setItem(STORAGE_KEY_SHAPES, JSON.stringify(arr));
    } catch {
      /* ignore */
    }
  }

  private emit() {
    for (const fn of this.tickListeners) fn();
  }

  private emitStore(change: StoreChange) {
    for (const entry of this.storeListeners) {
      const { opts } = entry;
      if (opts.source && opts.source !== "all" && opts.source !== change.source)
        continue;
      if (opts.scope && opts.scope !== change.scope) continue;
      entry.fn(change);
    }
  }

  subscribe(fn: () => void): () => void {
    this.tickListeners.add(fn);
    return () => {
      this.tickListeners.delete(fn);
    };
  }

  listen(
    fn: StoreListener,
    opts: { source?: "user" | "remote" | "all"; scope?: "document" | "session" } = {},
  ): () => void {
    const entry = { fn, opts };
    this.storeListeners.add(entry);
    return () => {
      this.storeListeners.delete(entry);
    };
  }

  getShape(id: string | ShapeId): ScreenShape | undefined {
    return this.shapes.get(id as ShapeId);
  }

  getAllShapes(): ScreenShape[] {
    return this.order
      .map((id) => this.shapes.get(id))
      .filter((s): s is ScreenShape => !!s);
  }

  getAllShapeIds(): ShapeId[] {
    return [...this.order];
  }

  getSelectedIds(): ShapeId[] {
    return [...this.selected];
  }

  getEditingId(): ShapeId | null {
    return this.editingId;
  }

  getCamera(): Camera {
    return { ...this.camera };
  }

  getViewport(): ViewportBounds {
    return { ...this.viewport };
  }

  getPageBounds(): ViewportBounds | undefined {
    if (this.order.length === 0) return undefined;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of this.order) {
      const s = this.shapes.get(id);
      if (!s) continue;
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x + s.props.w > maxX) maxX = s.x + s.props.w;
      if (s.y + s.props.h > maxY) maxY = s.y + s.props.h;
    }
    if (!isFinite(minX)) return undefined;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  setViewport(v: ViewportBounds) {
    // Viewport measurement comes from the OpenCanvas container's getBoundingClientRect.
    // It shouldn't trigger tick subscribers — only the pan/zoom interactions do.
    this.viewport = v;
  }

  setCamera(c: Camera, _opts: { immediate?: boolean; animation?: unknown } = {}) {
    // We don't actually animate camera moves yet — just snap. The opts exist
    // so existing call sites that passed {animation:{duration:…}} still work.
    const next = { x: c.x, y: c.y, z: clampZoom(c.z) };
    if (
      next.x === this.camera.x &&
      next.y === this.camera.y &&
      next.z === this.camera.z
    )
      return;
    this.camera = next;
    this.emit();
    this.emitStore({
      source: "user",
      scope: "session",
      changes: { updated: {}, added: {}, removed: {} },
    });
  }

  addShape(shape: ScreenShape, source: "user" | "remote" = "remote") {
    if (this.shapes.has(shape.id)) {
      this.updateShape({ ...shape }, source);
      return;
    }
    this.shapes.set(shape.id, shape);
    this.order.push(shape.id);
    this.persist();
    this.emit();
    this.emitStore({
      source,
      scope: "document",
      changes: { updated: {}, added: { [shape.id]: shape }, removed: {} },
    });
  }

  updateShape(
    patch: {
      id: ShapeId | string;
      type?: "screen";
      x?: number;
      y?: number;
      props?: Partial<ScreenShape["props"]>;
    },
    source: "user" | "remote" = "remote",
  ) {
    const prev = this.shapes.get(patch.id as ShapeId);
    if (!prev) return;
    const next: ScreenShape = {
      ...prev,
      x: patch.x ?? prev.x,
      y: patch.y ?? prev.y,
      props: { ...prev.props, ...(patch.props ?? {}) },
    };
    if (
      next.x === prev.x &&
      next.y === prev.y &&
      shallowEqualProps(next.props, prev.props)
    ) {
      return;
    }
    this.shapes.set(next.id, next);
    this.persist();
    this.emit();
    this.emitStore({
      source,
      scope: "document",
      changes: { updated: { [next.id]: [prev, next] }, added: {}, removed: {} },
    });
  }

  updateShapes(
    patches: Array<{
      id: ShapeId | string;
      type?: "screen";
      x?: number;
      y?: number;
      props?: Partial<ScreenShape["props"]>;
    }>,
    source: "user" | "remote" = "remote",
  ) {
    const updated: Record<string, [ScreenShape, ScreenShape]> = {};
    for (const patch of patches) {
      const prev = this.shapes.get(patch.id as ShapeId);
      if (!prev) continue;
      const next: ScreenShape = {
        ...prev,
        x: patch.x ?? prev.x,
        y: patch.y ?? prev.y,
        props: { ...prev.props, ...(patch.props ?? {}) },
      };
      if (
        next.x === prev.x &&
        next.y === prev.y &&
        shallowEqualProps(next.props, prev.props)
      )
        continue;
      this.shapes.set(next.id, next);
      updated[next.id] = [prev, next];
    }
    if (Object.keys(updated).length === 0) return;
    this.persist();
    this.emit();
    this.emitStore({
      source,
      scope: "document",
      changes: { updated, added: {}, removed: {} },
    });
  }

  deleteShapes(ids: Array<ShapeId | string>, source: "user" | "remote" = "user") {
    const removed: Record<string, ScreenShape> = {};
    for (const id of ids) {
      const s = this.shapes.get(id as ShapeId);
      if (!s) continue;
      this.shapes.delete(s.id);
      this.order = this.order.filter((x) => x !== s.id);
      this.selected.delete(s.id);
      if (this.editingId === s.id) this.editingId = null;
      removed[s.id] = s;
    }
    if (Object.keys(removed).length === 0) return;
    this.persist();
    this.emit();
    this.emitStore({
      source,
      scope: "document",
      changes: { updated: {}, added: {}, removed },
    });
  }

  setSelected(ids: Array<ShapeId | string>) {
    const next = new Set(ids as ShapeId[]);
    if (eqSet(next, this.selected)) return;
    this.selected = next;
    this.emit();
    this.emitStore({
      source: "user",
      scope: "session",
      changes: { updated: {}, added: {}, removed: {} },
    });
  }

  select(id: ShapeId | string) {
    this.setSelected([id]);
  }

  addToSelection(id: ShapeId | string) {
    if (this.selected.has(id as ShapeId)) return;
    const next = new Set(this.selected);
    next.add(id as ShapeId);
    this.selected = next;
    this.emit();
  }

  toggleInSelection(id: ShapeId | string) {
    const next = new Set(this.selected);
    if (next.has(id as ShapeId)) next.delete(id as ShapeId);
    else next.add(id as ShapeId);
    this.selected = next;
    this.emit();
  }

  clearSelection() {
    if (this.selected.size === 0) return;
    this.selected = new Set();
    this.emit();
  }

  setEditingId(id: ShapeId | string | null) {
    const next = (id ?? null) as ShapeId | null;
    if (next === this.editingId) return;
    this.editingId = next;
    this.emit();
  }

  bringToFront(ids: Array<ShapeId | string>) {
    const set = new Set(ids as ShapeId[]);
    const rest = this.order.filter((id) => !set.has(id));
    const moved = this.order.filter((id) => set.has(id));
    this.order = [...rest, ...moved];
    this.persist();
    this.emit();
  }

  // Zoom helpers — ported from what tldraw gave us. The camera translation
  // is applied in canvas-root coordinates (origin at canvas-root top-left).
  // With the canvas edge-to-edge and panels floating on top, canvas-root's
  // origin is the screen origin — so "center in visible area" means
  // `vp.x + vp.w/2` (where vp.x is the left-panel width), NOT `vp.w/2`.
  zoomToFit(opts: { animation?: unknown } = {}) {
    void opts;
    const bounds = this.getPageBounds();
    if (!bounds) return;
    const vp = this.viewport;
    const pad = 80;
    const sx = (vp.w - pad * 2) / bounds.w;
    const sy = (vp.h - pad * 2) / bounds.h;
    const z = clampZoom(Math.min(sx, sy));
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    this.setCamera({
      x: (vp.x + vp.w / 2) / z - cx,
      y: (vp.y + vp.h / 2) / z - cy,
      z,
    });
  }

  zoomToSelection(opts: { animation?: unknown } = {}) {
    void opts;
    const ids = [...this.selected];
    if (ids.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of ids) {
      const s = this.shapes.get(id);
      if (!s) continue;
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x + s.props.w > maxX) maxX = s.x + s.props.w;
      if (s.y + s.props.h > maxY) maxY = s.y + s.props.h;
    }
    if (!isFinite(minX)) return;
    const w = maxX - minX;
    const h = maxY - minY;
    const vp = this.viewport;
    const pad = 60;
    const sx = (vp.w - pad * 2) / w;
    const sy = (vp.h - pad * 2) / h;
    const z = clampZoom(Math.min(sx, sy, 1));
    const cx = minX + w / 2;
    const cy = minY + h / 2;
    this.setCamera({
      x: (vp.x + vp.w / 2) / z - cx,
      y: (vp.y + vp.h / 2) / z - cy,
      z,
    });
  }
}

function clampZoom(z: number): number {
  if (!isFinite(z) || z <= 0) return 1;
  return Math.max(0.05, Math.min(8, z));
}

function shallowEqualProps(a: Record<string, unknown>, b: Record<string, unknown>) {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

function eqSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export const canvasStore = new CanvasStore();

if (typeof window !== "undefined") {
  canvasStore.hydrate();
  // Seed a starter screen when the canvas is completely empty (first-run UX).
  if (canvasStore.getAllShapes().length === 0) {
    const v = VIEWPORT_PRESETS_BY_ID["iphone-17-pro"];
    canvasStore.addShape({
      id: createShapeId(),
      type: "screen",
      x: -v.width / 2,
      y: -v.height / 2,
      props: {
        w: v.width,
        h: v.height,
        name: "Home",
        viewportId: "iphone-17-pro",
        code: DEFAULT_SCREEN_CODE,
        statusBarStyle: "dark",
        parentScreenId: "",
      },
    });
  }
}

/**
 * Generate a stable shape id. Format mirrors tldraw's `shape:xxx` so the string
 * interop with any code that compared substrings or passed ids to external
 * services still works.
 */
export function createShapeId(): ShapeId {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 18);
  return `shape:${rand}` as ShapeId;
}

/**
 * Subscribe-and-re-render hook. Any component that reads from the store should
 * call this so it re-renders when the store mutates. Returns the current tick
 * counter; components rarely need the value itself.
 */
export function useCanvasTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => canvasStore.subscribe(() => setTick((t) => t + 1)), []);
  return tick;
}

/**
 * tldraw-compatible `useValue(name, compute, deps)` hook. Subscribes to the
 * canvas store and re-runs `compute` on every tick. The `name` is ignored —
 * tldraw used it for devtools labels.
 */
export function useValue<T>(
  _name: string,
  compute: () => T,
  _deps: unknown[],
): T {
  useCanvasTick();
  return compute();
}
