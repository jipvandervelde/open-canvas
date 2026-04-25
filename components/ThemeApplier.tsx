"use client";

import { useLayoutEffect } from "react";
import { themeStore } from "@/lib/theme-store";

/**
 * Re-applies `data-theme` + `color-scheme` on <html> after React hydration.
 * React 19 normalizes <html> attributes to match what it rendered on the
 * server — which never has `data-theme` (no window at SSR). That wipes the
 * value the boot script set pre-hydration. This component fires
 * useLayoutEffect right after hydration commits, setting the attributes back
 * from the theme-store (which read localStorage + prefers-color-scheme).
 *
 * Paired with the `@media (prefers-color-scheme: dark)` fallback in
 * globals.css so the interval between the hydration wipe and this re-apply
 * still paints close to the user's system preference.
 */
export function ThemeApplier() {
  useLayoutEffect(() => {
    const theme = themeStore.get();
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }, []);
  return null;
}
