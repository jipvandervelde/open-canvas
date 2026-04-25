"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  SandpackProvider,
  SandpackPreview,
  SandpackLayout,
} from "@codesandbox/sandpack-react";
import { useValue } from "@/lib/canvas-store";
import { useEditorRef } from "@/lib/editor-context";
import {
  previewPanelStore,
  COLLAPSED_WIDTH,
  type PreviewZoomMode,
} from "@/lib/preview-panel-store";
import {
  VIEWPORT_PRESETS,
  VIEWPORT_PRESETS_BY_ID,
  DEFAULT_SCREEN_CODE,
  DEFAULT_VIEWPORT_ID,
  type ViewportPresetId,
  type ViewportPreset,
} from "@/lib/viewports";
import { themeStore, type Theme } from "@/lib/theme-store";
import {
  designTokensStore,
  type DesignTokens,
} from "@/lib/design-tokens-store";
import {
  getIconRegistryJs,
  getIconRegistryJsSync,
} from "@/lib/icon-registry-client";
import {
  designComponentsStore,
  type DesignComponent,
} from "@/lib/design-components-store";
import {
  designServicesStore,
  type DesignService,
} from "@/lib/design-services-store";
import {
  designDataStore,
  type DataEntity,
} from "@/lib/design-data-store";
import {
  designMotionStore,
  type MotionPreset,
} from "@/lib/design-motion-store";
import { routeTableStore } from "@/lib/route-table-store";
import {
  designComponentTokensStore,
  buildComponentTokensJs,
} from "@/lib/design-component-tokens-store";
import {
  SANDPACK_INDEX_JS_FOR_THEME,
  buildComponentFiles,
  buildServiceFiles,
  buildDataFiles,
  buildTokensCss,
  type ScreenShape,
} from "@/components/ScreenShapeUtil";
import { DeviceChrome } from "@/components/DeviceChrome";
import { PreviewPanelResizer } from "@/components/PreviewPanelResizer";
import { PreviewPanelCornerResizer } from "@/components/PreviewPanelCornerResizer";

/**
 * Right-side Preview panel — runs the canvas's currently-selected screen in
 * a device simulator. Think "Xcode preview canvas" but live: the same
 * Sandpack runtime the canvas shapes use, wrapped in a physical device bezel
 * so the user experiences the app at real dimensions.
 *
 * Behavior:
 *  - Follows canvas selection. If a screen is selected, preview it. Otherwise
 *    preview the first screen on the page (fallback to the default code).
 *  - Device selector changes the *preview frame*, not the canvas shape. Users
 *    can see the same code rendered at different dimensions without touching
 *    their design.
 *  - Collapsed mode pins the panel to a thin rail — same pattern as VSCode's
 *    activity bar. Expand-on-click.
 */
