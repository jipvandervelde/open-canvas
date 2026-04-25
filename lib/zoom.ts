import type { Editor } from "@/lib/editor-shim";

/**
 * zoomToFit that caps the zoom level at 1.0 (100%). Default zoomToFit will
 * blow past 100% when there's a small artboard on a large viewport, which
 * makes mobile screens look pixelated and cropped.
 */
export function zoomToFitCapped(
  editor: Editor,
  opts: { animation?: { duration: number } } = {},
) {
  editor.zoomToFit({ animation: opts.animation });
  const cam = editor.getCamera();
  if (cam.z > 1) {
    const bounds = editor.getCurrentPageBounds();
    if (bounds) {
      const viewport = editor.getViewportScreenBounds();
      const centerX = bounds.x + bounds.w / 2;
      const centerY = bounds.y + bounds.h / 2;
      // Center in the visible (non-panel) region of the canvas.
      editor.setCamera(
        {
          x: viewport.x + viewport.w / 2 - centerX,
          y: viewport.y + viewport.h / 2 - centerY,
          z: 1,
        },
        opts.animation ? { animation: opts.animation } : { immediate: true },
      );
    } else {
      editor.setCamera(
        { ...cam, z: 1 },
        opts.animation ? { animation: opts.animation } : { immediate: true },
      );
    }
  }
}
