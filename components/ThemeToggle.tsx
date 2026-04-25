"use client";

import { useEffect, useState } from "react";
import { getIconComponent } from "@/lib/icon-render-client";
import { themeStore, type Theme } from "@/lib/theme-store";

const SunOutlined = getIconComponent("IconSun", "outlined");
const SunFilled = getIconComponent("IconSun", "filled");
const MoonOutlined = getIconComponent("IconMoon", "outlined");
const MoonFilled = getIconComponent("IconMoon", "filled");

/**
 * Figma-style rounded segmented control: light | dark, sliding surface on
 * the active segment. Active side uses filled Central icons; inactive uses
 * outlined. Subscribes to the theme store for external flips.
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
  const Sun = !isDark ? SunFilled : SunOutlined;
  const Moon = isDark ? MoonFilled : MoonOutlined;

  return (
    <div
      className="oc-theme-seg"
      role="group"
      aria-label="Theme"
      data-theme={theme}
    >
      <span className="oc-theme-seg-indicator" aria-hidden="true" />
      <button
        type="button"
        className="oc-theme-seg-item"
        aria-pressed={!isDark}
        aria-label="Light mode"
        onClick={() => themeStore.set("light")}
      >
        {Sun ? (
          <Sun
            size={16}
            color="currentColor"
            ariaHidden
            className="oc-theme-seg-icon"
          />
        ) : null}
      </button>
      <button
        type="button"
        className="oc-theme-seg-item"
        aria-pressed={isDark}
        aria-label="Dark mode"
        onClick={() => themeStore.set("dark")}
      >
        {Moon ? (
          <Moon
            size={16}
            color="currentColor"
            ariaHidden
            className="oc-theme-seg-icon"
          />
        ) : null}
      </button>
    </div>
  );
}
