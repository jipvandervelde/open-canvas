import type { Editor } from "@/lib/editor-shim";
import type { ScreenShape } from "@/components/ScreenShapeUtil";
import { VIEWPORT_PRESETS_BY_ID } from "@/lib/viewports";
import { designTokensStore } from "@/lib/design-tokens-store";
import {
  componentPromptLine,
  designComponentsStore,
} from "@/lib/design-components-store";
import { designServicesStore } from "@/lib/design-services-store";
import { designMotionStore } from "@/lib/design-motion-store";
import { designDataStore } from "@/lib/design-data-store";
import { routeTableStore } from "@/lib/route-table-store";
import { screenFlowMemoryStore } from "@/lib/screen-flow-memory-store";

/**
 * Build a short "canvas context" string that's injected into each agent turn
 * so Claude knows which screen the user has selected and what else exists on
 * the canvas. Without this the agent tends to default to createScreen even
 * when the user clearly means "update this screen".
 */
export function buildAgentContext(editor: Editor | null): string {
  if (!editor) return "";

  const allShapes = editor.getCurrentPageShapes();
  const screens = allShapes.filter(
    (s): s is ScreenShape => s.type === "screen",
  );
  const selectedIds = new Set(editor.getSelectedShapeIds());
  const selectedScreens = screens.filter((s) => selectedIds.has(s.id));

  const lines: string[] = [];

  // Selection
  if (selectedScreens.length === 1) {
    const s = selectedScreens[0];
    const v = VIEWPORT_PRESETS_BY_ID[s.props.viewportId];
    lines.push(
      `The user has currently SELECTED the screen "${s.props.name}" (id: ${s.id}, viewport: ${v?.label ?? s.props.viewportId}).`,
    );
    lines.push(
      `Unless the user explicitly says "new screen" or "create another", treat phrases like "this screen", "turn this into", "fix it", "change the …" as referring to THIS selected screen and use updateScreen({ id: "${s.id}", ... }).`,
    );
  } else if (selectedScreens.length > 1) {
    lines.push(
      `The user has ${selectedScreens.length} screens selected: ${selectedScreens
        .map((s) => `"${s.props.name}" (${s.id})`)
        .join(", ")}.`,
    );
  } else {
    lines.push(
      `No screen is currently selected. If the user refers to "this screen", ask them to select one first — or pick the most-recently-created one from the list below.`,
    );
  }

  // Inventory of all screens
  if (screens.length > 0) {
    lines.push("");
    lines.push(`All screens currently on the canvas:`);
    for (const s of screens) {
      const v = VIEWPORT_PRESETS_BY_ID[s.props.viewportId];
      lines.push(
        `- "${s.props.name}" — id: ${s.id}, viewport: ${v?.label ?? s.props.viewportId}${selectedIds.has(s.id) ? " [SELECTED]" : ""}`,
      );
    }
  }

  // Design tokens — CSS variables already defined in /tokens.css inside every
  // screen's Sandpack. The model should reference them by `var(--name)` in
  // inline styles instead of baking raw hex/px values. Keep this short so it
  // doesn't bloat every request.
  const tokens = designTokensStore.get();
  const hasTokens =
    tokens.color.length ||
    tokens.spacing.length ||
    tokens.radius.length ||
    tokens.typography.length;
  if (hasTokens) {
    lines.push("");
    lines.push("Design tokens available as CSS variables in every screen:");
    const fmtScalar = (
      prefix: string,
      ts: { name: string; value: string }[],
    ) =>
      ts
        .map(
          (t) =>
            `  var(--${prefix}-${t.name.replace(/\./g, "-")}) = ${t.value}`,
        )
        .join("\n");
    if (tokens.color.length) {
      lines.push(
        "Colors (light / dark — CSS automatically swaps dark values under [data-theme=dark] or @media (prefers-color-scheme: dark)):",
      );
      lines.push(
        tokens.color
          .map(
            (t) =>
              `  var(--color-${t.name.replace(/\./g, "-")}) → light ${t.light} · dark ${t.dark}`,
          )
          .join("\n"),
      );
    }
    if (tokens.spacing.length) {
      lines.push("Spacing:");
      lines.push(fmtScalar("space", tokens.spacing));
    }
    if (tokens.radius.length) {
      lines.push("Radius:");
      lines.push(fmtScalar("radius", tokens.radius));
    }
    if (tokens.typography.length) {
      lines.push(
        "Typography (each role emits 5 vars: --font-<role>-family, -size, -weight, -line-height, -letter-spacing, plus a back-compat --font-<role> alias for just the size):",
      );
      lines.push(
        tokens.typography
          .map(
            (t) =>
              `  ${t.name} → ${t.fontSize} / ${t.fontWeight} / lh ${t.lineHeight} / tracking ${t.letterSpacing} — ${t.fontFamily.split(",")[0].trim()}`,
          )
          .join("\n"),
      );
    }
    lines.push(
      "Prefer referencing these tokens via `var(--token-name)` in inline styles (e.g. `style={{ color: 'var(--color-brand)', padding: 'var(--space-screen-px)' }}`) rather than baking in raw hex/px — it keeps the generated UI consistent with the project's design system and ensures automatic dark-mode support.",
    );
  }

  // Shared components — files at `/components/{Name}.js` in every Sandpack.
  // The agent should compose with these instead of inlining the same markup
  // across screens.
  const components = designComponentsStore.get();
  if (components.length > 0) {
    lines.push("");
    lines.push("Shared component registry:");
    for (const c of components) {
      lines.push(componentPromptLine(c));
    }
    lines.push(
      "When a generated screen needs a button, surface, nav bar, bottom tab bar, input, switch, segmented control, icon chip, or reusable layout, IMPORT the matching component instead of recreating it inline. Canonical names win over aliases; for bottom tabs use BottomTabBar, not TabBar.",
    );
  }

  // Shared services — files at `/services/{name}.js`. Cross-screen logic:
  // session, fetcher, toast, storage, router, etc. These are the app's
  // "brains" — screens import them to share state and side-effects.
  const services = designServicesStore.get();
  if (services.length > 0) {
    lines.push("");
    lines.push(
      "Shared services (import via `import { ... } from './services/{name}';`):",
    );
    for (const s of services) {
      lines.push(`- ${s.name} — ${s.description || "(no description)"}`);
    }
    lines.push(
      "When a screen needs authentication, network calls, localStorage persistence, toast notifications, or inter-screen navigation, IMPORT from the matching service instead of reimplementing. Do not inline fetch() calls, raw localStorage access, or bespoke auth shims when a service already covers that concern.",
    );
  }

  // Motion presets — single file at /motion.js. Named animation configs
  // the agent can use by preset rather than hand-writing framer-motion.
  const motionPresets = designMotionStore.get();
  if (motionPresets.length > 0) {
    lines.push("");
    lines.push(
      "Motion presets (import via `import { Motion, MotionList } from './motion';`):",
    );
    for (const p of motionPresets) {
      lines.push(`- ${p.name} — ${p.description}`);
    }
    lines.push(
      "When animating elements, wrap them with `<Motion preset=\"name\">…</Motion>` or use `<MotionList preset=\"slideUp\">` for staggered lists instead of hand-rolling framer-motion config. The `framer-motion` package is available directly too for one-off custom animations.",
    );
  }

  // Shared data entities — seed rows at /data/{name}.js exposing
  // `{name}`, `find{Singular}(id)`, `list{Singular}s()`. Screens should
  // import from here instead of inlining parallel arrays; that's what
  // lets Overview and Detail show the same recipe for the same id.
  const entities = designDataStore.get();
  if (entities.length > 0) {
    lines.push("");
    lines.push(
      "Shared data entities (import via `import { name, findX } from './data/{name}';`):",
    );
    for (const e of entities) {
      const fieldList = e.fields.map((f) => `${f.name}:${f.type}`).join(", ");
      lines.push(
        `- ${e.name} (${e.singular}) — ${e.description || "(no description)"} · fields: ${fieldList} · ${e.seeds.length} seed row${e.seeds.length === 1 ? "" : "s"}`,
      );
    }
    lines.push(
      "List screens should `import { " +
        entities[0].name +
        " } from './data/" +
        entities[0].name +
        "';` and render items directly. Detail screens should `const { id } = useParams();` (from './services/router') then `find" +
        entities[0].singular +
        "(id)` — DO NOT re-inline hardcoded arrays for these entities. List-to-detail links should include the id as a querystring param, e.g. `<Link to={`/" +
        entities[0].name +
        "-detail?id=${item.id}`}>`.",
    );
  }

  // Routes — auto-derived from screens on the canvas. Agent uses these
  // paths when writing <Link to="/..." /> inside screen code; clicking
  // such a Link in the live preview pans the canvas to the target screen.
  const routes = routeTableStore.get();
  if (routes.length > 0) {
    lines.push("");
    lines.push(
      "Route table (auto-generated from screens; import { Link } from './services/router'; then <Link to=\"/path\">):",
    );
    for (const r of routes) {
      lines.push(`- "${r.name}" → ${r.path}`);
    }
    lines.push(
      "When a screen needs navigation to another screen (a tappable card, menu item, back button, call-to-action), use <Link to=\"/path\"> from './services/router'. Do NOT hard-code anchor hrefs to the whole URL — use paths from this table. When a target screen doesn't exist yet but the user described it, CREATE that screen in the same turn (parallel createScreen) so the route table includes it.",
    );
  }

  const memoryBlock = screenFlowMemoryStore.toPromptBlock();
  if (memoryBlock) {
    lines.push("");
    lines.push(memoryBlock);
    lines.push(
      "Use this structured memory to preserve flow intent across turns. Update it with writeScreenMemory/writeFlowMemory when scope, invariants, open questions, or todos change.",
    );
  }

  return lines.join("\n");
}
