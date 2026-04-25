"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getIconComponent } from "@/lib/icon-render-client";
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
  COLLAPSED_DIAMETER,
  PREVIEW_STAGE_INSET_H,
  PREVIEW_STAGE_INSET_V,
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
  designTokensSignature,
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
      data-collapsed={state.collapsed || undefined}
      style={{
        top: 10,
        right: 10,
        // Collapsed: a 44×44 circular FAB pinned to the top-right corner.
        // Expanded: a panel that respects the dragged width minus the right
        // inset (matches `--right-panel-w` budget the canvas reserves).
        width: state.collapsed
          ? COLLAPSED_DIAMETER
          : Math.max(0, width - 10),
        height: state.collapsed
          ? COLLAPSED_DIAMETER
          : `min(${state.height}px, calc(100vh - 20px))`,
        borderRadius: state.collapsed ? "50%" : undefined,
        zIndex: 50,
        background: "var(--surface-1)",
      }}
      aria-label="Simulator panel"
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
    <button
      type="button"
      onClick={() => previewPanelStore.setCollapsed(false)}
      title="Show preview"
      aria-label="Show preview"
      className="oc-preview-collapsed-fab"
    >
      <PhoneIcon />
    </button>
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
      style={{ minHeight: 44 }}
    >
      <span
        className="pl-1.5 text-[13px] font-semibold"
        style={{
          color: "var(--text-primary)",
          letterSpacing: "-0.005em",
        }}
      >
        Simulator
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
        <HidePreviewIcon />
      </button>
    </header>
  );
}

/**
 * Full-screen icon — resets panel size and zoom so the device is at 1:1
 * (zoomMode "actual"). Panel resize returns to "fit" automatically.
 */
const ZoomResetIcon = getIconComponent("IconFullScreen", "outlined");

function ZoomReset({ value }: { value: PreviewZoomMode }) {
  const isActual = value === "actual";
  const I = ZoomResetIcon;
  if (!I) return null;
  return (
    <button
      type="button"
      className="oc-preview-icon-btn oc-preview-reset"
      data-active={isActual || undefined}
      onClick={() => previewPanelStore.resetSize()}
      title="Reset panel to 100% (device at actual size)"
      aria-label="Reset panel to 100% device size"
    >
      <I size={20} ariaHidden />
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
  // Insets must match the Stage’s asymmetric padding (see `preview-panel-store`).
  useLayoutEffect(() => {
    if (!stageRef.current) return;
    const el = stageRef.current;
    const ro = new ResizeObserver(() => {
      const aw = Math.max(0, el.clientWidth - PREVIEW_STAGE_INSET_H);
      const ah = Math.max(0, el.clientHeight - PREVIEW_STAGE_INSET_V);
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
      className="flex-1 min-h-0 min-w-0 px-8 pt-4 pb-8"
      style={{
        background: "var(--surface-1)",
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
  const [tokens, setTokens] = useState<DesignTokens>(() =>
    designTokensStore.get(),
  );
  useEffect(() => designTokensStore.subscribe(setTokens), []);

  const isMobile = device.category === "mobile";
  const isTablet = device.category === "tablet";
  const hasBezel = isMobile || isTablet;
  const innerRadius = isMobile ? 60 : isTablet ? 32 : 12;
  const bezel = isMobile ? 10 : isTablet ? 12 : 0;
  const radius = innerRadius + bezel;

  const bgPrimary = tokens.color.find((c) => c.name === "bg.primary");
  const screenFill =
    bgPrimary != null
      ? isDark
        ? bgPrimary.dark
        : bgPrimary.light
      : isDark
        ? "#0f0f10"
        : "#ffffff";

  return (
    <div
      style={{
        width: device.width,
        height: device.height,
        background: hasBezel ? "#0a0a0a" : "transparent",
        borderRadius: radius,
        padding: bezel,
        boxShadow: hasBezel
          ? `0 6px 20px rgba(0,0,0,${isDark ? 0.28 : 0.1}), 0 14px 36px -6px rgba(0,0,0,${isDark ? 0.18 : 0.06}), 0 0 0 1.5px ${isDark ? "#2a2a2a" : "#1a1a1a"}`
          : `0 4px 14px rgba(0,0,0,${isDark ? 0.2 : 0.07}), 0 0 0 1px var(--border-subtle)`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: innerRadius,
          overflow: "hidden",
          background: screenFill,
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
  const routeParams: Record<string, string> = screen?.props.dataRecordId
    ? { id: String(screen.props.dataRecordId) }
    : {};

  // Key includes the screen id + device + token signature so the iframe
  // remounts when the user swaps device/screen or edits project tokens.
  // Without the token sig, Sandpack can keep a stale `tokens.css`.
  const key = `${screen?.id ?? "none"}:${viewportId}:${theme}:${screen?.props.dataEntityName ?? ""}:${screen?.props.dataRecordId ?? ""}:${designTokensSignature(tokens)}`;

  return (
    <SandpackProvider
      key={key}
      template="react"
      theme={theme}
      files={{
        "/App.js": code,
        "/index.js": SANDPACK_INDEX_JS_FOR_THEME(theme, routeParams),
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

/** Real Central Icon — hand-rolled SVG was 24×24 squashed into 20×20,
 *  which read squished on the 44×44 collapsed FAB. The registered
 *  `IconPhone` glyph already paints to its viewBox and respects the
 *  `size` prop. */
const PhoneIconGlyph = getIconComponent("IconPhone", "outlined");

function PhoneIcon() {
  if (!PhoneIconGlyph) return null;
  const I = PhoneIconGlyph;
  return <I size={22} ariaHidden />;
}

/** `IconSidebarLeftArrow` points left; flip for “dismiss to the right” (hide). */
const HidePreviewIconGlyph = getIconComponent(
  "IconSidebarLeftArrow",
  "outlined",
);

function HidePreviewIcon() {
  if (!HidePreviewIconGlyph) return null;
  const I = HidePreviewIconGlyph;
  return (
    <span
      className="inline-flex"
      style={{ transform: "scaleX(-1)" }}
      aria-hidden
    >
      <I size={20} ariaHidden />
    </span>
  );
}
