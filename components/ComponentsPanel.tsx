"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SandpackProvider,
  SandpackPreview,
  SandpackLayout,
} from "@codesandbox/sandpack-react";
import {
  designComponentsStore,
  type DesignComponent,
} from "@/lib/design-components-store";
import { designTokensStore } from "@/lib/design-tokens-store";
import { designServicesStore } from "@/lib/design-services-store";
import { designDataStore } from "@/lib/design-data-store";
import { designMotionStore } from "@/lib/design-motion-store";
import { routeTableStore } from "@/lib/route-table-store";
import { themeStore, type Theme } from "@/lib/theme-store";
import {
  buildComponentFiles,
  buildServiceFiles,
  buildDataFiles,
  buildTokensCss,
  SANDPACK_INDEX_JS_FOR_THEME,
} from "@/lib/screen-runtime";
import {
  getIconRegistryJs,
  getIconRegistryJsSync,
} from "@/lib/icon-registry-client";
import {
  designComponentTokensStore,
  buildComponentTokensJs,
} from "@/lib/design-component-tokens-store";
import { CodeEditor } from "@/components/CodeEditor";

const STARTER_CODE = `import React from 'react';

/** Describe what this component does in one line. */
export default function NewComponent({ children }) {
  return (
    <div style={{ padding: 'var(--space-md)' }}>
      {children ?? 'NewComponent'}
    </div>
  );
}
`;

export function ComponentsPanel() {
  const [components, setComponents] = useState<DesignComponent[]>(() =>
    designComponentsStore.get(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const first = designComponentsStore.get()[0];
    return first?.id ?? null;
  });

  useEffect(() => {
    setComponents(designComponentsStore.get());
    return designComponentsStore.subscribe(setComponents);
  }, []);

  const selected = useMemo(
    () => components.find((c) => c.id === selectedId) ?? null,
    [components, selectedId],
  );

  const addComponent = () => {
    const id = `c_${Date.now().toString(36)}`;
    const existingNames = new Set(components.map((c) => c.name));
    let name = "NewComponent";
    let i = 2;
    while (existingNames.has(name)) {
      name = `NewComponent${i++}`;
    }
    const c: DesignComponent = {
      id,
      name,
      description: "",
      code: STARTER_CODE,
    };
    designComponentsStore.upsert(c);
    setSelectedId(id);
  };

  const removeSelected = () => {
    if (!selected) return;
    if (!window.confirm(`Remove component "${selected.name}"?`)) return;
    designComponentsStore.remove(selected.id);
    setSelectedId(components.find((c) => c.id !== selected.id)?.id ?? null);
  };

  const updateSelected = (patch: Partial<DesignComponent>) => {
    if (!selected) return;
    designComponentsStore.upsert({ ...selected, ...patch });
  };

  return (
    <div className="oc-components">
      <aside className="oc-components-list" aria-label="Components">
        <header className="oc-components-list-head">
          <span className="oc-tokens-title">Components</span>
          <button
            type="button"
            className="oc-tokens-add"
            onClick={addComponent}
            title="Add component"
          >
            + New
          </button>
        </header>
        <ul>
          {components.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="oc-components-item"
                data-selected={c.id === selectedId || undefined}
                onClick={() => setSelectedId(c.id)}
              >
                <span className="oc-components-item-name">{c.name}</span>
                {c.description && (
                  <span className="oc-components-item-desc">
                    {c.description}
                  </span>
                )}
              </button>
            </li>
          ))}
          {components.length === 0 && (
            <li className="oc-tokens-empty">No components yet.</li>
          )}
        </ul>
      </aside>
      {selected ? (
        <section className="oc-components-edit">
          <div className="oc-components-meta">
            <input
              className="oc-tokens-name oc-components-name"
              value={selected.name}
              onChange={(e) =>
                updateSelected({
                  name: e.target.value.replace(/[^A-Za-z0-9]/g, ""),
                })
              }
              spellCheck={false}
              aria-label="Component name"
            />
            <button
              type="button"
              className="oc-components-remove"
              onClick={removeSelected}
              title="Remove component"
            >
              Remove
            </button>
          </div>
          <input
            className="oc-tokens-value oc-components-desc"
            placeholder="One-line description (shown to the AI)"
            value={selected.description}
            onChange={(e) => updateSelected({ description: e.target.value })}
            spellCheck={false}
            aria-label="Component description"
          />
          <div className="oc-components-code">
            <CodeEditor
              value={selected.code}
              onChange={(next) => updateSelected({ code: next })}
              fillParent
            />
          </div>
          <ComponentPreview component={selected} />
        </section>
      ) : (
        <section className="oc-components-empty">
          Select a component to edit, or click <strong>+ New</strong>.
        </section>
      )}
    </div>
  );
}

