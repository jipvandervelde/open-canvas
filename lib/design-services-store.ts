/**
 * Shared, hand-authored cross-screen logic modules. Each service is a file
 * the Sandpack iframe exposes at `/services/{Name}.js`; screens import them
 * like `import { useSession } from './services/session';`. This is where
 * state, side-effects, and shared helpers live — the "brains behind the
 * screens" so the AI stops inlining the same logic across three screens.
 *
 * Mirrors `design-components-store` almost exactly. Later iterations plug
 * in auto-install for third-party connectors (Supabase, Firebase, etc.),
 * but for now every service is in-canvas JS, no network.
 */

export type DesignService = {
  id: string;
  name: string; // PascalCase/camelCase slug used for filename + import
  description: string;
  code: string;
};

// Bump whenever the DEFAULTS meaningfully change so existing users pick up
// the updated service code instead of keeping their stale cached copies.
// v2: router now exports useParams().
const SERVICES_VERSION = 2;
const STORAGE_KEY = `oc:design-services:v${SERVICES_VERSION}`;

const SESSION_CODE = `import React, { createContext, useContext, useMemo, useState } from 'react';

/** Session — the signed-in user, plus a tiny in-memory auth shim.
 *  Screens can \`const { user, signIn, signOut } = useSession();\`. */
const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const value = useMemo(() => ({
    user,
    signIn: (u) => setUser(u ?? { id: 'demo-user', name: 'Demo' }),
    signOut: () => setUser(null),
  }), [user]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  // Allow screens to call useSession outside a provider during design-time —
  // return a stub so previews don't crash.
  return ctx ?? { user: null, signIn: () => {}, signOut: () => {} };
}
`;

const FETCHER_CODE = `/** Fetcher — minimal typed JSON helpers that always set JSON headers and
 *  throw on non-2xx responses. Use this instead of raw fetch() so screens
 *  look consistent and errors surface predictably. */

async function toJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

async function handle(res) {
  if (!res.ok) {
    const body = await toJson(res).catch(() => null);
    const message = (body && body.error) || res.statusText || 'Request failed';
    throw new Error(\`[\${res.status}] \${message}\`);
  }
  return toJson(res);
}

export async function getJSON(url, init) {
  const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init?.headers || {}) } });
  return handle(res);
}

export async function postJSON(url, body, init) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers || {}) },
    body: JSON.stringify(body ?? {}),
    ...init,
  });
  return handle(res);
}

export async function patchJSON(url, body, init) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers || {}) },
    body: JSON.stringify(body ?? {}),
    ...init,
  });
  return handle(res);
}

export async function deleteRequest(url, init) {
  const res = await fetch(url, { method: 'DELETE', ...init });
  return handle(res);
}
`;

const STORAGE_CODE = `/** Storage — typed localStorage wrapper. All values go through JSON so
 *  screens can persist objects/arrays without manual serialize/parse. */

export function getItem(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function removeItem(key) {
  try { localStorage.removeItem(key); } catch {}
}

import { useEffect, useState, useCallback } from 'react';

/** useLocalState — like useState but persisted to localStorage. */
export function useLocalState(key, initial) {
  const [value, setValue] = useState(() => {
    const stored = getItem(key, null);
    return stored == null ? (typeof initial === 'function' ? initial() : initial) : stored;
  });
  useEffect(() => { setItem(key, value); }, [key, value]);
  const clear = useCallback(() => { removeItem(key); setValue(typeof initial === 'function' ? initial() : initial); }, [key, initial]);
  return [value, setValue, clear];
}
`;

const TOAST_CODE = `import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

/** Toast — portal-based ephemeral notifications. Call \`const toast = useToast();
 *  toast.show('Saved')\` from any screen. Wrap the app in <ToastProvider />
 *  (done by default in /index.js). */

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, opts = {}) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind: opts.kind ?? 'info' }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.durationMs ?? 2400);
  }, []);
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 2147483646 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            padding: 'var(--space-sm) var(--space-md)',
            borderRadius: 'var(--radius-md)',
            background: t.kind === 'error' ? 'var(--color-state-danger)' : 'var(--color-bg-surface)',
            color: t.kind === 'error' ? 'white' : 'var(--color-text-primary)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            fontSize: 'var(--font-body)',
          }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx ?? { show: () => {} };
}
`;

