/**
 * Icon search endpoint — keyword search over the 1970-icon set.
 *
 * Used by:
 *   - IconsPanel (client-side browse) — GET with ?q=…
 *   - The agent's `searchIcons` tool — goes direct through `lib/icon-metadata`
 *     server-side so it doesn't pay the HTTP round-trip.
 *
 * Returns compact { name, aliases, category } objects — the caller does
 * its own rendering / insertion.
 */

import {
  searchIcons,
  getIconsIndex,
  type IconSearchHit,
} from "@/lib/icon-metadata";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  // Upper bound is the full catalog size (1970) so the Icons panel can
  // ask for everything; the agent's searchIcons tool passes a much
  // smaller limit (~12) to keep context tight.
  const limit = clampInt(url.searchParams.get("limit"), 1, 2000, 48);
  const category = url.searchParams.get("category");

  // Empty query → return the requested category (or the whole library if
  // none). When `limit` is large enough, that's every icon — the panel
  // uses this to browse the full catalog with scroll.
  if (!q.trim()) {
    const index = getIconsIndex();
    const source = category
      ? index.icons.filter((i) => i.category === category)
      : index.icons;
    const hits: IconSearchHit[] = source.slice(0, limit).map((i) => ({
      name: i.name,
      aliases: i.aliases,
      category: i.category,
      score: 0,
    }));
    return Response.json({
      totalIcons: index.totalIcons,
      categories: index.categories.map((c) => ({
        name: c.name,
        count: c.count,
      })),
      hits,
      query: "",
    });
  }

  // For keyword search we fetch the full ranked list within the category,
  // no artificial `limit * 2` because category-filtering may drop most of
  // the hits. Slicing happens after filtering.
  const rawHits = searchIcons(q, 2000);
  const hits = category
    ? rawHits.filter((h) => h.category === category).slice(0, limit)
    : rawHits.slice(0, limit);
  const index = getIconsIndex();

  return Response.json({
    totalIcons: index.totalIcons,
    categories: index.categories.map((c) => ({
      name: c.name,
      count: c.count,
    })),
    hits,
    query: q,
  });
}

function clampInt(
  v: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = v == null ? NaN : Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
