/**
 * Client-side icon component registry. Pulls in both variant packages
 * (filled + outlined) as `import *` so any icon can be rendered by name.
 *
 * Bundle-size cost: this bundles ~16MB of icon components into the main
 * app. That's deliberate — the IconsPanel needs random-access lookup
 * across the full 1970-icon set, and Sandpack-generated screens use
 * their own direct subpath imports (tree-shaken by Sandpack's bundler)
 * so the main app is the only surface paying the cost.
 *
 * The agent-generated screens do NOT use this registry — they write
 * direct imports like `import { IconHome } from '@central-icons-react/…'`
 * which Sandpack tree-shakes. This file is only for the tool's UI.
 */

import type { FC } from "react";
import * as FilledIcons from "@central-icons-react/round-filled-radius-2-stroke-2";
import * as OutlinedIcons from "@central-icons-react/round-outlined-radius-2-stroke-2";
import type { IconVariant } from "@/lib/icon-style-store";

type IconProps = {
  size?: number | string;
  color?: string;
  ariaHidden?: boolean;
  title?: string;
  style?: React.CSSProperties;
  className?: string;
};

type IconModule = Record<string, FC<IconProps>>;

const filled = FilledIcons as unknown as IconModule;
const outlined = OutlinedIcons as unknown as IconModule;

export function getIconComponent(
  name: string,
  variant: IconVariant,
): FC<IconProps> | null {
  const set = variant === "filled" ? filled : outlined;
  const C = set[name];
  return typeof C === "function" ? C : null;
}