const ROUTER_CODE = `/** Router — inter-screen navigation with path params.
 *
 *  <Link to="/recipes/r1"> emits an \`oc:navigate\` postMessage; the canvas
 *  listens, matches the path against its auto-generated route table
 *  (supports template segments like \`:id\` and \`:slug\`), then pans to that
 *  screen AND broadcasts the captured params back to that screen's iframe.
 *
 *  useParams() reads the latest params for this screen. It pairs with the
 *  data layer: a detail screen does \`const { id } = useParams();
 *  const recipe = findRecipe(id);\` and stays in sync as the user clicks
 *  different items in the overview screen.
 */

import React, { useEffect, useState } from 'react';

/** Split "/recipes?id=r1&sort=asc" into { path: "/recipes", params: {id:"r1", sort:"asc"} }. */
function splitLink(to) {
  if (!to) return { path: '/', params: {} };
  const qi = to.indexOf('?');
  if (qi < 0) return { path: to, params: {} };
  const path = to.slice(0, qi) || '/';
  const params = {};
  const qs = to.slice(qi + 1);
  for (const pair of qs.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const k = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
    const v = decodeURIComponent(eq < 0 ? '' : pair.slice(eq + 1));
    if (k) params[k] = v;
  }
  return { path, params };
}

function emitNavigate(to) {
  try {
    const { path, params } = splitLink(to);
    window.parent.postMessage({ __oc: 'oc:navigate', to: path, params }, '*');
  } catch {}
}

export function Link({ to, children, style, ...rest }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        emitNavigate(to);
      }}
      style={{ color: 'var(--color-brand-500)', textDecoration: 'none', ...style }}
      {...rest}
    >
      {children}
    </a>
  );
}

export function navigate(to) {
  emitNavigate(to);
}

/** Read the current route params for this screen. The parent pushes
 *  \`oc:route-params\` whenever navigation targets this screen — so clicking
 *  recipe A in Overview causes Detail's useParams() to return { id: 'A' },
 *  then clicking B returns { id: 'B' } without a full reload. */
export function useParams() {
  const [params, setParams] = useState(() => {
    if (typeof window === 'undefined') return {};
    return window.__ocRouteParams || {};
  });
  useEffect(() => {
    function onMsg(e) {
      const d = e.data;
      if (!d || typeof d !== 'object' || d.__oc !== 'oc:route-params') return;
      // The parent broadcasts to all iframes; ignore if this message is
      // targeted at a different screen than ours.
      if (d.targetScreenId && window.__ocScreenId && d.targetScreenId !== window.__ocScreenId) return;
      window.__ocRouteParams = d.params || {};
      setParams(window.__ocRouteParams);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  return params;
}
`;

const DEFAULTS: DesignService[] = [
  {
    id: "s_session",
    name: "session",
    description:
      "Signed-in user context. useSession() → { user, signIn, signOut }. Wrap in SessionProvider at app root.",
    code: SESSION_CODE,
  },
  {
    id: "s_fetcher",
    name: "fetcher",
    description:
      "Typed JSON helpers. getJSON(url), postJSON(url, body), patchJSON, deleteRequest — throws on non-2xx.",
    code: FETCHER_CODE,
  },
  {
    id: "s_storage",
    name: "storage",
    description:
      "Typed localStorage wrapper. useLocalState(key, initial) + getItem/setItem/removeItem.",
    code: STORAGE_CODE,
  },
  {
    id: "s_toast",
    name: "toast",
    description:
      "Ephemeral notifications. toast.show('Saved'). Wrap in ToastProvider at app root.",
    code: TOAST_CODE,
  },
  {
    id: "s_router",
    name: "router",
    description:
      "Inter-screen navigation. <Link to=\"/path\"> + navigate(path). Emits oc:navigate to the canvas.",
    code: ROUTER_CODE,
  },
];

type Listener = (services: DesignService[]) => void;

class DesignServicesStore {
  private current: DesignService[] = DEFAULTS.map((s) => ({ ...s }));
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): DesignService[] {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    if (typeof window === "undefined") return this.current;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DesignService[];
        if (Array.isArray(parsed)) this.current = parsed;
      }
    } catch {
      /* ignore */
    }
    return this.current;
  }

  get(): DesignService[] {
    if (!this.hydrated) this.hydrate();
    return this.current;
  }

  upsert(s: DesignService) {
    const i = this.current.findIndex((x) => x.id === s.id);
    if (i >= 0) this.current = this.current.map((x, j) => (j === i ? s : x));
    else this.current = [...this.current, s];
    this.persist();
    this.notify();
  }

  remove(id: string) {
    this.current = this.current.filter((s) => s.id !== id);
    this.persist();
    this.notify();
  }

  resetToDefaults() {
    this.current = DEFAULTS.map((s) => ({ ...s }));
    this.persist();
    this.notify();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  /**
   * Files map fragment to merge into Sandpack. Services are lowercase
   * (`/services/session.js`) to match common React convention.
   */
  toSandpackFiles(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const s of this.current) {
      if (!/^[a-zA-Z][A-Za-z0-9]*$/.test(s.name)) continue;
      out[`/services/${s.name}.js`] = s.code;
    }
    return out;
  }

  toPromptDescription(): string {
    if (this.current.length === 0) return "";
    const lines = [
      "Shared services (import via `import ... from './services/{name}';`):",
    ];
    for (const s of this.current) {
      lines.push(`- ${s.name} — ${s.description}`);
    }
    return lines.join("\n");
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      /* ignore */
    }
  }

  private notify() {
    for (const l of this.listeners) l(this.current);
  }
}

export const designServicesStore = new DesignServicesStore();

if (typeof window !== "undefined") {
  (
    window as unknown as { __designServicesStore: DesignServicesStore }
  ).__designServicesStore = designServicesStore;
  designServicesStore.hydrate();
}