/**
 * Live Sandpack preview of the selected component. Mirrors the screen
 * Sandpack wiring (same tokens.css, centralIcons, motion, shared
 * components/services/data) so the preview renders EXACTLY how the
 * component would look dropped into a screen. Updates reactively as the
 * user types — Sandpack's `recompileDelay` keeps the compile pass
 * debounced so keystrokes don't thrash.
 *
 * The preview App.js renders `<Component />` with no props inside a
 * centered card. Components that need props (a typed Button that
 * requires `children`) will either render a null/empty shell or crash
 * with a Sandpack error overlay. Both are acceptable signals — the
 * preview's job is to show the DEFAULT look, not to exhaustively
 * document every prop.
 */
function ComponentPreview({ component }: { component: DesignComponent }) {
  const [theme, setTheme] = useState<Theme>(() => themeStore.get());
  const [tokens, setTokens] = useState(() => designTokensStore.get());
  const [components, setComponents] = useState(() =>
    designComponentsStore.get(),
  );
  const [services, setServices] = useState(() => designServicesStore.get());
  const [entities, setEntities] = useState(() => designDataStore.get());
  const [motionJs, setMotionJs] = useState(() =>
    designMotionStore.toMotionJs(),
  );
  const [routesJs, setRoutesJs] = useState(() => routeTableStore.toRoutesJs());
  const [iconRegistryJs, setIconRegistryJs] = useState<string>(() =>
    getIconRegistryJsSync(),
  );
  const [componentTokens, setComponentTokens] = useState(() =>
    designComponentTokensStore.get(),
  );

  useEffect(() => themeStore.subscribe(setTheme), []);
  useEffect(() => designTokensStore.subscribe(setTokens), []);
  useEffect(() => designComponentsStore.subscribe(setComponents), []);
  useEffect(() => designServicesStore.subscribe(setServices), []);
  useEffect(() => designDataStore.subscribe(setEntities), []);
  useEffect(
    () =>
      designMotionStore.subscribe(() =>
        setMotionJs(designMotionStore.toMotionJs()),
      ),
    [],
  );
  useEffect(
    () =>
      routeTableStore.subscribe(() =>
        setRoutesJs(routeTableStore.toRoutesJs()),
      ),
    [],
  );
  useEffect(() => {
    let active = true;
    void getIconRegistryJs().then((js) => {
      if (active) setIconRegistryJs(js);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(
    () => designComponentTokensStore.subscribe(setComponentTokens),
    [],
  );

  const appCode = useMemo(
    () => buildPreviewAppCode(component.name),
    [component.name],
  );

  // Key includes the component name so renaming forces a full remount —
  // otherwise Sandpack's module cache may keep the stale import alive.
  const key = `${component.id}:${component.name}`;

  // Resizable height. Persists across reloads via localStorage; range
  // is clamped at render time so corrupt values can't escape.
  const [height, setHeight] = useState<number>(() => readPreviewHeight());
  useEffect(() => {
    try {
      window.localStorage.setItem(
        PREVIEW_HEIGHT_KEY,
        String(Math.round(height)),
      );
    } catch {
      /* quota / private mode — in-memory state still correct */
    }
  }, [height]);

  return (
    <div
      className="oc-components-preview"
      data-theme={theme}
      style={{ height }}
    >
      <PreviewResizer height={height} onChange={setHeight} />
      <div className="oc-components-preview-head">
        <span className="oc-components-preview-label">Live preview</span>
      </div>
      <div className="oc-components-preview-frame">
        <SandpackProvider
          key={key}
          template="react"
          theme={theme}
          files={{
            "/App.js": appCode,
            "/index.js": SANDPACK_INDEX_JS_FOR_THEME(theme),
            "/tokens.css": buildTokensCss(tokens),
            "/motion.js": motionJs,
            "/routes.js": routesJs,
            "/centralIcons.js": iconRegistryJs,
            "/component-tokens.js": buildComponentTokensJs(componentTokens),
            ...buildComponentFiles(components),
            ...buildServiceFiles(services),
            ...buildDataFiles(entities),
          }}
          customSetup={{
            dependencies: {
              react: "^18.0.0",
              "react-dom": "^18.0.0",
              "framer-motion": "^11.0.0",
            },
          }}
          options={{
            recompileMode: "delayed",
            recompileDelay: 200,
          }}
        >
          <SandpackLayout
            style={{
              height: "100%",
              width: "100%",
              border: "none",
              borderRadius: 0,
            }}
          >
            <SandpackPreview
              showOpenInCodeSandbox={false}
              showRefreshButton={false}
              showNavigator={false}
              showSandpackErrorOverlay
              style={{ height: "100%", width: "100%", flex: 1 }}
            />
          </SandpackLayout>
        </SandpackProvider>
      </div>
    </div>
  );
}

// ─── Resizable preview pane ────────────────────────────────────────

const PREVIEW_HEIGHT_KEY = "oc:components-preview-height:v1";
const MIN_PREVIEW_HEIGHT = 120;
const MAX_PREVIEW_HEIGHT = 720;
const DEFAULT_PREVIEW_HEIGHT = 220;

function readPreviewHeight(): number {
  if (typeof window === "undefined") return DEFAULT_PREVIEW_HEIGHT;
  try {
    const raw = window.localStorage.getItem(PREVIEW_HEIGHT_KEY);
    if (!raw) return DEFAULT_PREVIEW_HEIGHT;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_PREVIEW_HEIGHT;
    return clampHeight(n);
  } catch {
    return DEFAULT_PREVIEW_HEIGHT;
  }
}

function clampHeight(h: number): number {
  return Math.max(MIN_PREVIEW_HEIGHT, Math.min(MAX_PREVIEW_HEIGHT, h));
}

/**
 * Top-edge drag handle for the preview pane. Drag UP to grow the
 * preview (shrink the code editor); drag DOWN to shrink. Pointer
 * events let it work consistently across mouse + touch + pen.
 */
function PreviewResizer({
  height,
  onChange,
}: {
  height: number;
  onChange: (next: number) => void;
}) {
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(
    null,
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startHeight: height };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [height],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      // Drag UP = grow preview (deltaY negative). Invert so moving the
      // handle UP increases height.
      const delta = drag.startY - e.clientY;
      onChange(clampHeight(drag.startHeight + delta));
    },
    [onChange],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released — ignore */
      }
    },
    [],
  );

  return (
    <div
      className="oc-components-preview-resizer"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize preview pane"
      aria-valuenow={Math.round(height)}
      aria-valuemin={MIN_PREVIEW_HEIGHT}
      aria-valuemax={MAX_PREVIEW_HEIGHT}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={(e) => {
        // Keyboard nudge: 8px arrow / 32px shift+arrow.
        const step = e.shiftKey ? 32 : 8;
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onChange(clampHeight(height + step));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          onChange(clampHeight(height - step));
        }
      }}
    >
      <span className="oc-components-preview-resizer-grip" aria-hidden />
    </div>
  );
}

