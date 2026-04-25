"use client";

import { useEffect, useState } from "react";
import { themeStore, type Theme } from "@/lib/theme-store";

/**
 * Two-state pill toggle for the app theme. Subscribes to the theme store so
 * external flips (e.g. from a shortcut or initial hydration) keep the UI
 * in sync.
 */
export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setThemeState(themeStore.get());
    return themeStore.subscribe(setThemeState);
  }, []);

  if (!mounted) return null;

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => themeStore.toggle()}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="oc-theme-toggle"
      data-theme={theme}
    >
      <span className="oc-theme-toggle-track" aria-hidden="true">
        <span className="oc-theme-toggle-thumb" />
      </span>
      <SunIcon />
      <MoonIcon />
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="oc-theme-icon oc-theme-icon-sun"
    >
      <circle cx="7" cy="7" r="2.4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7 1.5v1.6M7 10.9v1.6M1.5 7h1.6M10.9 7h1.6M2.7 2.7l1.15 1.15M10.15 10.15l1.15 1.15M2.7 11.3l1.15-1.15M10.15 3.85l1.15-1.15"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="oc-theme-icon oc-theme-icon-moon"
    >
      <path
        d="M11.5 8.5A4.5 4.5 0 015.5 2.5a5 5 0 106 6z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
