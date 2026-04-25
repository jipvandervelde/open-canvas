"use client";

/**
 * Runtime for a single screen shape — the Sandpack iframe wrapper plus the
 * theme + tokens + components + services + routes files that get piped into
 * every live preview. Extracted from the old ScreenShapeUtil.tsx so the new
 * native canvas can render screens without pulling tldraw.
 *
 * Exports:
 *   <ScreenBody />                   — the full sandpack wrapper, positioned
 *                                     absolute by the caller at (0,0) filling
 *                                     its container.
 *   SANDPACK_INDEX_JS_FOR_THEME()    — /index.js injected into every iframe.
 *   buildComponentFiles / …          — helpers that mirror design-system
 *                                     stores into the Sandpack files map.
 */

import {
  SandpackProvider,
  SandpackPreview,
  SandpackLayout,
} from "@codesandbox/sandpack-react";
import { useEffect, useRef, useState } from "react";
import { SandpackStatusReporter } from "@/components/SandpackStatusReporter";
import { DeviceChrome } from "@/components/DeviceChrome";
import { themeStore, type Theme } from "@/lib/theme-store";
import {
  canvasModeStore,
  toIframeMode,
  type CanvasMode,
} from "@/lib/canvas-mode-store";
import {
  designTokensStore,
  type DesignTokens,
} from "@/lib/design-tokens-store";
import {
  designComponentsStore,
  type DesignComponent,
} from "@/lib/design-components-store";
import {
  designServicesStore,
  type DesignService,
} from "@/lib/design-services-store";
import {
  designMotionStore,
  type MotionPreset,
} from "@/lib/design-motion-store";
import {
  designDataStore,
  type DataEntity,
} from "@/lib/design-data-store";
import { routeTableStore } from "@/lib/route-table-store";
import {
  getIconRegistryJs,
  getIconRegistryJsSync,
} from "@/lib/icon-registry-client";
import {
  designComponentTokensStore,
  buildComponentTokensJs,
} from "@/lib/design-component-tokens-store";
import { screenResetStore } from "@/lib/screen-reset-store";
import { editor } from "@/lib/editor-shim";
import { useValue } from "@/lib/canvas-store";
import type { ScreenShape } from "@/lib/shape-types";

// Force Sandpack's wrapper chain to fill our container. Same rules that used
// to be scoped to `.tl-html-container` — we now own a `.oc-screen` wrapper
// and `.oc-preview` (the right panel) and apply the rules in both.
const SANDPACK_FILL_CSS = `
.oc-screen .sp-wrapper,
.oc-screen .sp-layout,
.oc-screen .sp-stack,
.oc-screen .sp-preview-container,
.oc-screen .sp-preview-iframe {
  height: 100% !important;
  max-height: none !important;
  min-height: 0 !important;
  flex: 1 1 0% !important;
}
.oc-screen .sp-wrapper {
  display: flex !important;
  flex-direction: column !important;
}
.oc-screen .sp-layout,
.oc-screen .sp-preview-container,
.oc-screen .sp-preview-iframe {
  border: 0 !important;
  background: var(--surface-1) !important;
}
.oc-screen .sp-wrapper {
  position: absolute !important;
  inset: -1px !important;
  width: auto !important;
  height: auto !important;
}
body[data-oc-streaming="true"] .oc-screen .sp-error,
body[data-oc-streaming="true"] .oc-screen .sp-overlay,
body[data-oc-streaming="true"] .oc-screen .sp-cm,
body[data-oc-streaming="true"] .oc-screen [class*="sp-error"] {
  display: none !important;
  visibility: hidden !important;
}
`;

if (
  typeof document !== "undefined" &&
  !document.getElementById("oc-sandpack-fill")
) {
  const style = document.createElement("style");
  style.id = "oc-sandpack-fill";
  style.textContent = SANDPACK_FILL_CSS;
  document.head.appendChild(style);
}

