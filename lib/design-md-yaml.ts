/**
 * Projects our in-memory stores onto Google's DESIGN.md YAML schema and
 * prepends that block to the prose design.md so agents + external
 * tools (Figma, tokens.json pipelines, Style Dictionary) can consume
 * ONE file.
 *
 * Mapping decisions:
 *
 * - **Colors**: we ship { light, dark } pairs; Google's schema expects
 *   a single hex per token. We emit the LIGHT value at the top level
 *   and a sibling `<name>-dark` token for the dark variant. Losing
 *   information isn't an option; sharing the primary (light) hex as
 *   the canonical value is the least-surprising compromise. Consumers
 *   that understand our convention pick up the `-dark` counterparts
 *   automatically; consumers that don't see a valid single-value set.
 *
 * - **Rounded**: Google uses `rounded`, we use `radius`. Emit as
 *   `rounded` in the YAML for interop; internal CSS vars keep the
 *   `--radius-*` names. Same semantics, different dialect.
 *
 * - **Typography**: emit the full object shape directly — already
 *   matches Google's schema 1:1.
 *
 * - **Spacing**: emit our semantic names (`screen.px`, `safe.top`,
 *   …) alongside the numeric scale. Google's recommended-token-names
 *   section is non-normative, so custom keys are legal.
 *
 * - **Components**: pass through verbatim. Token references already
 *   use the `{group.name}` syntax.
 *
 * The YAML is hand-emitted (no dependency on `js-yaml`) to keep the
 * edge-runtime-safe server routes happy. The subset we need — maps of
 * scalars and one level of nested maps — is trivial to write by hand.
 */

import type { TokensSnapshot } from "@/lib/agent-framing";
import type {
  ComponentTokens,
  ComponentTokenProps,
} from "@/lib/design-component-tokens-store";

export type DesignMdProjectionInput = {
  name?: string;
  description?: string;
  tokens: TokensSnapshot;
  componentTokens: ComponentTokens;
};

/**
 * Build the YAML front matter block (including the `---` fences) to
 * prepend to design.md. Returns an empty string if there's nothing to
 * emit (no tokens, no component tokens).
 */
export function buildDesignMdFrontMatter(
  input: DesignMdProjectionInput,
): string {
  const { tokens, componentTokens } = input;
  const hasAny =
    tokens.color.length > 0 ||
    tokens.spacing.length > 0 ||
    tokens.radius.length > 0 ||
    tokens.typography.length > 0 ||
    Object.keys(componentTokens).length > 0;
  if (!hasAny) return "";

  const lines: string[] = ["---"];
  lines.push("version: alpha");
  lines.push(`name: ${yamlScalar(input.name || "Open Canvas")}`);
  if (input.description) {
    lines.push(`description: ${yamlScalar(input.description)}`);
  }

  if (tokens.color.length > 0) {
    lines.push("colors:");
    for (const c of tokens.color) {
      lines.push(`  ${yamlKey(c.name)}: ${yamlScalar(c.light)}`);
      // Emit the dark counterpart as a sibling `<name>-dark` key —
      // not normative in Google's schema, but preserves our light/dark
      // contract for downstream tools that understand the convention.
      // Build the composite key string first so `yamlKey` decides whether
      // to quote the whole thing (not just the base half).
      lines.push(
        `  ${yamlKey(`${c.name}-dark`)}: ${yamlScalar(c.dark)}`,
      );
    }
  }

  if (tokens.typography.length > 0) {
    lines.push("typography:");
    for (const t of tokens.typography) {
      lines.push(`  ${yamlKey(t.name)}:`);
      lines.push(`    fontFamily: ${yamlScalar(t.fontFamily)}`);
      lines.push(`    fontSize: ${yamlScalar(t.fontSize)}`);
      lines.push(`    fontWeight: ${t.fontWeight}`);
      lines.push(`    lineHeight: ${yamlScalar(t.lineHeight)}`);
      lines.push(`    letterSpacing: ${yamlScalar(t.letterSpacing)}`);
    }
  }

  if (tokens.radius.length > 0) {
    lines.push("rounded:");
    for (const r of tokens.radius) {
      lines.push(`  ${yamlKey(r.name)}: ${yamlScalar(r.value)}`);
    }
  }

  if (tokens.spacing.length > 0) {
    lines.push("spacing:");
    for (const s of tokens.spacing) {
      lines.push(`  ${yamlKey(s.name)}: ${yamlScalar(s.value)}`);
    }
  }

  const componentEntries = Object.entries(componentTokens);
  if (componentEntries.length > 0) {
    lines.push("components:");
    for (const [name, props] of componentEntries) {
      lines.push(`  ${yamlKey(name)}:`);
      const flattened = flattenComponentProps(props);
      for (const [k, v] of flattened) {
        lines.push(`    ${k}: ${yamlScalar(v)}`);
      }
    }
  }

  lines.push("---");
  return lines.join("\n");
}

/**
 * Combine the YAML front matter with the prose design.md. If the
 * prose already contains a front-matter block at the top, REPLACE it;
 * otherwise prepend. Keeps the agent from seeing a stale matter block
 * next to the freshly-projected one.
 */
export function prefixDesignMdWithYaml(
  prose: string,
  front: string,
): string {
  if (!front) return prose;
  const stripped = prose.replace(
    /^---\s*\n[\s\S]*?\n---\s*\n?/,
    "",
  );
  return `${front}\n\n${stripped.trimStart()}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function yamlScalar(value: string | number): string {
  if (typeof value === "number") return String(value);
  // Quote values that look like YAML types (true/false/yes/no), start
  // with special chars (:, &, *, !, #, |, >, @), contain `:` without a
  // space, or look like a hex/number. Token references like
  // `{colors.primary}` are safe quoted; we always quote hex + URL-ish
  // strings so YAML parsers don't misinterpret them.
  const needsQuoting =
    /^(true|false|yes|no|null|~)$/i.test(value.trim()) ||
    /^[\s!&*#|>%@,[\]{}?:-]/.test(value) ||
    /:\s*$/.test(value) ||
    /^#/.test(value) || // hex colors
    /^[0-9]/.test(value); // numeric-like strings
  if (!needsQuoting) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function yamlKey(name: string): string {
  // Wrap keys that contain dots or unusual chars in quotes so the
  // parser reads them as a single key, not a nested path.
  if (/[.\s]/.test(name)) return `"${name}"`;
  return name;
}

function flattenComponentProps(
  props: ComponentTokenProps,
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (props.backgroundColor)
    out.push(["backgroundColor", props.backgroundColor]);
  if (props.textColor) out.push(["textColor", props.textColor]);
  if (props.borderColor) out.push(["borderColor", props.borderColor]);
  if (props.typography) out.push(["typography", props.typography]);
  if (props.rounded) out.push(["rounded", props.rounded]);
  if (props.padding) out.push(["padding", props.padding]);
  if (props.size) out.push(["size", props.size]);
  if (props.height) out.push(["height", props.height]);
  if (props.width) out.push(["width", props.width]);
  if (props.extra) {
    for (const [k, v] of Object.entries(props.extra)) {
      out.push([k, v]);
    }
  }
  return out;
}
