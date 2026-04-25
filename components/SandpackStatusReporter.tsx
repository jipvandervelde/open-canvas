"use client";

import { useEffect, useRef } from "react";
import { useSandpack } from "@codesandbox/sandpack-react";
import { screenStatusStore } from "@/lib/screen-status-store";
import { screenErrorLog } from "@/lib/screen-error-log";

/**
 * Subscribes to Sandpack's bundler iframe messages via `listen()` and forwards
 * terminal outcomes (success / error) to the global screen-status store.
 *
 * `useSandpack().sandpack.status` alone isn't enough — for certain error
 * classes (e.g. DependencyNotFoundError) it stays in "running" indefinitely.
 * The iframe-level messages `done`, `success`, and `action: show-error` are
 * authoritative, so we listen for those.
 */
export function SandpackStatusReporter({ screenId }: { screenId: string }) {
  const { listen } = useSandpack();
  const lastSentRef = useRef<string>("");

  // Whenever the store flips this screen back to pending (because a new
  // compile has been queued), clear the dedup so the next success/error
  // message from the iframe is forwarded again.
  useEffect(() => {
    return screenStatusStore.subscribe(screenId, (status) => {
      if (status.kind === "pending") {
        lastSentRef.current = "";
      }
    });
  }, [screenId]);

  useEffect(() => {
    function report(kind: "success" | "error", message?: string) {
      const sig = kind === "error" ? `error:${message}` : "success";
      if (lastSentRef.current === sig) return;
      lastSentRef.current = sig;
      if (kind === "error") {
        const msg = message ?? "Sandpack reported an unknown error.";
        screenStatusStore.set(screenId, { kind: "error", message: msg });
        screenErrorLog.record(screenId, "compile", msg);
      } else {
        screenStatusStore.set(screenId, { kind: "success" });
      }
    }

    const unsub = listen((msg) => {
      // Debug hook so we can inspect what Sandpack actually sends.
      if (typeof window !== "undefined") {
        const w = window as unknown as {
          __ocSandpackDebug?: Record<string, unknown[]>;
        };
        w.__ocSandpackDebug = w.__ocSandpackDebug ?? {};
        const list = (w.__ocSandpackDebug[screenId] as unknown[]) ?? [];
        list.push({ type: msg.type, at: Date.now() });
        if (list.length > 30) list.shift();
        w.__ocSandpackDebug[screenId] = list;
      }

      if (msg.type === "success") {
        report("success");
        return;
      }

      if (msg.type === "done") {
        // `done` fires on every bundler completion, with a flag.
        const compErr = (msg as { compilatonError?: boolean }).compilatonError;
        if (compErr) {
          // Error details arrive via the `action: show-error` message; keep
          // existing error message if we already set one, else a placeholder.
          if (!lastSentRef.current.startsWith("error")) {
            report("error", "Compilation failed.");
          }
        } else {
          report("success");
        }
        return;
      }

      if (msg.type === "action") {
        const act = (msg as { action?: string }).action;
        if (act === "show-error") {
          const title =
            (msg as { title?: string }).title ??
            (msg as { message?: string }).message ??
            "Runtime error";
          report("error", title);
          return;
        }
        if (act === "notification") {
          const t = (msg as { notificationType?: string }).notificationType;
          if (t === "error") {
            report(
              "error",
              (msg as { title?: string }).title ?? "Sandpack error",
            );
          }
          return;
        }
      }
    });

    return () => {
      unsub();
    };
  }, [listen, screenId]);

  return null;
}
