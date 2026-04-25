/**
 * Server-side icon metadata loader + keyword search.
 *
 * Reads the `icons-index.json` shipped inside each variant package. The two
 * variants ship the SAME metadata (same names, same aliases, same
 * categories) — they only differ in SVG content — so we load from one and
 * treat it as authoritative.
 *
 * Search is simple: lowercase substring match across name + aliases. No
 * fancy ranking beyond "exact name match wins over alias match". Good
 * enough for 1970 icons — users are narrowing by category in the UI
 * anyway, and the agent only needs decent recall to pick an icon by
 * semantic keyword.
 *
 * Cached after first read — the JSON is ~150KB and never changes at
 * runtime.
 */

// Read the JSON via fs at first call. The package's `exports` field only
// maps subpath-directory imports (`./IconHome` → `./IconHome/index.mjs`)
// and intentionally doesn't expose the top-level `icons-index.json`,
// which rules out a static `import ... from '@central-icons-react/…/
// icons-index.json'` — both Next/Turbopack and Webpack refuse to resolve
// it. We also can't use `createRequire(import.meta.url).resolve(...)`:
// Turbopack statically analyzes resolve() calls and still applies the
// exports map. So: compute the path via `process.cwd()` at runtime with
// a string the bundler can't trace, and read it with fs. This module is
// server-only (Node runtime) — the API routes that consume it never run
// on the edge.
import fs from "node:fs";
import path from "node:path";

export type IconCategory = {
  name: string;
  count: number;
  icons: string[];
};

export type IconEntry = {
  name: string; // "IconHome"
  aliases: string; // "home, house, residence"
  category: string;
};

export type IconsIndex = {
  totalIcons: number;
  categories: IconCategory[];
  icons: IconEntry[];
  aliasesByName: Record<string, string>;
  categoryByName: Record<string, string>;
};

let cached: IconsIndex | null = null;

// Build the package name piecewise so the bundler doesn't treat it as a
// static module reference. Without this, Turbopack tries to apply the
// package's `exports` map and fails because the JSON isn't listed there.
const PKG_SEGMENTS = [
  "@central-icons-react",
  "round-outlined-radius-2-stroke-2",
] as const;

function loadRawJson(): {
  totalIcons: number;
  categories: Record<string, { count: number; icons: string[] }>;
  iconAliases: Record<string, string>;
} {
  // pnpm stores real packages at the top-level node_modules (symlinked
  // through to .pnpm/), so cwd + node_modules/@scope/pkg resolves fine.
  const jsonPath = path.join(
    process.cwd(),
    "node_modules",
    PKG_SEGMENTS[0],
    PKG_SEGMENTS[1],
    "icons-index.json",
  );
  const raw = fs.readFileSync(jsonPath, "utf8");
  return JSON.parse(raw);
}

