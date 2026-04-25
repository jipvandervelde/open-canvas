"use client";

import { useEffect, useRef, useState } from "react";
import { canvasStore, createShapeId, useValue } from "@/lib/canvas-store";
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
import {
  designDataStore,
  type DataEntity,
} from "@/lib/design-data-store";
import { messageQueueStore } from "@/lib/message-queue-store";
import type { ScreenShape } from "@/components/ScreenShapeUtil";
import { PresenceCursor } from "@/components/PresenceCursor";

const VARIANT_STACK_GAP = 80;

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
  code: string;
  dataEntityName: string;
  dataRecordId: string;
  variantGroupId: string;
  variantName: string;
  variantRole: "main" | "alt" | "";
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
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [variantPromptFor, setVariantPromptFor] = useState<string | null>(null);
  const [variantPromptDraft, setVariantPromptDraft] = useState<string>("");
  const [dataEntities, setDataEntities] = useState<DataEntity[]>(() =>
    designDataStore.get(),
  );
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

  useEffect(() => designDataStore.subscribe(setDataEntities), []);

  useEffect(() => {
    if (!openMenuFor) return;
    function closeMenu() {
      setOpenMenuFor(null);
      setVariantPromptFor(null);
      setVariantPromptDraft("");
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuFor]);

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
          code: s.props.code,
          dataEntityName: s.props.dataEntityName ?? "",
          dataRecordId: s.props.dataRecordId ?? "",
          variantGroupId: s.props.variantGroupId ?? "",
          variantName: s.props.variantName ?? "",
          variantRole: s.props.variantRole ?? "",
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

  function loadableEntityFor(p: PillData): DataEntity | null {
    if (p.dataEntityName) {
      return dataEntities.find((e) => e.name === p.dataEntityName) ?? null;
    }
    return (
      dataEntities.find((entity) => {
        const importsEntity =
          p.code.includes(`./data/${entity.name}`) ||
          p.code.includes(`'/data/${entity.name}'`) ||
          p.code.includes(`"/data/${entity.name}"`);
        if (!importsEntity) return false;
        return (
          p.code.includes(`find${entity.singular}`) ||
          p.code.includes("useParams") ||
          /\.\s*find\s*\(/.test(p.code)
        );
      }) ?? null
    );
  }

  function selectDataRecord(p: PillData, entity: DataEntity, row: Record<string, unknown>) {
    const rawId = row.id ?? row.slug ?? row.key;
    if (rawId == null) return;
    updateScreen(p.id, {
      dataEntityName: entity.name,
      dataRecordId: String(rawId),
    });
    setOpenMenuFor(null);
  }

  function resetScreenState(id: string) {
    screenResetStore.bump(id);
    setOpenMenuFor(null);
  }

  function deleteScreen(p: PillData) {
    const groupId = p.variantGroupId;
    const wasMain = p.variantRole === "main";
    editor?.deleteShapes([p.id as ScreenShape["id"]]);
    if (groupId && wasMain) {
      const nextMain = canvasStore
        .getAllShapes()
        .filter((s) => s.id !== p.id && s.props.variantGroupId === groupId)
        .sort((a, b) =>
          (a.props.variantName ?? "").localeCompare(b.props.variantName ?? ""),
        )[0];
      if (nextMain) {
        canvasStore.updateShape(
          { id: nextMain.id, props: { variantRole: "main" } },
          "user",
        );
      }
    }
    setOpenMenuFor(null);
  }

  function createVariant(p: PillData, brief: string) {
    const all = canvasStore.getAllShapes();
    const groupId = p.variantGroupId || p.id;
    const group = all.filter((s) => (s.props.variantGroupId || s.id) === groupId);
    const source = all.find((s) => s.id === p.id);
    if (!source) return null;

    const baseName = stripVariantSuffix(source.props.name);
    const existingLabels = new Set(
      group.map((s) => s.props.variantName).filter(Boolean) as string[],
    );
    if (!p.variantGroupId) existingLabels.add("A");
    const nextLabel = nextVariantLabel(existingLabels);
    const stack = group.length > 0 ? group : [source];
    const minX = Math.min(...stack.map((s) => s.x));
    const nextY =
      Math.max(...stack.map((s) => s.y + s.props.h)) + VARIANT_STACK_GAP;

    if (!source.props.variantGroupId) {
      canvasStore.updateShape(
        {
          id: source.id,
          props: {
            name: `${baseName} [A]`,
            variantGroupId: groupId,
            variantName: "A",
            variantRole: "main",
          },
        },
        "user",
      );
    }

    const id = createShapeId();
    canvasStore.addShape(
      {
        id,
        type: "screen",
        x: minX,
        y: nextY,
        props: {
          ...source.props,
          name: `${baseName} [${nextLabel}]`,
          variantGroupId: groupId,
          variantName: nextLabel,
          variantRole: "alt",
          parentScreenId: source.props.parentScreenId ?? "",
        },
      },
      "user",
    );
    canvasStore.select(id);
    setOpenMenuFor(null);
    setVariantPromptFor(null);
    setVariantPromptDraft("");
    messageQueueStore.enqueue(buildVariantPrompt(source, id, `${baseName} [${nextLabel}]`, brief));
    return id;
  }

  function setMainVariant(p: PillData) {
    if (!p.variantGroupId) return;
    const group = canvasStore
      .getAllShapes()
      .filter((s) => s.props.variantGroupId === p.variantGroupId)
      .sort((a, b) =>
        (a.props.variantName ?? "").localeCompare(b.props.variantName ?? ""),
      );
    const selected = group.find((s) => s.id === p.id);
    if (!selected) return;
    const anchorX = Math.min(...group.map((s) => s.x));
    const anchorY = Math.min(...group.map((s) => s.y));
    let y = anchorY;
    const ordered = [selected, ...group.filter((s) => s.id !== selected.id)];
    canvasStore.updateShapes(
      ordered.map((shape, index) => {
        const patch = {
          id: shape.id,
          x: anchorX,
          y,
          props: {
            variantRole: index === 0 ? ("main" as const) : ("alt" as const),
          },
        };
        y += shape.props.h + VARIANT_STACK_GAP;
        return patch;
      }),
      "user",
    );
    setOpenMenuFor(null);
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
        const loadableEntity = loadableEntityFor(p);
        const loadableRows =
          loadableEntity?.seeds.filter((row) => row.id ?? row.slug ?? row.key) ??
          [];
        const canLoadData = !!loadableEntity && loadableRows.length > 1;
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y - 36,
              width: p.w,
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "center",
              pointerEvents: "auto",
            }}
          >
            <div className="oc-artboard-left-actions">
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
                {p.variantRole === "main" && (
                  <span className="oc-pill-badge" aria-hidden>
                    main
                  </span>
                )}
                {p.variantRole === "alt" && (
                  <span className="oc-pill-badge" aria-hidden>
                    alt
                  </span>
                )}
                {p.parentScreenId && (
                  <span className="oc-pill-badge" aria-hidden>
                    sheet
                  </span>
                )}
              </button>
            )}
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
            </div>
            <div
              className="oc-artboard-menu-wrap"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="oc-pill oc-pill--icon oc-pill--menu"
                title="Screen actions"
                aria-label="Screen actions"
                aria-haspopup="menu"
                aria-expanded={openMenuFor === p.id}
                onClick={() =>
                  setOpenMenuFor((cur) => (cur === p.id ? null : p.id))
                }
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="4" cy="8" r="1.25" fill="currentColor" />
                  <circle cx="8" cy="8" r="1.25" fill="currentColor" />
                  <circle cx="12" cy="8" r="1.25" fill="currentColor" />
                </svg>
              </button>
              {openMenuFor === p.id && (
                <div className="oc-artboard-menu" role="menu">
                  <div
                    className="oc-artboard-menu-viewport"
                    role="group"
                    aria-label="Viewport"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <label
                      className="oc-viewport-chooser oc-viewport-chooser--menu"
                      title="Change viewport"
                    >
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
                        onChange={(e) => {
                          applyViewport(
                            p.id,
                            e.target.value as ViewportPresetId,
                          );
                          setOpenMenuFor(null);
                        }}
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
                  </div>
                  <div
                    className="oc-artboard-menu-separator"
                    role="separator"
                  />
                  <button
                    type="button"
                    role="menuitem"
                    className="oc-artboard-menu-item"
                    onClick={() => resetScreenState(p.id)}
                  >
                    Reset state
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="oc-artboard-menu-item"
                    disabled={!canLoadData}
                    onClick={() => {
                      if (!loadableEntity) return;
                      const nextRow =
                        loadableRows.find((row) => {
                          const id = String(row.id ?? row.slug ?? row.key);
                          return id !== p.dataRecordId;
                        }) ?? loadableRows[0];
                      if (nextRow) selectDataRecord(p, loadableEntity, nextRow);
                    }}
                    title={
                      canLoadData
                        ? `Switch ${loadableEntity?.singular ?? "record"} preview data`
                        : "Available on detail screens that import a data entity and read route params"
                    }
                  >
                    Load different data entity
                  </button>
                  {canLoadData && loadableEntity && (
                    <div className="oc-artboard-record-list">
                      {loadableRows.slice(0, 8).map((row) => {
                        const id = String(row.id ?? row.slug ?? row.key);
                        const current = id === p.dataRecordId;
                        return (
                          <button
                            key={id}
                            type="button"
                            role="menuitem"
                            className="oc-artboard-record-item"
                            disabled={current}
                            onClick={() => selectDataRecord(p, loadableEntity, row)}
                          >
                            <span className="oc-artboard-record-name">
                              {recordLabel(row)}
                            </span>
                            {current && (
                              <span className="oc-artboard-record-current">
                                current
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="oc-artboard-menu-item"
                    onClick={() => {
                      setVariantPromptFor((cur) => (cur === p.id ? null : p.id));
                      setVariantPromptDraft("");
                    }}
                  >
                    Create variants
                  </button>
                  {variantPromptFor === p.id && (
                    <form
                      className="oc-artboard-variant-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        createVariant(p, variantPromptDraft.trim());
                      }}
                    >
                      <textarea
                        autoFocus
                        value={variantPromptDraft}
                        onChange={(e) => setVariantPromptDraft(e.target.value)}
                        placeholder="What should be different in this variant?"
                        className="oc-artboard-variant-input"
                        rows={3}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            e.preventDefault();
                            createVariant(p, variantPromptDraft.trim());
                          }
                        }}
                      />
                      <button
                        type="submit"
                        className="oc-artboard-variant-submit"
                      >
                        Create and send to agent
                      </button>
                    </form>
                  )}
                  {p.variantGroupId && p.variantRole !== "main" && (
                    <button
                      type="button"
                      role="menuitem"
                      className="oc-artboard-menu-item"
                      onClick={() => setMainVariant(p)}
                    >
                      Set as main variant
                    </button>
                  )}
                  <div className="oc-artboard-menu-separator" role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="oc-artboard-menu-item oc-artboard-menu-item--danger"
                    onClick={() => deleteScreen(p)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
            {/* Hint label for the currently-hovering viewport — swallowed to keep pill compact */}
            {viewport && null}
          </div>
        );
      })}
    </div>
  );
}