/**
 * Minimal host App that imports the selected component and renders a
 * useful preview against a neutral surface. Components that have
 * meaningful shape variants (Button: label-only / icon+label /
 * icon-only) get a multi-instance layout so the user can see all
 * supported shapes at once. Single-shape components fall back to one
 * instance with conservative default props.
 *
 * Default props for the single-instance fallback:
 *   - `children="Preview"` so label-driven components (Chip, Badge,
 *     ListRow) render with visible text.
 *   - `label`, `title` — same story for form-input components.
 * If a component genuinely requires specific props and crashes, the
 * Sandpack error overlay surfaces it — that's a useful signal too.
 */
function buildPreviewAppCode(name: string): string {
  // Wrapper background is `bg-tertiary` on purpose: most surface-like
  // components (Card, Sheet, ListRow) use `bg-secondary` or
  // `bg-primary`, so tertiary gives the component its own visible
  // silhouette instead of blending into the wrapper.
  if (name === "Button") {
    return BUTTON_PREVIEW_APP;
  }
  return `import React from 'react';
import Target from './components/${name}';
import './tokens.css';

export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      background: 'var(--color-bg-tertiary)',
      color: 'var(--color-fg-primary)',
      fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      boxSizing: 'border-box',
    }}>
      <Target label="Preview" title="Preview">Preview</Target>
    </div>
  );
}
`;
}

