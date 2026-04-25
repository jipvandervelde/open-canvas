"use client";

import dynamic from "next/dynamic";

// Client-only — the Sandpack iframes and the pointer-event wiring both need
// the DOM, and we don't want the canvas to render on the server and flash.
const OpenCanvas = dynamic(
  () => import("./OpenCanvas").then((m) => m.OpenCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 grid place-items-center text-sm text-zinc-500">
        Loading canvas…
      </div>
    ),
  },
);

export function Canvas() {
  return <OpenCanvas />;
}
