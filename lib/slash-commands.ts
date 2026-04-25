/**
 * Slash-command registry for the chat composer.
 *
 * A slash command looks like `/review [args]` — the user types it at the
 * start of the composer, the autocomplete popover matches it, Enter picks
 * and the handler fires. Each command is either:
 *
 *   - `clientAction`: runs locally (e.g. clear chat, reset project, open a
 *     tab). No message is sent to the agent.
 *   - `expand`: returns a full natural-language prompt that's sent as the
 *     user's next message. Lets us build short mnemonics for common
 *     agent requests without teaching the model a new protocol.
 *
 * Commands live here, not in ChatPanel, so they're easy to audit and extend.
 */

import type { Editor } from "@/lib/editor-shim";
import type { ScreenShape } from "@/components/ScreenShapeUtil";
import { resetProject } from "./project-reset";

export type SlashCommandContext = {
  editor: Editor | null;
  setInput: (s: string) => void;
  sendMessageText: (text: string) => void;
  clearChat: () => void;
  openTab: (tab: string) => void;
  selectedScreenName?: string;
};

export type SlashCommand = {
  slug: string;
  label: string;
  hint: string;
  argPlaceholder?: string;
  /** Runs client-side. Skips the chat round-trip. */
  clientAction?: (args: string, ctx: SlashCommandContext) => void;
  /** Returns the full prompt text to send as a user message. */
  expand?: (args: string, ctx: SlashCommandContext) => string | null;
  /** True when the command doesn't take args — hides the arg hint. */
  noArgs?: boolean;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    slug: "/review",
    label: "Review screens",
    hint: "Reviewer agent fans out across screens and surfaces top issues",
    argPlaceholder: "optional: screen name — otherwise reviews all",
    expand: (args, ctx) => {
      const target = args.trim() || ctx.selectedScreenName?.trim();
      if (target) {
        return `Review the "${target}" screen: spawn the reviewer sub-agent, let it fan out focused sub-reviewers in parallel for the categories that apply (accessibility, motion, forms, layout, visual-consistency, navigation), and surface every issue it finds with severity + one-line fix. Do NOT apply fixes yet — I want to see the full list first.`;
      }
      return `Review every screen on the canvas in parallel: fire reviewScreen for each in a single message. After all reviews return, list the high-severity issues grouped by screen. Do NOT apply fixes yet — I want to see the full list first.`;
    },
  },
  {
    slug: "/fix",
    label: "Review + fix",
    hint: "Review and apply every high-severity fix in parallel",
    argPlaceholder: "optional: screen name — otherwise uses selected or all",
    expand: (args, ctx) => {
      const target = args.trim() || ctx.selectedScreenName?.trim();
      if (target) {
        return `Review the "${target}" screen via reviewScreen, then for every HIGH and MEDIUM severity issue returned, fire editScreen (or updateScreen if the fix is too large for a surgical patch) to apply the fix. Batch all edits in parallel in a single assistant message. Do NOT re-review after — one cycle is enough.`;
      }
      return `Review every screen on the canvas in parallel, then for every HIGH and MEDIUM severity issue returned across ALL screens, batch editScreen/updateScreen calls in parallel in a single assistant message. Do NOT re-review after — one cycle is enough.`;
    },
  },
  {
    slug: "/plan",
    label: "Plan only",
    hint: "Write a visible plan via planTasks — no building yet",
    argPlaceholder: "what to plan — e.g. 'a recipe app with Home, Detail, Favorites'",
    expand: (args) => {
      const goal = args.trim();
      if (!goal) {
        return `Use planTasks to draft a visible plan for what you'd build next based on everything currently on the canvas and in the conversation. Do NOT start building — stop immediately after planTasks so I can approve the plan.`;
      }
      return `Plan how to build: ${goal}\n\nUse planTasks to write a visible checklist with one task per screen (+ shared components/services/data). For each task mark parallelizable true|false honestly. STOP immediately after planTasks — do NOT start building. I want to approve the plan first.`;
    },
  },
  {
    slug: "/think",
    label: "Think visibly",
    hint: "Use the think tool to reflect on a topic — no actions",
    argPlaceholder: "topic — e.g. 'which nav pattern fits this app'",
    expand: (args) => {
      const topic = args.trim();
      if (!topic) return null;
      return `Emit ONE think({topic, thought}) tool call reflecting on: ${topic}\n\nBe specific, pick a side, no hedging. After the think call, STOP — do not take any other action.`;
    },
  },
  {
    slug: "/screens",
    label: "List screens",
    hint: "Ask the agent to list every screen with a one-line summary",
    noArgs: true,
    expand: () =>
      `List every screen on the canvas. For each: name · viewport · one-line summary of what the screen does. Use short dashes between fields. Do NOT modify anything — just the list.`,
  },
  {
    slug: "/clear",
    label: "Clear chat",
    hint: "Empty the chat transcript (keeps canvas + stores intact)",
    noArgs: true,
    clientAction: (_args, ctx) => {
      ctx.clearChat();
    },
  },
  {
    slug: "/reset",
    label: "Reset project",
    hint: "Wipe everything and reload — for testing",
    noArgs: true,
    clientAction: () => {
      const ok = window.confirm(
        "Reset the entire project?\n\nClears canvas, chat, notes, tokens, components, services, data, review streams. Reloads the page.\n\nCan't be undone.",
      );
      if (ok) resetProject();
    },
  },
  {
    slug: "/notes",
    label: "Open notes",
    hint: "Switch to the Notes tab",
    noArgs: true,
    clientAction: (_args, ctx) => {
      ctx.openTab("notes");
    },
  },
];

const SLUG_MAP = new Map(SLASH_COMMANDS.map((c) => [c.slug, c]));

/**
 * Match a leading `/cmd` token in the user's input. Returns the command +
 * any remaining text as args. Trailing whitespace is trimmed but whitespace
 * inside the args payload is preserved.
 */
export function parseSlashCommand(
  input: string,
): { command: SlashCommand; args: string } | null {
  const m = /^\s*(\/[a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/i.exec(input);
  if (!m) return null;
  const command = SLUG_MAP.get(m[1].toLowerCase());
  if (!command) return null;
  return { command, args: (m[2] ?? "").trim() };
}

/**
 * Prefix-match against slugs for the autocomplete popover. When `token`
 * is just `/`, everything is returned in the registry order.
 */
export function matchSlashCommands(token: string): SlashCommand[] {
  if (!token.startsWith("/")) return [];
  const needle = token.slice(1).toLowerCase();
  if (needle === "") return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter((c) =>
    c.slug.slice(1).toLowerCase().startsWith(needle),
  );
}

/**
 * Helper — collapse canvas screens to a {id, name} list so the registry's
 * `sendMessageText` callers can resolve a user-typed screen name to a
 * concrete id if they need to in the future (not used today; commands
 * just bake the name into the prompt and let the orchestrator look it up
 * via the canvas-state block).
 */
export function listScreens(
  editor: Editor | null,
): Array<{ id: string; name: string }> {
  if (!editor) return [];
  const shapes = editor.getCurrentPageShapes();
  return shapes
    .filter((s): s is ScreenShape => s.type === "screen")
    .map((s) => ({ id: String(s.id), name: s.props.name }));
}