/**
 * Button-specific preview — three shape modes (label only, icon+label,
 * icon only) rendered as a vertical stack so each is recognizable at
 * the small preview size. Each row is a horizontal flex with a label
 * caption above the example so the user knows what they're looking at.
 */
const BUTTON_PREVIEW_APP = `import React from 'react';
import Button from './components/Button';
import { Icon } from './centralIcons';
import './tokens.css';

/** Matrix preview — variants/states down, shape modes across.
 *
 *  Rows:    Primary, Secondary, Disabled (primary + disabled=true),
 *           Capsule (primary + capsule=true).
 *  Columns: Label only, Icon + label, Icon only.
 *
 *  12 cells total — captions repeat across rows so each button reads
 *  on its own without scanning back to the column header. The preview
 *  pane is resizable; drag the top edge if you need more headroom. */
const Cell = ({ caption, children }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  }}>
    <span style={{
      fontSize: 9,
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'var(--color-fg-tertiary)',
    }}>{caption}</span>
    {children}
  </div>
);

const RowLabel = ({ children }) => (
  <span style={{
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-fg-secondary)',
    letterSpacing: '-0.005em',
    minWidth: 84,
  }}>{children}</span>
);

const Row = ({ caption, variant = 'primary', disabled = false, capsule = false }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 22,
    flexWrap: 'wrap',
  }}>
    <RowLabel>{caption}</RowLabel>
    <Cell caption="Label">
      <Button variant={variant} disabled={disabled} capsule={capsule}>
        Continue
      </Button>
    </Cell>
    <Cell caption="Icon + label">
      <Button
        variant={variant}
        disabled={disabled}
        capsule={capsule}
        leadingIcon={<Icon name="IconHeart" size={18} />}
      >
        Like
      </Button>
    </Cell>
    <Cell caption="Icon only">
      <Button
        variant={variant}
        disabled={disabled}
        capsule={capsule}
        iconOnly={<Icon name="IconHeart" size={20} />}
        ariaLabel="Like"
      />
    </Cell>
  </div>
);

export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: 18,
      padding: 16,
      background: 'var(--color-bg-tertiary)',
      color: 'var(--color-fg-primary)',
      fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      boxSizing: 'border-box',
    }}>
      <Row caption="Primary" variant="primary" />
      <Row caption="Secondary" variant="secondary" />
      <Row caption="Disabled" variant="primary" disabled />
      <Row caption="Capsule" variant="primary" capsule />
    </div>
  );
}
`;
