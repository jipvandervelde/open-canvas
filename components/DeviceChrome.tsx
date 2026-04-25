"use client";

import { useEffect, useState } from "react";
import type { ViewportPresetId } from "@/lib/viewports";

/**
 * Device chrome overlay — renders the status bar and home indicator on
 * top of mobile/tablet screens. Pure chrome, no interaction. Sits above
 * the Sandpack iframe (z-index layered) so the app content behind can
 * still be edge-to-edge, while the chrome adds the "this is a real phone"
 * signal users expect from a design tool.
 *
 * Per-viewport metrics come from Apple HIG:
 *   - iPhone 17 (393×852): 47pt status bar, 34pt home indicator
 *   - iPhone 17 Pro (402×874): 59pt (Dynamic Island), 34pt
 *   - iPhone 17 Pro Max (440×956): 59pt (Dynamic Island), 34pt
 *   - iPad (820×1180): 24pt status bar, 20pt home indicator
 *   - Desktop: no chrome
 *
 * Ink color (clock, signal bars, home indicator pill) follows the host
 * theme — white in dark mode, black in light mode — so the chrome stays
 * legible as the user toggles the theme. Screens that need a per-screen
 * override (a dark hero photo where ink should always be light, say) can
 * pass `statusBarStyle="light"` or `"dark"` to force it; the default is
 * theme-driven and is the right answer 95% of the time.
 */

type ChromeSpec = {
  topHeight: number;
  bottomHeight: number;
  dynamicIsland?: boolean;
};

const CHROME: Partial<Record<ViewportPresetId, ChromeSpec>> = {
  // Every modern iPhone (14 Pro+, 15, 16, 17) has a Dynamic Island —
  // include the non-Pro iPhone 17 in that set. The 59px chrome height
  // matches Apple's reported safe-area-inset-top; the design token
  // `--space-safe-top` lives at 62px to give content a 3px breathing
  // gap below the Island.
  "iphone-17": { topHeight: 59, bottomHeight: 34, dynamicIsland: true },
  "iphone-17-pro": { topHeight: 59, bottomHeight: 34, dynamicIsland: true },
  "iphone-17-pro-max": { topHeight: 59, bottomHeight: 34, dynamicIsland: true },
  ipad: { topHeight: 24, bottomHeight: 20 },
};

export function DeviceChrome({
  viewportId,
  isDark,
  statusBarStyle,
}: {
  viewportId: ViewportPresetId;
  /** Current host theme. Used to pick the default ink color:
   *  dark theme → light ink, light theme → dark ink. */
  isDark: boolean;
  /** Optional per-screen override. Omit for the common case where the
   *  screen uses theme tokens and the chrome should follow the theme. */
  statusBarStyle?: "light" | "dark";
}) {
  const spec = CHROME[viewportId];
  if (!spec) return null; // Desktop / custom — no chrome.

  // Default ink tracks the host theme. Explicit override wins when set.
  const style: "light" | "dark" =
    statusBarStyle ?? (isDark ? "light" : "dark");

  return (
    <>
      <StatusBar
        height={spec.topHeight}
        style={style}
        dynamicIsland={spec.dynamicIsland}
      />
      <HomeIndicator height={spec.bottomHeight} style={style} />
    </>
  );
}

function StatusBar({
  height,
  style,
  dynamicIsland,
}: {
  height: number;
  style: "light" | "dark";
  dynamicIsland?: boolean;
}) {
  const ink = style === "light" ? "#FFFFFF" : "#000000";
  const [time, setTime] = useState(() => formatClock());

  // Live clock — ticks every 15s, enough to feel alive without waking the
  // render loop every second across every screen on the canvas. Real iOS
  // updates on the minute anyway.
  useEffect(() => {
    setTime(formatClock());
    const id = window.setInterval(() => setTime(formatClock()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const systemUi =
    "ui-sans-serif, -apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, sans-serif";
  const assetTone = style === "light" ? undefined : "invert(1)";

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height,
        pointerEvents: "none",
        zIndex: 6,
        // Soft vertical fade so the status bar stays legible over hero
        // gradients; invisible over flat solid backgrounds.
        background:
          style === "light"
            ? "linear-gradient(180deg, rgba(0,0,0,0.15), transparent 80%)"
            : "transparent",
      }}
    >
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          alignItems: "center",
          minHeight: 44,
          padding: "12px 20px 0",
          color: ink,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 0,
            textAlign: "center",
          }}
        >
          <span
            data-status-clock
            style={{
              display: "inline-block",
              fontFamily: systemUi,
              fontSize: 15.5,
              fontWeight: 600,
              letterSpacing: -0.35,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.2,
            }}
          >
            {time}
          </span>
        </div>
        <div aria-hidden style={{ minHeight: 1 }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            minWidth: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static public asset, chrome asset */}
          <img
            src="/device-chrome/statusbar-right.svg"
            width={100}
            height={20}
            alt=""
            style={{
              display: "block",
              maxWidth: "100%",
              height: "auto",
              objectFit: "contain",
              filter: assetTone,
            }}
          />
        </div>
      </div>
      {dynamicIsland && <DynamicIsland />}
    </div>
  );
}

function HomeIndicator({
  height,
  style,
}: {
  height: number;
  style: "light" | "dark";
}) {
  // Asset: `public/device-chrome/home-indicator.svg` — 144×5, centered
  // horizontally with its bottom edge 8px from the device bottom (iOS HIG).
  const assetTone = style === "light" ? undefined : "invert(1)";
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height,
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: 8,
        zIndex: 6,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static public asset, chrome asset */}
      <img
        src="/device-chrome/home-indicator.svg"
        width={144}
        height={5}
        alt=""
        style={{
          display: "block",
          maxWidth: "min(100%, 144px)",
          width: 144,
          height: 5,
          filter: assetTone,
        }}
      />
    </div>
  );
}

function DynamicIsland() {
  return (
    <div
      style={{
        position: "absolute",
        top: 11,
        left: "50%",
        transform: "translateX(-50%)",
        width: 124,
        height: 37,
        background: "#000",
        borderRadius: 20,
        pointerEvents: "none",
        zIndex: 2,
      }}
    />
  );
}

function formatClock(): string {
  const d = new Date();
  let h = d.getHours();
  const m = d.getMinutes();
  // iOS uses 24h or 12h based on system; our chrome defaults to 24h since
  // that's what most design mocks use. Switching to 12h is trivial if a
  // user preference later demands it.
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  void h;
  return `${hh}:${mm}`;
}
