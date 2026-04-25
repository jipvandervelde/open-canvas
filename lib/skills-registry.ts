/**
 * Skills registry — a Claude-Code-style skill system built on top of Kimi's
 * tool calling. Kimi has no native skills concept, so we fill the gap with:
 *
 *   1. Skill folders at the repo root, each containing a SKILL.md with YAML
 *      frontmatter (`name`, `description`, optional `scope`, `triggers`).
 *   2. A lightweight INDEX of all skills injected into the orchestrator's
 *      system prompt every turn — small enough that 100+ skills fit without
 *      blowing the budget.
 *   3. A `useSkill({slug})` tool the orchestrator calls when it decides a
 *      skill is relevant. The tool reads the full body on demand and
 *      returns it as a tool result; the body lands in context.
 *
 * Deep-linking into supporting files: if a skill folder has additional
 * markdown files beside SKILL.md (e.g. `animations.md`, `forms.md`), they
 * can be addressed as `emil-design-engineering/animations` — the slug is
 * `<folder>/<subfile-without-extension>`. SKILL.md is the entry point and
 * should point the model at the most useful deep links.
 *
 * Server-only module; imports `fs`.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

/** Folders at the repo root to scan as skills. Order = display order. */
export const SKILL_ROOTS = [
  "react-native-mastery",
  "emil-design-engineering",
  "benji-consumer-craft",
  "make-interfaces-feel-better",
] as const;

export type SkillScope = "orchestrator" | "sub-agent" | "both";

export type SkillEntry = {
  /** Stable id — same as folder name. */
  slug: string;
  /** Short, model-scannable name. */
  name: string;
  /** When to use. Critical for trigger accuracy — this is what the model reads to decide. */
  description: string;
  /** Which agents the skill is applicable to. Defaults to "both". */
  scope: SkillScope;
  /** Optional keyword triggers for auto-injection into sub-agent prompts. */
  triggers: string[];
  /** Rough byte count of the full SKILL.md body (not including sub-files). */
  bodyBytes: number;
  /** Deep-link slugs of supporting markdown files in the same folder. */
  subfiles: string[];
};

/**
 * Sub-file metadata for auto-injection. Each `.md` in a skill folder can
 * declare its own frontmatter — this is how the registry knows which
 * sub-files to inject into a given sub-agent brief. If a sub-file has no
 * frontmatter it's still deep-linkable but won't auto-inject.
 */
export type SkillResource = {
  /** Full slug: "emil-design-engineering/forms-controls". */
  slug: string;
  /** Parent skill folder. */
  skill: string;
  /** Sub-file name without .md extension. */
  subfile: string;
  /** Short title (frontmatter `name` or derived from filename). */
  title: string;
  scope: SkillScope;
  triggers: string[];
  /** Viewport ids that should auto-boost this resource (e.g. mobile-only skills). */
  viewports: string[];
  /** If true, this resource is included as a fallback when nothing else matched. */
  baseline: boolean;
};

type ParsedFrontmatter = {
  frontmatter: Record<string, string | string[]>;
  body: string;
};

/** Parse YAML frontmatter from the top of a markdown file. Accepts simple
 *  `key: value` lines; no nesting, no arrays-as-yaml — we use comma-lists
 *  instead to keep the parser trivial. */
function parseFrontmatter(markdown: string): ParsedFrontmatter {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: markdown };
  const fm: Record<string, string | string[]> = {};
  const lines = match[1].split("\n");
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // Strip wrapping quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Comma-list support (useful for `triggers: a, b, c`).
    if (value.includes(",") && key === "triggers") {
      fm[key] = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      fm[key] = value;
    }
  }
  return { frontmatter: fm, body: match[2] };
}

// In-process cache. Invalidates on server restart / redeploy.
let cachedIndex: SkillEntry[] | null = null;

