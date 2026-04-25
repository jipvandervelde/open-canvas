"use client";

import { useEffect } from "react";
import {
  selectedElementStore,
  type SelectedElement,
} from "@/lib/selected-element-store";
import { streamingStore } from "@/lib/streaming-store";
import { screenErrorLog } from "@/lib/screen-error-log";
import { routeTableStore } from "@/lib/route-table-store";
import { designDataStore } from "@/lib/design-data-store";
import { useEditorRef } from "@/lib/editor-context";
import type { ScreenShape } from "@/components/ScreenShapeUtil";

/**
 * Listens for postMessage events posted back from in-iframe selection agents
 * (oc:select / oc:clear) and pushes the result into selectedElementStore.
 *
 * The outbound broadcast of "mode + armed" lives inside each ScreenShapeBody
 * because that's where we have direct iframe access.
 */
export function ElementSelectionBridge() {
  const { editor } = useEditorRef();

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || typeof data !== "object") return;
      const marker = (data as { __oc?: string }).__oc;
      if (marker === "oc:navigate") {
        // The right-side simulator owns its own click-through state. Canvas
        // route navigation should only respond to iframes embedded on the
        // canvas itself, otherwise preview clicks unexpectedly change canvas
        // selection.
        if (isMessageFromPreviewPanel(e.source)) return;
        const d = data as { to?: string; params?: Record<string, string> };
        if (!d.to || !editor) return;
        const route = routeTableStore.findByPath(d.to);
        if (!route) return;
        const params = d.params ?? {};
        if (params.id) {
          const target = editor
            .getCurrentPageShapes()
            .find((s) => s.id === route.id) as ScreenShape | undefined;
          const entity = target
            ? designDataStore
                .get()
                .find((e) => target.props.code.includes(`./data/${e.name}`))
            : null;
          editor.updateShape({
            id: route.id as ScreenShape["id"],
            type: "screen",
            props: {
              dataRecordId: String(params.id),
              ...(entity ? { dataEntityName: entity.name } : null),
            },
          });
        }
        // Pan + select the target screen on the canvas.
        editor.select(route.id as ScreenShape["id"]);
        editor.zoomToSelection({ animation: { duration: 360 } });
        // Forward route params to the target iframe so its useParams() hook
        // picks up the new value. Need a tiny delay — the iframe may have
        // been unmounted/remounted by selection state. We retry a couple of
        // times because Sandpack reloads asynchronously.
        const postParams = () => {
          const selector = `iframe[title="Sandpack Preview"]`;
          const iframes = document.querySelectorAll<HTMLIFrameElement>(selector);
          for (const f of iframes) {
            try {
              f.contentWindow?.postMessage(
                { __oc: "oc:route-params", params, targetScreenId: route.id },
                "*",
              );
            } catch {
              /* ignore cross-origin */
            }
          }
        };
        postParams();
        window.setTimeout(postParams, 120);
        window.setTimeout(postParams, 400);
        return;
      }
      if (marker === "oc:select") {
        const d = data as {
          screenId: string;
          payload: Omit<SelectedElement, "screenId">;
        };
        if (!d.screenId || !d.payload) return;
        selectedElementStore.set({ ...d.payload, screenId: d.screenId });
      } else if (marker === "oc:clear") {
        const d = data as { screenId: string };
        selectedElementStore.clearForScreen(d.screenId);
      } else if (marker === "oc:agent-pos") {
        const d = data as {
          screenId: string;
          rect: { x: number; y: number; w: number; h: number };
        };
        if (!d.screenId || !d.rect) return;
        streamingStore.updatePositionByScreen(d.screenId, d.rect);
      } else if (marker === "oc:runtime-error") {
        const d = data as {
          screenId?: string | null;
          message?: string;
          stack?: string | null;
        };
        if (!d.message) return;
        // Fall back to "unknown" screen bucket if the iframe hadn't received
        // its set-mode yet — the error pill won't show, but the console and
        // window.__screenErrorLog still capture it.
        const target = d.screenId || "unknown";
        const full = d.stack ? `${d.message}\n${d.stack}` : d.message;
        screenErrorLog.record(target, "runtime", full);
      } else if (marker === "oc:debug") {
        const w = window as unknown as { __ocDebugAgent?: unknown[] };
        if (!w.__ocDebugAgent) w.__ocDebugAgent = [];
        (w.__ocDebugAgent as unknown[]).push({ at: Date.now(), ...(data as Record<string, unknown>) });
        if ((w.__ocDebugAgent as unknown[]).length > 100) (w.__ocDebugAgent as unknown[]).shift();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [editor]);

  return null;
}

function isMessageFromPreviewPanel(source: MessageEventSource | null): boolean {
  if (!source) return false;
  const panel = document.querySelector(".oc-preview");
  if (!panel) return false;
  const iframes = panel.querySelectorAll<HTMLIFrameElement>(
    'iframe[title="Sandpack Preview"]',
  );
  for (const iframe of iframes) {
    if (iframe.contentWindow === source) return true;
  }
  return false;
}