function stripVariantSuffix(name: string): string {
  return name.replace(/\s+\[[A-Z]+\]$/u, "").trim() || "Screen";
}

function nextVariantLabel(existing: Set<string>): string {
  for (let i = 0; i < 26; i++) {
    const label = String.fromCharCode(65 + i);
    if (!existing.has(label)) return label;
  }
  return String(existing.size + 1);
}

function recordLabel(row: Record<string, unknown>): string {
  const value =
    row.title ??
    row.name ??
    row.label ??
    row.displayName ??
    row.id ??
    row.slug ??
    row.key;
  return value == null ? "Untitled record" : String(value);
}

function buildVariantPrompt(
  source: ScreenShape,
  variantId: ScreenShape["id"],
  variantName: string,
  brief: string,
): string {
  const trimmedBrief =
    brief ||
    "Create a meaningful alternative layout and visual treatment while preserving the same screen purpose, data, and navigation contract.";
  return [
    `Create a screen variant for "${source.props.name}".`,
    "",
    `Source screen id: ${source.id}`,
    `Variant screen id to update: ${variantId}`,
    `Variant name: ${variantName}`,
    "",
    "The variant screen has already been created on the canvas as a clone. Use updateScreen on the variant screen id only. Do not create another screen.",
    "Preserve the same product intent, viewport, shared data imports, route behavior, and core user task unless the brief explicitly asks to change them.",
    "",
    `Variant brief: ${trimmedBrief}`,
  ].join("\n");
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
  const tipX = marker.rect ? screenX + marker.rect.x * zoom : screenX;
  const tipY = marker.rect ? screenY + marker.rect.y * zoom : screenY;

  const label = marker.agentName ? (
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
  );

  return (
    <PresenceCursor role="agent" x={tipX} y={tipY} label={label} />
  );
}
