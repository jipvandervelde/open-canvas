"use client";

/**
 * PresenceCursor — the shared cursor primitive used everywhere we render a
 * presence on the canvas:
 *
 *   role="user"      — your own cursor (rendered locally, future multi-window)
 *   role="agent"     — an AI agent's live cursor (current AgentCursor consumer)
 *   role="teammate"  — another collaborator (future multiplayer presence)
 *
 * Visuals are token-driven so the cursor automatically tracks brand changes:
 *
 *   user      → text-primary fill
 *   agent     → accent-base fill
 *   teammate  → state-success fill
 *
 * The component is purely presentational — it absolutely positions itself at
 * `(x, y)` (the arrow tip lands there) and animates between updates with a
 * GPU-accelerated transform. Caller decides where the cursor lives in the DOM
 * tree (canvas overlay, full-screen layer, per-screen overlay).
 */

import * as React from "react";

export type PresenceCursorRole = "user" | "agent" | "teammate";

const ROLE_COLORS: Record<
  PresenceCursorRole,
  {
    /** Cursor arrow + label background. */
    fill: string;
    /** Label text. Always reads against `fill`. */
    ink: string;
    /** Color used by the soft drop-shadow + the pill's outline glow. */
    shadowMix: string;
  }
> = {
  user: {
    fill: "var(--text-primary)",
    ink: "var(--surface-1)",
    shadowMix: "var(--text-primary)",
  },
  agent: {
    fill: "var(--accent-base)",
    ink: "var(--accent-on)",
    shadowMix: "var(--accent-base)",
  },
  teammate: {
    fill: "var(--state-success)",
    ink: "var(--accent-on)",
    shadowMix: "var(--state-success)",
  },
};

const CURSOR_MASK = "url('/cursors/cursor.svg')";
const CURSOR_SIZE = 16;

type Props = {
  role: PresenceCursorRole;
  /** Tip-of-arrow coordinates in screen-space pixels. */
  x: number;
  y: number;
  /** Optional label rendered as a pill anchored next to the cursor. */
  label?: React.ReactNode;
  /** Smoothly tween from previous to current position. Default true; set
   *  false for live mouse-tracking (already 60fps and tweening would lag). */
  animate?: boolean;
  /** Scale factor for the arrow + label. Defaults to 1. */
  scale?: number;
  /** Disable expensive paint effects for cursors that track every pointermove. */
  effects?: boolean;
};

export function PresenceCursor({
  role,
  x,
  y,
  label,
  animate = true,
  scale = 1,
  effects = true,
}: Props) {
  const c = ROLE_COLORS[role];
  const cursorSize = CURSOR_SIZE * scale;
  // Match LocalUserCursor: the SVG path's visual tip sits slightly inside the
  // viewBox, so nudging the mask up/left makes the perceived tip land on (x, y).
  const tipOffset = 2 * scale;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: `translate3d(${x - tipOffset}px, ${y - tipOffset}px, 0)`,
        transition: animate
          ? "transform 520ms cubic-bezier(0.22, 1, 0.36, 1)"
          : "none",
        willChange: "transform",
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        zIndex: 10,
      }}
    >
      <span
        style={{
          display: "block",
          width: cursorSize,
          height: cursorSize,
          flexShrink: 0,
          background: c.fill,
          maskImage: CURSOR_MASK,
          maskPosition: "center",
          maskRepeat: "no-repeat",
          maskSize: "contain",
          WebkitMaskImage: CURSOR_MASK,
          WebkitMaskPosition: "center",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
          filter: effects
            ? `drop-shadow(0 1px 1px rgba(0, 0, 0, 0.24)) drop-shadow(0 3px 8px color-mix(in oklch, ${c.shadowMix} 28%, transparent))`
            : undefined,
          userSelect: "none",
        }}
        aria-hidden
      />
      {label != null ? (
        <span
          className="oc-tabular"
          style={{
            transform: `translateY(${4 * scale}px)`,
            background: c.fill,
            color: c.ink,
            padding: "3px 10px",
            borderRadius: "var(--radius-pill)",
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.4,
            whiteSpace: "nowrap",
            boxShadow: `0 0 0 1px color-mix(in oklch, ${c.shadowMix} 50%, transparent), 0 6px 16px -4px color-mix(in oklch, ${c.shadowMix} 45%, transparent)`,
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
