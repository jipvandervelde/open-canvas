/**
 * Right-side Preview panel state — width, collapsed state, and the currently
 * selected simulator device. Persisted to localStorage. Writes the width into
 * the `--right-panel-w` CSS variable that TldrawCanvas reads to reserve the
 * canvas's right inset, so the canvas and the preview never overlap.
 *
 * Collapsed state pins the width to a thin rail; expanded state restores the
 * user's chosen drag-width.
 */

import {
  DEFAULT_VIEWPORT_ID,
  VIEWPORT_PRESETS_BY_ID,
  type ViewportPresetId,
} from "@/lib/viewports";

const STORAGE_KEY_WIDTH = "oc:preview-panel-w";
const STORAGE_KEY_HEIGHT = "oc:preview-panel-h";
const STORAGE_KEY_COLLAPSED = "oc:preview-panel-collapsed";
const STORAGE_KEY_DEVICE = "oc:preview-panel-device";
const STORAGE_KEY_ZOOM = "oc:preview-panel-zoom";

export type PreviewZoomMode = "fit" | "actual";

export const COLLAPSED_WIDTH = 40;
export const MAX_WIDTH = 1400;
export const MAX_HEIGHT = 1600;
/** Minimum scale the device is allowed to render at — a floor so the preview
 *  never becomes unreadably tiny. Also drives the panel's dynamic minimum
 *  size so the panel can't shrink below what fits the device at this scale. */
export const MIN_SCALE = 0.35;
/** Hard-floor absolute minimums — guard against tiny pathological devices
 *  (e.g., a custom 100×100 preset) where `device * MIN_SCALE + chrome` would
 *  still shrink below a usable panel. */
const ABS_MIN_WIDTH = 220;
const ABS_MIN_HEIGHT = 200;
/** Stage padding — must match `PreviewPanel` `Stage` Tailwind classes. */
export const PREVIEW_STAGE_PAD_X_PX = 32; // `px-8`
export const PREVIEW_STAGE_PAD_TOP_PX = 16; // `pt-4` — less space above the device
export const PREVIEW_STAGE_PAD_BOTTOM_PX = 32; // `pb-8`
export const PREVIEW_STAGE_INSET_H = PREVIEW_STAGE_PAD_X_PX * 2;
export const PREVIEW_STAGE_INSET_V =
  PREVIEW_STAGE_PAD_TOP_PX + PREVIEW_STAGE_PAD_BOTTOM_PX;

/** Chrome reserved around the device inside the panel: stage padding + aside
 *  insets + header. The aside subtracts 10px from `state.width` for its right
 *  margin (so the CSS var reports total reserved screen space correctly),
 *  so the horizontal budget needs to include that margin or the device ends
 *  up scaled slightly below 1.0 at the "wraps-device" default size. */
const PANEL_H_PADDING = PREVIEW_STAGE_INSET_H + 10; // stage L/R + aside margin
const PANEL_V_PADDING = PREVIEW_STAGE_INSET_V; // stage top + bottom
const PANEL_HEADER_H = 48;

/** Extra W/H on default + min panel so the device isn’t flush to the stage. */
const PANEL_LOOSEN = 20;

type State = {
  width: number;
  height: number;
  collapsed: boolean;
  deviceId: ViewportPresetId;
  zoomMode: PreviewZoomMode;
};

type Listener = (state: State) => void;

/** Device-driven default panel size — wraps the device at 100% plus chrome. */
function defaultSizeFor(id: ViewportPresetId): { w: number; h: number } {
  const d = VIEWPORT_PRESETS_BY_ID[id] ?? VIEWPORT_PRESETS_BY_ID[DEFAULT_VIEWPORT_ID];
  return {
    w: Math.round(d.width + PANEL_H_PADDING + PANEL_LOOSEN),
    h: Math.round(d.height + PANEL_V_PADDING + PANEL_HEADER_H + PANEL_LOOSEN),
  };
}

