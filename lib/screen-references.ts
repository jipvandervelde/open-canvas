/**
 * `@screen-name` mention support — parallel to `#N` annotation references
 * and `/command` slash commands. Users type `@` in the composer to open a
 * picker of every screen on the canvas, pick one, and the slugged token
 * ends up in the input. At send time we rewrite each `@slug` into a
 * concrete inline reference the orchestrator can resolve.
 *
 * Slug format: lowercased name with every run of non-alphanumeric
 * characters collapsed to a single hyphen, then stripped of leading /
 * trailing hyphens. This matches how the orchestrator lists screens in
 * the canvas-context block so agents can match the slug back to the
 * shape id + viewport without extra coordination.
 */

import type { Editor } from "@/lib/editor-shim";
import type { ScreenShape } from "@/components/ScreenShapeUtil";

export type ScreenRef = {
  id: string;
  name: string;
  slug: string;
  viewportId: string;
};

export function slugifyScreenName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "screen";
}

/**
 * Snapshot every screen on the canvas with its slug. Duplicates (two
 * screens with the same name) get their shape id suffixed onto the slug
 * so references remain unambiguous.
 */
export function listScreenRefs(editor: Editor | null): ScreenRef[] {
  if (!editor) return [];
  const shapes = editor
    .getCurrentPageShapes()
    .filter((s): s is ScreenShape => s.type === "screen");
  const baseSlugs = new Map<string, number>();
  const refs: ScreenRef[] = [];
  for (const s of shapes) {
    const base = slugifyScreenName(s.props.name);
    const hits = baseSlugs.get(base) ?? 0;
    baseSlugs.set(base, hits + 1);
    const slug =
      hits === 0 ? base : `${base}-${String(s.id).slice(-4)}`;
    refs.push({
      id: String(s.id),
      name: s.props.name,
      slug,
      viewportId: s.props.viewportId,
    });
  }
  return refs;
}

/**
 * Rewrite every `@slug` token in the user's input into an explicit inline
 * reference so the orchestrator doesn't have to guess which screen was
 * meant. Unknown slugs stay verbatim (the user may have typed `@foo` for
 * reasons unrelated to screen selection).
 */
export function expandScreenReferences(
  input: string,
  editor: Editor | null,
): string {
  const refs = listScreenRefs(editor);
  if (refs.length === 0) return input;
  const bySlug = new Map(refs.map((r) => [r.slug, r]));
  return input.replace(/@([a-z0-9][a-z0-9-]*)(?=\b|$)/gi, (match, rawSlug) => {
    const slug = String(rawSlug).toLowerCase();
    const r = bySlug.get(slug);
    if (!r) return match;
    return `the "${r.name}" screen (shape id: ${r.id}, viewport: ${r.viewportId})`;
  });
}

/**
 * Return the set of `@slug` tokens currently present in the input,
 * resolved against the live screen list. Used by the composer to render
 * the "referenced screens" chip row below the textarea.
 */
export function referencedScreens(
  input: string,
  editor: Editor | null,
): ScreenRef[] {
  const refs = listScreenRefs(editor);
  if (refs.length === 0) return [];
  const bySlug = new Map(refs.map((r) => [r.slug, r]));
  const out: ScreenRef[] = [];
  const seen = new Set<string>();
  for (const m of input.matchAll(/@([a-z0-9][a-z0-9-]*)(?=\b|$)/gi)) {
    const slug = m[1].toLowerCase();
    if (seen.has(slug)) continue;
    const r = bySlug.get(slug);
    if (!r) continue;
    seen.add(slug);
    out.push(r);
  }
  return out;
}