export function SANDPACK_INDEX_JS_FOR_THEME(
  theme: "light" | "dark",
  routeParams: Record<string, string> = {},
): string {
  const colorScheme = theme === "dark" ? "dark" : "light";
  const initialRouteParams = JSON.stringify(routeParams);
  return `import App from "./App";
import React from "react";
import { createRoot } from "react-dom/client";
import "./tokens.css";

// Propagate the host-selected theme into the Sandpack <html> so the
// tokens.css [data-theme="dark"] selector applies to design-token var()s
// referenced by the screen code.
document.documentElement.setAttribute("data-theme", "${theme}");
window.__ocRouteParams = ${initialRouteParams};

const resetStyle = document.createElement("style");
resetStyle.textContent = \`
  :root { color-scheme: ${colorScheme}; }
  html, body, #root {
    margin: 0 !important;
    padding: 0 !important;
    height: 100% !important;
    width: 100% !important;
    overflow: hidden;
    background: var(--color-bg-primary) !important;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  #root {
    display: flex;
    flex-direction: column;
  }
  #root > * {
    flex: 1 1 0%;
    min-height: 0;
    min-width: 0;
  }
  iframe[id^="react-error-overlay"],
  iframe[title*="error" i],
  #react-error-overlay,
  #webpack-dev-server-client-overlay,
  [data-reactoverlay] {
    display: none !important;
    pointer-events: none !important;
  }
\`;
document.head.appendChild(resetStyle);

function __ocKillErrorOverlay() {
  const nodes = document.body ? document.body.children : [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n && n.tagName === "IFRAME") {
      try { n.remove(); } catch (e) {}
    }
  }
}
__ocKillErrorOverlay();
new MutationObserver(__ocKillErrorOverlay).observe(document.body, {
  childList: true,
});
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const reo = require("react-error-overlay");
  if (reo && typeof reo.stopReportingRuntimeErrors === "function") {
    reo.stopReportingRuntimeErrors();
  }
} catch (e) {}

class __OcErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.snapshotHtml = null;
    this.rootNode = null;
    this.snapshotMO = null;
  }
  componentDidMount() {
    const rootEl = document.getElementById("root");
    if (!rootEl) return;
    this.rootNode = rootEl;
    const capture = () => {
      if (this.state.error) return;
      if (rootEl.childElementCount === 0) return;
      if (rootEl.firstElementChild && rootEl.firstElementChild.hasAttribute && rootEl.firstElementChild.hasAttribute("data-oc-snapshot")) return;
      this.snapshotHtml = rootEl.innerHTML;
    };
    capture();
    this.snapshotMO = new MutationObserver(capture);
    this.snapshotMO.observe(rootEl, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  }
  componentWillUnmount() {
    if (this.snapshotMO) {
      try { this.snapshotMO.disconnect(); } catch (e) {}
    }
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    try {
      window.parent.postMessage(
        {
          __oc: "oc:runtime-error",
          screenId: window.__ocScreenId || null,
          message: String((error && error.message) || error),
          stack: (error && error.stack) ? String(error.stack).split("\\n").slice(0, 5).join("\\n") : null,
        },
        "*"
      );
    } catch (e) {}
  }
  componentDidUpdate(prevProps, prevState) {
    if (prevState.error && !this.state.error) {
      this.snapshotHtml = null;
    }
  }
  render() {
    if (this.state.error) {
      if (this.snapshotHtml) {
        return React.createElement("div", {
          "data-oc-snapshot": "",
          style: { width: "100%", height: "100%" },
          dangerouslySetInnerHTML: { __html: this.snapshotHtml },
        });
      }
      return null;
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById("root"));
root.render(
  React.createElement(__OcErrorBoundary, null, React.createElement(App))
);

(function attachSelectionAgent() {
  let mode = 'design';
  let screenId = null;
  let armed = false;

  function heartbeat(reason) {
    try {
      window.parent.postMessage(
        { __oc: 'oc:debug', reason, screenId, mode, armed, at: Date.now() },
        '*'
      );
    } catch (e) {}
  }
  heartbeat('mount');
  try {
    window.parent.postMessage({ __oc: 'oc:request-mode', at: Date.now() }, '*');
  } catch (e) {}

  const hover = document.createElement('div');
  hover.setAttribute('data-oc-hover', '');
  hover.style.cssText =
    'position:fixed;pointer-events:none;' +
    'border:1.5px dashed color-mix(in oklch, #4f46e5 70%, transparent);' +
    'background:color-mix(in oklch, #4f46e5 8%, transparent);' +
    'border-radius:4px;z-index:2147483646;' +
    'transition:all 70ms ease-out;opacity:0;';
  document.body.appendChild(hover);

  const selected = document.createElement('div');
  selected.setAttribute('data-oc-selected', '');
  selected.style.cssText =
    'position:fixed;pointer-events:none;' +
    'box-shadow:0 0 0 1.5px #4f46e5,0 0 0 4px color-mix(in oklch, #4f46e5 25%, transparent);' +
    'border-radius:3px;z-index:2147483647;' +
    'transition:all 90ms ease-out;opacity:0;';
  document.body.appendChild(selected);

  const label = document.createElement('div');
  label.setAttribute('data-oc-selected-label', '');
  label.style.cssText =
    'position:fixed;pointer-events:none;z-index:2147483647;' +
    'background:#4f46e5;color:white;' +
    'font:600 10px/1.4 -apple-system, system-ui, sans-serif;' +
    'padding:2px 7px;border-radius:999px;letter-spacing:0.01em;' +
    'box-shadow:0 2px 6px color-mix(in oklch, #4f46e5 35%, transparent);' +
    'opacity:0;white-space:nowrap;';
  document.body.appendChild(label);

  function isInternalUI(el) {
    if (!el) return true;
    return (
      el.hasAttribute?.('data-oc-hover') ||
      el.hasAttribute?.('data-oc-selected') ||
      el.hasAttribute?.('data-oc-selected-label') ||
      el === document.body ||
      el === document.documentElement
    );
  }

  function showHover(el) {
    if (!el || isInternalUI(el) || !armed || mode !== 'design') {
      hover.style.opacity = '0';
      return;
    }
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) {
      hover.style.opacity = '0';
      return;
    }
    hover.style.left = r.left + 'px';
    hover.style.top = r.top + 'px';
    hover.style.width = r.width + 'px';
    hover.style.height = r.height + 'px';
    hover.style.opacity = '1';
  }

  function showSelected(el, info) {
    if (!el) {
      selected.style.opacity = '0';
      label.style.opacity = '0';
      return;
    }
    const r = el.getBoundingClientRect();
    selected.style.left = r.left + 'px';
    selected.style.top = r.top + 'px';
    selected.style.width = r.width + 'px';
    selected.style.height = r.height + 'px';
    selected.style.opacity = '1';

    label.textContent = info.label;
    label.style.left = r.left + 'px';
    label.style.top = Math.max(2, r.top - 20) + 'px';
    label.style.opacity = '1';
  }

  function computePath(el) {
    const parts = [];
    let node = el;
    while (node && node !== document.body && parts.length < 10) {
      let s = node.tagName.toLowerCase();
      if (node.id) {
        s += '#' + node.id;
        parts.unshift(s);
        break;
      }
      const cls = (node.className || '').toString().trim().split(/\\s+/).filter(Boolean);
      if (cls.length) s += '.' + cls.slice(0, 2).join('.');
      if (node.parentElement) {
        const siblings = Array.from(node.parentElement.children).filter(
          (c) => c.tagName === node.tagName
        );
        if (siblings.length > 1) {
          s += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
        }
      }
      parts.unshift(s);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function describe(el) {
    const r = el.getBoundingClientRect();
    const text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
    const tag = el.tagName.toLowerCase();
    const className = (el.className || '').toString();
    const cs = window.getComputedStyle(el);
    const toHex = (c) => {
      if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent') return '';
      const m = c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
      if (!m) return '';
      const h = (n) => Number(n).toString(16).padStart(2, '0');
      return '#' + h(m[1]) + h(m[2]) + h(m[3]);
    };
    const pxNum = (v) => parseFloat(v) || 0;
    const directText =
      el.children.length === 0 ? (el.textContent || '').trim() : '';
    return {
      tag,
      text,
      className,
      id: el.id || '',
      ocId: el.getAttribute('data-oc-id') || '',
      path: computePath(el),
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      label: tag + (el.id ? '#' + el.id : (text ? ' — ' + text.slice(0, 40) : '')),
      styles: {
        background: toHex(cs.backgroundColor),
        color: toHex(cs.color),
        paddingTop: pxNum(cs.paddingTop),
        paddingRight: pxNum(cs.paddingRight),
        paddingBottom: pxNum(cs.paddingBottom),
        paddingLeft: pxNum(cs.paddingLeft),
        borderRadius: pxNum(cs.borderTopLeftRadius),
        fontSize: pxNum(cs.fontSize),
        display: cs.display || 'block',
        flexDirection: cs.flexDirection || 'row',
        gap: pxNum(cs.rowGap || cs.gap),
        justifyContent: cs.justifyContent || 'flex-start',
        alignItems: cs.alignItems || 'stretch',
        flexWrap: cs.flexWrap || 'nowrap',
        alignSelf: cs.alignSelf || 'auto',
        flexGrow: pxNum(cs.flexGrow),
        flexShrink: parseFloat(cs.flexShrink) || 0,
        order: parseInt(cs.order, 10) || 0,
        marginTop: pxNum(cs.marginTop),
        marginRight: pxNum(cs.marginRight),
        marginBottom: pxNum(cs.marginBottom),
        marginLeft: pxNum(cs.marginLeft),
      },
      directText,
    };
  }

  let lastSelected = null;
  let lastHoverEl = null;

  function isDesignArmed() {
    return mode === 'design' && armed;
  }

  function swallow(e) {
    if (!isDesignArmed()) return;
    const t = e.target;
    if (!t || isInternalUI(t)) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }
  }

  const BLOCKED_EVENTS = [
    'pointerdown','mousedown','touchstart','dblclick','contextmenu',
    'submit','keydown','keypress','input','change','beforeinput',
    'dragstart','auxclick',
  ];
  for (const ev of BLOCKED_EVENTS) {
    document.addEventListener(ev, swallow, true);
  }
  document.addEventListener('focusin', (e) => {
    if (!isDesignArmed()) return;
    const t = e.target;
    if (t && !isInternalUI(t) && typeof t.blur === 'function') {
      t.blur();
    }
  }, true);

  // Throttle agentation hover reports so we don't flood postMessage at 120Hz.
  // ~16ms ≈ 60Hz is plenty for a hover overlay.
  let lastAgentationHoverAt = 0;
  let lastAgentationHoverEl = null;
  document.addEventListener('mousemove', (e) => {
    // Agentation mode — stream hovered element info to the parent so the
    // parent-side agentation toolbar can render its hover overlay for
    // elements that live inside this iframe's document.
    if (mode === 'agentation' && armed) {
      hover.style.opacity = '0';
      const now = Date.now();
      if (now - lastAgentationHoverAt < 16) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || isInternalUI(el)) return;
      if (el === lastAgentationHoverEl && now - lastAgentationHoverAt < 120) return;
      lastAgentationHoverAt = now;
      lastAgentationHoverEl = el;
      try {
        const info = describe(el);
        window.parent.postMessage(
          {
            __oc: 'oc:agentation-hover',
            screenId,
            payload: info,
            clientX: e.clientX,
            clientY: e.clientY,
          },
          '*'
        );
      } catch (err) {}
      return;
    }

    if (!isDesignArmed()) {
      hover.style.opacity = '0';
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el === lastHoverEl) return;
    lastHoverEl = el;
    showHover(el);
  }, true);

  document.addEventListener('mouseleave', () => {
    hover.style.opacity = '0';
  }, true);

  document.addEventListener('pointerup', (e) => {
    // Agentation click — report to parent so the parent-side toolbar can
    // open its annotation popup pinned to this element.
    if (mode === 'agentation' && armed) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || isInternalUI(el)) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const info = describe(el);
        window.parent.postMessage(
          {
            __oc: 'oc:agentation-click',
            screenId,
            payload: info,
            clientX: e.clientX,
            clientY: e.clientY,
          },
          '*'
        );
      } catch (err) {}
      return;
    }

    if (!isDesignArmed()) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isInternalUI(el)) return;
    e.preventDefault();
    e.stopPropagation();
    const info = describe(el);
    lastSelected = el;
    showSelected(el, info);
    try {
      window.parent.postMessage(
        { __oc: 'oc:select', screenId, payload: info },
        '*'
      );
    } catch (err) {}
  }, true);

  document.addEventListener('click', (e) => {
    if ((mode === 'agentation' && armed) || isDesignArmed()) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  const reposition = () => {
    if (lastSelected) {
      const info = describe(lastSelected);
      selected.style.left = info.rect.x + 'px';
      selected.style.top = info.rect.y + 'px';
      selected.style.width = info.rect.w + 'px';
      selected.style.height = info.rect.h + 'px';
      label.style.left = info.rect.x + 'px';
      label.style.top = Math.max(2, info.rect.y - 20) + 'px';
    }
    if (lastHoverEl) showHover(lastHoverEl);
  };
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
  const appRoot = document.getElementById('root') || document.body;

  function findLastDescendant(root) {
    let cur = root;
    while (cur && cur.lastElementChild) cur = cur.lastElementChild;
    return cur && cur !== root ? cur : null;
  }
  let posFrame = 0;
  let pendingMutations = null;
  function reportAgentPos() {
    posFrame = 0;
    pendingMutations = null;
    if (!screenId) return;
    const el = findLastDescendant(appRoot);
    if (!el || isInternalUI(el)) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    try {
      window.parent.postMessage(
        { __oc: 'oc:agent-pos', screenId, rect: { x: r.left, y: r.top, w: r.width, h: r.height } },
        '*'
      );
    } catch (e) {}
  }
  function schedulePosReport(muts) {
    let structural = false;
    for (let i = 0; i < muts.length; i++) {
      const t = muts[i].type;
      if (t === 'childList' || t === 'characterData') { structural = true; break; }
    }
    if (!structural) return;
    pendingMutations = muts;
    if (posFrame) return;
    posFrame = requestAnimationFrame(reportAgentPos);
  }

  new MutationObserver((mutations) => {
    reposition();
    schedulePosReport(mutations);
  }).observe(appRoot, {
    subtree: true, childList: true, attributes: true, characterData: true,
  });

  window.addEventListener('message', (e) => {
    const data = e.data;
    if (!data || typeof data !== 'object') return;

    if (data.__oc === 'oc:set-mode') {
      const wasMissingId = !screenId;
      mode = data.mode || 'design';
      armed = !!data.armed;
      if (typeof data.screenId === 'string') {
        screenId = data.screenId;
        window.__ocScreenId = screenId;
      }
      if (!armed || mode !== 'design') {
        hover.style.opacity = '0';
      }
      if (mode !== 'agentation') {
        lastAgentationHoverEl = null;
      }
      if (data.clearSelection) {
        lastSelected = null;
        selected.style.opacity = '0';
        label.style.opacity = '0';
      }
      heartbeat('set-mode');
      if (wasMissingId && !posFrame) {
        pendingMutations = null;
        posFrame = requestAnimationFrame(reportAgentPos);
      }
      return;
    }

    if (
      data.__oc === 'oc:select-parent' &&
      (!data.screenId || data.screenId === screenId)
    ) {
      if (!lastSelected) return;
      const appEl = document.getElementById('root');
      const parent = lastSelected.parentElement;
      if (
        !parent || parent === appEl ||
        parent === document.body ||
        parent === document.documentElement ||
        isInternalUI(parent)
      ) {
        lastSelected = null;
        selected.style.opacity = '0';
        label.style.opacity = '0';
        try {
          window.parent.postMessage({ __oc: 'oc:clear', screenId }, '*');
        } catch (e) {}
        return;
      }
      const info = describe(parent);
      lastSelected = parent;
      showSelected(parent, info);
      try {
        window.parent.postMessage({ __oc: 'oc:select', screenId, payload: info }, '*');
      } catch (e) {}
      return;
    }

    if (
      data.__oc === 'oc:update-style' &&
      lastSelected &&
      (!data.screenId || data.screenId === screenId)
    ) {
      const patch = data.patch || {};
      try {
        if (typeof patch.background === 'string') lastSelected.style.background = patch.background;
        if (typeof patch.color === 'string') lastSelected.style.color = patch.color;
        function applyLen(prop, v) {
          if (typeof v === 'number') lastSelected.style[prop] = v + 'px';
          else if (typeof v === 'string') lastSelected.style[prop] = v;
        }
        applyLen('paddingTop', patch.paddingTop);
        applyLen('paddingRight', patch.paddingRight);
        applyLen('paddingBottom', patch.paddingBottom);
        applyLen('paddingLeft', patch.paddingLeft);
        if (typeof patch.borderRadius === 'number') lastSelected.style.borderRadius = patch.borderRadius + 'px';
        if (typeof patch.fontSize === 'number') lastSelected.style.fontSize = patch.fontSize + 'px';
        if (typeof patch.display === 'string') lastSelected.style.display = patch.display;
        if (typeof patch.flexDirection === 'string') lastSelected.style.flexDirection = patch.flexDirection;
        applyLen('gap', patch.gap);
        if (typeof patch.justifyContent === 'string') lastSelected.style.justifyContent = patch.justifyContent;
        if (typeof patch.alignItems === 'string') lastSelected.style.alignItems = patch.alignItems;
        if (typeof patch.flexWrap === 'string') lastSelected.style.flexWrap = patch.flexWrap;
        if (typeof patch.alignSelf === 'string') lastSelected.style.alignSelf = patch.alignSelf;
        if (typeof patch.flexGrow === 'number') lastSelected.style.flexGrow = String(patch.flexGrow);
        if (typeof patch.flexShrink === 'number') lastSelected.style.flexShrink = String(patch.flexShrink);
        if (typeof patch.order === 'number') lastSelected.style.order = String(patch.order);
        applyLen('marginTop', patch.marginTop);
        applyLen('marginRight', patch.marginRight);
        applyLen('marginBottom', patch.marginBottom);
        applyLen('marginLeft', patch.marginLeft);
        if (typeof patch.directText === 'string') {
          if (lastSelected.children.length === 0) lastSelected.textContent = patch.directText;
        }
        const r = lastSelected.getBoundingClientRect();
        selected.style.left = r.left + 'px';
        selected.style.top = r.top + 'px';
        selected.style.width = r.width + 'px';
        selected.style.height = r.height + 'px';
        label.style.left = r.left + 'px';
        label.style.top = Math.max(2, r.top - 20) + 'px';
      } catch (err) {}
      return;
    }
  });
})();
`;
}