export function getIconsIndex(): IconsIndex {
  if (cached) return cached;

  const raw = loadRawJson();

  const categories: IconCategory[] = Object.entries(raw.categories)
    .map(([name, v]) => ({ name, count: v.count, icons: v.icons.slice() }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const categoryByName: Record<string, string> = {};
  for (const cat of categories) {
    for (const iconName of cat.icons) categoryByName[iconName] = cat.name;
  }

  const aliasesByName = raw.iconAliases;

  const icons: IconEntry[] = Object.entries(aliasesByName)
    .map(([name, aliases]) => ({
      name,
      aliases,
      category: categoryByName[name] || "Uncategorized",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  cached = {
    totalIcons: raw.totalIcons,
    categories,
    icons,
    aliasesByName,
    categoryByName,
  };
  return cached;
}

export type IconSearchHit = {
  name: string;
  aliases: string;
  category: string;
  score: number;
};

const SYNONYMS: Record<string, string[]> = {
  account: ["user", "profile", "person"],
  add: ["plus", "create", "new"],
  alert: ["warning", "bell", "notification"],
  analytics: ["chart", "graph", "statistics"],
  bag: ["shopping", "cart", "basket"],
  basket: ["shopping", "cart", "bag"],
  calendar: ["date", "schedule", "event"],
  cart: ["shopping", "basket", "bag"],
  cash: ["money", "dollar", "payment"],
  check: ["done", "confirm", "tick"],
  close: ["x", "cancel", "remove"],
  cog: ["settings", "gear"],
  complete: ["check", "done", "success"],
  delete: ["trash", "remove"],
  delivery: ["truck", "shipping"],
  discover: ["compass", "search"],
  done: ["check", "complete", "success"],
  edit: ["pencil", "compose"],
  error: ["warning", "alert"],
  favorite: ["heart", "star"],
  filter: ["sliders", "tune"],
  food: ["restaurant", "fork", "knife"],
  gear: ["settings", "cog"],
  location: ["pin", "map"],
  menu: ["bars", "hamburger"],
  more: ["ellipsis", "dots"],
  notification: ["bell", "alert"],
  payment: ["card", "credit", "money"],
  pickup: ["bag", "shopping"],
  profile: ["user", "person", "account"],
  remove: ["trash", "delete", "minus"],
  search: ["magnifying", "glass"],
  settings: ["gear", "cog", "sliders"],
  share: ["send", "upload"],
  shipping: ["delivery", "truck"],
  stats: ["chart", "graph", "statistics"],
  success: ["check", "done", "complete"],
  user: ["profile", "person", "account"],
};

function normalizeQuery(query: string): string {
  return query
    .replace(/^icon/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
}

function queryVariants(query: string): string[] {
  const base = normalizeQuery(query);
  if (!base) return [];
  const words = base.split(/\s+/).filter(Boolean);
  const variants = new Set<string>([base]);
  for (const word of words) {
    variants.add(word);
    for (const synonym of SYNONYMS[word] ?? []) {
      variants.add(synonym);
      variants.add(words.map((w) => (w === word ? synonym : w)).join(" "));
    }
  }
  return Array.from(variants);
}

function searchIconsStrict(query: string, limit: number): IconSearchHit[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const index = getIconsIndex();
  const hits: IconSearchHit[] = [];

  for (const icon of index.icons) {
    const lowerName = icon.name.toLowerCase();
    const lowerAliases = icon.aliases.toLowerCase();
    let score = 0;
    let matchedAll = true;
    for (const w of words) {
      const nameIdx = lowerName.indexOf(w);
      const aliasIdx = lowerAliases.indexOf(w);
      if (nameIdx === -1 && aliasIdx === -1) {
        matchedAll = false;
        break;
      }
      // Per-word scoring: big boost for name match at start ("icon" prefix is
      // discounted because every name starts with it).
      if (nameIdx === 4) score += 100; // "Icon|home" — right after the prefix
      else if (nameIdx > -1) score += 40;
      // Alias word-boundary match > mid-string match.
      if (aliasIdx > -1) {
        const before = lowerAliases[aliasIdx - 1];
        if (aliasIdx === 0 || before === " " || before === ",") score += 30;
        else score += 10;
      }
    }
    if (!matchedAll) continue;
    // Exact whole-query match on name (after stripping "Icon" prefix) wins.
    if (lowerName === `icon${q.replace(/\s+/g, "")}`) score += 500;
    hits.push({
      name: icon.name,
      aliases: icon.aliases,
      category: icon.category,
      score,
    });
  }

  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return hits.slice(0, limit);
}

/**
 * Keyword search. Multi-word queries match ALL words (AND semantics).
 * Scoring: exact-name hit > name-substring > alias-word > alias-substring.
 * Returns up to `limit` hits sorted by score desc then name asc.
 */
export function searchIcons(query: string, limit = 24): IconSearchHit[] {
  const byName = new Map<string, IconSearchHit>();
  for (const variant of queryVariants(query)) {
    const hits = searchIconsStrict(variant, limit);
    for (const hit of hits) {
      const current = byName.get(hit.name);
      if (!current || hit.score > current.score) {
        byName.set(hit.name, hit);
      }
    }
  }
  const hits = Array.from(byName.values());
  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return hits.slice(0, limit);
}

export function closestIconNames(name: string, limit = 8): IconSearchHit[] {
  const index = getIconsIndex();
  const cleaned = normalizeQuery(name);
  const compact = cleaned.replace(/\s+/g, "");
  const byName = new Map<string, IconSearchHit>();
  for (const q of [cleaned, compact, ...queryVariants(cleaned)].filter(Boolean)) {
    for (const hit of searchIcons(q, limit)) {
      if (!byName.has(hit.name)) byName.set(hit.name, hit);
    }
  }
  if (byName.size === 0) {
    for (const icon of index.icons) {
      if (icon.name.toLowerCase().startsWith("icon" + compact.slice(0, 4))) {
        byName.set(icon.name, { ...icon, score: 1 });
      }
      if (byName.size >= limit) break;
    }
  }
  return Array.from(byName.values()).slice(0, limit);
}

/** Validate that an icon name actually exists in the set. Cheap O(1) lookup. */
export function iconExists(name: string): boolean {
  return name in getIconsIndex().aliasesByName;
}
