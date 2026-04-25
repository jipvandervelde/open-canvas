"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Agentation,
  type AgentationProps,
  type Annotation,
} from "@/components/Agentation";
import { sendQuickReply } from "@/lib/quick-replies-store";
import { canvasModeStore } from "@/lib/canvas-mode-store";
import {
  agentationAnnotationsStore,
  formatAnnotationAsFixPrompt,
} from "@/lib/agentation-annotations-store";
import { canvasStore } from "@/lib/canvas-store";

/**
 * Iframe-local coordinates captured at click time. We keep these per
 * annotation so the pin can be re-projected into parent-viewport space on
 * every canvas change — without this, pins would freeze at the absolute
 * pixel position they were first dropped and drift away from their element
 * the moment the canvas pans or zooms.
 *
 * Persisted to localStorage alongside agentation's own annotation cache so
 * pins survive reloads.
 */
type AnnotationAnchor = {
  screenId: string;
  localX: number;
  localY: number;
  localW: number;
  localH: number;
};
const ANCHORS_KEY = "oc:agentation-anchors";
function loadAnchors(): Record<string, AnnotationAnchor> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ANCHORS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AnnotationAnchor>) : {};
  } catch {
    return {};
  }
}
function saveAnchors(a: Record<string, AnnotationAnchor>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANCHORS_KEY, JSON.stringify(a));
  } catch {
    /* storage full / disabled — ignore */
  }
}

/**
 * Native agentation integration for Open Canvas.
 *
 * Our screens render inside Sandpack iframes, and agentation's element picker
 * (running in the parent) can't pierce the iframe boundary — `elementFromPoint`
 * stops at the iframe element. Without a bridge, the whole screen looks like
 * a single opaque rectangle to agentation.
 *
 * This component bridges the gap by piggy-backing on the in-iframe selection
 * agent we already inject into every Sandpack preview (see
 * `lib/screen-runtime.tsx`). When agentation goes active:
 *
 *   1) We post `oc:set-mode {mode: "agentation"}` to every Sandpack iframe,
 *      arming a throttled hover/click stream inside each document.
 *   2) The in-iframe agent posts `oc:agentation-hover` / `oc:agentation-click`
 *      messages with the hovered element's rich descriptor (name, CSS path,
 *      bounding box, computed styles) in iframe-local coordinates.
 *   3) We translate the rect to parent-viewport coords (adding the iframe's
 *      own bounding box) and feed them into agentation via its `externalHover`
 *      / `externalClick` props, so agentation renders its overlay and opens
 *      its annotation popup as if it had picked the element itself.
 *
 * The `onSubmit` → `sendQuickReply` wire dumps the AFS markdown output
 * straight into the chat composer when the user hits "Send to Agent".
 */
