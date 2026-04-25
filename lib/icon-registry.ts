/**
 * Server-side icon SVG registry builder.
 *
 * Why we generate this on the server and ship it as a Sandpack virtual
 * file instead of adding the npm packages to Sandpack's customSetup
 * dependencies:
 *
 * Sandpack's hosted bundler (2-19-8-sandpack.codesandbox.io) refuses to
 * resolve the central-icons scoped packages reliably. They use wildcard
 * subpath exports which that bundler's resolver handles poorly,
 * producing intermittent DependencyNotFoundError at runtime. Even when
 * the main entry resolves, sub-path imports often don't.
 *
 * Our workaround: we have the full packages installed locally in
 * node_modules. We render every icon to a static SVG string once via
 * react-dom/server, strip the outer wrapper, keep only the inner path
 * markup, and bundle the whole catalog into a single JS module that
 * Sandpack loads at the path /centralIcons.js. The module exports a
 * single Icon component that looks up the right path data by name +
 * variant and re-wraps it in an svg with user-controlled size/color/
 * aria props.
 *
 * The rendered JS is roughly 1.2 MB (1970 icons x 2 variants x ~200
 * chars of inline markup). It's cached in memory on the server after
 * the first build, served with long cache headers to the client, and
 * memoized in a module-level promise client-side so Sandpack only pays
 * the cost once per session.
 */

import "server-only";
import React from "react";
import * as FilledIcons from "@central-icons-react/round-filled-radius-2-stroke-2";
import * as OutlinedIcons from "@central-icons-react/round-outlined-radius-2-stroke-2";

type IconComponent = (props: Record<string, unknown>) => React.ReactElement;

let cachedJs: string | null = null;

/**
 * Build the full centralIcons JS module string. Idempotent — result is
 * memoized for the life of the process.
 */
export function getIconRegistryJs(): string {
  if (cachedJs) return cachedJs;

  const filled = extractInnerMarkup(FilledIcons);
  const outlined = extractInnerMarkup(OutlinedIcons);

  // Compact key scheme: IconHome → { f: "...", o: "..." }. Saves a few
  // hundred KB over { filled, outlined } with full word keys.
  const combined: Record<string, { f?: string; o?: string }> = {};
  for (const [name, inner] of Object.entries(filled)) {
    combined[name] = { ...(combined[name] ?? {}), f: inner };
  }
  for (const [name, inner] of Object.entries(outlined)) {
    combined[name] = { ...(combined[name] ?? {}), o: inner };
  }

  cachedJs = renderModuleSource(combined);
  return cachedJs;
}

/**
 * Turn a `import * as` namespace object into { name → inner SVG markup }.
 * The central-icons wrappers render an `<svg>` with child path(s); we
 * keep only the children so the Sandpack-side component can rewrap with
 * user-controlled props.
 *
 * We render WITHOUT `react-dom/server` because Next 16 refuses to let
 * API route handlers pull it in. Instead, we call the component to get
 * its React element tree, then walk the tree ourselves. Central-icons
 * components are trivially simple — just `<CentralIconBase><path .../></…>`
 * or nested `<g><path/></g>` — so a tiny recursive serializer is enough.
 */
function extractInnerMarkup(mod: object): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value !== "function") continue;
    if (!name.startsWith("Icon")) continue;
    // Every icon is also re-exported as `{name}Default` for default-import
    // users; skip the duplicates.
    if (name.endsWith("Default")) continue;
    try {
      const Comp = value as IconComponent;
      // Call the component directly to get its React element. We pass
      // size=24 so the outer <svg> has the standard viewBox, and
      // color=undefined to leave the children's stroke/fill as
      // `currentColor` (set by the source components).
      const element = Comp({ size: 24 });
      const inner = serializeChildrenOfSvg(element);
      if (inner) out[name] = inner;
    } catch {
      // Skip icons that fail — nothing we can do from here.
    }
  }
  return out;
}

/**
 * Central-icons components return a single `<CentralIconBase>` element
 * that, when called, returns an `<svg>` React element with children.
 * Our component doesn't render the full tree — it unwraps past the base
 * wrapper until it finds the first `<svg>`, then serializes its children
 * only (not the <svg> itself, which we'll recreate on the Sandpack side).
 */
function serializeChildrenOfSvg(element: unknown): string {
  const svgElement = findSvgElement(element);
  if (!svgElement) return "";
  const props = svgElement.props ?? {};
  return serializeChildren(props.children);
}

type ReactLikeElement = {
  type: string | ((props: Record<string, unknown>) => unknown);
  props: Record<string, unknown> & { children?: unknown };
};

function isElement(v: unknown): v is ReactLikeElement {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in v &&
    "props" in v &&
    (typeof (v as { type: unknown }).type === "string" ||
      typeof (v as { type: unknown }).type === "function")
  );
}

/**
 * Unwrap composite React elements (function-type) by calling them until
 * we reach the first intrinsic `<svg>`. Returns null if the tree never
 * yields an svg.
 */
function findSvgElement(element: unknown): ReactLikeElement | null {
  let cursor: unknown = element;
  // Guard rail — no icon nests deeper than a few levels.
  for (let i = 0; i < 8; i++) {
    if (!isElement(cursor)) return null;
    if (cursor.type === "svg") return cursor;
    if (typeof cursor.type === "function") {
      cursor = cursor.type(cursor.props);
      continue;
    }
    return null;
  }
  return null;
}