/** Device-driven minimum panel size — the floor below which the device would
 *  be forced under MIN_SCALE. Absolute ABS_MIN_* kick in for unusually small
 *  presets. */
function minSizeFor(id: ViewportPresetId): { w: number; h: number } {
  const d = VIEWPORT_PRESETS_BY_ID[id] ?? VIEWPORT_PRESETS_BY_ID[DEFAULT_VIEWPORT_ID];
  return {
    w: Math.max(
      ABS_MIN_WIDTH,
      Math.round(d.width * MIN_SCALE + PANEL_H_PADDING + PANEL_LOOSEN),
    ),
    h: Math.max(
      ABS_MIN_HEIGHT,
      Math.round(
        d.height * MIN_SCALE + PANEL_V_PADDING + PANEL_HEADER_H + PANEL_LOOSEN,
      ),
    ),
  };
}

class PreviewPanelStore {
  private state: State;
  private listeners = new Set<Listener>();
  private hydrated = false;

  constructor() {
    const def = defaultSizeFor(DEFAULT_VIEWPORT_ID);
    this.state = {
      width: def.w,
      height: def.h,
      collapsed: false,
      deviceId: DEFAULT_VIEWPORT_ID,
      // Default zoom = "actual" (100%). Panel wraps the device at 100% so
      // there's no visual difference vs "fit"; the distinction only appears
      // once the user shrinks the panel (where fit auto-scales down).
      zoomMode: "actual",
    };
  }

  hydrate(): State {
    if (this.hydrated) return this.state;
    this.hydrated = true;
    if (typeof window === "undefined") return this.state;
    try {
      // Device first — defaults for W/H depend on it.
      const rawD = window.localStorage.getItem(STORAGE_KEY_DEVICE);
      if (rawD) this.state.deviceId = rawD as ViewportPresetId;

      // Only override the device-driven defaults if the user has explicitly
      // resized; otherwise recompute defaults from the (possibly updated)
      // device so new users see a perfect 100% wrap.
      const rawW = window.localStorage.getItem(STORAGE_KEY_WIDTH);
      const rawH = window.localStorage.getItem(STORAGE_KEY_HEIGHT);
      const storedW = rawW != null ? parseInt(rawW, 10) : NaN;
      const storedH = rawH != null ? parseInt(rawH, 10) : NaN;
      if (!isNaN(storedW) || !isNaN(storedH)) {
        const next = this.clamp(
          !isNaN(storedW) ? storedW : this.state.width,
          !isNaN(storedH) ? storedH : this.state.height,
        );
        this.state.width = next.w;
        this.state.height = next.h;
      } else {
        const def = defaultSizeFor(this.state.deviceId);
        this.state.width = def.w;
        this.state.height = def.h;
      }

      const rawC = window.localStorage.getItem(STORAGE_KEY_COLLAPSED);
      if (rawC === "1") this.state.collapsed = true;

      const rawZ = window.localStorage.getItem(STORAGE_KEY_ZOOM);
      if (rawZ === "fit" || rawZ === "actual") this.state.zoomMode = rawZ;
    } catch {
      /* ignore */
    }
    this.applyCssVar();
    return this.state;
  }

  get(): State {
    if (!this.hydrated) this.hydrate();
    return this.state;
  }

  /** Dimensions at which the panel would fit the device at MIN_SCALE. The
   *  corner resizer reads this to know how far it's allowed to shrink. */
  getMinSize(): { w: number; h: number } {
    return minSizeFor(this.state.deviceId);
  }

  private clamp(w: number, h: number): { w: number; h: number } {
    const min = minSizeFor(this.state.deviceId);
    // Upper bound = the "wraps device at 100%" default for the current
    // device. Growing past that would only pad empty space around the
    // device, which we disallow — the preview maxes out at its actual size.
    // The absolute MAX_* constants stay as a ceiling against runaway values.
    const defSize = defaultSizeFor(this.state.deviceId);
    const maxW = Math.min(defSize.w, MAX_WIDTH);
    const maxH = Math.min(defSize.h, MAX_HEIGHT);
    const clampedW = Math.round(Math.max(min.w, Math.min(maxW, w)));
    const clampedH = Math.round(Math.max(min.h, Math.min(maxH, h)));
    return { w: clampedW, h: clampedH };
  }