/** Scan all SKILL_ROOTS and return lightweight index entries. Cached. */
export async function listSkills(): Promise<SkillEntry[]> {
  if (cachedIndex) return cachedIndex;
  const root = process.cwd();
  const entries: SkillEntry[] = [];
  for (const folder of SKILL_ROOTS) {
    const folderPath = path.join(root, folder);
    const skillMd = path.join(folderPath, "SKILL.md");
    try {
      const raw = await fs.readFile(skillMd, "utf8");
      const { frontmatter, body } = parseFrontmatter(raw);
      const name =
        (frontmatter.name as string | undefined)?.trim() || folder;
      const description =
        (frontmatter.description as string | undefined)?.trim() ||
        "(no description — add one in the SKILL.md frontmatter)";
      const scopeRaw = (frontmatter.scope as string | undefined)?.trim();
      const scope: SkillScope =
        scopeRaw === "orchestrator" ||
        scopeRaw === "sub-agent" ||
        scopeRaw === "both"
          ? scopeRaw
          : "both";
      const triggers = Array.isArray(frontmatter.triggers)
        ? frontmatter.triggers
        : typeof frontmatter.triggers === "string"
          ? frontmatter.triggers
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      // Find supporting .md files in the same folder so the model can
      // deep-link into them via useSkill({slug: "folder/subfile"}).
      let subfiles: string[] = [];
      try {
        const all = await fs.readdir(folderPath);
        subfiles = all
          .filter(
            (f) =>
              f.endsWith(".md") &&
              f !== "SKILL.md" &&
              !f.startsWith("."),
          )
          .map((f) => f.replace(/\.md$/, ""));
      } catch {
        /* folder unreadable — leave subfiles empty */
      }
      entries.push({
        slug: folder,
        name,
        description,
        scope,
        triggers,
        bodyBytes: body.length,
        subfiles,
      });
    } catch {
      // Folder or SKILL.md missing — quietly skip. Don't throw; the skill
      // system should degrade gracefully if a folder is deleted.
    }
  }
  cachedIndex = entries;
  return entries;
}

/** Read a skill's full body (or a sub-file's body). Slug formats:
 *    "emil-design-engineering"              → SKILL.md
 *    "emil-design-engineering/animations"   → animations.md in that folder
 *  Returns null if the target doesn't exist. */
export async function loadSkill(
  slug: string,
): Promise<{ slug: string; name: string; body: string } | null> {
  const root = process.cwd();
  const [folder, subfile] = slug.split("/", 2);
  if (!folder) return null;
  // Defense-in-depth: reject path traversal attempts.
  if (folder.includes("..") || (subfile && subfile.includes(".."))) {
    return null;
  }
  if (!SKILL_ROOTS.includes(folder as (typeof SKILL_ROOTS)[number])) {
    return null;
  }
  const file = subfile
    ? path.join(root, folder, `${subfile}.md`)
    : path.join(root, folder, "SKILL.md");
  try {
    const raw = await fs.readFile(file, "utf8");
    const { frontmatter, body } = parseFrontmatter(raw);
    // For sub-files, use the filename as the name (they often skip FM).
    const name = subfile
      ? `${folder}/${subfile}`
      : ((frontmatter.name as string | undefined) ?? folder);
    return { slug, name, body: body.trim() };
  } catch {
    return null;
  }
}

/**
 * Produce a short, model-scannable description of every available skill
 * for injection into the orchestrator's system prompt. Each entry is
 * ~1 line + the description — budget ~50-150 tokens per skill. Pass
 * `disabledSkills` to hide user-toggled-off skills.
 */
export async function buildSkillIndexBlock(
  disabledSkills?: Set<string>,
): Promise<string> {
  const skills = await listSkills();
  const filtered = disabledSkills
    ? skills.filter((s) => !disabledSkills.has(s.slug))
    : skills;
  if (filtered.length === 0) return "";
  const lines = [
    "Skills available (call useSkill({slug}) to load the full body into context; call multiple in parallel when several apply):",
  ];
  for (const s of filtered) {
    const subHint =
      s.subfiles.length > 0
        ? ` · sub-files: ${s.subfiles.map((f) => `"${s.slug}/${f}"`).join(", ")}`
        : "";
    lines.push(`- "${s.slug}" (${s.scope}) — ${s.description}${subHint}`);
  }
  return lines.join("\n");
}

// Cache of sub-file metadata. Keyed by slug; populated lazily.
let cachedResourceIndex: SkillResource[] | null = null;

/**
 * List every sub-file across all skill folders that declares
 * frontmatter with `scope: sub-agent | both`. This is the auto-injection
 * catalog used by the sub-agent picker.
 */
