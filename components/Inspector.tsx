"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useValue } from "@/lib/canvas-store";
import { DialRoot, useDialKit } from "dialkit";
import { useEditorRef } from "@/lib/editor-context";
import {
  VIEWPORT_PRESETS,
  VIEWPORT_PRESETS_BY_ID,
  type ViewportPresetId,
} from "@/lib/viewports";
import { themeStore } from "@/lib/theme-store";
import { canvasModeStore, type CanvasMode } from "@/lib/canvas-mode-store";
import { annotationsStore, type Annotation } from "@/lib/annotations-store";
import { designTokensStore } from "@/lib/design-tokens-store";
import { ConstraintPinGrid } from "@/components/ConstraintPinGrid";
import { applyStyleChange, extractToComponent } from "@/lib/jsx-surgery";
import { designComponentsStore } from "@/lib/design-components-store";
import type { Editor } from "@/lib/editor-shim";
import {
  selectedElementStore,
  type SelectedElement,
  type ElementStyles,
} from "@/lib/selected-element-store";
import type { ScreenShape } from "@/components/ScreenShapeUtil";

/**
 * Inspector — a FLOATING Dialkit panel that appears only when exactly one
 * screen is selected. Controls are registered via `useDialKit` so Dialkit
 * renders and positions the panel itself.
 */
export function Inspector() {
  const { editor } = useEditorRef();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => themeStore.get());

  useEffect(() => {
    setMounted(true);
    setTheme(themeStore.get());
    return themeStore.subscribe(setTheme);
  }, []);

  const selected = useValue(
    "inspector-selected-screen",
    () => {
      if (!editor) return null;
      const ids = editor.getSelectedShapeIds();
      if (ids.length !== 1) return null;
      const shape = editor.getShape(ids[0]);
      if (!shape || shape.type !== "screen") return null;
      return shape as ScreenShape;
    },
    [editor],
  );

  const [elementSel, setElementSel] = useState<SelectedElement | null>(null);
  useEffect(() => {
    setElementSel(selectedElementStore.get());
    return selectedElementStore.subscribe(setElementSel);
  }, []);

  const [canvasMode, setCanvasMode] = useState<CanvasMode>(() =>
    canvasModeStore.get(),
  );
  useEffect(() => canvasModeStore.subscribe(setCanvasMode), []);

  if (!mounted || !editor || !selected) return null;

  const elementForThisScreen =
    elementSel && elementSel.screenId === selected.id ? elementSel : null;

  // Annotator mode: element picks route to the annotation panel instead of
  // the style editor. Screen selection (no element) still routes to the
  // regular Screen controls so viewport/name dials stay accessible.
  const isAnnotating = canvasMode === "annotator";
  const showElementPanel = !!elementForThisScreen?.styles;

  return (
    <>
      <DialRoot position="top-right" defaultOpen mode="popover" theme={theme} />
      {showElementPanel && isAnnotating ? (
        <ElementAnnotator
          key={`ann::${elementForThisScreen!.screenId}::${elementForThisScreen!.path}`}
          element={elementForThisScreen!}
        />
      ) : showElementPanel ? (
        <ElementDialControls
          key={`${elementForThisScreen!.screenId}::${elementForThisScreen!.path}`}
          element={elementForThisScreen!}
          editor={editor}
        />
      ) : (
        <ScreenDialControls
          key={selected.id}
          shape={selected}
          editor={editor}
          elementSelection={elementForThisScreen}
        />
      )}
    </>
  );
}

/**
 * Annotator UI — floating card that hosts a note input and the history of
 * notes already pinned to this element. Uses the same selected-element
 * framework as the style Inspector; the only difference is the surface.
 */