  setWidth(width: number) {
    const next = this.clamp(width, this.state.height);
    if (next.w === this.state.width) return;
    // Any user resize snaps zoom to "fit" so the device auto-rescales to the
    // new container. Pressing the "100%" button explicitly overrides later.
    this.state = { ...this.state, width: next.w, zoomMode: "fit" };
    this.persist(STORAGE_KEY_WIDTH, String(next.w));
    this.persist(STORAGE_KEY_ZOOM, "fit");
    this.applyCssVar();
    this.emit();
  }

  setHeight(height: number) {
    const next = this.clamp(this.state.width, height);
    if (next.h === this.state.height) return;
    this.state = { ...this.state, height: next.h, zoomMode: "fit" };
    this.persist(STORAGE_KEY_HEIGHT, String(next.h));
    this.persist(STORAGE_KEY_ZOOM, "fit");
    this.emit();
  }

  setSize(width: number, height: number) {
    const next = this.clamp(width, height);
    if (next.w === this.state.width && next.h === this.state.height) return;
    this.state = {
      ...this.state,
      width: next.w,
      height: next.h,
      zoomMode: "fit",
    };
    this.persist(STORAGE_KEY_WIDTH, String(next.w));
    this.persist(STORAGE_KEY_HEIGHT, String(next.h));
    this.persist(STORAGE_KEY_ZOOM, "fit");
    this.applyCssVar();
    this.emit();
  }

  setCollapsed(collapsed: boolean) {
    if (this.state.collapsed === collapsed) return;
    this.state = { ...this.state, collapsed };
    this.persist(STORAGE_KEY_COLLAPSED, collapsed ? "1" : "0");
    this.applyCssVar();
    this.emit();
  }

  toggleCollapsed() {
    this.setCollapsed(!this.state.collapsed);
  }

  setDeviceId(id: ViewportPresetId) {
    if (this.state.deviceId === id) return;
    // Switch device then re-fit the panel to wrap the new device at 100%.
    // This matches the "default should be 100% with the panel wrapping the
    // device" behavior — changing devices always starts you at 100% again.
    const def = defaultSizeFor(id);
    this.state = {
      ...this.state,
      deviceId: id,
      width: def.w,
      height: def.h,
      zoomMode: "actual",
    };
    this.persist(STORAGE_KEY_DEVICE, id);
    this.persist(STORAGE_KEY_WIDTH, String(def.w));
    this.persist(STORAGE_KEY_HEIGHT, String(def.h));
    this.persist(STORAGE_KEY_ZOOM, "actual");
    this.applyCssVar();
    this.emit();
  }

  /** Reset panel W/H to the "wraps-device-at-100%" default for the current
   *  device. Double-clicking the resizer handles call this. */
  resetSize() {
    const def = defaultSizeFor(this.state.deviceId);
    this.setSize(def.w, def.h);
    this.setZoomMode("actual");
  }

  setZoomMode(mode: PreviewZoomMode) {
    if (this.state.zoomMode === mode) return;
    this.state = { ...this.state, zoomMode: mode };
    this.persist(STORAGE_KEY_ZOOM, mode);
    this.emit();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private emit() {
    for (const l of this.listeners) l(this.state);
  }

  private persist(key: string, value: string) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }

  private applyCssVar() {
    if (typeof document === "undefined") return;
    const effective = this.state.collapsed ? COLLAPSED_WIDTH : this.state.width;
    document.documentElement.style.setProperty(
      "--right-panel-w",
      `${effective}px`,
    );
  }
}

export const previewPanelStore = new PreviewPanelStore();

if (typeof window !== "undefined") {
  previewPanelStore.hydrate();
}
