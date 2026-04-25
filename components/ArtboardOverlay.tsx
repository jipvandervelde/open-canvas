"use client";

import { useEffect, useRef, useState } from "react";
import { useValue } from "@/lib/canvas-store";
import { useEditorRef } from "@/lib/editor-context";
import {
  VIEWPORT_PRESETS,
  VIEWPORT_PRESETS_BY_ID,
  type ViewportPresetId,
} from "@/lib/viewports";
import { streamingStore, type StreamingMarker } from "@/lib/streaming-store";
import {
  screenStatusStore,
  type ScreenCompileStatus,
} from "@/lib/screen-status-store";
import {
  screenErrorLog,
  type ScreenErrorEntry,
} from "@/lib/screen-error-log";
import { screenResetStore } from "@/lib/screen-reset-store";
import type { ScreenShape } from "@/components/ScreenShapeUtil";

type PillData = {
  id: string;
  name: string;
  viewportId: ViewportPresetId;
  w: number;
  h: number;
  x: number; // screen pixel x of top-left
  y: number; // screen pixel y of top-left
  zoom: number;
  isSelected: boolean;
  parentScreenId: string; // "" when top-level
};

export function ArtboardOverlay() {
  const { editor } = useEditorRef();
  const [streamingMarkers, setStreamingMarkers] = useState<StreamingMarker[]>([]);
  const [compileStatuses, setCompileStatuses] = useState<
    Map<string, ScreenCompileStatus>
  >(new Map());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>("");
  const [errorPopoverFor, setErrorPopoverFor] = useState<string | null>(null);
  const [errorLogs, setErrorLogs] = useState<
    Map<string, ScreenErrorEntry[]>
  >(new Map());

  useEffect(() => {
    setErrorLogs(screenErrorLog.getAll());
    return screenErrorLog.subscribeAll(setErrorLogs);
  }, []);

  useEffect(() => {
    setStreamingMarkers(streamingStore.list());
    return streamingStore.subscribe(setStreamingMarkers);
  }, []);

  useEffect(() => {
    setCompileStatuses(screenStatusStore.getAll());
    return screenStatusStore.subscribeAll(setCompileStatuses);
  }, []);

  const pills = useValue<PillData[]>(
    "artboard-pills",
    () => {
      if (!editor) return [];
      const camera = editor.getCamera();
      const selectedIds = new Set(editor.getSelectedShapeIds());
      const screens = editor
        .getCurrentPageShapes()
        .filter((s) => s.type === "screen") as ScreenShape[];

      return screens.map((s) => {
        // Page → screen transform. The canvas is edge-to-edge (its origin is
        // the document origin), so the shape's document coord is simply
        // (s + camera) * zoom. The stored `viewport.x/y` is the visible-area
        // offset used for zoom/fit math — NOT an additional screen offset.
        const x = (s.x + camera.x) * camera.z;
        const y = (s.y + camera.y) * camera.z;
        return {
          id: s.id,
          name: s.props.name,
          viewportId: s.props.viewportId,
          w: s.props.w * camera.z,
          h: s.props.h * camera.z,
          x,
          y,
          zoom: camera.z,
          isSelected: selectedIds.has(s.id),
          parentScreenId: s.props.parentScreenId ?? "",
        };
      });
    },
    [editor],
  );

  if (!editor || pills.length === 0) return null;

  function updateScreen(id: string, patch: Partial<ScreenShape["props"]>) {
    editor?.updateShape({ id: id as ScreenShape["id"], type: "screen", props: patch });
  }

  function applyViewport(id: string, presetId: ViewportPresetId) {
    const v = VIEWPORT_PRESETS_BY_ID[presetId];
    if (!v) return;
    updateScreen(id, {
      viewportId: presetId,
      w: v.width,
      h: v.height,
    });
  }

  const streamingByScreenId = new Map<string, StreamingMarker>();
  for (const m of streamingMarkers) streamingByScreenId.set(m.screenId, m);

  if (typeof window !== "undefined") {
    (window as unknown as { __ocDebugMarkers?: unknown }).__ocDebugMarkers = {
      markers: streamingMarkers,
      pillIds: pills.map((p) => p.id),
    };
  }

  // Build a parent-id → pill map so we can draw connector lines from a
  // parent's right edge to the left edge of each of its sheet children.
  // Runs on every render (canvas zoom/pan), which is fine — cheap.
  const pillById = new Map<string, PillData>();
  for (const p of pills) pillById.set(p.id, p);
  const sheetLinks: Array<{
    id: string;
    parent: PillData;
    child: PillData;
  }> = [];
  for (const p of pills) {
    if (!p.parentScreenId) continue;
    const parent = pillById.get(p.parentScreenId);
    if (!parent) continue;
    sheetLinks.push({ id: p.id + "-link", parent, child: p });
  }

  return (
    <div
      data-agentation-ignore
      className="pointer-events-none fixed inset-0 z-20"
      aria-hidden={false}
    >
      {/* Parent → sheet connector lines. Rendered first so they sit BEHIND
          pills + cursors. */}
      {sheetLinks.length > 0 && (
        <svg
          style={{
            position: "fixed",
            inset: 0,
            width: "100vw",
            height: "100vh",
            pointerEvents: "none",
          }}
        >
          {sheetLinks.map((link) => {
            // Connect right-center of parent to left-center of child.
            const fromX = link.parent.x + link.parent.w;
            const fromY = link.parent.y + link.parent.h / 2;
            const toX = link.child.x;
            const toY = link.child.y + link.child.h / 2;
            // Control points for a soft bezier — biased so the curve
            // leaves horizontally from parent and arrives horizontally at
            // child.
            const midX = (fromX + toX) / 2;
            const path = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
            return (
              <g key={link.id}>
                <path
                  d={path}
                  fill="none"
                  stroke="color-mix(in oklch, var(--accent-base) 60%, transparent)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
                {/* Small filled dot at the parent end so the origin is
                    obvious even when the line is faint at low zoom. */}
                <circle
                  cx={fromX}
                  cy={fromY}
                  r={3}
                  fill="var(--accent-base)"
                />
              </g>
            );
          })}
        </svg>
      )}
      {pills.map((p) => {
        const streaming = streamingByScreenId.get(p.id);
        if (streaming) {
          return (
            <AgentCursor
              key={`${p.id}-agent`}
              screenX={p.x}
              screenY={p.y}
              zoom={p.zoom}
              marker={streaming}
            />
          );
        }
        return null;
      }).filter(Boolean)}
      {pills.map((p) => {
        const viewport = VIEWPORT_PRESETS_BY_ID[p.viewportId];
        const compileStatus = compileStatuses.get(p.id);
        const isStreaming = streamingByScreenId.has(p.id);
        const showErrorBadge =
          !isStreaming && compileStatus?.kind === "error";
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y - 36,
              maxWidth: p.w,
              display: "flex",
              gap: 10,
              alignItems: "center",
              pointerEvents: "auto",
            }}
          >
            {renamingId === p.id ? (
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = renameDraft.trim();
                    if (v) updateScreen(p.id, { name: v });
                    setRenamingId(null);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setRenamingId(null);
                  }
                }}
                onBlur={() => {
                  const v = renameDraft.trim();
                  if (v && v !== p.name) updateScreen(p.id, { name: v });
                  setRenamingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="oc-pill oc-pill--name"
                style={{
                  maxWidth: Math.max(96, p.w * 0.55),
                  outline: "none",
                  border: "none",
                  fontFamily: "inherit",
                }}
              />
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  editor?.select(p.id as ScreenShape["id"]);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setRenameDraft(p.name);
                  setRenamingId(p.id);
                }}
                title={
                  p.parentScreenId
                    ? `Sheet of ${pillById.get(p.parentScreenId)?.name ?? "another screen"} — double-click to rename`
                    : "Click to select · double-click to rename"
                }
                data-selected={p.isSelected || undefined}
                data-sheet={p.parentScreenId ? true : undefined}
                className="oc-pill oc-pill--name"
                style={{
                  maxWidth: Math.max(96, p.w * 0.55),
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.parentScreenId && (
                  <>
                    <span className="oc-pill-parent">
                      {pillById.get(p.parentScreenId)?.name ?? "…"}
                    </span>
                    <span className="oc-pill-sep" aria-hidden>
                      ▸
                    </span>
                  </>
                )}
                {p.name}
                {p.parentScreenId && (
                  <span className="oc-pill-badge" aria-hidden>
                    sheet
                  </span>
                )}
              </button>
            )}
            <label className="oc-viewport-chooser" title="Change viewport">
              <span className="oc-viewport-chooser-label oc-tabular">
                {viewport?.label ?? p.viewportId}
              </span>
              <svg
                className="oc-viewport-chooser-caret"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <select
                value={p.viewportId}
                onChange={(e) =>
                  applyViewport(p.id, e.target.value as ViewportPresetId)
                }
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Change viewport"
              >
                {VIEWPORT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="oc-pill oc-pill--icon"
              title="Reset this screen's internal state (navigation, forms, counters). Does not change code."
              aria-label="Reset screen state"
              onClick={(e) => {
                e.stopPropagation();
                screenResetStore.bump(p.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.7 0 3.2.7 4.3 1.9M12.8 2v2.8H10"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {(showErrorBadge || (errorLogs.get(p.id)?.length ?? 0) > 0) && (
              <ErrorBadge
                screenId={p.id}
                errors={errorLogs.get(p.id) ?? []}
                compileMessage={
                  compileStatus?.kind === "error"
                    ? compileStatus.message
                    : null
                }
                open={errorPopoverFor === p.id}
                onToggle={() =>
                  setErrorPopoverFor((cur) => (cur === p.id ? null : p.id))
                }
                onClose={() => setErrorPopoverFor(null)}
              />
            )}
            {/* Hint label for the currently-hovering viewport — swallowed to keep pill compact */}
            {viewport && null}
          </div>
        );
      })}
    </div>
  );
}