export async function listSubAgentResources(): Promise<SkillResource[]> {
  if (cachedResourceIndex) return cachedResourceIndex;
  const root = process.cwd();
  const skills = await listSkills();
  const out: SkillResource[] = [];
  for (const s of skills) {
    for (const sub of s.subfiles) {
      const file = path.join(root, s.slug, `${sub}.md`);
      let raw: string;
      try {
        raw = await fs.readFile(file, "utf8");
      } catch {
        continue;
      }
      const { frontmatter } = parseFrontmatter(raw);
      const scopeRaw = (frontmatter.scope as string | undefined)?.trim();
      const scope: SkillScope =
        scopeRaw === "orchestrator" ||
        scopeRaw === "sub-agent" ||
        scopeRaw === "both"
          ? scopeRaw
          : "both";
      // Orchestrator-only sub-files aren't auto-injected into sub-agent
      // prompts. Skip them.
      if (scope === "orchestrator") continue;
      const triggers = frontmatterList(frontmatter, "triggers");
      const viewports = frontmatterList(frontmatter, "viewports");
      const baseline = String(frontmatter.baseline ?? "")
        .toLowerCase()
        .startsWith("t");
      const title =
        (frontmatter.name as string | undefined)?.trim() ||
        `${s.slug}/${sub}`;
      out.push({
        slug: `${s.slug}/${sub}`,
        skill: s.slug,
        subfile: sub,
        title,
        scope,
        triggers,
        viewports,
        baseline,
      });
    }
  }
  cachedResourceIndex = out;
  return out;
}

/** Escape a trigger for use inside a regex. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word match for trigger keywords. The haystack must contain the
 * trigger at a word boundary on both sides. "form" matches "form" and
 * "form field" but NOT "transform". Hyphen is treated as a word boundary
 * so "scale-on-press" matches correctly.
 */
function matchesAsWords(haystack: string, trigger: string): boolean {
  const re = new RegExp(`(?:^|\\b|[-/])${escapeRe(trigger)}(?:$|\\b|[-/])`, "i");
  return re.test(haystack);
}

function frontmatterList(
  fm: Record<string, string | string[]>,
  key: string,
): string[] {
  const v = fm[key];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Pick up to `limit` (default 2) sub-file resources most relevant to the
 * given brief — keyword + viewport scored.
 *
 * Scoring:
 *   - +1 per trigger substring match in (brief + sharedContext)
 *   - +3 if the viewportId is listed in the resource's `viewports`
 *   - Resources with score > 0 are picked in descending order
 *   - If under `limit` picks, fill remaining slots with baselines
 *
 * Topic-level dedup: at most ONE resource per subfile name across all
 * skill roots. If both `emil/animations` and
 * `make-interfaces-feel-better/animations` score, only the higher-scoring
 * one is kept — the other slot goes to a different-named resource. This
 * gives the sub-agent breadth across topics rather than two doses of the
 * same one. Per Anthropic's guidance that "every token competes" — two
 * slots on the same topic is a worse use of budget than one slot on
 * each of two distinct topics.
 */
export async function pickSubAgentResources(params: {
  viewportId: string;
  brief: string;
  sharedContext?: string;
  limit?: number;
  disabledSkills?: Set<string>;
}): Promise<Array<{ slug: string; title: string; body: string }>> {
  const limit = params.limit ?? 2;
  const haystack = (
    (params.brief || "") +
    "\n" +
    (params.sharedContext || "")
  ).toLowerCase();
  const resources = await listSubAgentResources();
  const active = params.disabledSkills
    ? resources.filter((r) => !params.disabledSkills!.has(r.skill))
    : resources;

  const scored = active.map((r) => {
    let score = 0;
    for (const t of r.triggers) {
      if (!t) continue;
      // Word-boundary matching so "form" doesn't match "transform",
      // "icon" doesn't match "silicon", "table" doesn't match "vegetable".
      // Raw substring matching produced false positives (e.g. forms-controls
      // was matching "transform-only" in a CSS-perf brief). A trigger can
      // still span multiple words — \b boundaries are on each word edge, so
      // "transition all" matches iff both appear as whole words.
      if (matchesAsWords(haystack, t.toLowerCase())) score += 1;
    }
    if (r.viewports.includes(params.viewportId)) score += 3;
    return { r, score };
  });
  const sorted = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked: SkillResource[] = [];
  const takenTopics = new Set<string>();
  for (const s of sorted) {
    // Topic dedup: one resource per subfile name. Emil/animations +
    // make-interfaces/animations both match? Keep the higher-scoring one,
    // drop the other, free that slot for a different topic.
    if (takenTopics.has(s.r.subfile)) continue;
    picked.push(s.r);
    takenTopics.add(s.r.subfile);
    if (picked.length >= limit) break;
  }
  if (picked.length < limit) {
    for (const r of active) {
      if (r.baseline && !takenTopics.has(r.subfile)) {
        picked.push(r);
        takenTopics.add(r.subfile);
        if (picked.length >= limit) break;
      }
    }
  }

  const out: Array<{ slug: string; title: string; body: string }> = [];
  for (const r of picked) {
    const loaded = await loadSkill(r.slug);
    if (loaded) out.push({ slug: r.slug, title: r.title, body: loaded.body });
  }
  return out;
}
