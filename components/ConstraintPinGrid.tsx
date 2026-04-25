"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { SelectedElement } from "@/lib/selected-element-store";

type H = "left" | "center" | "right";
type V = "top" | "center" | "bottom";

/**
 * Figma-style constraint pin grid for a selected element. The nine pins
 * encode all combinations of horizontal ∈ {left, center, right} and
 * vertical ∈ {top, center, bottom}. Stretch toggles per axis fill the
 * available space on that axis.
 *
 * Mapping to CSS uses `margin: auto` on the appropriate sides — a pattern
 * that works identically in both row-flex and column-flex parents, so the
 * pin grid reads "visually" rather than "relative to the flex axis". Values
 * reach the iframe through the existing `postStyleUpdate` path; the iframe
 * agent already handles string values (including "auto") for margin props.
 */
export function ConstraintPinGrid({
  element,
  postPatch,
}: {
  element: SelectedElement;
  postPatch: (
    patch: Record<string, string | number | boolean | undefined>,
  ) => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  // Wait for Dialkit to mount its panel, then portal into it. Retry a few
  // frames because Dialkit renders after its parent's first commit.
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

  if (!host) return null;

  return createPortal(
    <PinGridBody element={element} postPatch={postPatch} />,
    host,
  );
}

function PinGridBody({
  element,
  postPatch,
}: {
  element: SelectedElement;
  postPatch: (
    patch: Record<string, string | number | boolean | undefined>,
  ) => void;
}) {
  const applyPin = (h: H, v: V) => {
    postPatch({
      marginLeft: h === "left" ? 0 : "auto",
      marginRight: h === "right" ? 0 : "auto",
      marginTop: v === "top" ? 0 : "auto",
      marginBottom: v === "bottom" ? 0 : "auto",
    });
  };

  const fillHorizontal = () => {
    postPatch({ marginLeft: 0, marginRight: 0, flexGrow: 1, alignSelf: "stretch" });
  };
  const fillVertical = () => {
    postPatch({ marginTop: 0, marginBottom: 0, alignSelf: "stretch", flexGrow: 1 });
  };
  const resetFill = () => {
    postPatch({ flexGrow: 0, alignSelf: "auto" });
  };

  // Per-axis stretch toggles are apply-only — we can't reliably read
  // "auto vs 0" back from computed style. The pin grid is write-only too.
  void element;

  return (
    <div className="oc-constraint-grid">
      <div className="oc-constraint-grid-head">Constraints</div>
      <div className="oc-constraint-grid-body">
        <div className="oc-constraint-pins" role="group" aria-label="Pin to">
          {ROWS.map((v) => (
            <div key={v} className="oc-constraint-pins-row">
              {COLS.map((h) => (
                <button
                  key={`${h}-${v}`}
                  type="button"
                  className="oc-constraint-pin"
                  title={`Pin ${v}-${h}`}
                  onClick={() => applyPin(h, v)}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="oc-constraint-actions">
          <button
            type="button"
            className="oc-constraint-action"
            onClick={fillHorizontal}
            title="Stretch horizontally (fill width)"
          >
            <span className="oc-constraint-axis-glyph">↔</span>
            Fill W
          </button>
          <button
            type="button"
            className="oc-constraint-action"
            onClick={fillVertical}
            title="Stretch vertically (fill height)"
          >
            <span className="oc-constraint-axis-glyph">↕</span>
            Fill H
          </button>
          <button
            type="button"
            className="oc-constraint-action oc-constraint-reset"
            onClick={resetFill}
            title="Reset fill / alignSelf"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

const COLS: H[] = ["left", "center", "right"];
const ROWS: V[] = ["top", "center", "bottom"];