export function AgentationBar() {
  const [externalHover, setExternalHover] = useState<
    AgentationProps["externalHover"]
  >(null);
  const [externalClick, setExternalClick] = useState<
    AgentationProps["externalClick"]
  >(null);
  const isActiveRef = useRef(false);

  // Anchors keyed by annotation id. Plus a "staging" anchor for the most
  // recent iframe click — agentation creates the annotation id only when
  // the user actually commits, so we hold the coords aside and promote
  // them on the next `onAnnotationAdd`.
  const anchorsRef = useRef<Record<string, AnnotationAnchor>>({});
  const stagingAnchorRef = useRef<AnnotationAnchor | null>(null);
  // Mirror of agentation's annotations list (declared early so a single
  // mount-time effect can seed it from localStorage).
  const listRef = useRef<Annotation[]>([]);
  useEffect(() => {
    anchorsRef.current = loadAnchors();
    // Seed the side-channel list from agentation's own localStorage so the
    // chat composer can resolve `#N` references immediately after reload —
    // agentation only emits onAnnotationAdd on user interaction, not when
    // it rehydrates its state from storage.
    try {
      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(
              `feedback-annotations-${window.location.pathname}`,
            )
          : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Annotation[];
        if (Array.isArray(parsed)) {
          listRef.current = parsed;
          agentationAnnotationsStore.set(parsed.slice());
        }
      }
    } catch {
      /* ignore corrupt cache */
    }
  }, []);

  // Pins need re-positioning whenever the canvas camera moves, but the
  // override fn queries `iframe.getBoundingClientRect()` — which returns
  // the iframe's *committed* position. If we just subscribe to the store
  // and re-render synchronously, React runs the override BEFORE the
  // canvas transform DOM change has flushed, and we read a stale rect.
  // Instead: subscribe to the store, then schedule the tick bump in
  // `requestAnimationFrame` so it fires after layout settles.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    let pending = false;
    const bump = () => {
      raf = 0;
      pending = false;
      setTick((t) => t + 1);
    };
    const schedule = () => {
      if (pending) return;
      pending = true;
      raf = requestAnimationFrame(bump);
    };
    const unsubscribe = canvasStore.subscribe(schedule);
    return () => {
      unsubscribe();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Agentation's isActive state resets on every reload, but canvasMode can
  // still be "agentation" from a prior session via localStorage. Bring them
  // back in sync: if the store says we're in agentation mode but agentation
  // itself hasn't woken up yet, drop to "cursor" so the iframes stop being
  // armed for a component that will never respond.
  useEffect(() => {
    if (canvasModeStore.get() === "agentation" && !isActiveRef.current) {
      canvasModeStore.set("cursor");
    }
  }, []);

  // Find every Sandpack preview iframe currently in the document. Sandpack
  // tags its iframe with `title="Sandpack Preview"` (see their source) — the
  // same lookup `ElementSelectionBridge` uses for route-param dispatch.
  const getSandpackIframes = useCallback((): HTMLIFrameElement[] => {
    return Array.from(
      document.querySelectorAll<HTMLIFrameElement>(
        'iframe[title="Sandpack Preview"]',
      ),
    );
  }, []);

  // Agentation notifies us via onActiveChange whenever the user toggles its
  // active state (Cmd+Shift+F, clicking the collapsed pill, pressing Esc).
  // We flip the canvas mode to "agentation" so every ScreenBody naturally
  // relays the right mode to its Sandpack iframe — ScreenBody already owns
  // the postMode loop (retries, HMR reloads, iframe MutationObserver). We
  // don't double-drive it from here.
  const onActiveChange = useCallback(
    (active: boolean) => {
      if (isActiveRef.current === active) return;
      isActiveRef.current = active;
      canvasModeStore.set(active ? "agentation" : "cursor");
      if (!active) {
        setExternalHover(null);
      }
    },
    [],
  );

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || typeof data !== "object") return;
      const marker = (data as { __oc?: string }).__oc;
      if (!marker) return;

      if (marker === "oc:agentation-hover" || marker === "oc:agentation-click") {
        const d = data as {
          screenId: string;
          payload: {
            tag: string;
            label?: string;
            path: string;
            rect: { x: number; y: number; w: number; h: number };
            directText?: string;
          };
          clientX: number;
          clientY: number;
        };
        // Find the iframe that emitted this message so we can translate
        // iframe-local coordinates to the parent viewport.
        const iframe = getSandpackIframes().find(
          (f) => f.contentWindow === e.source,
        );
        if (!iframe) return;
        const iframeRect = iframe.getBoundingClientRect();
        const parentX = iframeRect.left + d.clientX;
        const parentY = iframeRect.top + d.clientY;
        const parentRect = {
          x: iframeRect.left + d.payload.rect.x,
          y: iframeRect.top + d.payload.rect.y,
          width: d.payload.rect.w,
          height: d.payload.rect.h,
        };
        // Use the describe() label as the human-readable name, falling back to
        // the raw tag if the in-iframe agent didn't produce one.
        const elementName = d.payload.label || d.payload.tag;
        const elementDisplay =
          d.payload.directText && d.payload.directText.length > 0
            ? `${d.payload.tag} "${d.payload.directText.slice(0, 40)}"`
            : d.payload.tag;
        const base = {
          clientX: parentX,
          clientY: parentY,
          elementName,
          element: elementDisplay,
          elementPath: d.payload.path,
          rect: parentRect,
          reactComponents: null,
        };
        if (marker === "oc:agentation-hover") {
          setExternalHover(base);
        } else {
          // Stash the iframe-local coords keyed to "the next annotation
          // that gets added." When onAnnotationAdd fires with the real id
          // we move this into `anchorsRef`.
          stagingAnchorRef.current = {
            screenId: d.screenId,
            localX: d.payload.rect.x,
            localY: d.payload.rect.y,
            localW: d.payload.rect.w,
            localH: d.payload.rect.h,
          };
          setExternalClick({ ...base, token: Date.now() });
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [getSandpackIframes]);

  // Keep our side-channel annotation list in sync with agentation's internal
  // state. Agentation emits onAnnotationAdd/Update/Delete/Clear — we mirror
  // the deltas into the side store so the chat composer can resolve `#N`
  // references without poking agentation's internals.
  const publish = useCallback(() => {
    agentationAnnotationsStore.set(listRef.current.slice());
  }, []);

  return (
    <Agentation
      onSubmit={(markdown) => {
        sendQuickReply(markdown);
      }}
      onActiveChange={onActiveChange}
      externalHover={externalHover}
      externalClick={externalClick}
      onAnnotationAdd={(a) => {
        listRef.current.push(a);
        if (stagingAnchorRef.current) {
          anchorsRef.current[a.id] = stagingAnchorRef.current;
          stagingAnchorRef.current = null;
          saveAnchors(anchorsRef.current);
        }
        publish();
      }}
      onAnnotationUpdate={(a) => {
        const idx = listRef.current.findIndex((x) => x.id === a.id);
        if (idx >= 0) {
          listRef.current[idx] = a;
          publish();
        }
      }}
      onAnnotationDelete={(a) => {
        listRef.current = listRef.current.filter((x) => x.id !== a.id);
        if (anchorsRef.current[a.id]) {
          delete anchorsRef.current[a.id];
          saveAnchors(anchorsRef.current);
        }
        publish();
      }}
      onAnnotationsClear={() => {
        listRef.current = [];
        anchorsRef.current = {};
        saveAnchors({});
        publish();
      }}
      positionTick={tick}
      getAnnotationPosition={(a) => {
        const anchor = anchorsRef.current[a.id];
        if (!anchor) return null;
        const screen = document.querySelector<HTMLElement>(
          `[data-screen-id="${anchor.screenId}"]`,
        );
        const iframe = screen?.querySelector<HTMLIFrameElement>(
          'iframe[title="Sandpack Preview"]',
        );
        if (!iframe) return null;
        const r = iframe.getBoundingClientRect();
        const centerX = r.left + anchor.localX + anchor.localW / 2;
        const topY = r.top + anchor.localY;
        return {
          x: (centerX / window.innerWidth) * 100,
          y: topY + window.scrollY,
          boundingBox: {
            x: r.left + anchor.localX,
            y: r.top + anchor.localY + window.scrollY,
            width: anchor.localW,
            height: anchor.localH,
          },
          isFixed: false,
        };
      }}
      onAnnotationFix={(annotation) => {
        // Find the pin number at fix-time so the composer + direct-Fix
        // format stay identical.
        const list = agentationAnnotationsStore.get();
        const idx = list.findIndex((x) => x.id === annotation.id);
        const pinNumber = idx >= 0 ? idx + 1 : undefined;
        sendQuickReply(formatAnnotationAsFixPrompt(annotation, pinNumber));
      }}
    />
  );
}