function ElementAnnotator({ element }: { element: SelectedElement }) {
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState<Annotation[]>(() =>
    annotationsStore.listForElement(element.screenId, element.path),
  );
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const update = () => {
      setNotes(annotationsStore.listForElement(element.screenId, element.path));
    };
    update();
    return annotationsStore.subscribe(update);
  }, [element.screenId, element.path]);

  // Auto-focus the textarea when the annotator opens so the user can just
  // start typing after they click an element.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function save() {
    const v = draft.trim();
    if (!v) return;
    annotationsStore.add(element.screenId, element.path, v);
    setDraft("");
  }

  return (
    <div data-agentation-ignore className="oc-annotator-card">
      <div className="oc-annotator-head">
        <span className="oc-annotator-title">Annotation</span>
        <span className="oc-annotator-target">
          {"<"}
          {element.tag}
          {">"}
        </span>
      </div>
      <div className="oc-annotator-path" title={element.path}>
        {element.path || "(root)"}
      </div>
      <textarea
        ref={inputRef}
        className="oc-annotator-input"
        placeholder="Leave a note on this element…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
        rows={3}
      />
      <div className="oc-annotator-actions">
        <span className="oc-annotator-hint">⌘⏎ to save</span>
        <button
          type="button"
          className="oc-annotator-save"
          onClick={save}
          disabled={!draft.trim()}
        >
          Add note
        </button>
      </div>
      {notes.length > 0 && (
        <ul className="oc-annotator-list">
          {[...notes].reverse().map((n) => (
            <li key={n.id} className="oc-annotator-entry">
              <div className="oc-annotator-entry-text">{n.note}</div>
              <div className="oc-annotator-entry-meta">
                <span>{formatRelative(n.createdAt)}</span>
                <button
                  type="button"
                  className="oc-annotator-delete"
                  onClick={() => annotationsStore.remove(n.id)}
                  aria-label="Delete annotation"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatRelative(at: number): string {
  const d = Date.now() - at;
  if (d < 1000) return "just now";
  if (d < 60_000) return `${Math.round(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Second Dialkit folder — mounted only when an element is selected. Sends
 * `oc:update-style` messages back to the iframe for live inline-style edits.
 */
function ElementDialControls({
  element,
  editor,
}: {
  element: SelectedElement;
  editor: Editor;
}) {
  const s = element.styles!;
  const initial = useRef({
    text: element.directText ?? "",
    background: s.background,
    color: s.color,
    paddingTop: s.paddingTop,
    paddingRight: s.paddingRight,
    paddingBottom: s.paddingBottom,
    paddingLeft: s.paddingLeft,
    borderRadius: s.borderRadius,
    fontSize: s.fontSize,
    display: s.display ?? "block",
    flexDirection: s.flexDirection ?? "row",
    gap: s.gap ?? 0,
    justifyContent: s.justifyContent ?? "flex-start",
    alignItems: s.alignItems ?? "stretch",
    flexWrap: s.flexWrap ?? "nowrap",
    alignSelf: s.alignSelf ?? "auto",
    flexGrow: s.flexGrow ?? 0,
    flexShrink: s.flexShrink ?? 0,
    order: s.order ?? 0,
    marginTop: s.marginTop ?? 0,
    marginRight: s.marginRight ?? 0,
    marginBottom: s.marginBottom ?? 0,
    marginLeft: s.marginLeft ?? 0,
  });

  const values = useDialKit(
    "Element",
    {
      // Action buttons rendered by Dialkit at the top of the folder. Wired
      // via options.onAction below.
      "↑ Select parent": { type: "action", label: "↑ Select parent" },
      "⎘ Extract component": {
        type: "action",
        label: "⎘ Extract component",
      },
      Text:
        element.directText !== undefined
          ? {
              type: "text",
              default: initial.current.text,
              placeholder: "Text content",
            }
          : {
              type: "text",
              default: "",
              placeholder: "(nested element — no direct text)",
            },
      Background: {
        type: "color",
        default: initial.current.background || "#ffffff",
      },
      Color: {
        type: "color",
        default: initial.current.color || "#000000",
      },
      Padding: {
        Top: { type: "text", default: String(initial.current.paddingTop) },
        Right: { type: "text", default: String(initial.current.paddingRight) },
        Bottom: {
          type: "text",
          default: String(initial.current.paddingBottom),
        },
        Left: { type: "text", default: String(initial.current.paddingLeft) },
      },
      Radius: { type: "text", default: String(initial.current.borderRadius) },
      FontSize: { type: "text", default: String(initial.current.fontSize) },
      Layout: {
        Display: {
          type: "select",
          options: [
            { value: "block", label: "Block" },
            { value: "flex", label: "Flex" },
            { value: "inline-block", label: "Inline-block" },
            { value: "grid", label: "Grid" },
            { value: "none", label: "None" },
          ],
          default: initial.current.display,
        },
        Direction: {
          type: "select",
          options: [
            { value: "row", label: "Row" },
            { value: "column", label: "Column" },
            { value: "row-reverse", label: "Row reverse" },
            { value: "column-reverse", label: "Column reverse" },
          ],
          default: initial.current.flexDirection,
        },
        Gap: { type: "text", default: String(initial.current.gap) },
        Justify: {
          type: "select",
          options: [
            { value: "flex-start", label: "Start" },
            { value: "center", label: "Center" },
            { value: "flex-end", label: "End" },
            { value: "space-between", label: "Space between" },
            { value: "space-around", label: "Space around" },
            { value: "space-evenly", label: "Space evenly" },
          ],
          default: initial.current.justifyContent,
        },
        Align: {
          type: "select",
          options: [
            { value: "stretch", label: "Stretch" },
            { value: "flex-start", label: "Start" },
            { value: "center", label: "Center" },
            { value: "flex-end", label: "End" },
            { value: "baseline", label: "Baseline" },
          ],
          default: initial.current.alignItems,
        },
        Wrap: {
          type: "select",
          options: [
            { value: "nowrap", label: "No wrap" },
            { value: "wrap", label: "Wrap" },
            { value: "wrap-reverse", label: "Wrap reverse" },
          ],
          default: initial.current.flexWrap,
        },
      },
      // Child-side controls — how THIS element behaves inside its parent's
      // layout. Harmless on non-flex parents, essential inside flex ones.
      Child: {
        AlignSelf: {
          type: "select",
          options: [
            { value: "auto", label: "Auto" },
            { value: "stretch", label: "Stretch" },
            { value: "flex-start", label: "Start" },
            { value: "center", label: "Center" },
            { value: "flex-end", label: "End" },
            { value: "baseline", label: "Baseline" },
          ],
          default: initial.current.alignSelf,
        },
        Grow: { type: "text", default: String(initial.current.flexGrow) },
        Shrink: { type: "text", default: String(initial.current.flexShrink) },
        Order: { type: "text", default: String(initial.current.order) },
        MarginTop: {
          type: "text",
          default: String(initial.current.marginTop),
        },
        MarginRight: {
          type: "text",
          default: String(initial.current.marginRight),
        },
        MarginBottom: {
          type: "text",
          default: String(initial.current.marginBottom),
        },
        MarginLeft: {
          type: "text",
          default: String(initial.current.marginLeft),
        },
      },
    },
    {
      onAction: (path) => {
        if (path === "↑ Select parent") {
          postSelectParent(element.screenId);
        } else if (path === "⎘ Extract component") {
          promoteToComponent(editor, element);
        }
      },
    },
  );

  // Only send updates when values differ from the initial snapshot, to avoid
  // posting a no-op on mount.
  useEffect(() => {
    const patch: Partial<
      ElementStyles & {
        directText: string;
        // Spacing fields accept strings too so users / the agent can pass
        // token references like "var(--space-md)". The iframe's update-style
        // handler applies the value verbatim when it's a string.
        gap: number | string;
        paddingTop: number | string;
        paddingRight: number | string;
        paddingBottom: number | string;
        paddingLeft: number | string;
        marginTop: number | string;
        marginRight: number | string;
        marginBottom: number | string;
        marginLeft: number | string;
      }
    > = {};
    const parseNum = (s: string) => {
      const n = parseInt(s, 10);
      return isNaN(n) ? null : n;
    };
    /**
     * Accept a spacing value as either a number (px), a known spacing-token
     * name (e.g. "md", "space.md"), or a pass-through string ("var(…)",
     * "8px", "1rem"). Returns number | string | null.
     */
    const parseSpacing = (raw: string): number | string | null => {
      const v = raw.trim();
      if (v === "") return null;
      // Pure integer → number
      if (/^-?\d+(?:\.\d+)?$/.test(v)) return parseFloat(v);
      // CSS-function or explicit unit — pass through verbatim
      if (/^(var|calc|clamp|min|max)\(/i.test(v)) return v;
      if (/[a-z%]/i.test(v) && /^-?\d/.test(v)) return v; // "16px", "1rem"
      // Token name → resolve to var(--space-…)
      const tokenName = v.replace(/^space\./, "");
      const tokens = designTokensStore.get().spacing;
      if (tokens.some((t) => t.name === tokenName)) {
        return `var(--space-${tokenName.replace(/\./g, "-")})`;
      }
      return null;
    };
    if (values.Text !== initial.current.text) patch.directText = values.Text;
    if (values.Background !== initial.current.background) patch.background = values.Background;
    if (values.Color !== initial.current.color) patch.color = values.Color;

    const pT = parseSpacing(values.Padding.Top);
    if (pT !== null && pT !== initial.current.paddingTop) patch.paddingTop = pT;
    const pR = parseSpacing(values.Padding.Right);
    if (pR !== null && pR !== initial.current.paddingRight)
      patch.paddingRight = pR;
    const pB = parseSpacing(values.Padding.Bottom);
    if (pB !== null && pB !== initial.current.paddingBottom)
      patch.paddingBottom = pB;
    const pL = parseSpacing(values.Padding.Left);
    if (pL !== null && pL !== initial.current.paddingLeft)
      patch.paddingLeft = pL;

    const br = parseNum(values.Radius);
    if (br !== null && br !== initial.current.borderRadius) patch.borderRadius = br;
    const fs = parseNum(values.FontSize);
    if (fs !== null && fs !== initial.current.fontSize) patch.fontSize = fs;

    if (values.Layout.Display !== initial.current.display)
      patch.display = values.Layout.Display;
    if (values.Layout.Direction !== initial.current.flexDirection)
      patch.flexDirection = values.Layout.Direction;
    const gap = parseSpacing(values.Layout.Gap);
    if (gap !== null && gap !== initial.current.gap) patch.gap = gap;
    if (values.Layout.Justify !== initial.current.justifyContent)
      patch.justifyContent = values.Layout.Justify;
    if (values.Layout.Align !== initial.current.alignItems)
      patch.alignItems = values.Layout.Align;
    if (values.Layout.Wrap !== initial.current.flexWrap)
      patch.flexWrap = values.Layout.Wrap;

    if (values.Child.AlignSelf !== initial.current.alignSelf)
      patch.alignSelf = values.Child.AlignSelf;
    const gr = parseNum(values.Child.Grow);
    if (gr !== null && gr !== initial.current.flexGrow) patch.flexGrow = gr;
    const sh = parseNum(values.Child.Shrink);
    if (sh !== null && sh !== initial.current.flexShrink) patch.flexShrink = sh;
    const ord = parseNum(values.Child.Order);
    if (ord !== null && ord !== initial.current.order) patch.order = ord;
    const mT = parseSpacing(values.Child.MarginTop);
    if (mT !== null && mT !== initial.current.marginTop) patch.marginTop = mT;
    const mR = parseSpacing(values.Child.MarginRight);
    if (mR !== null && mR !== initial.current.marginRight)
      patch.marginRight = mR;
    const mB = parseSpacing(values.Child.MarginBottom);
    if (mB !== null && mB !== initial.current.marginBottom)
      patch.marginBottom = mB;
    const mL = parseSpacing(values.Child.MarginLeft);
    if (mL !== null && mL !== initial.current.marginLeft) patch.marginLeft = mL;

    if (Object.keys(patch).length === 0) return;
    persistElementEdit(editor, element, patch);
  }, [
    values.Text,
    values.Background,
    values.Color,
    values.Padding.Top,
    values.Padding.Right,
    values.Padding.Bottom,
    values.Padding.Left,
    values.Radius,
    values.FontSize,
    values.Layout.Display,
    values.Layout.Direction,
    values.Layout.Gap,
    values.Layout.Justify,
    values.Layout.Align,
    values.Layout.Wrap,
    values.Child.AlignSelf,
    values.Child.Grow,
    values.Child.Shrink,
    values.Child.Order,
    values.Child.MarginTop,
    values.Child.MarginRight,
    values.Child.MarginBottom,
    values.Child.MarginLeft,
    element.screenId,
  ]);

  // Dialkit renders the whole panel — including the "↑ Select parent"
  // action button at the top of the Element folder. We portal the
  // constraint pin grid into the panel so it sits visually below the
  // folders without needing a Dialkit custom control.
  return (
    <>
      <ComponentInstanceBadge tag={element.tag} />
      <ConstraintPinGrid
        element={element}
        postPatch={(patch) => persistElementEdit(editor, element, patch as never)}
      />
    </>
  );
}

/**
 * When the selected element's tag matches the name of a component in the
 * project library, surface that connection — so the user knows they're
 * editing an instance of a shared component, not a one-off div. Portaled
 * into the Dialkit panel like the pin grid, above the folders.
 */
function ComponentInstanceBadge({ tag }: { tag: string }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [match, setMatch] = useState<string | null>(null);

  useEffect(() => {
    const lookup = () => {
      const components = designComponentsStore.get();
      const hit = components.find(
        (c) => c.name.toLowerCase() === tag.toLowerCase(),
      );
      setMatch(hit?.name ?? null);
    };
    lookup();
    return designComponentsStore.subscribe(lookup);
  }, [tag]);

  useEffect(() => {
    let frame = 0;
    let tries = 0;
    const find = () => {
      const el = document.querySelector<HTMLElement>(".dialkit-panel-inner");
      if (el) {
        setHost(el);
        return;
      }
      if (tries++ < 30) frame = requestAnimationFrame(find);
    };
    find();
    return () => {
      cancelAnimationFrame(frame);
      setHost(null);
    };
  }, []);

  if (!host || !match) return null;
  // Insert as the first child of the panel so it sits at the very top.
  return createPortalAtTop(
    <div className="oc-instance-badge" aria-label="Component instance">
      <span className="oc-instance-badge-dot" aria-hidden />
      <span className="oc-instance-badge-label">Instance of</span>
      <span className="oc-instance-badge-name">{match}</span>
    </div>,
    host,
  );
}

function createPortalAtTop(children: React.ReactNode, host: HTMLElement) {
  // Small helper to createPortal with a stable anchor element that always
  // lives at the TOP of the host — so the instance badge renders above the
  // Dialkit folders, not below. Uses a <div data-oc-instance-anchor> as a
  // persistent sibling we can reuse.
  let anchor = host.querySelector<HTMLDivElement>(
    "div[data-oc-instance-anchor]",
  );
  if (!anchor) {
    anchor = document.createElement("div");
    anchor.setAttribute("data-oc-instance-anchor", "");
    host.insertBefore(anchor, host.firstChild);
  }
  return createPortal(children, anchor);
}

// Debounced source write-back. We post the live style to the iframe
// immediately (so the preview feels instant) but coalesce source updates
// per-screen so typing into a numeric field doesn't thrash Sandpack. If the
// surgery fails for any reason, we silently keep the iframe edit and skip
// persisting to source — the worst case is the next AI regeneration
// overwrites the edit, which is the pre-2b behavior.
const sourceWriteTimers = new Map<string, number>();
const pendingSourcePatches = new Map<
  string,
  { element: SelectedElement; patch: Record<string, unknown> }
>();

function persistElementEdit(
  editor: Editor,
  element: SelectedElement,
  patch: Record<string, unknown>,
) {
  // 1) Live update to the iframe — same behavior as before.
  postStyleUpdate(element.screenId, patch as never);

  // 2) Coalesced write-back into shape.props.code.
  const key = String(element.screenId);
  const existing = pendingSourcePatches.get(key);
  pendingSourcePatches.set(key, {
    element,
    patch: { ...(existing?.patch ?? {}), ...patch },
  });
  const existingTimer = sourceWriteTimers.get(key);
  if (existingTimer) window.clearTimeout(existingTimer);
  const t = window.setTimeout(() => {
    sourceWriteTimers.delete(key);
    const entry = pendingSourcePatches.get(key);
    pendingSourcePatches.delete(key);
    if (!entry) return;
    flushSourceWriteBack(editor, entry.element, entry.patch);
  }, 500);
  sourceWriteTimers.set(key, t);
}

function flushSourceWriteBack(
  editor: Editor,
  element: SelectedElement,
  patch: Record<string, unknown>,
) {
  const shape = editor.getShape(element.screenId as ScreenShape["id"]);
  if (!shape || shape.type !== "screen") return;
  const code = (shape as ScreenShape).props.code;
  if (!code) return;

  // Separate text content (handled by text-node replacement) from style.
  const { directText, ...styleLike } = patch as Record<
    string,
    string | number | undefined
  > & { directText?: string };
  void directText; // text-content rewrites are harder to round-trip; defer.

  const next = applyStyleChange(code, element.path, styleLike);
  if (!next || next === code) return;
  editor.updateShape({
    id: element.screenId as ScreenShape["id"],
    type: "screen",
    props: { code: next },
  });
}

/**
 * 3b — Promote the currently-selected element into a reusable component.
 * Prompts the user for a PascalCase name, runs JSX surgery on the screen's
 * source to swap the element for `<Name />`, and stashes the extracted
 * subtree as a new entry in the design-components store (which the Sandpack
 * files map already mirrors into `/components/{Name}.js`).
 */
function promoteToComponent(editor: Editor, element: SelectedElement) {
  const shape = editor.getShape(element.screenId as ScreenShape["id"]);
  if (!shape || shape.type !== "screen") return;
  const code = (shape as ScreenShape).props.code;
  const existingNames = new Set(
    designComponentsStore.get().map((c) => c.name),
  );

  // Suggest a name based on the element's tag/text. User can edit.
  const suggest = suggestName(element, existingNames);
  const name = window.prompt(
    "Extract selected element as component (PascalCase):",
    suggest,
  );
  if (!name) return;
  const trimmed = name.trim();
  if (!/^[A-Z][A-Za-z0-9]*$/.test(trimmed)) {
    window.alert(
      "Component names must be PascalCase (A–Z, 0–9; starts with a capital).",
    );
    return;
  }
  if (existingNames.has(trimmed)) {
    window.alert(`A component named "${trimmed}" already exists.`);
    return;
  }

  const result = extractToComponent(code, element.path, trimmed);
  if (!result) {
    window.alert(
      "Couldn't extract this element — the source didn't parse cleanly or the path didn't match. Try a smaller selection.",
    );
    return;
  }

  designComponentsStore.upsert({
    id: `c_${trimmed.toLowerCase()}_${Date.now().toString(36)}`,
    name: trimmed,
    description: `Extracted from ${shape.props.name}.`,
    code: result.componentCode,
  });
  editor.updateShape({
    id: element.screenId as ScreenShape["id"],
    type: "screen",
    props: { code: result.newCode },
  });
}

function suggestName(
  element: SelectedElement,
  existing: Set<string>,
): string {
  // Prefer the tag name in PascalCase (Card, Button), then append a number
  // to disambiguate against the existing library.
  const raw =
    element.tag === "div"
      ? "Block"
      : element.tag.charAt(0).toUpperCase() + element.tag.slice(1);
  const base = /^[A-Z][A-Za-z0-9]*$/.test(raw) ? raw : "Block";
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

function postSelectParent(screenId: string) {
  const iframes = document.querySelectorAll<HTMLIFrameElement>(
    'iframe[title="Sandpack Preview"]',
  );
  for (const iframe of iframes) {
    try {
      iframe.contentWindow?.postMessage(
        { __oc: "oc:select-parent", screenId },
        "*",
      );
    } catch {
      /* cross-origin; fine */
    }
  }
}

function postStyleUpdate(
  screenId: string,
  patch: Partial<ElementStyles & { directText: string }>,
) {
  const iframes = document.querySelectorAll<HTMLIFrameElement>(
    'iframe[title="Sandpack Preview"]',
  );
  for (const iframe of iframes) {
    try {
      iframe.contentWindow?.postMessage(
        { __oc: "oc:update-style", screenId, patch },
        "*",
      );
    } catch {
      /* cross-origin; fine */
    }
  }
}

function ScreenDialControls({
  shape,
  editor,
  elementSelection,
}: {
  shape: ScreenShape;
  editor: NonNullable<ReturnType<typeof useEditorRef>["editor"]>;
  elementSelection: SelectedElement | null;
}) {
  // Seed default values from the shape on first mount (key={shape.id} on the
  // parent makes this fire anew per-selection). Subsequent user edits to the
  // dial propagate back to the tldraw shape via the effect below.
  const defaults = useRef({
    name: shape.props.name,
    viewportId: shape.props.viewportId,
    w: shape.props.w,
    h: shape.props.h,
  });

  const values = useDialKit("Screen", {
    Name: {
      type: "text",
      default: defaults.current.name,
      placeholder: "Untitled screen",
    },
    Viewport: {
      type: "select",
      options: VIEWPORT_PRESETS.map((p) => ({
        value: p.id,
        label: `${p.label} (${p.width}×${p.height})`,
      })),
      default: defaults.current.viewportId,
    },
    Size: {
      Width: { type: "text", default: String(defaults.current.w) },
      Height: { type: "text", default: String(defaults.current.h) },
    },
  });

  // Sync dial values → tldraw shape.
  useEffect(() => {
    if (!editor.getShape(shape.id)) return;

    const patches: Partial<ScreenShape["props"]> = {};

    if (values.Name !== shape.props.name) {
      patches.name = values.Name;
    }

    const nextViewport = values.Viewport as ViewportPresetId;
    if (nextViewport && nextViewport !== shape.props.viewportId) {
      const v = VIEWPORT_PRESETS_BY_ID[nextViewport];
      if (v) {
        patches.viewportId = nextViewport;
        patches.w = v.width;
        patches.h = v.height;
      }
    } else {
      const wn = parseInt(values.Size.Width, 10);
      const hn = parseInt(values.Size.Height, 10);
      if (!isNaN(wn) && wn !== shape.props.w) {
        patches.w = wn;
        if (shape.props.viewportId !== "custom") patches.viewportId = "custom";
      }
      if (!isNaN(hn) && hn !== shape.props.h) {
        patches.h = hn;
        if (shape.props.viewportId !== "custom") patches.viewportId = "custom";
      }
    }

    if (Object.keys(patches).length > 0) {
      editor.updateShape({ id: shape.id, type: "screen", props: patches });
    }
  }, [
    values.Name,
    values.Viewport,
    values.Size.Width,
    values.Size.Height,
    editor,
    shape.id,
    shape.props.name,
    shape.props.viewportId,
    shape.props.w,
    shape.props.h,
  ]);

  return <ElementInspectorCard element={elementSelection} />;
}

/**
 * Floating card rendered beneath the Dialkit panel showing read-only details
 * for the currently-selected nested element. Appears only when the user has
 * clicked through to an inner element via the in-iframe selection agent.
 */
function ElementInspectorCard({
  element,
}: {
  element: SelectedElement | null;
}) {
  if (!element) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 490,
        right: 12,
        zIndex: 40,
        minWidth: 260,
        maxWidth: 320,
        background: "var(--surface-1)",
        color: "var(--text-primary)",
        borderRadius: "var(--radius-lg)",
        padding: "12px 14px 14px",
        boxShadow: `0 0 0 1px var(--border-subtle),
          0 8px 24px -6px rgba(0, 0, 0, 0.18),
          0 20px 56px -14px rgba(0, 0, 0, 0.22)`,
        fontFamily: "var(--font-ui)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          Element
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--accent-base)",
            background: "var(--accent-subtle)",
            padding: "2px 8px",
            borderRadius: 999,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {"<"}
          {element.tag}
          {">"}
        </span>
      </div>
      <ElRow label="Path" value={element.path || "—"} mono />
      {element.className && (
        <ElRow label="Class" value={element.className} mono />
      )}
      {element.text && <ElRow label="Text" value={element.text} />}
      <ElRow
        label="Size"
        value={`${Math.round(element.rect.w)} × ${Math.round(element.rect.h)}`}
        mono
      />
    </div>
  );
}

function ElRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          lineHeight: 1.4,
          color: "var(--text-secondary)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)",
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
    </div>
  );
}