function ErrorBadge({
  screenId,
  errors,
  compileMessage,
  open,
  onToggle,
  onClose,
}: {
  screenId: string;
  errors: ScreenErrorEntry[];
  compileMessage: string | null;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        popRef.current?.contains(e.target as Node) ||
        btnRef.current?.contains(e.target as Node)
      )
        return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Merge transient compile message with logged history. The compileMessage
  // is what the status store currently says; history is the running log.
  const visible = [...errors].reverse();
  const count = visible.length;
  const label = compileMessage || visible[0]?.message || "Error";

  const copyAll = async () => {
    const entries = visible.length
      ? visible
      : compileMessage
        ? [
            {
              id: "live",
              screenId,
              source: "compile" as const,
              message: compileMessage,
              at: Date.now(),
            },
          ]
        : [];
    if (entries.length === 0) return;
    const text = formatErrorsForClipboard(screenId, entries);
    // Guard against Chrome's NotAllowedError when the parent document doesn't
    // have focus — common in this app because a Sandpack iframe often holds
    // focus when the user clicks this button.
    if (typeof document !== "undefined" && !document.hasFocus()) {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1400);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        title={label}
        className="oc-pill oc-pill--error"
        aria-expanded={open}
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--state-error)" }}
          aria-hidden
        />
        error{count > 1 ? ` · ${count}` : ""}
      </button>
      {open && (
        <div
          ref={popRef}
          className="oc-error-popover"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="oc-error-popover-head">
            <span className="oc-error-popover-title">
              Errors on this screen
            </span>
            <div className="oc-error-popover-actions">
              <button
                type="button"
                className="oc-error-popover-action"
                onClick={copyAll}
                title="Copy all errors as text"
                disabled={visible.length === 0 && !compileMessage}
              >
                {copyState === "copied"
                  ? "Copied"
                  : copyState === "failed"
                    ? "Copy failed"
                    : "Copy all"}
              </button>
              <button
                type="button"
                className="oc-error-popover-action"
                onClick={() => {
                  screenErrorLog.clearForScreen(screenId);
                  onClose();
                }}
                title="Clear error history"
              >
                Clear
              </button>
            </div>
          </div>
          {visible.length === 0 && compileMessage && (
            <ErrorEntry
              source="compile"
              message={compileMessage}
              at={Date.now()}
              live
            />
          )}
          {visible.map((e) => (
            <ErrorEntry
              key={e.id}
              source={e.source}
              message={e.message}
              at={e.at}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatErrorsForClipboard(
  screenId: string,
  entries: ScreenErrorEntry[],
): string {
  const lines: string[] = [];
  lines.push(`Errors on screen ${screenId} (${entries.length})`);
  for (const e of entries) {
    const t = new Date(e.at).toISOString();
    lines.push("");
    lines.push(`[${t}] ${e.source.toUpperCase()}`);
    lines.push(e.message);
  }
  return lines.join("\n");
}

function ErrorEntry({
  source,
  message,
  at,
  live,
}: {
  source: string;
  message: string;
  at: number;
  live?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const firstLine = message.split("\n")[0];
  const hasMore = message.includes("\n");
  return (
    <button
      type="button"
      className="oc-error-entry"
      onClick={() => hasMore && setExpanded((v) => !v)}
      data-expandable={hasMore || undefined}
    >
      <div className="oc-error-entry-head">
        <span
          className={"oc-error-entry-source oc-error-entry-source--" + source}
        >
          {source}
        </span>
        <span className="oc-error-entry-time oc-tabular">
          {live ? "now" : formatTime(at)}
        </span>
      </div>
      <div className="oc-error-entry-msg">
        {expanded && hasMore ? message : firstLine}
      </div>
    </button>
  );
}

function formatTime(at: number): string {
  const d = Date.now() - at;
  if (d < 1000) return "just now";
  if (d < 60_000) return `${Math.round(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AgentCursor({
  screenX,
  screenY,
  zoom,
  marker,
}: {
  screenX: number;
  screenY: number;
  zoom: number;
  marker: StreamingMarker;
}) {
  // Point the cursor at the top-left of the most-recently-added element —
  // its center floats mid-screen when the element happens to be full-width
  // (headings, hero blocks), which reads as "wrong". Top-left makes the
  // arrow land visibly AT the element, so the user can see what's being
  // worked on.
  const tipX = marker.rect
    ? screenX + marker.rect.x * zoom
    : screenX;
  const tipY = marker.rect
    ? screenY + marker.rect.y * zoom
    : screenY;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        // Animate via GPU-accelerated transform for smooth gliding between
        // successive positions instead of hard-jumping on each mutation.
        transform: `translate3d(${tipX - 10}px, ${tipY - 10}px, 0)`,
        transition: "transform 520ms cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "transform",
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        style={{ filter: "drop-shadow(0 2px 6px color-mix(in oklch, var(--accent-base) 35%, transparent))" }}
        aria-hidden="true"
      >
        <path
          d="M3 3 L17 9 L9 11 L7 17 Z"
          fill="var(--accent-base)"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <div
        className="oc-tabular"
        style={{
          background: "var(--accent-base)",
          color: "var(--accent-on)",
          padding: "3px 10px",
          borderRadius: "var(--radius-pill)",
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.4,
          whiteSpace: "nowrap",
          boxShadow:
            "0 0 0 1px color-mix(in oklch, var(--accent-base) 50%, transparent), 0 6px 16px -4px color-mix(in oklch, var(--accent-base) 45%, transparent)",
        }}
      >
        {marker.agentName ? (
          <>
            <span style={{ fontWeight: 700 }}>{marker.agentName}</span>
            <span style={{ opacity: 0.7, margin: "0 5px" }}>·</span>
            <span>{marker.screenName}</span>
          </>
        ) : (
          <>
            <span style={{ opacity: 0.9, marginRight: 4 }}>✨</span>
            Claude is {marker.kind === "create" ? "writing" : "editing"}{" "}
            <span style={{ fontWeight: 700 }}>{marker.screenName}</span>
            <span style={{ display: "inline-block", marginLeft: 3 }}>…</span>
          </>
        )}
      </div>
    </div>
  );
}
