"use client";

/**
 * Icons tab — browse + configure the project's icon defaults.
 *
 * Top section: three style controls — variant (filled/outlined), default
 * size, default color. These are *defaults* the agent uses when its
 * context doesn't dictate a specific choice; the agent will still reach
 * for filled-on-active / outlined-inactive per iOS conventions without
 * asking permission.
 *
 * Main section: search + results grid. Previews render at the current
 * default size and color so the user sees exactly what will land in
 * their screens. Click an icon to copy its name (for manual paste into
 * the composer or code).
 */

import { useEffect, useRef, useState } from "react";
import {
  iconStyleStore,
  type IconStyle,
  type IconVariant,
} from "@/lib/icon-style-store";
import { getIconComponent } from "@/lib/icon-render-client";

type SearchHit = {
  name: string;
  aliases: string;
  category: string;
  score: number;
};

type CategoryCount = { name: string; count: number };

type SearchResponse = {
  totalIcons: number;
  categories: CategoryCount[];
  hits: SearchHit[];
  query: string;
};

export function IconsPanel() {
  const [style, setStyle] = useState<IconStyle>(() => iconStyleStore.get());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [justCopied, setJustCopied] = useState<string | null>(null);

  useEffect(() => {
    setStyle(iconStyleStore.get());
    return iconStyleStore.subscribe(setStyle);
  }, []);

  // Debounced fetch — hits /api/icons/search with query + category.
  useEffect(() => {
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (category) params.set("category", category);
        // Ask for everything — the full 1970-icon catalog. The server
        // serializes it as compact JSON (~150KB); the client virtualizes
        // rendering via CSS `content-visibility: auto` on each cell so
        // off-screen cells skip layout + paint until scrolled into view.
        params.set("limit", "2000");
        const res = await fetch(`/api/icons/search?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as SearchResponse;
        setData(json);
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          console.error("icon search failed", err);
        }
      } finally {
        setLoading(false);
      }
    }, 120);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [query, category]);

  const copyName = async (name: string) => {
    const ok = await copyToClipboard(name);
    if (!ok) return;
    setJustCopied(name);
    // 1400ms — long enough to be a clear acknowledgement, short enough
    // to clear before the next intentional click. ~900ms is too brief
    // to read.
    window.setTimeout(() => {
      setJustCopied((n) => (n === name ? null : n));
    }, 1400);
  };

  return (
    <div className="oc-icons">
      <div className="oc-icons-head">
        <span className="oc-icons-title">Icons</span>
        <span className="oc-icons-total">
          {data ? `${data.totalIcons} available` : "…"}
        </span>
        <button
          type="button"
          className="oc-tokens-reset"
          onClick={() => iconStyleStore.resetToDefaults()}
          title="Restore icon style defaults"
        >
          Reset
        </button>
      </div>

      <StyleControls style={style} />

      <div className="oc-icons-filters">
        <input
          type="search"
          className="oc-icons-search"
          placeholder="Search 1970 icons (e.g. home, chart, lock)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <CategoryFilter
          categories={data?.categories ?? []}
          active={category}
          onChange={setCategory}
        />
      </div>

      <div className="oc-icons-grid-wrap">
        {data && data.hits.length === 0 && !loading && (
          <div className="oc-icons-empty">
            No icons match &ldquo;{query}&rdquo;
            {category ? ` in ${category}` : ""}.
          </div>
        )}
        <IconGrid
          hits={data?.hits ?? []}
          variant={style.defaultVariant}
          size={style.defaultSize}
          color={style.defaultColor}
          onCopy={copyName}
          justCopied={justCopied}
        />
      </div>
    </div>
  );
}

function StyleControls({ style }: { style: IconStyle }) {
  const setVariant = (v: IconVariant) => iconStyleStore.set({ defaultVariant: v });
  return (
    <div className="oc-icons-controls">
      <div className="oc-icons-control">
        <label className="oc-icons-control-label">Variant</label>
        <div className="oc-icons-segmented" role="tablist">
          <button
            type="button"
            role="tab"
            className="oc-icons-segmented-btn"
            data-active={style.defaultVariant === "outlined"}
            onClick={() => setVariant("outlined")}
            title="Outlined — iOS default, inactive states"
          >
            Outlined
          </button>
          <button
            type="button"
            role="tab"
            className="oc-icons-segmented-btn"
            data-active={style.defaultVariant === "filled"}
            onClick={() => setVariant("filled")}
            title="Filled — active, selected, primary states"
          >
            Filled
          </button>
        </div>
      </div>
      <div className="oc-icons-control">
        <label className="oc-icons-control-label" htmlFor="oc-icons-size">
          Size
        </label>
        <input
          id="oc-icons-size"
          type="number"
          min={12}
          max={96}
          step={1}
          className="oc-icons-size"
          value={style.defaultSize}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n > 0) {
              iconStyleStore.set({ defaultSize: n });
            }
          }}
        />
        <span className="oc-icons-control-unit">px</span>
      </div>
      <div className="oc-icons-control oc-icons-control--wide">
        <label className="oc-icons-control-label" htmlFor="oc-icons-color">
          Color
        </label>
        <input
          id="oc-icons-color"
          type="text"
          className="oc-icons-color"
          value={style.defaultColor}
          onChange={(e) => iconStyleStore.set({ defaultColor: e.target.value })}
          spellCheck={false}
          placeholder="var(--color-fg-primary)"
        />
      </div>
    </div>
  );
}

function CategoryFilter({
  categories,
  active,
  onChange,
}: {
  categories: CategoryCount[];
  active: string | null;
  onChange: (v: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="oc-icons-cats" ref={scrollRef}>
      <button
        type="button"
        className="oc-icons-cat"
        data-active={active == null}
        onClick={() => onChange(null)}
      >
        All
      </button>
      {categories.map((c) => (
        <button
          type="button"
          key={c.name}
          className="oc-icons-cat"
          data-active={active === c.name}
          onClick={() => onChange(active === c.name ? null : c.name)}
          title={`${c.count} icons`}
        >
          {c.name}
          <span className="oc-icons-cat-count">{c.count}</span>
        </button>
      ))}
    </div>
  );
}

function IconGrid({
  hits,
  variant,
  size,
  color,
  onCopy,
  justCopied,
}: {
  hits: SearchHit[];
  variant: IconVariant;
  size: number;
  color: string;
  onCopy: (name: string) => void;
  justCopied: string | null;
}) {
  // Render every hit. At up to 1970 cells this would be heavy if each
  // cell fully rendered — CSS `content-visibility: auto` on the cell
  // (see `.oc-icons-cell-btn`) lets the browser skip rendering off-screen
  // cells until scrolled into view, while still reserving their space
  // via `contain-intrinsic-size`. Result: snappy scroll, no pagination.
  return (
    <ul className="oc-icons-grid" role="list">
      {hits.map((hit) => (
        <IconCell
          key={hit.name}
          hit={hit}
          variant={variant}
          size={size}
          color={color}
          onCopy={onCopy}
          copied={justCopied === hit.name}
        />
      ))}
    </ul>
  );
}

function IconCell({
  hit,
  variant,
  size,
  color,
  onCopy,
  copied,
}: {
  hit: SearchHit;
  variant: IconVariant;
  size: number;
  color: string;
  onCopy: (name: string) => void;
  copied: boolean;
}) {
  const Component = getIconComponent(hit.name, variant);
  const shortName = hit.name.replace(/^Icon/, "");
  const title = `${hit.name} — ${hit.category}\n${hit.aliases}`;
  const displayed = copied ? "Copied!" : shortName;
  return (
    <li className="oc-icons-cell">
      <button
        type="button"
        className="oc-icons-cell-btn"
        onClick={() => onCopy(hit.name)}
        title={title}
        aria-label={`Copy ${hit.name}`}
      >
        <span className="oc-icons-cell-glyph">
          {Component ? (
            // `color` may be a CSS var; pass through CSS `color` property
            // and let the SVG inherit via `stroke="currentColor"` or
            // `fill="currentColor"` — the central-icons base sets it.
            <Component size={size} color={color} ariaHidden />
          ) : (
            <span className="oc-icons-missing">?</span>
          )}
        </span>
        <span className="oc-icons-cell-name">{displayed}</span>
      </button>
    </li>
  );
}

/**
 * Copy text to the clipboard with a fallback path for contexts where
 * `navigator.clipboard.writeText` throws (missing document focus,
 * insecure contexts, older browsers). Returns true on success.
 *
 * The modern Clipboard API is a user-gesture API: it requires the
 * document to be focused when writeText() fires. Most of the time a
 * click handler qualifies, but the Claude Code automation context
 * doesn't have focus and the async API rejects. The `execCommand`
 * fallback works regardless because it targets a synchronous
 * selection, which is always available.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  // Modern path first — rejects in un-focused or insecure contexts.
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }
  // Legacy path: a temporary textarea + document.execCommand('copy').
  // Off-screen so it's invisible; readOnly to disable the on-screen
  // keyboard on iOS.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.readOnly = true;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