export function buildComponentFiles(
  components: DesignComponent[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of components) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(c.name)) continue;
    out[`/components/${c.name}.js`] = c.code;
  }
  return out;
}

export function buildServiceFiles(
  services: DesignService[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of services) {
    if (!/^[a-zA-Z][A-Za-z0-9]*$/.test(s.name)) continue;
    out[`/services/${s.name}.js`] = s.code;
  }
  return out;
}

export function buildDataFiles(entities: DataEntity[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entities) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(e.name)) continue;
    if (!/^[A-Z][A-Za-z0-9]*$/.test(e.singular)) continue;
    const seedsJson = JSON.stringify(e.seeds ?? [], null, 2);
    out[`/data/${e.name}.js`] =
      `export const ${e.name} = ${seedsJson};\n\n` +
      `export function find${e.singular}(id) {\n` +
      `  return ${e.name}.find((item) => String(item.id) === String(id)) || null;\n` +
      `}\n\n` +
      `export function list${e.singular}s() {\n  return ${e.name};\n}\n`;
  }
  return out;
}

export function buildTokensCss(tokens: DesignTokens): string {
  const varName = (prefix: string, name: string) =>
    `--${prefix}-${name.replace(/\./g, "-")}`;
  const lightLines: string[] = [":root {"];
  for (const t of tokens.color) {
    lightLines.push(`  ${varName("color", t.name)}: ${t.light};`);
  }
  for (const t of tokens.spacing) {
    lightLines.push(`  ${varName("space", t.name)}: ${t.value};`);
  }
  for (const t of tokens.radius) {
    lightLines.push(`  ${varName("radius", t.name)}: ${t.value};`);
  }
  // Typography tokens emit five individual vars per role (family, size,
  // weight, line-height, letter-spacing) plus a back-compat alias
  // `--font-<name>` that resolves to just the size — so existing prose
  // referencing `var(--font-body)` keeps working while new code can
  // reach for the richer vars.
  for (const t of tokens.typography) {
    const base = `--font-${t.name.replace(/\./g, "-")}`;
    lightLines.push(`  ${base}-family: ${t.fontFamily};`);
    lightLines.push(`  ${base}-size: ${t.fontSize};`);
    lightLines.push(`  ${base}-weight: ${t.fontWeight};`);
    lightLines.push(`  ${base}-line-height: ${t.lineHeight};`);
    lightLines.push(`  ${base}-letter-spacing: ${t.letterSpacing};`);
    lightLines.push(`  ${base}: ${t.fontSize};`);
  }
  lightLines.push("}");

  // Dark overrides — emit under BOTH `[data-theme="dark"]` (explicit host
  // control) AND `@media (prefers-color-scheme: dark)` with an
  // `:root:not([data-theme="light"])` guard so the media query yields if
  // the host has forced a theme.
  const darkLines = tokens.color.map(
    (t) => `  ${varName("color", t.name)}: ${t.dark};`,
  );

  return [
    lightLines.join("\n"),
    `[data-theme="dark"] {\n${darkLines.join("\n")}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${darkLines
      .map((l) => "  " + l)
      .join("\n")}\n  }\n}`,
  ].join("\n\n");
}

