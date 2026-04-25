/**
 * Thin compatibility layer that exposes a tldraw-like `editor` object over
 * our native canvasStore. Every file in the app that used to call
 * `editor.getSelectedShapeIds()`, `editor.createShape(...)`, etc. keeps
 * working without changes — we translate each call into the corresponding
 * canvasStore mutation.
 *
 * This is NOT a full Editor reimplementation. It only covers the methods the
 * app actually uses (see the BRAINSTORM / Agent survey for the list).
 */

import { canvasStore, createShapeId as createId, type Camera } from "@/lib/canvas-store";
import type { ScreenShape, ShapeId } from "@/lib/shape-types";

type ShapePatch<T extends ScreenShape = ScreenShape> = {
  id: T["id"] | string;
  type?: T["type"];
  x?: number;
  y?: number;
  props?: Partial<T["props"]>;
};

type ShapeCreate<T extends ScreenShape = ScreenShape> = {
  id?: T["id"] | string;
  type: T["type"];
  x?: number;
  y?: number;
  props: Partial<T["props"]>;
};

export interface Editor {
  getShape(id: string): ScreenShape | undefined;
  getSelectedShapeIds(): ShapeId[];
  getCurrentPageShapes(): ScreenShape[];
  getCurrentPageShapeIds(): Set<ShapeId>;
  createShape<T extends ScreenShape = ScreenShape>(shape: ShapeCreate<T>): void;
  updateShape<T extends ScreenShape = ScreenShape>(patch: ShapePatch<T>): void;
  updateShapes<T extends ScreenShape = ScreenShape>(patches: ShapePatch<T>[]): void;
  deleteShapes(ids: Array<ShapeId | string>): void;
  select(...ids: Array<ShapeId | string>): void;
  zoomToSelection(opts?: { animation?: { duration: number } }): void;
  zoomToFit(opts?: { animation?: { duration: number } }): void;
  getCamera(): Camera;
  setCamera(c: Camera, opts?: { immediate?: boolean; animation?: { duration: number } }): void;
  getViewportScreenBounds(): { x: number; y: number; w: number; h: number };
  getCurrentPageBounds(): { x: number; y: number; w: number; h: number } | undefined;
  getEditingShapeId(): ShapeId | null;
  getCurrentToolId(): string;
  toImage(
    ids: Array<ShapeId | string>,
    opts?: { format?: string; background?: boolean; padding?: number; scale?: number },
  ): Promise<{ blob: Blob }>;
  user: {
    updateUserPreferences(prefs: Record<string, unknown>): void;
  };
  store: {
    listen(
      fn: (entry: {
        source: "user" | "remote";
        scope: "document" | "session";
        changes: {
          updated: Record<string, [ScreenShape, ScreenShape]>;
          added: Record<string, ScreenShape>;
          removed: Record<string, ScreenShape>;
        };
      }) => void,
      opts?: { source?: "user" | "remote" | "all"; scope?: "document" | "session" },
    ): () => void;
  };
}

class CanvasEditor implements Editor {
  // Used by canvas UI to toggle between "select" and legacy tool labels. We
  // only ever return "select"; legacy style-panel/tool visibility code reads
  // this to decide whether to show options we don't have anymore.
  private toolId: string = "select";

  getShape(id: string): ScreenShape | undefined {
    return canvasStore.getShape(id);
  }

  getSelectedShapeIds(): ShapeId[] {
    return canvasStore.getSelectedIds();
  }

  getCurrentPageShapes(): ScreenShape[] {
    return canvasStore.getAllShapes();
  }

  getCurrentPageShapeIds(): Set<ShapeId> {
    return new Set(canvasStore.getAllShapeIds());
  }

  createShape<T extends ScreenShape = ScreenShape>(shape: ShapeCreate<T>): void {
    const id = (shape.id ?? createId()) as ShapeId;
    const base: ScreenShape = {
      id,
      type: "screen",
      x: shape.x ?? 0,
      y: shape.y ?? 0,
      props: {
        w: 402,
        h: 874,
        name: "Untitled screen",
        viewportId: "iphone-17-pro",
        code: "",
        statusBarStyle: "dark",
        parentScreenId: "",
        ...(shape.props as Partial<ScreenShape["props"]>),
      } as ScreenShape["props"],
    };
    canvasStore.addShape(base, "remote");
  }

  updateShape<T extends ScreenShape = ScreenShape>(patch: ShapePatch<T>): void {
    canvasStore.updateShape(
      {
        id: patch.id as string,
        type: "screen",
        x: patch.x,
        y: patch.y,
        props: patch.props as Partial<ScreenShape["props"]> | undefined,
      },
      "remote",
    );
  }

  updateShapes<T extends ScreenShape = ScreenShape>(patches: ShapePatch<T>[]): void {
    canvasStore.updateShapes(
      patches.map((p) => ({
        id: p.id as string,
        type: "screen" as const,
        x: p.x,
        y: p.y,
        props: p.props as Partial<ScreenShape["props"]> | undefined,
      })),
      "remote",
    );
  }

  deleteShapes(ids: Array<ShapeId | string>): void {
    canvasStore.deleteShapes(ids, "user");
  }

  select(...ids: Array<ShapeId | string>): void {
    // Match tldraw: `editor.select()` with no args clears the selection.
    canvasStore.setSelected(ids);
  }

  zoomToSelection(opts?: { animation?: { duration: number } }): void {
    canvasStore.zoomToSelection(opts);
  }

  zoomToFit(opts?: { animation?: { duration: number } }): void {
    canvasStore.zoomToFit(opts);
  }

  getCamera(): Camera {
    return canvasStore.getCamera();
  }

  setCamera(
    c: Camera,
    opts?: { immediate?: boolean; animation?: { duration: number } },
  ): void {
    canvasStore.setCamera(c, opts);
  }

  getViewportScreenBounds(): { x: number; y: number; w: number; h: number } {
    return canvasStore.getViewport();
  }

  getCurrentPageBounds():
    | { x: number; y: number; w: number; h: number }
    | undefined {
    return canvasStore.getPageBounds();
  }

  getEditingShapeId(): ShapeId | null {
    return canvasStore.getEditingId();
  }

  getCurrentToolId(): string {
    return this.toolId;
  }

  async toImage(
    _ids: Array<ShapeId | string>,
    _opts?: { format?: string; background?: boolean; padding?: number; scale?: number },
  ): Promise<{ blob: Blob }> {
    // Sketch-to-UI relied on tldraw's draw tool + SVG export. We removed the
    // draw tool; this method stays as a stub so the sketch button fails
    // gracefully instead of crashing.
    throw new Error(
      "Sketch export is no longer supported — the drawing tool was removed from the canvas.",
    );
  }

  user = {
    updateUserPreferences(_prefs: Record<string, unknown>): void {
      // No-op. Theme syncing happens via themeStore directly, and snap mode
      // is always-on in our resize handler.
    },
  };

  store = {
    listen: canvasStore.listen.bind(canvasStore),
  };
}

export const editor: Editor = new CanvasEditor();

/** tldraw-compatible shape-id factory. */
export const createShapeId = createId;

// Expose editor on window in dev so the console shortcut `__editor` keeps
// working (useful for debugging, and a couple of overlays read it).
if (typeof window !== "undefined") {
  (window as unknown as { __editor: Editor }).__editor = editor;
}
