/**
 * Debug-only route — surfaces the skill registry's current state without
 * invoking the LLM. Useful for verifying that new skill folders are
 * discovered and that frontmatter parses correctly.
 */

import { listSkills, loadSkill, buildSkillIndexBlock } from "@/lib/skills-registry";

export async function GET() {
  const skills = await listSkills();
  const indexBlock = await buildSkillIndexBlock();
  return Response.json({ skills, indexBlock });
}

export async function POST(req: Request) {
  const { slug } = (await req.json()) as { slug: string };
  const loaded = await loadSkill(slug);
  if (!loaded) return Response.json({ ok: false, slug }, { status: 404 });
  return Response.json({
    ok: true,
    slug: loaded.slug,
    name: loaded.name,
    bodyBytes: loaded.body.length,
    bodyPreview: loaded.body.slice(0, 240),
  });
}