/** FNV-1a — short stable id when the emitted `tokens.css` string changes. */
function fnv1aHash32(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * Use in Sandpack `key` so the iframe remounts whenever project tokens change.
 * Without this, Sandpack can keep a stale bundled `tokens.css` and previews
 * stay stuck (e.g. white `bg.primary`) after edits in the Tokens panel.
 */
export function designTokensSignature(tokens: DesignTokens): string {
  return fnv1aHash32(buildTokensCss(tokens));
}

/**
 * Full-bleed Sandpack surface for one screen. Does NOT position itself — the
 * parent (OpenCanvas' shape renderer) is expected to size this to the shape's
 * width/height and position it in page coordinates.
 */
export function ScreenBody({ shape }: { shape: ScreenShape }) {
  const [theme, setTheme] = useState<Theme>(() => themeStore.get());
  const [canvasMode, setCanvasMode] = useState<CanvasMode>(() =>
    canvasModeStore.get(),
  );
  const [tokens, setTokens] = useState<DesignTokens>(() =>
    designTokensStore.get(),
  );
  const [components, setComponents] = useState<DesignComponent[]>(() =>
    designComponentsStore.get(),
  );
  const [services, setServices] = useState<DesignService[]>(() =>
    designServicesStore.get(),
  );
  const [motionPresets, setMotionPresets] = useState<MotionPreset[]>(() =>
    designMotionStore.get(),
  );
  const [dataEntities, setDataEntities] = useState<DataEntity[]>(() =>
    designDataStore.get(),
  );
  useEffect(() => themeStore.subscribe(setTheme), []);
  useEffect(() => canvasModeStore.subscribe(setCanvasMode), []);
  useEffect(() => designTokensStore.subscribe(setTokens), []);
  useEffect(() => designComponentsStore.subscribe(setComponents), []);
  useEffect(() => designServicesStore.subscribe(setServices), []);
  useEffect(() => designMotionStore.subscribe(setMotionPresets), []);
  useEffect(() => designDataStore.subscribe(setDataEntities), []);

  const tokensCss = buildTokensCss(tokens);
  const componentFiles = buildComponentFiles(components);
  const serviceFiles = buildServiceFiles(services);
  const dataFiles = buildDataFiles(dataEntities);
  const motionJs = designMotionStore.toMotionJs();
  void motionPresets;

  // Component-token styles, resolved to React CSSProperties objects and
  // exposed as `/component-tokens.js` inside Sandpack. Seeded components
  // import { STYLE } from './component-tokens' and spread the matching
  // entry; agent-generated screens do the same. Rebuilds when tokens
  // (colors/typography/radius/spacing) OR component-token refs change.
  const [componentTokens, setComponentTokens] = useState(() =>
    designComponentTokensStore.get(),
  );
  useEffect(
    () => designComponentTokensStore.subscribe(setComponentTokens),
    [],
  );
  const componentTokensJs = buildComponentTokensJs(componentTokens);
  void tokens; // componentTokensJs resolves to CSS var refs, so tokens
  //              don't need to be in the deps — CSS cascade does the work.

  const [routesJs, setRoutesJs] = useState<string>(() =>
    routeTableStore.toRoutesJs(),
  );
  // Pre-rendered icon registry (~3.6MB of inlined SVGs). Same source as
  // PreviewPanel — the client fetcher memoizes, so every screen on the
  // canvas shares one network hit.
  const [iconRegistryJs, setIconRegistryJs] = useState<string>(() =>
    getIconRegistryJsSync(),
  );
  useEffect(() => {
    let active = true;
    void getIconRegistryJs().then((js) => {
      if (active) setIconRegistryJs(js);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    setRoutesJs(routeTableStore.toRoutesJs());
    return routeTableStore.subscribe(() =>
      setRoutesJs(routeTableStore.toRoutesJs()),
    );
  }, []);

  const [resetKey, setResetKey] = useState<number>(() =>
    screenResetStore.get(shape.id),
  );
  useEffect(() => {
    setResetKey(screenResetStore.get(shape.id));
    return screenResetStore.subscribe(shape.id, setResetKey);
  }, [shape.id]);

  const isEditing = useValue(
    "screen-is-editing-" + shape.id,
    () => editor.getEditingShapeId() === shape.id,
    [shape.id],
  );
  const isSelected = useValue(
    "screen-is-selected-" + shape.id,
    () => editor.getSelectedShapeIds().includes(shape.id),
    [shape.id],
  );

  const isDark = theme === "dark";
  const isInteractive = canvasMode === "cursor";
  const routeParams: Record<string, string> = shape.props.dataRecordId
    ? { id: String(shape.props.dataRecordId) }
    : {};
  // Both inspector and annotator arm element selection inside the selected
  // screen — they share the in-iframe agent, they just route the selection
  // payload to different parent-side UIs.
  //
  // Agentation mode arms every screen simultaneously (not just the selected
  // one) because agentation's annotator should be able to pick any element
  // on the canvas — selecting a screen first would be extra friction.
  const isArmed =
    canvasMode === "agentation" ||
    ((canvasMode === "inspector" || canvasMode === "annotator") && isSelected);

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    function postMode() {
      const iframe = wrapper?.querySelector<HTMLIFrameElement>(
        'iframe[title="Sandpack Preview"]',
      );
      if (!iframe?.contentWindow) return;
      try {
        iframe.contentWindow.postMessage(
          {
            __oc: "oc:set-mode",
            // The in-iframe agent only knows "design" | "interactive" | "off".
            // Inspector + annotator both map to "design" so the selection
            // framework behaves identically; the parent-side Inspector
            // component decides whether to show style dials or an
            // annotation input.
            mode: toIframeMode(canvasMode),
            armed: isArmed,
            screenId: shape.id,
            clearSelection: !isArmed,
          },
          "*",
        );
      } catch {
        /* ignore cross-origin issues */
      }
    }

    postMode();
    const t1 = window.setTimeout(postMode, 200);
    const t2 = window.setTimeout(postMode, 800);
    const t3 = window.setTimeout(postMode, 2000);

    let attachedIframe: HTMLIFrameElement | null = null;
    function onLoad() {
      window.setTimeout(postMode, 30);
      window.setTimeout(postMode, 250);
    }
    function attachLoadHandler() {
      const iframe = wrapper?.querySelector<HTMLIFrameElement>(
        'iframe[title="Sandpack Preview"]',
      ) ?? null;
      if (iframe === attachedIframe) return;
      if (attachedIframe) attachedIframe.removeEventListener("load", onLoad);
      attachedIframe = iframe;
      if (iframe) iframe.addEventListener("load", onLoad);
    }
    attachLoadHandler();
    const mo = new MutationObserver(attachLoadHandler);
    mo.observe(wrapper, { childList: true, subtree: true });

    function onRequest(e: MessageEvent) {
      if (!e.data || typeof e.data !== "object") return;
      if ((e.data as { __oc?: string }).__oc !== "oc:request-mode") return;
      const iframe = wrapper?.querySelector<HTMLIFrameElement>(
        'iframe[title="Sandpack Preview"]',
      );
      if (!iframe || iframe.contentWindow !== e.source) return;
      postMode();
    }
    window.addEventListener("message", onRequest);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      mo.disconnect();
      window.removeEventListener("message", onRequest);
      if (attachedIframe) attachedIframe.removeEventListener("load", onLoad);
    };
  }, [canvasMode, isArmed, shape.id, shape.props.code]);

  // Modest card-style chrome: 1px hairline border + a single soft drop.
  // Editing state stacks an accent focus ring on top. The chat + preview
  // panels mirror this same recipe (see globals.css `.oc-chat, .oc-preview`).
  const shadow = isEditing
    ? `0 0 0 2px var(--accent-base), 0 8px 24px rgba(0,0,0,${isDark ? 0.4 : 0.08})`
    : `0 0 0 1px var(--border-subtle), 0 4px 12px rgba(0,0,0,${isDark ? 0.22 : 0.06})`;

  return (
    <div
      className="oc-screen"
      data-agentation-scope
      data-screen-id={shape.id}
      style={{
        width: shape.props.w,
        height: shape.props.h,
        background: "var(--surface-1)",
        border: "none",
        borderRadius: "var(--chrome-panel-radius)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: shadow,
      }}
    >
      <div
        ref={wrapperRef}
        style={{
          flex: 1,
          position: "relative",
          background: "var(--surface-1)",
          overflow: "hidden",
          pointerEvents:
            isEditing || isInteractive || isArmed ? "auto" : "none",
        }}
        onPointerDown={(e) => {
          if (isEditing || isInteractive || isArmed) e.stopPropagation();
        }}
      >
        <SandpackProvider
          // Include `theme` so flipping light/dark forces a remount; the
          // boot script in /index.js sets data-theme imperatively at boot,
          // and HMR doesn't re-execute it. Without the remount, tokens.css
          // [data-theme="dark"] selectors never engage on toggle.
          // Include `designTokensSignature` so edits in the Tokens panel
          // rebuild Sandpack — otherwise the iframe keeps stale CSS vars.
          key={`${shape.id}:${resetKey}:${theme}:${shape.props.dataEntityName ?? ""}:${shape.props.dataRecordId ?? ""}:${designTokensSignature(tokens)}`}
          template="react"
          theme={theme}
          files={{
            "/App.js": shape.props.code,
            "/index.js": SANDPACK_INDEX_JS_FOR_THEME(theme, routeParams),
            "/tokens.css": tokensCss,
            "/motion.js": motionJs,
            "/routes.js": routesJs,
            "/centralIcons.js": iconRegistryJs,
            "/component-tokens.js": componentTokensJs,
            ...componentFiles,
            ...serviceFiles,
            ...dataFiles,
          }}
          customSetup={{
            dependencies: {
              react: "^18.0.0",
              "react-dom": "^18.0.0",
              "framer-motion": "^11.0.0",
            },
          }}
          options={{
            recompileMode: "delayed",
            recompileDelay: 60,
          }}
        >
          <SandpackLayout
            style={{
              height: "100%",
              width: "100%",
              border: "none",
              borderRadius: 0,
            }}
          >
            <SandpackPreview
              showOpenInCodeSandbox={false}
              showRefreshButton={false}
              showNavigator={false}
              showSandpackErrorOverlay={false}
              style={{ height: "100%", width: "100%", flex: 1 }}
            />
          </SandpackLayout>
          <SandpackStatusReporter screenId={shape.id} />
        </SandpackProvider>
        {/* Ink color follows the host theme — see note in PreviewPanel
            for why the per-screen `statusBarStyle` prop isn't forwarded. */}
        <DeviceChrome viewportId={shape.props.viewportId} isDark={isDark} />
      </div>
    </div>
  );
}

export type { ScreenShape } from "@/lib/shape-types";