/** Serialize a React children prop (element | array | string | null) to HTML. */
function serializeChildren(children: unknown): string {
  if (children == null || children === false || children === true) return "";
  if (typeof children === "string" || typeof children === "number") {
    return escapeText(String(children));
  }
  if (Array.isArray(children)) {
    return children.map((c) => serializeChildren(c)).join("");
  }
  if (isElement(children)) return serializeElement(children);
  return "";
}

function serializeElement(element: ReactLikeElement): string {
  let cursor: ReactLikeElement | null = element;
  // Resolve composite (function) elements down to intrinsics.
  for (let i = 0; i < 8 && typeof cursor!.type === "function"; i++) {
    const result = (cursor!.type as (p: Record<string, unknown>) => unknown)(
      cursor!.props,
    );
    cursor = isElement(result) ? result : null;
    if (!cursor) return "";
  }
  if (!cursor || typeof cursor.type !== "string") return "";
  const tag = cursor.type;
  const attrs = serializeAttrs(cursor.props);
  const inner = serializeChildren(cursor.props.children);
  // Void SVG elements (path, circle, rect, etc.) still need a closing
  // tag for XML parsers to be happy inside an HTML context — we'll use
  // self-closing via `/>` when there are no children.
  return inner.length > 0
    ? `<${tag}${attrs}>${inner}</${tag}>`
    : `<${tag}${attrs}/>`;
}

/**
 * Serialize a React props bag into an HTML attribute string. Handles
 * the standard React → HTML name conversions (className → class,
 * strokeWidth → stroke-width, etc.) and skips children / unknown
 * complex values.
 */
function serializeAttrs(props: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key" || key === "ref") continue;
    if (value === null || value === undefined || value === false) continue;
    // React-style style object — not relevant on icon children, but
    // handle it defensively.
    if (key === "style" && typeof value === "object") continue;
    const attrName = reactNameToHtml(key);
    if (value === true) {
      parts.push(` ${attrName}`);
    } else {
      parts.push(` ${attrName}="${escapeAttr(String(value))}"`);
    }
  }
  return parts.join("");
}

const REACT_ATTR_NAME_MAP: Record<string, string> = {
  className: "class",
  htmlFor: "for",
};

function reactNameToHtml(name: string): string {
  if (REACT_ATTR_NAME_MAP[name]) return REACT_ATTR_NAME_MAP[name];
  // camelCase → kebab-case for SVG attributes like `strokeWidth`,
  // `strokeLinejoin`, `clipPath`, etc.
  return name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}

function escapeAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Build the final JS module. Plain JS (not JSX) so Sandpack's default
 * esbuild treats it as-is. Exports an `Icon` component + a `has(name)`
 * helper + a `listIcons()` helper.
 */
function renderModuleSource(
  combined: Record<string, { f?: string; o?: string }>,
): string {
  const json = JSON.stringify(combined);
  return `// Auto-generated by lib/icon-registry.ts — DO NOT edit by hand.
// Ships every icon from @central-icons-react as an inline SVG string,
// wrapped in a single React component. Agent-generated screens import
// from './centralIcons' instead of resolving the package through the
// Sandpack CDN (which fails on subpath-wildcard exports).

import React from 'react';

export const ICONS = ${json};

/**
 * <Icon name="IconHome" variant="outlined" size={24} color="currentColor" />
 *
 * Props:
 *   - name (string, required) — PascalCase icon name, e.g. "IconHome".
 *     Prefix with "Icon" (IconHome, IconBellOutlined, IconChart1).
 *   - variant ("filled" | "outlined", default "outlined") — iOS convention:
 *     outlined for default/inactive/decorative; filled for active/selected/primary.
 *   - size (number | string, default 24) — width & height in px.
 *   - color (string, default "currentColor") — sets the SVG color via CSS.
 *   - ariaLabel (string) — when provided, the icon becomes role="img" with a <title>.
 *   - All other props pass through to <svg>.
 */
export function Icon({
  name,
  variant = 'outlined',
  size = 24,
  color = 'currentColor',
  ariaLabel,
  style,
  ...rest
}) {
  const entry = ICONS[name];
  if (!entry) {
    if (typeof console !== 'undefined') {
      console.warn('[centralIcons] Unknown icon name:', name);
    }
    return null;
  }
  const key = variant === 'filled' ? 'f' : 'o';
  const inner = entry[key] ?? entry.o ?? entry.f;
  if (!inner) return null;
  const title = ariaLabel ? '<title>' + escapeXml(ariaLabel) + '</title>' : '';
  const sizeStr = typeof size === 'number' ? size + 'px' : size;
  return React.createElement('svg', {
    width: sizeStr,
    height: sizeStr,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': ariaLabel ? undefined : true,
    role: ariaLabel ? 'img' : undefined,
    style: { color: color, ...style },
    ...rest,
    dangerouslySetInnerHTML: { __html: title + inner },
  });
}

export function hasIcon(name) {
  return typeof ICONS[name] !== 'undefined';
}

export function listIcons() {
  return Object.keys(ICONS);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default Icon;
`;
}