export function PreviewPanel() {
  const { editor } = useEditorRef();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => themeStore.get());
  const [state, setState] = useState(() => previewPanelStore.get());

  useEffect(() => {
    setMounted(true);
    return themeStore.subscribe(setTheme);
  }, []);
  useEffect(() => previewPanelStore.subscribe(setState), []);

  const selectedScreen = useValue(
    "preview-selected-screen",
    () => {
      if (!editor) return null;
      const ids = editor.getSelectedShapeIds();
      const selected = ids
        .map((id) => editor.getShape(id))
        .filter((s): s is ScreenShape => !!s && s.type === "screen");
      if (selected.length === 1) return selected[0];
      const all = editor
        .getCurrentPageShapes()
        .filter((s): s is ScreenShape => s.type === "screen");
      return all[0] ?? null;
    },
    [editor],
  );

  if (!mounted) return null;

  const width = state.collapsed ? COLLAPSED_WIDTH : state.width;
  const isDark = theme === "dark";

  return (
    <aside
      data-agentation-ignore
      className="oc-preview fixed flex flex-col overflow-hidden"
      style={{
        top: 10,
        right: 10,
        width: Math.max(0, width - 10),
        // Flexible height, capped to the viewport so the panel stays inset
        // on both top and bottom no matter how tall the stored value is.
        height: state.collapsed
          ? "calc(100vh - 20px)"
          : `min(${state.height}px, calc(100vh - 20px))`,
        zIndex: 50,
        background: "var(--surface-1)",
      }}
      aria-label="Preview panel"
    >
      {!state.collapsed && <PreviewPanelResizer />}
      {!state.collapsed && <PreviewPanelCornerResizer />}
      {state.collapsed ? (
        <CollapsedRail />
      ) : (
        <ExpandedContents
          screen={selectedScreen}
          deviceId={state.deviceId}
          zoomMode={state.zoomMode}
          isDark={isDark}
        />
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsed rail                                                     */
/* ------------------------------------------------------------------ */

function CollapsedRail() {
  return (
    <div className="flex flex-col items-center gap-2 pt-3">
      <button
        type="button"
        onClick={() => previewPanelStore.setCollapsed(false)}
        title="Show preview"
        aria-label="Show preview"
        className="oc-preview-rail-btn"
      >
        <PhoneIcon />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Expanded contents                                                  */
/* ------------------------------------------------------------------ */

function ExpandedContents({
  screen,
  deviceId,
  zoomMode,
  isDark,
}: {
  screen: ScreenShape | null;
  deviceId: ViewportPresetId;
  zoomMode: PreviewZoomMode;
  isDark: boolean;
}) {
  const device =
    VIEWPORT_PRESETS_BY_ID[deviceId] ??
    VIEWPORT_PRESETS_BY_ID[DEFAULT_VIEWPORT_ID];

  return (
    <>
      <Header screen={screen} deviceId={deviceId} zoomMode={zoomMode} />
      <Stage
        device={device}
        screen={screen}
        zoomMode={zoomMode}
        isDark={isDark}
      />
    </>
  );
}

function Header({
  screen,
  deviceId,
  zoomMode,
}: {
  screen: ScreenShape | null;
  deviceId: ViewportPresetId;
  zoomMode: PreviewZoomMode;
}) {
  return (
    <header
      className="flex items-center gap-2 px-3 py-2.5"
      style={{
        boxShadow: "inset 0 -1px 0 0 var(--border-subtle)",
        minHeight: 44,
      }}
    >
      <span
        className="text-[13px] font-semibold"
        style={{
          color: "var(--text-primary)",
          letterSpacing: "-0.005em",
        }}
      >
        Preview
      </span>
      <span
        className="text-[11px] truncate"
        style={{
          color: "var(--text-tertiary)",
          flex: 1,
        }}
        title={screen?.props.name ?? "No screen"}
      >
        {screen ? screen.props.name : "No screen"}
      </span>
      <ZoomReset value={zoomMode} />
      <DeviceSelector value={deviceId} />
      <button
        type="button"
        onClick={() => previewPanelStore.setCollapsed(true)}
        title="Hide preview"
        aria-label="Hide preview"
        className="oc-preview-icon-btn"
      >
        <CollapseIcon />
      </button>
    </header>
  );
}

/**
 * Single "100%" reset button. Clicking resets both the panel size and the
 * zoom mode: the panel snaps back to "wraps-device-at-100%" dimensions and
 * zoomMode flips to "actual". That way the button does what it says — you
 * always see the device at 1:1 with no clipping — instead of leaving a
 * too-small panel showing only a crop of the device.
 */
function ZoomReset({ value }: { value: PreviewZoomMode }) {
  const isActual = value === "actual";
  return (
    <button
      type="button"
      className="oc-preview-reset"
      data-active={isActual || undefined}
      onClick={() => previewPanelStore.resetSize()}
      title="Reset panel to 100% (device at actual size)"
      aria-label="Reset panel to 100% device size"
    >
      100%
    </button>
  );
}

function DeviceSelector({ value }: { value: ViewportPresetId }) {
  return (
    <select
      value={value}
      onChange={(e) =>
        previewPanelStore.setDeviceId(e.target.value as ViewportPresetId)
      }
      className="text-[11px]"
      style={{
        background: "var(--surface-2)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 6,
        padding: "3px 6px",
        maxWidth: 170,
      }}
    >
      {VIEWPORT_PRESETS.filter((p) => p.id !== "custom").map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/*  Stage — device frame + Sandpack simulator                          */
/* ------------------------------------------------------------------ */

function Stage({
  device,
  screen,
  zoomMode,
  isDark,
}: {
  device: ViewportPreset;
  screen: ScreenShape | null;
  zoomMode: PreviewZoomMode;
  isDark: boolean;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);

  // Measure the stage so "fit" mode can compute a scale that keeps the full
  // device visible. "actual" mode ignores this and renders at scale 1, with
  // the stage scrolling when the device overflows.
  useLayoutEffect(() => {
    if (!stageRef.current) return;
    const el = stageRef.current;
    const ro = new ResizeObserver(() => {
      const pad = 32;
      const aw = Math.max(0, el.clientWidth - pad);
      const ah = Math.max(0, el.clientHeight - pad);
      if (aw <= 0 || ah <= 0) return;
      const s = Math.min(1, aw / device.width, ah / device.height);
      setFitScale(s > 0 ? s : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [device.width, device.height]);

  const scale = zoomMode === "actual" ? 1 : fitScale;
  const isActual = zoomMode === "actual";

  return (
    <div
      ref={stageRef}
      className="flex-1 min-h-0 min-w-0 p-4"
      style={{
        background: "var(--surface-2)",
        overflow: isActual ? "auto" : "hidden",
        display: isActual ? "block" : "grid",
        placeItems: isActual ? undefined : "center",
      }}
    >
      <div
        style={{
          width: device.width * scale,
          height: device.height * scale,
          display: "flex",
          margin: isActual ? "0 auto" : undefined,
        }}
      >
        <div
          style={{
            width: device.width,
            height: device.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            flex: "0 0 auto",
          }}
        >
          <DeviceFrame device={device} screen={screen} isDark={isDark} />
        </div>
      </div>
    </div>
  );
}

function DeviceFrame({
  device,
  screen,
  isDark,
}: {
  device: ViewportPreset;
  screen: ScreenShape | null;
  isDark: boolean;
}) {
  const isMobile = device.category === "mobile";
  const isTablet = device.category === "tablet";
  const hasBezel = isMobile || isTablet;
  const innerRadius = isMobile ? 60 : isTablet ? 32 : 12;
  const bezel = isMobile ? 10 : isTablet ? 12 : 0;
  const radius = innerRadius + bezel;

  return (
    <div
      style={{
        width: device.width,
        height: device.height,
        background: hasBezel ? "#0a0a0a" : "transparent",
        borderRadius: radius,
        padding: bezel,
        boxShadow: hasBezel
          ? `0 20px 50px rgba(0,0,0,${isDark ? 0.55 : 0.25}), 0 0 0 1.5px ${isDark ? "#2a2a2a" : "#1a1a1a"}`
          : `0 10px 24px rgba(0,0,0,${isDark ? 0.45 : 0.1}), 0 0 0 1px var(--border-subtle)`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: innerRadius,
          overflow: "hidden",
          background: isDark ? "#0f0f10" : "#ffffff",
        }}
      >
        <ScreenSandpack
          screen={screen}
          viewportId={device.id}
          isDark={isDark}
        />
        {/* Ink color follows the host theme. The per-screen
            `statusBarStyle` prop is deliberately NOT passed — every
            screen ships with `"dark"` as a factory default that would
            clobber the theme-driven default. If a future screen needs
            a hero override, we'll re-surface the prop through an
            explicit "auto" value. */}
        <DeviceChrome viewportId={device.id} isDark={isDark} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sandpack — mirrors ScreenShapeUtil's runtime so the preview runs   */
/*  the exact same code the canvas does.                               */
/* ------------------------------------------------------------------ */

function ScreenSandpack({
  screen,
  viewportId,
  isDark,
}: {
  screen: ScreenShape | null;
  viewportId: ViewportPresetId;
  isDark: boolean;
}) {
  const [tokens, setTokens] = useState<DesignTokens>(() =>
    designTokensStore.get(),
  );
  const [components, setComponents] = useState<DesignComponent[]>(() =>
    designComponentsStore.get(),
  );
  const [services, setServices] = useState<DesignService[]>(() =>
    designServicesStore.get(),
  );
  const [dataEntities, setDataEntities] = useState<DataEntity[]>(() =>
    designDataStore.get(),
  );
  const [motionPresets, setMotionPresets] = useState<MotionPreset[]>(() =>
    designMotionStore.get(),
  );
  const [routesJs, setRoutesJs] = useState<string>(() =>
    routeTableStore.toRoutesJs(),
  );
  // centralIcons.js is ~1.2 MB of pre-rendered SVGs for all 1970 icons ×
  // 2 variants. We fetch it once per session, memoized module-side —
  // the sync getter returns a tiny stub while the fetch is in flight so
  // Sandpack can still compile screens that haven't yet loaded the
  // registry.
  const [iconRegistryJs, setIconRegistryJs] = useState<string>(() =>
    getIconRegistryJsSync(),
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

  const [componentTokens, setComponentTokens] = useState(() =>
    designComponentTokensStore.get(),
  );
  useEffect(() => designTokensStore.subscribe(setTokens), []);
  useEffect(() => designComponentsStore.subscribe(setComponents), []);
  useEffect(() => designServicesStore.subscribe(setServices), []);
  useEffect(() => designDataStore.subscribe(setDataEntities), []);
  useEffect(() => designMotionStore.subscribe(setMotionPresets), []);
  useEffect(
    () => designComponentTokensStore.subscribe(setComponentTokens),
    [],
  );
  useEffect(
    () =>
      routeTableStore.subscribe(() =>
        setRoutesJs(routeTableStore.toRoutesJs()),
      ),
    [],
  );

  void motionPresets; // subscribed so toMotionJs is fresh
  const theme: Theme = isDark ? "dark" : "light";
  const code = screen?.props.code ?? DEFAULT_SCREEN_CODE;

  // Key includes the screen id + device so the iframe fully remounts when the
  // user swaps device or screen — prevents stale DOM from leaking across.
  const key = `${screen?.id ?? "none"}:${viewportId}:${theme}`;

  return (
    <SandpackProvider
      key={key}
      template="react"
      theme={theme}
      files={{
        "/App.js": code,
        "/index.js": SANDPACK_INDEX_JS_FOR_THEME(theme),
        "/tokens.css": buildTokensCss(tokens),
        "/motion.js": designMotionStore.toMotionJs(),
        "/routes.js": routesJs,
        // Pre-rendered icon registry — every icon from both variant
        // packages, inlined as SVG. Agents import the `<Icon>` component
        // from this file instead of resolving the npm packages through
        // Sandpack's CDN (which fails on wildcard subpath exports).
        "/centralIcons.js": iconRegistryJs,
        "/component-tokens.js": buildComponentTokensJs(componentTokens),
        ...buildComponentFiles(components),
        ...buildServiceFiles(services),
        ...buildDataFiles(dataEntities),
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
        recompileDelay: 60,
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
          showSandpackErrorOverlay={false}
          style={{ height: "100%", width: "100%", flex: 1 }}
        />
      </SandpackLayout>
    </SandpackProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function PhoneIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="7" y="2" width="10" height="20" rx="2.5" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13 6l6 6-6 6" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

