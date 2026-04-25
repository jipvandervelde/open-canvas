"use client";

import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { createShapeId, type Editor } from "@/lib/editor-shim";
import { useValue, useCanvasTick } from "@/lib/canvas-store";
import type { ShapeId } from "@/lib/shape-types";
import { useEditorRef } from "@/lib/editor-context";
import {
  DEFAULT_SCREEN_CODE,
  VIEWPORT_PRESETS_BY_ID,
  type ViewportPresetId,
} from "@/lib/viewports";
import { normalizeScreenCode } from "@/lib/normalize-screen-code";
import { screenStatusStore } from "@/lib/screen-status-store";
import { screenErrorLog } from "@/lib/screen-error-log";
import { planStore } from "@/lib/plan-store";
import {
  designDataStore,
  type DataEntity,
  type DataField,
} from "@/lib/design-data-store";
import {
  designComponentsStore,
  type DesignComponent,
} from "@/lib/design-components-store";
import {
  designServicesStore,
  type DesignService,
} from "@/lib/design-services-store";
import { designTokensStore } from "@/lib/design-tokens-store";
import { designComponentTokensStore } from "@/lib/design-component-tokens-store";
import { iconStyleStore } from "@/lib/icon-style-store";
import {
  buildDataFiles,
  buildTokensCss,
} from "@/lib/screen-runtime";
import {
  agentationAnnotationsStore,
  expandAnnotationReferences,
} from "@/lib/agentation-annotations-store";
import { routeTableStore } from "@/lib/route-table-store";
import {
  stabilizeStreamingJsx,
  primeLastGood,
} from "@/lib/stabilize-streaming-jsx";
import { buildAgentContext } from "@/lib/agent-context";
import { streamingStore } from "@/lib/streaming-store";
import { subAgentCodeStore } from "@/lib/subagent-code-store";
import { reviewStreamStore } from "@/lib/review-stream-store";
import { pendingDelegates } from "@/lib/pending-delegates";
import {
  assignAgentName,
  getAgentName,
  releaseAgentName,
} from "@/lib/agent-names";
import { zoomToFitCapped } from "@/lib/zoom";
import { CodeEditor } from "@/components/CodeEditor";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TokensPanel } from "@/components/TokensPanel";
import { IconsPanel } from "@/components/IconsPanel";
import { ComponentsPanel } from "@/components/ComponentsPanel";
import { ServicesPanel } from "@/components/ServicesPanel";
import { DataPanel } from "@/components/DataPanel";
import { SkillsPanel } from "@/components/SkillsPanel";
import { skillsUiStore } from "@/lib/skills-ui-store";
import { projectNotesStore } from "@/lib/project-notes-store";
import {
  messageQueueStore,
  type QueuedMessage,
} from "@/lib/message-queue-store";
import { subAgentAbortRegistry } from "@/lib/subagent-abort-registry";
import { cadenceWatchdog } from "@/lib/cadence-watchdog";
import { tokenUsageStore } from "@/lib/token-usage-store";
import { resetProject } from "@/lib/project-reset";
import {
  parseSlashCommand,
  matchSlashCommands,
  type SlashCommand,
  type SlashCommandContext,
} from "@/lib/slash-commands";
import {
  expandScreenReferences,
  listScreenRefs,
  referencedScreens,
  type ScreenRef,
} from "@/lib/screen-references";
import { projectDocStore } from "@/lib/project-doc-store";
import { designDocStore } from "@/lib/design-doc-store";
import { NotesPanel } from "@/components/NotesPanel";
import { ProjectPanel } from "@/components/ProjectPanel";
import { DesignPanel } from "@/components/DesignPanel";
import { getIconComponent } from "@/lib/icon-render-client";
import { ClarifyingQuestionsCard } from "@/components/ClarifyingQuestionsCard";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import {
  isQuickRepliesConsumed,
  markQuickRepliesConsumed,
  subscribeQuickReplies,
  sendQuickReply,
  setQuickReplySender,
} from "@/lib/quick-replies-store";
import {
  clarifyingQuestionsStore,
  setClarifyingSubmitHandler,
  submitClarifyingAnswers,
  type ClarifyingQuestion,
} from "@/lib/clarifying-questions-store";
import { LeftPanelResizer } from "@/components/LeftPanelResizer";
import { ModelPicker, ThinkingToggle } from "@/components/ComposerControls";
import { modelSettingsStore } from "@/lib/model-settings-store";
import type { ScreenShape } from "@/components/ScreenShapeUtil";

const COMPILE_TIMEOUT_MS = 8000;

const SCREEN_GAP = 80;

/**
 * Generate-screen streams raw React source with a trailing usage sentinel
 * (`/*__OC_USAGE__:{...}*\/`). Strip the marker from the code, parse the
 * JSON payload, push it into tokenUsageStore (deduped by `scope`), and
 * return the cleaned source.
 */
const USAGE_SENTINEL_RE = /\s*\/\*__OC_USAGE__:(.+?)\*\/\s*$/;
function stripUsageSentinel(
  accumulated: string,
  scope: string,
): string {
  const match = USAGE_SENTINEL_RE.exec(accumulated);
  if (!match) return accumulated;
  try {
    const payload = JSON.parse(match[1]) as {
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
    };
    tokenUsageStore.add(
      { ...payload, source: "generate-screen" },
      scope,
    );
  } catch {
    /* ignore malformed sentinel */
  }
  return accumulated.slice(0, match.index);
}

/**
 * Multiset line-diff: counts how many lines appear more often in `next` vs
 * `prev` (added) and vice versa (removed). Not a true LCS diff — duplicates
 * cancel out in the cheap way — but good enough for a chat stat.
 */
function lineDiff(prev: string, next: string): { added: number; removed: number } {
  const count = (s: string) => {
    const m = new Map<string, number>();
    for (const l of s.split("\n")) {
      const k = l.trim();
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const a = count(prev);
  const b = count(next);
  let added = 0;
  let removed = 0;
  for (const [k, n] of b) {
    const o = a.get(k) ?? 0;
    if (n > o) added += n - o;
  }
  for (const [k, n] of a) {
    const o = b.get(k) ?? 0;
    if (n > o) removed += n - o;
  }
  return { added, removed };
}

type CreateScreenInput = {
  name: string;
  viewportId: ViewportPresetId;
  code: string;
  statusBarStyle?: "light" | "dark";
  parentScreenId?: string;
};

type UpdateScreenInput = {
  id?: string;
  name?: string;
  viewportId?: ViewportPresetId;
  code?: string;
  statusBarStyle?: "light" | "dark";
  parentScreenId?: string;
};

// Legacy tldraw color/shape helpers were removed with the native canvas swap.
// The `createShape` agent tool (which drew geo/text annotations) no longer
// has a target — it returns an error so the agent learns to stop calling it.

/**
 * Codebase search surface. Scans all in-canvas sources (screens, components,
 * services, data, routes, tokens) for substring matches and returns a ranked
 * list with short excerpts. Used by the agent's `searchCodebase` tool to
 * introspect the current project state before making edits.
 */
type SearchMatch = {
  source: string;
  location: string;
  excerpt: string;
};

function searchProjectCodebase(
  editor: import("@/lib/editor-shim").Editor,
  query: string,
  scope:
    | "all"
    | "screens"
    | "components"
    | "services"
    | "data"
    | "routes"
    | "tokens",
): { matches: SearchMatch[]; truncated: boolean } {
  const q = query.trim().toLowerCase();
  if (!q) return { matches: [], truncated: false };
  const matches: SearchMatch[] = [];
  const MAX_MATCHES = 20;

  function scanText(source: string, location: string, body: string) {
    const lower = body.toLowerCase();
    let idx = lower.indexOf(q);
    let count = 0;
    while (idx !== -1 && count < 3 && matches.length < MAX_MATCHES) {
      // Pull a ~120 char window around the match so the agent sees context.
      const start = Math.max(0, idx - 40);
      const end = Math.min(body.length, idx + q.length + 80);
      const excerpt =
        (start > 0 ? "…" : "") +
        body.slice(start, end).replace(/\s+/g, " ").trim() +
        (end < body.length ? "…" : "");
      matches.push({ source, location, excerpt });
      idx = lower.indexOf(q, idx + q.length);
      count++;
    }
  }

  const wantAll = scope === "all";

  if (wantAll || scope === "screens") {
    const screens = editor
      .getCurrentPageShapes()
      .filter((s) => s.type === "screen") as import("@/components/ScreenShapeUtil").ScreenShape[];
    for (const s of screens) {
      scanText(
        "screen",
        `"${s.props.name}" (${s.id}, ${s.props.viewportId})`,
        s.props.code,
      );
      // Also match against the screen name itself so "home" finds the Home screen.
      if (s.props.name.toLowerCase().includes(q)) {
        matches.push({
          source: "screen",
          location: `"${s.props.name}" (${s.id})`,
          excerpt: `Screen name matches query. Viewport: ${s.props.viewportId}.`,
        });
      }
    }
  }

  if (wantAll || scope === "components") {
    for (const c of designComponentsStore.get()) {
      if (c.name.toLowerCase().includes(q)) {
        matches.push({
          source: "component",
          location: c.name,
          excerpt: c.description || "(no description)",
        });
      }
      scanText("component", c.name, c.code);
    }
  }

  if (wantAll || scope === "services") {
    for (const s of designServicesStore.get()) {
      if (s.name.toLowerCase().includes(q)) {
        matches.push({
          source: "service",
          location: s.name,
          excerpt: s.description || "(no description)",
        });
      }
      scanText("service", s.name, s.code);
    }
  }

  if (wantAll || scope === "data") {
    for (const e of designDataStore.get()) {
      const header = `${e.name} (${e.singular}, ${e.seeds.length} rows)`;
      if (
        e.name.toLowerCase().includes(q) ||
        e.singular.toLowerCase().includes(q)
      ) {
        matches.push({
          source: "data-entity",
          location: header,
          excerpt:
            `Fields: ${e.fields.map((f) => `${f.name}:${f.type}`).join(", ")}. ` +
            (e.description || ""),
        });
      }
      // Scan seed rows as stringified JSON so "Spaghetti" finds a recipe row.
      const blob = JSON.stringify(e.seeds);
      scanText("data-row", header, blob);
    }
  }

  if (wantAll || scope === "routes") {
    for (const r of routeTableStore.get()) {
      if (
        r.path.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q)
      ) {
        matches.push({
          source: "route",
          location: `${r.name}`,
          excerpt: `${r.path} → screen id ${r.id}`,
        });
      }
    }
  }

  if (wantAll || scope === "tokens") {
    const tokens = designTokensStore.get();
    // Colors have light + dark values; scalar tokens have a single value.
    for (const t of tokens.color) {
      if (
        t.name.toLowerCase().includes(q) ||
        t.light.toLowerCase().includes(q) ||
        t.dark.toLowerCase().includes(q)
      ) {
        matches.push({
          source: "token",
          location: `color.${t.name}`,
          excerpt: `light: ${t.light} · dark: ${t.dark}`,
        });
      }
    }
    for (const group of ["spacing", "radius"] as const) {
      for (const t of tokens[group]) {
        if (
          t.name.toLowerCase().includes(q) ||
          t.value.toLowerCase().includes(q)
        ) {
          matches.push({
            source: "token",
            location: `${group}.${t.name}`,
            excerpt: `value: ${t.value}`,
          });
        }
      }
    }
    for (const t of tokens.typography) {
      if (
        t.name.toLowerCase().includes(q) ||
        t.fontSize.toLowerCase().includes(q) ||
        t.fontFamily.toLowerCase().includes(q)
      ) {
        matches.push({
          source: "token",
          location: `typography.${t.name}`,
          excerpt: `size: ${t.fontSize} · weight: ${t.fontWeight}`,
        });
      }
    }
  }

  return {
    matches: matches.slice(0, MAX_MATCHES),
    truncated: matches.length > MAX_MATCHES,
  };
}



async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

type LeftTab =
  | "chat"
  | "code"
  | "project"
  | "design"
  | "tokens"
  | "icons"
  | "components"
  | "services"
  | "data"
  | "skills"
  | "notes";

/** Renders a Central Icons glyph in the chat composer (toolbar + send). */
function ComposerCentralIcon({
  name,
  variant = "outlined",
  size = 18,
}: {
  name: string;
  variant?: "filled" | "outlined";
  size?: number;
}) {
  const C = getIconComponent(name, variant);
  if (!C) return null;
  return createElement(C, { size, color: "currentColor", ariaHidden: true });
}

export function LeftPanel() {
  const { editor } = useEditorRef();
  const [input, setInput] = useState("");
  const [sketchBusy, setSketchBusy] = useState(false);
  const [sketchHint, setSketchHint] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LeftTab>("chat");

  // Code tab is always available — it opens a file-tree split view.
  // No automatic fallback to chat based on canvas selection.

  // Transport that injects the current model + thinking setting into every
  // request body — including automatic tool-result continuations, which don't
  // flow through our own sendMessage calls. Reads the store at send time so
  // switches made mid-conversation take effect on the next turn.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => {
          const s = modelSettingsStore.get();
          return {
            body: {
              ...(body ?? {}),
              messages,
              modelId: s.modelId,
              thinking: s.thinking,
              // Pass the current disabled-skills set so the server-side
              // registry filters both the orchestrator's skill index and
              // the sub-agent auto-injection picker. Fresh every turn so
              // UI toggles take effect immediately, no reconnect needed.
              disabledSkills: skillsUiStore.list(),
              // Pre-built notes index — localStorage lives on the client
              // so we build the scannable index here and ship it in the
              // system prompt on the server side.
              projectNotes: projectNotesStore.toPromptIndex(12),
              // If the previous turn spent >90s in a single hidden-reasoning
              // block, consumeNudge() returns a one-shot system reminder for
              // THIS turn; otherwise null. One-time-use — cleared on read.
              cadenceReminder: cadenceWatchdog.consumeNudge(),
              // Current project brief — the WHAT layer the orchestrator is
              // gated on. Sent fresh each turn so user edits via the Project
              // tab take effect immediately (no reconnect needed).
              projectDoc: projectDocStore.get().markdown,
              // Current design brief — taste profile, always-on. Seeded
              // from the embedded skills and evolves with the user.
              designDoc: designDocStore.get().markdown,
              // Live design-token snapshot (names + values, light/dark for
              // colors). Rendered by the server-side framing builder as a
              // "Current values" block so every agent sees what the CSS
              // variables referenced in design.md resolve to.
              tokens: designTokensStore.snapshot(),
              componentTokens: designComponentTokensStore.get(),
              // Icon-style defaults — which variant/size/color to reach for
              // by default. The agent picks per-usage from iOS conventions;
              // this is just the fallback when usage is ambiguous.
              iconStyle: iconStyleStore.snapshot(),
            },
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, addToolResult, status, stop, setMessages } =
    useChat({
    transport,
    // After a client-side tool (planTasks, createScreen, updateScreen,
    // createShape) posts its result via addToolResult, automatically send a
    // follow-up request so the model can continue the turn. Without this the
    // loop stops after the first tool call — planTasks would render its
    // checklist but never trigger the screen-creation follow-ups.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      if (!editor) {
        addToolResult({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: { ok: false, error: "Editor not ready" },
        });
        return;
      }

      try {
        if (toolCall.toolName === "reviewScreen") {
          const args = toolCall.input as { id: string };
          const shape = editor.getShape(args.id as ScreenShape["id"]) as
            | ScreenShape
            | undefined;
          if (!shape || shape.type !== "screen") {
            addToolResult({
              tool: "reviewScreen",
              toolCallId: toolCall.toolCallId,
              output: {
                ok: false,
                error: `No screen with id ${args.id} found on canvas`,
              },
            });
            return;
          }
          // Fire-and-forget so multiple reviewScreen calls in one message run
          // in parallel — same pattern as delegateScreen. Stream the
          // reviewer's reasoning + text through reviewStreamStore so the
          // card can render live and stay expandable post-completion.
          reviewStreamStore.initFor(toolCall.toolCallId);
          void (async () => {
            const { controller, release } = subAgentAbortRegistry.register(
              `review:${toolCall.toolCallId}`,
            );
            try {
              const res = await fetch("/api/review-screen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  screenName: shape.props.name,
                  viewportId: shape.props.viewportId,
                  code: shape.props.code,
                  disabledSkills: skillsUiStore.list(),
                  projectDoc: projectDocStore.get().markdown,
                  designDoc: designDocStore.get().markdown,
                  tokens: designTokensStore.snapshot(),
              componentTokens: designComponentTokensStore.get(),
                  iconStyle: iconStyleStore.snapshot(),
                }),
                signal: controller.signal,
              });

              if (!res.ok || !res.body) {
                throw new Error(
                  `Review request failed: ${res.status} ${res.statusText}`,
                );
              }

              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              let buf = "";
              let parsed: Record<string, unknown> | null = null;
              let streamedError: string | null = null;

              // NDJSON reader — split on newlines, parse each line, dispatch
              // to the store. Final `done` event carries the parsed JSON.
              // eslint-disable-next-line no-constant-condition
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                let nl: number;
                while ((nl = buf.indexOf("\n")) >= 0) {
                  const line = buf.slice(0, nl).trim();
                  buf = buf.slice(nl + 1);
                  if (!line) continue;
                  try {
                    const ev = JSON.parse(line) as {
                      kind: string;
                      delta?: string;
                      error?: string;
                      parsed?: Record<string, unknown>;
                      reasoning?: string;
                      text?: string;
                      ok?: boolean;
                      // Progressive agent events (new)
                      topic?: string;
                      thought?: string;
                      issue?: {
                        severity?: string;
                        category?: string;
                        location?: string;
                        problem?: string;
                        fix?: string;
                      };
                      focus?: string;
                      issueCount?: number;
                      summary?: string;
                      usage?: {
                        inputTokens?: number;
                        outputTokens?: number;
                        reasoningTokens?: number;
                        totalTokens?: number;
                      };
                    };
                    if (ev.kind === "reasoning" && ev.delta) {
                      reviewStreamStore.appendReasoning(
                        toolCall.toolCallId,
                        ev.delta,
                      );
                    } else if (ev.kind === "text" && ev.delta) {
                      reviewStreamStore.appendText(
                        toolCall.toolCallId,
                        ev.delta,
                      );
                    } else if (ev.kind === "think" && ev.topic && ev.thought) {
                      reviewStreamStore.addThink(toolCall.toolCallId, {
                        topic: ev.topic,
                        thought: ev.thought,
                      });
                    } else if (ev.kind === "issue" && ev.issue) {
                      reviewStreamStore.addIssue(
                        toolCall.toolCallId,
                        ev.issue,
                      );
                    } else if (ev.kind === "sub-reviewer-start" && ev.focus) {
                      reviewStreamStore.startSubReviewer(
                        toolCall.toolCallId,
                        ev.focus,
                      );
                    } else if (ev.kind === "sub-reviewer-done" && ev.focus) {
                      reviewStreamStore.finishSubReviewer(
                        toolCall.toolCallId,
                        ev.focus,
                        {
                          issueCount: ev.issueCount ?? 0,
                          error: ev.error,
                        },
                      );
                    } else if (ev.kind === "summary" && ev.summary) {
                      reviewStreamStore.setSummary(
                        toolCall.toolCallId,
                        ev.summary,
                      );
                    } else if (ev.kind === "usage" && ev.usage) {
                      tokenUsageStore.add(
                        { ...ev.usage, source: "review" },
                        `review:${toolCall.toolCallId}`,
                      );
                    } else if (ev.kind === "error") {
                      streamedError = ev.error ?? "reviewer error";
                    } else if (ev.kind === "done") {
                      parsed = ev.parsed ?? null;
                      if (ev.ok === false && ev.error) {
                        streamedError = ev.error;
                      }
                    }
                  } catch {
                    /* skip unparseable line */
                  }
                }
              }

              if (streamedError) {
                reviewStreamStore.markStatus(
                  toolCall.toolCallId,
                  "error",
                  streamedError,
                );
                addToolResult({
                  tool: "reviewScreen",
                  toolCallId: toolCall.toolCallId,
                  output: {
                    ok: false,
                    id: args.id,
                    screenName: shape.props.name,
                    error: streamedError,
                  },
                });
                return;
              }

              reviewStreamStore.markStatus(toolCall.toolCallId, "done");
              addToolResult({
                tool: "reviewScreen",
                toolCallId: toolCall.toolCallId,
                output: {
                  ok: true,
                  id: args.id,
                  screenName: shape.props.name,
                  ...(parsed ?? {}),
                },
              });
            } catch (err) {
              const aborted =
                err instanceof DOMException && err.name === "AbortError";
              reviewStreamStore.markStatus(
                toolCall.toolCallId,
                "error",
                aborted ? "Cancelled" : String(err),
              );
              addToolResult({
                tool: "reviewScreen",
                toolCallId: toolCall.toolCallId,
                output: {
                  ok: false,
                  id: args.id,
                  error: aborted ? "Cancelled by user" : String(err),
                },
              });
            } finally {
              release();
            }
          })();
          return;
        }

        if (toolCall.toolName === "suggestReplies") {
          // Purely presentational — the chips render from the message
          // part's input. Immediately resolve so the orchestrator can
          // finish its turn; no server-side side effects.
          addToolResult({
            tool: "suggestReplies",
            toolCallId: toolCall.toolCallId,
            output: { ok: true },
          });
          return;
        }

        if (toolCall.toolName === "askClarifyingQuestions") {
          const args = toolCall.input as {
            title: string;
            questions: ClarifyingQuestion[];
          };
          // Park the questions in the store; DO NOT addToolResult yet.
          // The tool call stays pending, sendAutomaticallyWhen won't fire,
          // the orchestrator's turn is suspended waiting for the user.
          // When the user submits answers (see MessageParts renderer),
          // we emit addToolResult with the structured answers.
          clarifyingQuestionsStore.set(toolCall.toolCallId, {
            title: args.title,
            questions: args.questions,
            answered: false,
          });
          return;
        }

        if (toolCall.toolName === "writeDesignDoc") {
          const args = toolCall.input as { markdown: string };
          const md = (args.markdown ?? "").trim();
          if (md.length < 100) {
            addToolResult({
              tool: "writeDesignDoc",
              toolCallId: toolCall.toolCallId,
              output: {
                ok: false,
                error:
                  "Design brief too short. Preserve the existing section structure (Visual theme, Color, Typography, Layout, Surfaces, Motion, Interaction, Components, Mobile, Do's/Don'ts) when updating.",
              },
            });
            return;
          }
          designDocStore.set(md, "agent");
          addToolResult({
            tool: "writeDesignDoc",
            toolCallId: toolCall.toolCallId,
            output: {
              ok: true,
              bytes: md.length,
              note: "Design brief updated. The new taste profile applies to every subsequent screen build.",
            },
          });
          return;
        }

        if (toolCall.toolName === "writeProjectDoc") {
          const args = toolCall.input as { markdown: string };
          const md = (args.markdown ?? "").trim();
          if (md.length < 40) {
            addToolResult({
              tool: "writeProjectDoc",
              toolCallId: toolCall.toolCallId,
              output: {
                ok: false,
                error:
                  "Brief too short. Include at least: what is this, who is it for, and the core feature list. Aim for 150–400 words.",
              },
            });
            return;
          }
          projectDocStore.set(md, "agent");
          addToolResult({
            tool: "writeProjectDoc",
            toolCallId: toolCall.toolCallId,
            output: {
              ok: true,
              bytes: md.length,
              established: projectDocStore.isEstablished(),
              note: "Project brief saved. You may now proceed with build tools.",
            },
          });
          return;
        }

        if (toolCall.toolName === "writeNote") {
          const args = toolCall.input as {
            title: string;
            category: "decision" | "plan" | "pattern" | "learning";
            body: string;
          };
          const note = projectNotesStore.upsertByTitle({
            title: args.title,
            category: args.category,
            body: args.body,
          });
          addToolResult({
            tool: "writeNote",
            toolCallId: toolCall.toolCallId,
            output: {
              ok: true,
              id: note.id,
              title: note.title,
              category: note.category,
              totalBytes: args.body.length,
              noteCount: projectNotesStore.get().length,
            },
          });
          return;
        }

        if (toolCall.toolName === "readNote") {
          const args = toolCall.input as { id: string };
          const note = projectNotesStore.findById(args.id);
          if (!note) {
            addToolResult({
              tool: "readNote",
              toolCallId: toolCall.toolCallId,
              output: {
                ok: false,
                id: args.id,
                error: "No note with that id. Use listNotes to see the current index.",
              },
            });
            return;
          }
          addToolResult({
            tool: "readNote",
            toolCallId: toolCall.toolCallId,
            output: {
              ok: true,
              id: note.id,
              title: note.title,
              category: note.category,
              body: note.body,
            },
          });
          return;
        }

        if (toolCall.toolName === "searchCodebase") {
          const args = toolCall.input as {
            query: string;
            scope?:
              | "all"
              | "screens"
              | "components"
              | "services"
              | "data"
              | "routes"
              | "tokens";
          };
          const results = searchProjectCodebase(
            editor,
            args.query,
            args.scope ?? "all",
          );
          addToolResult({
            tool: "searchCodebase",
            toolCallId: toolCall.toolCallId,
            output: { ok: true, query: args.query, ...results },
          });
          return;
        }

        if (toolCall.toolName === "createService") {
          const args = toolCall.input as {
            name: string;
            description: string;
            code: string;
          };
          if (!/^[a-z][a-zA-Z0-9]*$/.test(args.name)) {
            addToolResult({
              tool: "createService",
              toolCallId: toolCall.toolCallId,
              output: {
                ok: false,
                error: `Service name must be camelCase starting with lowercase (got "${args.name}"). Rename and retry.`,
              },
            });
            return;
          }
          const existing = designServicesStore
            .get()
            .find((s) => s.name === args.name);
          const id = existing?.id ?? `s_${Date.now().toString(36)}`;
          designServicesStore.upsert({
            id,
            name: args.name,
            description: args.description,
            code: args.code,
          });
          addToolResult({
            tool: "createService",
            toolCallId: toolCall.toolCallId,
            output: {
              ok: true,
              name: args.name,
              replaced: !!existing,
              importPath: `./services/${args.name}`,
              totalLines: args.code.split("\n").length,
            },
          });
          return;
        }

        if (toolCall.toolName === "createComponent") {
          const args = toolCall.input as {
            name: string;
            description: string;
            code: string;
          };
          // Validate PascalCase — prevents /components/foo.js which won't
          // import with the naming convention the sub-agents expect.
          if (!/^[A-Z][A-Za-z0-9]*$/.test(args.name)) {
            addToolResult({
              tool: "createComponent",
              toolCallId: toolCall.toolCallId,
              output: {
                ok: false,
                error: `Component name must be PascalCase (got "${args.name}"). Rename and retry.`,
              },
            });
            return;
          }
          // Idempotent by name: reuse an existing component's id so this
          // acts as "upsert" rather than creating duplicates.
          const existing = designComponentsStore
            .get()
            .find((c) => c.name === args.name);
          const id = existing?.id ?? `c_${Date.now().toString(36)}`;
          designComponentsStore.upsert({
            id,
            name: args.name,
            description: args.description,
            code: args.code,
          });
          addToolResult({
            tool: "createComponent",
            toolCallId: toolCall.toolCallId,
            output: {
              ok: true,
              name: args.name,
              replaced: !!existing,
              // Tell the orchestrator where to import this from — the exact
              // path sub-agents should use in delegateScreen briefs.
              importPath: `./components/${args.name}`,
              totalLines: args.code.split("\n").length,
            },
          });
          return;
        }

        if (toolCall.toolName === "defineDataEntity") {
          const args = toolCall.input as {
            name: string;
            singular: string;
            description: string;
            fields: DataField[];
            rowCount: number;
          };
          const existing = designDataStore
            .get()
            .find((e) => e.name === args.name);
          const entityId = existing?.id ?? `e_${Date.now().toString(36)}`;
          // Upsert schema immediately with existing seeds preserved — entity
          // becomes available as /data/{name}.js right away; if the user
          // already had good rows, we keep them and only fill the gap.
          designDataStore.upsert({
            id: entityId,
            name: args.name,
            singular: args.singular,
            description: args.description,
            fields: args.fields,
            seeds: existing?.seeds ?? [],
          });

          const existingCount = existing?.seeds?.length ?? 0;
          const target = Math.max(10, args.rowCount ?? 12);
          const alreadySatisfied = existingCount >= target;

          if (!alreadySatisfied) {
            // Kick off seed-fill sub-agent in the background. Don't await —
            // orchestrator continues with screens in parallel. When existing
            // rows are present (< target), pass them so the sub-agent
            // complements rather than duplicates.
            void (async () => {
              const { controller, release } = subAgentAbortRegistry.register(
                `seeds:${entityId}`,
              );
              try {
                const res = await fetch("/api/generate-seeds", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    entityName: args.name,
                    singular: args.singular,
                    description: args.description,
                    fields: args.fields,
                    rowCount: target,
                    existingRows: existing?.seeds ?? [],
                    modelId: modelSettingsStore.get().modelId,
                    projectDoc: projectDocStore.get().markdown,
                    designDoc: designDocStore.get().markdown,
                    tokens: designTokensStore.snapshot(),
                    componentTokens: designComponentTokensStore.get(),
                    iconStyle: iconStyleStore.snapshot(),
                  }),
                  signal: controller.signal,
                });
                const data = (await res.json()) as {
                  ok: boolean;
                  rows?: Record<string, unknown>[];
                  usage?: {
                    inputTokens?: number;
                    outputTokens?: number;
                    reasoningTokens?: number;
                    totalTokens?: number;
                  };
                };
                if (data.usage) {
                  tokenUsageStore.add(
                    { ...data.usage, source: "generate-seeds" },
                    `seeds:${entityId}`,
                  );
                }
                if (!data.ok || !Array.isArray(data.rows)) return;
                const cur = designDataStore
                  .get()
                  .find((e) => e.id === entityId);
                if (!cur) return;
                // Merge: keep existing rows, append new ones, dedupe on id.
                const byId = new Map<string, Record<string, unknown>>();
                for (const r of cur.seeds) {
                  const id = String(r.id ?? Math.random().toString(36));
                  byId.set(id, r);
                }
                for (const r of data.rows) {
                  const id = String(r.id ?? Math.random().toString(36));
                  if (!byId.has(id)) byId.set(id, r);
                }
                designDataStore.upsert({
                  ...cur,
                  seeds: Array.from(byId.values()),
                });
              } catch {
                /* best-effort; entity still usable with existing seeds */
              } finally {
                release();
              }
            })();
          }

          addToolResult({
            tool: "defineDataEntity",
            toolCallId: toolCall.toolCallId,
            output: {
              ok: true,
              name: args.name,
              schemaReady: true,
              seedsFillingInBackground: alreadySatisfied ? 0 : target,
              existingRowsPreserved: existingCount,
              replaced: !!existing,
            },
          });
          return;
        }

        if (toolCall.toolName === "createSheetView") {
          const args = toolCall.input as {
            parentScreenId: string;
            name: string;
            viewportId: ViewportPresetId;
            brief: string;
            sharedContext?: string;
            statusBarStyle?: "light" | "dark";
          };
          const parent = editor.getShape(
            args.parentScreenId as ScreenShape["id"],
          ) as ScreenShape | undefined;
          if (!parent || parent.type !== "screen") {
            addToolResult({
              tool: "createSheetView",
              toolCallId: toolCall.toolCallId,
              output: {
                ok: false,
                error: `No parent screen with id ${args.parentScreenId} on canvas. Use a valid id from the canvas-state list, or call delegateScreen/createScreen if this is a top-level screen.`,
              },
            });
            return;
          }
          const v =
            VIEWPORT_PRESETS_BY_ID[args.viewportId] ??
            VIEWPORT_PRESETS_BY_ID[parent.props.viewportId];
          // Position the sheet directly to the right of the parent with a
          // 40px gap so the canvas connector line (see ArtboardOverlay
          // sheet linker) reads as a natural "pops out from here" flow.
          const x = parent.x + parent.props.w + SCREEN_GAP;
          const y = parent.y;
          const id = createShapeId();
          screenStatusStore.bumpVersion(id);
          editor.createShape<ScreenShape>({
            id,
            type: "screen",
            x,
            y,
            props: {
              w: v.width,
              h: v.height,
              name: args.name,
              viewportId: args.viewportId,
              code: DEFAULT_SCREEN_CODE,
              statusBarStyle: args.statusBarStyle ?? parent.props.statusBarStyle ?? "dark",
              parentScreenId: String(parent.id),
            },
          });
          zoomToFitCapped(editor, { animation: { duration: 200 } });

          const agentName = assignAgentName(toolCall.toolCallId);
          streamingStore.upsert({
            toolCallId: toolCall.toolCallId,
            screenId: String(id),
            screenName: args.name,
            kind: "create",
            agentName,
          });
          primeLastGood(String(id), DEFAULT_SCREEN_CODE);
          subAgentCodeStore.set(toolCall.toolCallId, "");
          pendingDelegates.register({
            toolCallId: toolCall.toolCallId,
            name: args.name,
            viewportId: args.viewportId,
            brief: args.brief,
          });

          // Same fire-and-forget streaming pattern as delegateScreen — the
          // sheet's sub-agent brief gets an extra note that this is a
          // sheet/modal view so the code reflects that (grabber, backdrop,
          // dismiss affordance).
          void (async () => {
            await new Promise((r) => setTimeout(r, 80));
            const siblingList = pendingDelegates.siblings(toolCall.toolCallId);
            const siblingBlock =
              siblingList.length > 0
                ? "Sibling screens being built in parallel RIGHT NOW:\n" +
                  siblingList
                    .map((s) => `- ${s.name} (${s.viewportId}): ${s.brief}`)
                    .join("\n")
                : "";
            const sheetHint = `This screen IS A SHEET / MODAL / NESTED VIEW over parent "${parent.props.name}". The user slides it up from the bottom to perform ONE focused task, then dismisses to return to the parent. Include: a grabber (36×5 rounded bar at top), a backdrop-dim assumption (you don't render the backdrop yourself — we'll composite it over the parent), a dismiss affordance (swipe down OR an explicit close button), and the sheet's top should round its first 16px of corner-radius. The sheet's content fills the rest. Do NOT recreate the parent's top bar or tab bar — a sheet overlays them, doesn't replace them.`;
            const sharedContext = [
              args.sharedContext ?? "",
              sheetHint,
              siblingBlock,
            ]
              .filter(Boolean)
              .join("\n\n");

            let finalCode = DEFAULT_SCREEN_CODE;
            let streamError: string | null = null;
            const { controller, release } = subAgentAbortRegistry.register(
              `sheet:${toolCall.toolCallId}`,
            );
            try {
              const res = await fetch("/api/generate-screen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: args.name,
                  viewportId: args.viewportId,
                  brief: args.brief,
                  sharedContext,
                  modelId: modelSettingsStore.get().modelId,
                  disabledSkills: skillsUiStore.list(),
                  projectDoc: projectDocStore.get().markdown,
                  designDoc: designDocStore.get().markdown,
                  tokens: designTokensStore.snapshot(),
              componentTokens: designComponentTokensStore.get(),
                  iconStyle: iconStyleStore.snapshot(),
                }),
                signal: controller.signal,
              });
              if (!res.ok || !res.body) {
                streamError = `Sub-agent fetch failed: ${res.status}`;
              } else {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let accumulated = "";
                // eslint-disable-next-line no-constant-condition
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  accumulated += decoder.decode(value, { stream: true });
                  subAgentCodeStore.set(toolCall.toolCallId, accumulated);
                  const normalized = normalizeScreenCode(accumulated);
                  const stabilized = stabilizeStreamingJsx(
                    normalized,
                    String(id),
                  );
                  const shape = editor.getShape(id) as ScreenShape | undefined;
                  if (shape && stabilized !== shape.props.code) {
                    applyCodePatchThrottled(shape, { code: stabilized });
                  }
                }
                // Strip the trailing `/*__OC_USAGE__:{...}*/` marker that
                // /api/generate-screen appends and report those tokens to
                // tokenUsageStore. Happens post-stream so the marker never
                // ends up compiled inside Sandpack.
                let cleaned = stripUsageSentinel(
                  accumulated,
                  `generate-screen:${toolCall.toolCallId}`,
                ).trim();
                if (cleaned.startsWith("```")) {
                  cleaned = cleaned
                    .replace(/^```(?:\w+)?\n/, "")
                    .replace(/\n```\s*$/, "");
                }
                finalCode = normalizeScreenCode(cleaned);
              }
            } catch (err) {
              const aborted =
                err instanceof DOMException && err.name === "AbortError";
              streamError = aborted ? "Cancelled by user" : String(err);
            } finally {
              release();
            }

            streamingStore.remove(toolCall.toolCallId);
            subAgentCodeStore.remove(toolCall.toolCallId);
            pendingDelegates.unregister(toolCall.toolCallId);
            releaseAgentName(toolCall.toolCallId);

            if (streamError) {
              addToolResult({
                tool: "createSheetView",
                toolCallId: toolCall.toolCallId,
                output: {
                  ok: false,
                  id,
                  error: streamError,
                },
              });
              return;
            }

            cancelCodeApply(String(id));
            screenStatusStore.bumpVersion(id);
            editor.updateShape<ScreenShape>({
              id,
              type: "screen",
              props: {
                w: v.width,
                h: v.height,
                name: args.name,
                viewportId: args.viewportId,
                code: finalCode,
                statusBarStyle: args.statusBarStyle ?? parent.props.statusBarStyle ?? "dark",
                parentScreenId: String(parent.id),
              },
            });

            const verdict = await screenStatusStore.waitForCompletion(
              id,
              COMPILE_TIMEOUT_MS,
            );
            if (verdict.kind === "success") {
              screenErrorLog.clearForScreen(String(id));
            }
            addToolResult({
              tool: "createSheetView",
              toolCallId: toolCall.toolCallId,
              output: {
                ok: verdict.kind === "success",
                id,
                parentScreenId: String(parent.id),
                parentName: parent.props.name,
                status: verdict.kind,
              },
            });
          })();
          return;
        }

        if (toolCall.toolName === "delegateScreen") {
          const args = toolCall.input as {
            name: string;
            viewportId: ViewportPresetId;
            brief: string;
            sharedContext?: string;
            statusBarStyle?: "light" | "dark";
            parentScreenId?: string;
          };
          const v =
            VIEWPORT_PRESETS_BY_ID[args.viewportId] ??
            VIEWPORT_PRESETS_BY_ID["iphone-17-pro"];
          // Place the new screen to the right of everything else on the
          // canvas. When multiple delegateScreen calls run in parallel, each
          // picks the current rightmost edge; they stagger nicely because
          // the first createShape commits synchronously before the next
          // onToolCall reads the page.
          const existingScreens = editor
            .getCurrentPageShapes()
            .filter((s) => s.type === "screen");
          let x = -v.width / 2;
          let y = -v.height / 2;
          if (existingScreens.length > 0) {
            const rightEdge = Math.max(
              ...existingScreens.map((s) => s.x + (s as ScreenShape).props.w),
            );
            x = rightEdge + SCREEN_GAP;
            y = Math.min(...existingScreens.map((s) => s.y));
          }
          const id = createShapeId();
          screenStatusStore.bumpVersion(id);
          editor.createShape<ScreenShape>({
            id,
            type: "screen",
            x,
            y,
            props: {
              w: v.width,
              h: v.height,
              name: args.name,
              viewportId: args.viewportId,
              code: DEFAULT_SCREEN_CODE,
              statusBarStyle: args.statusBarStyle ?? "dark",
              parentScreenId: args.parentScreenId ?? "",
            },
          });
          zoomToFitCapped(editor, { animation: { duration: 200 } });
          // Assign a short friendly name ("Henk", "May", "Pim") to this
          // sub-agent so cursor + tool card can label its work personally.
          const agentName = assignAgentName(toolCall.toolCallId);
          streamingStore.upsert({
            toolCallId: toolCall.toolCallId,
            screenId: String(id),
            screenName: args.name,
            kind: "create",
            agentName,
          });
          primeLastGood(String(id), DEFAULT_SCREEN_CODE);
          subAgentCodeStore.set(toolCall.toolCallId, "");

          // Register in the pending-delegates registry so concurrent siblings
          // can see us when they build their sharedContext. The IIFE waits a
          // beat before firing so late-arriving siblings in the same
          // assistant message also register first.
          pendingDelegates.register({
            toolCallId: toolCall.toolCallId,
            name: args.name,
            viewportId: args.viewportId,
            brief: args.brief,
          });

          // CRITICAL: run the stream in a background IIFE and return from
          // onToolCall immediately. AI SDK awaits onToolCall before moving
          // on to the next tool call in the same assistant message — if we
          // awaited the sub-agent stream here, N delegateScreen calls would
          // serialize even though the model emitted them in parallel.
          // addToolResult is fine to call from the background task once the
          // stream finishes; the sendAutomaticallyWhen callback re-triggers
          // submission only when ALL tool calls for the message are done.
          void (async () => {
            // Wait a tick so concurrent sibling delegates in the same
            // assistant message have a chance to register themselves before
            // we snapshot the sibling list. 80ms covers the gap between AI
            // SDK firing consecutive onToolCall invocations comfortably.
            await new Promise((r) => setTimeout(r, 80));
            const siblingList = pendingDelegates.siblings(toolCall.toolCallId);
            const siblingBlock =
              siblingList.length > 0
                ? "Sibling screens being built in parallel RIGHT NOW (coordinate visually and structurally with these — same tab bar, same card pattern, same spacing rhythm, same brand look):\n" +
                  siblingList
                    .map((s) => `- ${s.name} (${s.viewportId}): ${s.brief}`)
                    .join("\n")
                : "";
            const sharedContext = [args.sharedContext ?? "", siblingBlock]
              .filter(Boolean)
              .join("\n\n");

            let finalCode = DEFAULT_SCREEN_CODE;
            let streamError: string | null = null;
            const { controller, release } = subAgentAbortRegistry.register(
              `delegate:${toolCall.toolCallId}`,
            );
            try {
              const res = await fetch("/api/generate-screen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: args.name,
                  viewportId: args.viewportId,
                  brief: args.brief,
                  sharedContext,
                  modelId: modelSettingsStore.get().modelId,
                  disabledSkills: skillsUiStore.list(),
                  projectDoc: projectDocStore.get().markdown,
                  designDoc: designDocStore.get().markdown,
                  tokens: designTokensStore.snapshot(),
              componentTokens: designComponentTokensStore.get(),
                  iconStyle: iconStyleStore.snapshot(),
                }),
                signal: controller.signal,
              });
              if (!res.ok || !res.body) {
                streamError = `Sub-agent fetch failed: ${res.status}`;
              } else {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let accumulated = "";
                // eslint-disable-next-line no-constant-condition
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  accumulated += decoder.decode(value, { stream: true });
                  subAgentCodeStore.set(toolCall.toolCallId, accumulated);
                  const normalized = normalizeScreenCode(accumulated);
                  const stabilized = stabilizeStreamingJsx(
                    normalized,
                    String(id),
                  );
                  const shape = editor.getShape(id) as ScreenShape | undefined;
                  if (shape && stabilized !== shape.props.code) {
                    applyCodePatchThrottled(shape, { code: stabilized });
                  }
                }
                // Strip the trailing `/*__OC_USAGE__:{...}*/` marker that
                // /api/generate-screen appends and report those tokens to
                // tokenUsageStore. Happens post-stream so the marker never
                // ends up compiled inside Sandpack.
                let cleaned = stripUsageSentinel(
                  accumulated,
                  `generate-screen:${toolCall.toolCallId}`,
                ).trim();
                if (cleaned.startsWith("```")) {
                  cleaned = cleaned
                    .replace(/^```(?:\w+)?\n/, "")
                    .replace(/\n```\s*$/, "");
                }
                finalCode = normalizeScreenCode(cleaned);
              }
            } catch (err) {
              const aborted =
                err instanceof DOMException && err.name === "AbortError";
              streamError = aborted ? "Cancelled by user" : String(err);
            } finally {
              release();
            }

            streamingStore.remove(toolCall.toolCallId);
            subAgentCodeStore.remove(toolCall.toolCallId);
            pendingDelegates.unregister(toolCall.toolCallId);
            // Release the name back to the pool for future concurrent
            // runs; the mapping is preserved so stale tool cards can
            // still show "Henk: Discover" post-completion.
            releaseAgentName(toolCall.toolCallId);

            if (streamError) {
              addToolResult({
                tool: "delegateScreen",
                toolCallId: toolCall.toolCallId,
                output: {
                  ok: false,
                  id,
                  error: streamError,
                  hint: "Sub-agent stream failed. Retry via delegateScreen or write the screen with createScreen.",
                },
              });
              return;
            }

            cancelCodeApply(String(id));
            screenStatusStore.bumpVersion(id);
            editor.updateShape<ScreenShape>({
              id,
              type: "screen",
              props: {
                w: v.width,
                h: v.height,
                name: args.name,
                viewportId: args.viewportId,
                code: finalCode,
                statusBarStyle: args.statusBarStyle ?? "dark",
                parentScreenId: args.parentScreenId ?? "",
              },
            });

            const verdict = await screenStatusStore.waitForCompletion(
              id,
              COMPILE_TIMEOUT_MS,
            );
            if (verdict.kind === "success") {
              screenErrorLog.clearForScreen(String(id));
              planStore.advanceFromScreenOp({
                screenId: String(id),
                screenName: args.name,
                status: "complete",
              });
            } else if (verdict.kind === "error") {
              planStore.advanceFromScreenOp({
                screenId: String(id),
                screenName: args.name,
                status: "failed",
              });
            }
            addToolResult({
              tool: "delegateScreen",
              toolCallId: toolCall.toolCallId,
              output: {
                ok: verdict.kind === "success",
                id,
                status: verdict.kind,
                totalLines: finalCode.split("\n").length,
                ...(verdict.kind === "error"
                  ? { error: verdict.message, code: finalCode }
                  : {}),
              },
            });
          })();
          return;
        }

        if (toolCall.toolName === "planTasks") {
          const args = toolCall.input as {
            title: string;
            tasks: Array<{
              id: string;
              description: string;
              parallelizable: boolean;
              hint?: string;
            }>;
          };
          planStore.setPlan(toolCall.toolCallId, args.title, args.tasks);
          addToolResult({
            tool: "planTasks",
            toolCallId: toolCall.toolCallId,
            output: { ok: true, count: args.tasks.length },
          });
          return;
        }

        if (toolCall.toolName === "createScreen") {
          const args = toolCall.input as CreateScreenInput;
          const v = VIEWPORT_PRESETS_BY_ID[args.viewportId] ?? VIEWPORT_PRESETS_BY_ID["iphone-17-pro"];
          const finalCode = args.code
            ? normalizeScreenCode(args.code)
            : DEFAULT_SCREEN_CODE;

          // If the streaming effect already pre-created a screen for this
          // tool call, reuse it (just finalize its props). Otherwise create a
          // fresh one at a sensible position to the right of existing screens.
          const preCreatedId = streamingScreenByToolCallRef.current.get(
            toolCall.toolCallId,
          );
          let id: ScreenShape["id"];

          if (preCreatedId && editor.getShape(preCreatedId as ScreenShape["id"])) {
            id = preCreatedId as ScreenShape["id"];
            const existing = editor.getShape(id) as ScreenShape;
            const codeChanged = finalCode !== existing.props.code;
            if (codeChanged) {
              screenStatusStore.bumpVersion(id);
            }
            editor.updateShape<ScreenShape>({
              id,
              type: "screen",
              props: {
                w: v.width,
                h: v.height,
                name: args.name,
                viewportId: args.viewportId,
                code: finalCode,
              },
            });
          } else {
            id = createShapeId();
            const existing = editor
              .getCurrentPageShapes()
              .filter((s) => s.type === "screen");
            let x = -v.width / 2;
            let y = -v.height / 2;
            if (existing.length > 0) {
              const rightEdge = Math.max(
                ...existing.map((s) => s.x + (s as ScreenShape).props.w),
              );
              x = rightEdge + SCREEN_GAP;
              y = Math.min(...existing.map((s) => s.y));
            }
            screenStatusStore.bumpVersion(id);
            editor.createShape<ScreenShape>({
              id,
              type: "screen",
              x,
              y,
              props: {
                w: v.width,
                h: v.height,
                name: args.name,
                viewportId: args.viewportId,
                code: finalCode,
                statusBarStyle: args.statusBarStyle ?? "dark",
                parentScreenId: args.parentScreenId ?? "",
              },
            });
          }

          // Mapping no longer needed once committed.
          streamingScreenByToolCallRef.current.delete(toolCall.toolCallId);

          zoomToFitCapped(editor, { animation: { duration: 200 } });

          const verdict = await screenStatusStore.waitForCompletion(
            id,
            COMPILE_TIMEOUT_MS,
          );

          if (verdict.kind === "error") {
            addToolResult({
              tool: "createScreen",
              toolCallId: toolCall.toolCallId,
              output: {
                ok: false,
                id,
                error: verdict.message,
                code: finalCode,
                hint: "The screen failed to compile in Sandpack. Read the error, fix the code, and call updateScreen with id='" + id + "' to retry.",
              },
            });
            return;
          }

          if (verdict.kind === "success") {
            // The final render compiled cleanly; any transient errors logged
            // while partial code was streaming in are now stale.
            screenErrorLog.clearForScreen(id);
            planStore.advanceFromScreenOp({
              screenId: String(id),
              screenName: args.name,
              status: "complete",
            });
          } else {
            planStore.advanceFromScreenOp({
              screenId: String(id),
              screenName: args.name,
              status: "failed",
            });
          }
          addToolResult({
            tool: "createScreen",
            toolCallId: toolCall.toolCallId,
            output: {
              ok: verdict.kind === "success",
              id,
              status: verdict.kind,
              totalLines: finalCode.split("\n").length,
              ...(verdict.kind === "pending"
                ? { error: "Compile did not complete within timeout" }
                : {}),
            },
          });
          return;
        }

        if (toolCall.toolName === "updateScreen") {
          const args = toolCall.input as UpdateScreenInput;
          const targetId =
            (args.id as ShapeId | undefined) ??
            editor
              .getSelectedShapeIds()
              .find(
                (sid) => editor.getShape(sid)?.type === "screen",
              );

          if (!targetId) {
            addToolResult({
              tool: "updateScreen",
              toolCallId: toolCall.toolCallId,
              output: { ok: false, error: "No screen selected and no id given" },
            });
            return;
          }

          const shape = editor.getShape(targetId);
          if (!shape || shape.type !== "screen") {
            addToolResult({
              tool: "updateScreen",
              toolCallId: toolCall.toolCallId,
              output: { ok: false, error: "Target is not a screen" },
            });
            return;
          }

          const props: Partial<ScreenShape["props"]> = {};
          if (args.name !== undefined) props.name = args.name;
          if (args.code !== undefined) props.code = normalizeScreenCode(args.code);
          if (args.statusBarStyle !== undefined)
            props.statusBarStyle = args.statusBarStyle;
          if (args.parentScreenId !== undefined)
            props.parentScreenId = args.parentScreenId;
          if (args.viewportId !== undefined) {
            const v = VIEWPORT_PRESETS_BY_ID[args.viewportId];
            if (v) {
              props.viewportId = args.viewportId;
              props.w = v.width;
              props.h = v.height;
            }
          }

          const prevCode = (shape as ScreenShape).props.code;
          const codeChanged =
            props.code !== undefined && props.code !== prevCode;
          const diff =
            props.code !== undefined
              ? lineDiff(prevCode, props.code)
              : { added: 0, removed: 0 };
          const totalLines =
            props.code !== undefined ? props.code.split("\n").length : 0;

          if (codeChanged) {
            screenStatusStore.bumpVersion(targetId);
          }

          editor.updateShape({ id: targetId, type: "screen", props });

          if (props.code !== undefined) {
            // If the streaming effect already applied this exact code, no new
            // compile will fire. Report based on the current status instead of
            // waiting for a compile that will never happen.
            if (!codeChanged) {
              const cur = screenStatusStore.get(targetId);
              if (cur?.kind === "error") {
                addToolResult({
                  tool: "updateScreen",
                  toolCallId: toolCall.toolCallId,
                  output: {
                    ok: false,
                    id: targetId,
                    error: cur.message,
                    code: props.code,
                    hint: "The screen failed to compile in Sandpack. Read the error, fix the code, and call updateScreen with id='" + targetId + "' to retry.",
                  },
                });
                return;
              }
              screenErrorLog.clearForScreen(String(targetId));
              planStore.advanceFromScreenOp({
                screenId: String(targetId),
                screenName: (shape as ScreenShape).props.name,
                status: "complete",
              });
              addToolResult({
                tool: "updateScreen",
                toolCallId: toolCall.toolCallId,
                output: {
                  ok: true,
                  id: targetId,
                  status: cur?.kind ?? "success",
                  noop: true,
                  linesAdded: diff.added,
                  linesRemoved: diff.removed,
                  totalLines,
                },
              });
              return;
            }

            const verdict = await screenStatusStore.waitForCompletion(
              targetId,
              COMPILE_TIMEOUT_MS,
            );

            if (verdict.kind === "error") {
              addToolResult({
                tool: "updateScreen",
                toolCallId: toolCall.toolCallId,
                output: {
                  ok: false,
                  id: targetId,
                  error: verdict.message,
                  code: props.code,
                  hint: "The screen failed to compile in Sandpack. Read the error, fix the code, and call updateScreen with id='" + targetId + "' to retry.",
                },
              });
              return;
            }

            if (verdict.kind === "success") {
              screenErrorLog.clearForScreen(String(targetId));
              planStore.advanceFromScreenOp({
                screenId: String(targetId),
                screenName: (shape as ScreenShape).props.name,
                status: "complete",
              });
            } else {
              planStore.advanceFromScreenOp({
                screenId: String(targetId),
                screenName: (shape as ScreenShape).props.name,
                status: "failed",
              });
            }
            addToolResult({
              tool: "updateScreen",
              toolCallId: toolCall.toolCallId,
              output: {
                ok: verdict.kind === "success",
                id: targetId,
                status: verdict.kind,
                linesAdded: diff.added,
                linesRemoved: diff.removed,
                totalLines,
                ...(verdict.kind === "pending"
                  ? { error: "Compile did not complete within timeout" }
                  : {}),
              },
            });
            return;
          }

          screenErrorLog.clearForScreen(String(targetId));
          planStore.advanceFromScreenOp({
            screenId: String(targetId),
            screenName: (shape as ScreenShape).props.name,
            status: "complete",
          });
          addToolResult({
            tool: "updateScreen",
            toolCallId: toolCall.toolCallId,
            output: { ok: true, id: targetId },
          });
          return;
        }

        if (toolCall.toolName === "editScreen") {
          const args = toolCall.input as {
            id: string;
            edits: Array<{
              oldString: string;
              newString: string;
              replaceAll?: boolean;
            }>;
          };
          const targetId = args.id as ScreenShape["id"];
          const shape = editor.getShape(targetId) as ScreenShape | undefined;
          if (!shape || shape.type !== "screen") {
            addToolResult({
              tool: "editScreen",
              toolCallId: toolCall.toolCallId,
              output: {
                ok: false,
                id: args.id,
                error: `No screen with id ${args.id} found on canvas`,
              },
            });
            return;
          }
          // Apply edits sequentially. If any fails, return without mutating
          // the shape — caller can then retry with corrected oldStrings.
          let next = shape.props.code;
          for (let i = 0; i < args.edits.length; i++) {
            const edit = args.edits[i];
            if (edit.oldString === edit.newString) {
              addToolResult({
                tool: "editScreen",
                toolCallId: toolCall.toolCallId,
                output: {
                  ok: false,
                  id: args.id,
                  error: `Edit #${i + 1}: oldString equals newString (no-op).`,
                },
              });
              return;
            }
            if (edit.replaceAll) {
              if (!next.includes(edit.oldString)) {
                addToolResult({
                  tool: "editScreen",
                  toolCallId: toolCall.toolCallId,
                  output: {
                    ok: false,
                    id: args.id,
                    error: `Edit #${i + 1}: oldString not found in screen code. Include surrounding context to make the match work; copy from the latest source.`,
                    failedEdit: i,
                  },
                });
                return;
              }
              next = next.split(edit.oldString).join(edit.newString);
            } else {
              const firstIdx = next.indexOf(edit.oldString);
              if (firstIdx < 0) {
                addToolResult({
                  tool: "editScreen",
                  toolCallId: toolCall.toolCallId,
                  output: {
                    ok: false,
                    id: args.id,
                    error: `Edit #${i + 1}: oldString not found in screen code. Copy the exact substring from the current source.`,
                    failedEdit: i,
                  },
                });
                return;
              }
              const secondIdx = next.indexOf(
                edit.oldString,
                firstIdx + edit.oldString.length,
              );
              if (secondIdx >= 0) {
                addToolResult({
                  tool: "editScreen",
                  toolCallId: toolCall.toolCallId,
                  output: {
                    ok: false,
                    id: args.id,
                    error: `Edit #${i + 1}: oldString matches ${next.split(edit.oldString).length - 1} times — include more surrounding context for a unique match, or set replaceAll: true.`,
                    failedEdit: i,
                  },
                });
                return;
              }
              next =
                next.slice(0, firstIdx) +
                edit.newString +
                next.slice(firstIdx + edit.oldString.length);
            }
          }

          const prevCode = shape.props.code;
          const diff = lineDiff(prevCode, next);
          screenStatusStore.bumpVersion(targetId);
          editor.updateShape({
            id: targetId,
            type: "screen",
            props: { code: next },
          });

          const verdict = await screenStatusStore.waitForCompletion(
            targetId,
            COMPILE_TIMEOUT_MS,
          );
          if (verdict.kind === "success") {
            screenErrorLog.clearForScreen(String(targetId));
            planStore.advanceFromScreenOp({
              screenId: String(targetId),
              screenName: shape.props.name,
              status: "complete",
            });
          }
          addToolResult({
            tool: "editScreen",
            toolCallId: toolCall.toolCallId,
            output: {
              ok: verdict.kind === "success",
              id: targetId,
              status: verdict.kind,
              editsApplied: args.edits.length,
              linesAdded: diff.added,
              linesRemoved: diff.removed,
              totalLines: next.split("\n").length,
              ...(verdict.kind === "error"
                ? { error: verdict.message, code: next }
                : {}),
            },
          });
          return;
        }

        if (toolCall.toolName === "createShape") {
          addToolResult({
            tool: "createShape",
            toolCallId: toolCall.toolCallId,
            output: {
              ok: false,
              error:
                "Annotation shapes (text/rect/ellipse) are no longer supported — the canvas only holds screens. Use createScreen to add a new screen or update a screen's code instead.",
            },
          });
          return;
        }
      } catch (err) {
        addToolResult({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: { ok: false, error: String(err) },
        });
      }
    },
  });

  // Install the ClarifyingQuestionsCard → addToolResult bridge. We use a
  // module-level ref (not a prop) so the card doesn't need to be threaded
  // through MessageRow → MessageParts. Cleared on unmount.
  useEffect(() => {
    setClarifyingSubmitHandler((toolCallId, answers) => {
      addToolResult({
        tool: "askClarifyingQuestions",
        toolCallId,
        output: { ok: true, answers },
      });
    });
    return () => setClarifyingSubmitHandler(null);
  }, [addToolResult]);

  // Same ref pattern for quick-reply chips — they need sendMessage without
  // being threaded through MessageRow → MessageParts. We also pass the
  // current canvasContext at send time so the next turn has fresh state.
  useEffect(() => {
    setQuickReplySender((text) => {
      const canvasContext = buildAgentContext(editor);
      sendMessage({ text }, { body: { canvasContext } });
    });
    return () => setQuickReplySender(null);
  }, [sendMessage, editor]);

  const isBusy = status === "streaming" || status === "submitted";

  // Scan assistant messages for usage metadata the chat route attaches via
  // `messageMetadata` in toUIMessageStreamResponse. Each finished assistant
  // message carries { ocTotalUsage } when the chat stream has finished.
  // Dedupe by messageId so React re-renders of the same message don't
  // double-count.
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      const meta = (m as unknown as { metadata?: Record<string, unknown> })
        .metadata;
      const total = meta?.ocTotalUsage as
        | {
            inputTokens?: number;
            outputTokens?: number;
            reasoningTokens?: number;
            totalTokens?: number;
          }
        | undefined;
      if (!total) continue;
      tokenUsageStore.add(
        {
          inputTokens: total.inputTokens,
          outputTokens: total.outputTokens,
          reasoningTokens: total.reasoningTokens,
          totalTokens: total.totalTokens,
          source: "chat",
        },
        `chat:${m.id}`,
      );
    }
  }, [messages]);

  // Queue state — lets the user type a follow-up while the agent is still
  // working. We drain the head of the queue in an effect below whenever the
  // chat status flips back to `ready`.
  const [queuedMessages, setQueuedMessages] = useState<readonly QueuedMessage[]>(
    () => messageQueueStore.get(),
  );
  const drainingQueueRef = useRef(false);
  useEffect(() => {
    setQueuedMessages(messageQueueStore.get());
    return messageQueueStore.subscribe(setQueuedMessages);
  }, []);

  // Build the slash-command context fresh every call — editor ref and
  // selected-screen name are live-read so the expanded prompts always
  // reflect the current canvas state.
  const buildSlashCtx = useCallback(
    (): SlashCommandContext => ({
      editor,
      setInput,
      sendMessageText: (text) => {
        const canvasContext = buildAgentContext(editor);
        sendMessage({ text }, { body: { canvasContext } });
      },
      clearChat: () => {
        setMessages([]);
        messageQueueStore.clear();
      },
      openTab: (tab) => setActiveTab(tab as LeftTab),
      selectedScreenName: (() => {
        if (!editor) return undefined;
        const ids = editor.getSelectedShapeIds();
        if (ids.length !== 1) return undefined;
        const shape = editor.getShape(ids[0]) as ScreenShape | undefined;
        return shape?.type === "screen" ? shape.props.name : undefined;
      })(),
    }),
    [editor, sendMessage, setMessages, setInput],
  );

  // Dispatch a slash command that the user has decided to run — either by
  // picking it from the popover and pressing Enter, or by typing it in
  // full and submitting. `clientAction` runs locally, `expand` returns a
  // prompt that's sent or queued as a regular user message.
  const dispatchSlashCommand = useCallback(
    (command: SlashCommand, args: string) => {
      const ctx = buildSlashCtx();
      if (command.clientAction) {
        command.clientAction(args, ctx);
        setInput("");
        return;
      }
      if (command.expand) {
        const text = command.expand(args, ctx);
        if (!text) return; // e.g. `/think` with no topic — let the user keep typing
        if (isBusy) {
          messageQueueStore.enqueue(text);
        } else {
          ctx.sendMessageText(text);
        }
        setInput("");
      }
    },
    [buildSlashCtx, isBusy, setInput],
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    // Slash commands take priority over annotation expansion — if the user
    // submitted `/review home`, we don't want `#1` references inside the
    // command's expansion to get double-processed later.
    const slash = parseSlashCommand(trimmed);
    if (slash) {
      dispatchSlashCommand(slash.command, slash.args);
      return;
    }

    // `#N` tokens resolve to agentation pin context and `@slug` tokens to
    // specific canvas screens — both resolved here at send-time so chaining
    // multiple references in one prompt is natural ("compare @home and
    // @recipe-detail and #3").
    const expanded = expandScreenReferences(
      expandAnnotationReferences(input),
      editor,
    );
    if (isBusy) {
      // Queue it instead — the effect below drains the queue when status
      // flips back to `ready`. Canvas context snapshot is deferred to drain
      // time since the canvas will keep changing until then.
      messageQueueStore.enqueue(expanded);
      setInput("");
      return;
    }
    const canvasContext = buildAgentContext(editor);
    sendMessage({ text: expanded }, { body: { canvasContext } });
    setInput("");
  }

  // Auto-drain the message queue as soon as the chat becomes ready. One
  // message per idle window; the `sendAutomaticallyWhen` inside useChat then
  // drives the model loop, and the NEXT idle transition drains the NEXT
  // queued message. This cleanly serializes user intents while leaving every
  // in-between tool call cycle free to finish.
  useEffect(() => {
    if (status !== "ready") {
      drainingQueueRef.current = false;
      return;
    }
    if (drainingQueueRef.current) return;
    const next = messageQueueStore.shift();
    if (!next) return;
    drainingQueueRef.current = true;
    const canvasContext = buildAgentContext(editor);
    sendMessage({ text: next.text }, { body: { canvasContext } });
  }, [status, queuedMessages.length, sendMessage, editor]);

  // Stop handler: cancels the streaming chat response AND aborts any
  // sub-agent fetches that the client kicked off via onToolCall. Keep the
  // queue as-is so the user can decide whether to continue (they can also
  // hit "Clear queue" on the chip above the composer).
  const handleStop = useCallback(() => {
    try {
      stop();
    } catch {
      /* useChat.stop() throws only if not streaming — safe to ignore */
    }
    subAgentAbortRegistry.abortAll();
  }, [stop]);

  // Keyboard: Cmd/Ctrl+. and Escape while the composer area is focused
  // triggers stop. Bound on the form element below via onKeyDown.
  const handleComposerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLFormElement>) => {
      if (!isBusy) return;
      if (e.key === "Escape" || (e.key === "." && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        handleStop();
      }
    },
    [isBusy, handleStop],
  );

  async function handleSendSketch() {
    if (!editor || isBusy || sketchBusy) return;

    const selectedIds = editor.getSelectedShapeIds();
    const allIds = editor.getCurrentPageShapeIds();
    const idsToExport =
      selectedIds.length > 0 ? selectedIds : Array.from(allIds);

    if (idsToExport.length === 0) {
      setSketchHint("Draw something first, then send.");
      setTimeout(() => setSketchHint(null), 2200);
      return;
    }

    setSketchBusy(true);
    setSketchHint(null);

    try {
      const result = await editor.toImage(idsToExport, {
        format: "png",
        background: true,
        padding: 32,
        scale: 2,
      });
      const dataUrl = await blobToDataUrl(result.blob);

      const caption =
        input.trim() ||
        "This is a hand-drawn sketch of UI. Recreate it cleanly using createShape calls — match the layout, hierarchy, and intent. Place the new shapes to the right of the sketch (around x=600, y=0) so they don't overlap.";

      const canvasContext = buildAgentContext(editor);
      sendMessage(
        {
          text: caption,
          files: [
            {
              type: "file",
              mediaType: "image/png",
              url: dataUrl,
              filename: "sketch.png",
            },
          ],
        },
        { body: { canvasContext } },
      );
      setInput("");
    } catch (err) {
      setSketchHint(`Sketch export failed: ${String(err)}`);
      setTimeout(() => setSketchHint(null), 4000);
    } finally {
      setSketchBusy(false);
    }
  }

  // ── Live streaming render ──────────────────────────────────────────────
  // Watches `messages` for tool parts in `input-streaming` state and applies
  // partial `code` into the target screen as it arrives, so Sandpack re-bundles
  // live and the user watches the UI take shape. Also drives the agent cursor
  // overlay via streamingStore.
  const streamingScreenByToolCallRef = useRef<Map<string, string>>(new Map());
  const initializedStreamsRef = useRef<Set<string>>(new Set());

  // Per-screen debounce for partial-code applies during streaming. Anthropic
  // emits tokens at ~20/s; without this, every chunk thrashes Sandpack's
  // bundler. Coalesces to at most one updateShape per MIN_INTERVAL, keeping
  // the latest patch that arrived within the window.
  const codeApplyRef = useRef<
    Map<
      string,
      {
        patch: Partial<ScreenShape["props"]>;
        timer: number | null;
        lastApply: number;
      }
    >
  >(new Map());

  const applyCodePatchThrottled = useCallback(
    (shape: ScreenShape, patch: Partial<ScreenShape["props"]>) => {
      if (!editor) return;
      const key = String(shape.id);
      // Keep this STRICTLY above Sandpack's recompileDelay (set in
      // ScreenShapeUtil) so each throttled apply is a distinct compile job
      // instead of being swallowed by the bundler's silence-window debounce.
      const MIN_INTERVAL = 100;
      const map = codeApplyRef.current;
      const entry = map.get(key) ?? {
        patch: {} as Partial<ScreenShape["props"]>,
        timer: null as number | null,
        lastApply: 0,
      };
      entry.patch = { ...entry.patch, ...patch };
      map.set(key, entry);

      const flush = () => {
        const cur = map.get(key);
        if (!cur) return;
        const p = cur.patch;
        cur.patch = {};
        cur.lastApply = Date.now();
        cur.timer = null;
        if (
          Object.keys(p).length > 0 &&
          editor.getShape(shape.id)
        ) {
          editor.updateShape({ id: shape.id, type: "screen", props: p });
        }
      };

      if (entry.timer !== null) return;
      const now = Date.now();
      const since = now - entry.lastApply;
      if (since >= MIN_INTERVAL) {
        flush();
      } else {
        entry.timer = window.setTimeout(flush, MIN_INTERVAL - since);
      }
    },
    [editor],
  );

  const cancelCodeApply = useCallback((shapeId: string) => {
    const entry = codeApplyRef.current.get(shapeId);
    if (entry?.timer != null) {
      window.clearTimeout(entry.timer);
    }
    codeApplyRef.current.delete(shapeId);
  }, []);

  useEffect(() => {
    if (!editor) return;

    const seenToolCallIds = new Set<string>();

    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const part of m.parts) {
        const tp = part as unknown as {
          type: string;
          state?: string;
          toolCallId?: string;
          input?: Partial<{
            name: string;
            viewportId: ViewportPresetId;
            code: string;
            id: string;
          }>;
        };

        if (tp.type !== "tool-createScreen" && tp.type !== "tool-updateScreen") continue;
        if (!tp.toolCallId) continue;
        seenToolCallIds.add(tp.toolCallId);

        if (tp.state !== "input-streaming") {
          // Streaming is over for this tool call — cancel any queued throttled
          // apply so a stale partial doesn't overwrite the final code the
          // tool handler is about to commit. Then hide the cursor.
          const knownScreenId = streamingScreenByToolCallRef.current.get(
            tp.toolCallId,
          );
          if (knownScreenId) cancelCodeApply(knownScreenId);
          const updateTargetId = tp.input?.id;
          if (updateTargetId) cancelCodeApply(updateTargetId);
          if (streamingStore.list().some((m) => m.toolCallId === tp.toolCallId)) {
            streamingStore.remove(tp.toolCallId);
          }
          continue;
        }

        const partialCode = tp.input?.code ?? "";
        const partialName = tp.input?.name;
        const partialViewport = tp.input?.viewportId;

        if (tp.type === "tool-createScreen") {
          let screenId = streamingScreenByToolCallRef.current.get(tp.toolCallId);
          if (!screenId) {
            // Pre-create a placeholder screen on first chunk so the stream has
            // somewhere to render into. Position is computed like the final handler.
            const v =
              (partialViewport && VIEWPORT_PRESETS_BY_ID[partialViewport]) ||
              VIEWPORT_PRESETS_BY_ID["iphone-17-pro"];
            const existing = editor
              .getCurrentPageShapes()
              .filter((s) => s.type === "screen");
            let x = -v.width / 2;
            let y = -v.height / 2;
            if (existing.length > 0) {
              const rightEdge = Math.max(
                ...existing.map((s) => s.x + (s as ScreenShape).props.w),
              );
              x = rightEdge + SCREEN_GAP;
              y = Math.min(...existing.map((s) => s.y));
            }

            const id = createShapeId();
            editor.createShape<ScreenShape>({
              id,
              type: "screen",
              x,
              y,
              props: {
                w: v.width,
                h: v.height,
                name: partialName || "Generating…",
                viewportId: partialViewport ?? "iphone-17-pro",
                code: partialCode
                  ? stabilizeStreamingJsx(normalizeScreenCode(partialCode), id)
                  : DEFAULT_SCREEN_CODE,
              },
            });
            zoomToFitCapped(editor, { animation: { duration: 120 } });
            screenId = id;
            streamingScreenByToolCallRef.current.set(tp.toolCallId, id);
          }

          // Apply partial updates as they arrive.
          const shape = editor.getShape(screenId as ScreenShape["id"]) as
            | ScreenShape
            | undefined;
          if (shape) {
            const patch: Partial<ScreenShape["props"]> = {};
            if (partialName && partialName !== shape.props.name) patch.name = partialName;
            if (
              partialViewport &&
              partialViewport !== shape.props.viewportId &&
              VIEWPORT_PRESETS_BY_ID[partialViewport]
            ) {
              const v = VIEWPORT_PRESETS_BY_ID[partialViewport];
              patch.viewportId = partialViewport;
              patch.w = v.width;
              patch.h = v.height;
            }
            if (partialCode) {
              const stabilized = stabilizeStreamingJsx(
                normalizeScreenCode(partialCode),
                String(shape.id),
              );
              if (stabilized !== shape.props.code) {
                patch.code = stabilized;
              }
            }
            if (Object.keys(patch).length > 0) {
              applyCodePatchThrottled(shape, patch);
            }
            streamingStore.upsert({
              toolCallId: tp.toolCallId,
              screenId: String(shape.id),
              screenName: patch.name ?? shape.props.name,
              kind: "create",
            });
          }
        } else if (tp.type === "tool-updateScreen") {
          // Resolve target screen by id (from input) or current selection.
          const argId = tp.input?.id;
          let targetId: string | undefined =
            argId ||
            editor
              .getSelectedShapeIds()
              .find((sid) => editor.getShape(sid)?.type === "screen");
          if (!targetId) continue;

          const shape = editor.getShape(targetId as ScreenShape["id"]) as
            | ScreenShape
            | undefined;
          if (!shape) continue;

          // On the very first chunk of this stream, seed the last-known-good
          // cache with the screen's CURRENT code so early partial frames
          // (imports / consts before the component body exists) fall back to
          // the working screen rather than a blank stub.
          if (!initializedStreamsRef.current.has(tp.toolCallId)) {
            primeLastGood(String(shape.id), shape.props.code);
            initializedStreamsRef.current.add(tp.toolCallId);
          }

          if (partialCode) {
            const stabilized = stabilizeStreamingJsx(
              normalizeScreenCode(partialCode),
              String(shape.id),
            );
            if (stabilized !== shape.props.code) {
              applyCodePatchThrottled(shape, { code: stabilized });
            }
          }
          streamingStore.upsert({
            toolCallId: tp.toolCallId,
            screenId: String(shape.id),
            screenName: shape.props.name,
            kind: "update",
          });
        }
      }
    }

    // Clean up markers for tool calls that disappeared.
    for (const [tcid] of streamingScreenByToolCallRef.current) {
      if (!seenToolCallIds.has(tcid)) {
        streamingScreenByToolCallRef.current.delete(tcid);
        streamingStore.remove(tcid);
      }
    }
    for (const tcid of initializedStreamsRef.current) {
      if (!seenToolCallIds.has(tcid)) {
        initializedStreamsRef.current.delete(tcid);
      }
    }
  }, [messages, editor, applyCodePatchThrottled, cancelCodeApply]);

  return (
    <aside
      data-agentation-ignore
      className="oc-chat fixed flex flex-col overflow-hidden"
      style={{
        top: 10,
        bottom: 10,
        left: 10,
        width: "calc(var(--left-panel-w) - 10px)",
        zIndex: 50,
      }}
    >
      <LeftPanelResizer />
      <header className="flex items-center justify-between px-4 pt-2.5 pb-1">
        <div className="flex items-center gap-2">
          <span
            className="text-[13px] font-semibold"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.005em" }}
          >
            Open Canvas
          </span>
          <span
            className="text-[10px] oc-tabular font-medium rounded-full px-1.5 py-px"
            style={{
              color: "var(--text-tertiary)",
              background: "var(--surface-2)",
              boxShadow: "inset 0 0 0 1px var(--border-subtle)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {sketchBusy ? "sketch" : status}
          </span>
          <ResetButton />
        </div>
        <div className="shrink-0 translate-x-1.5">
          <ThemeToggle />
        </div>
      </header>

      <div
        className="oc-tablist flex min-w-0 flex-nowrap items-stretch gap-2 overflow-x-auto px-4"
        style={{
          boxShadow: "inset 0 -1px 0 0 var(--border-subtle)",
        }}
        role="tablist"
      >
        <TabButton
          active={activeTab === "chat"}
          onClick={() => setActiveTab("chat")}
          label="Chat"
          icon="IconChatBubbles"
        />
        <TabButton
          active={activeTab === "code"}
          onClick={() => setActiveTab("code")}
          label="Code"
          icon="IconCode"
        />
        <TabButton
          active={activeTab === "tokens"}
          onClick={() => setActiveTab("tokens")}
          label="Tokens"
          icon="IconAiTokens"
        />
        <TabButton
          active={activeTab === "icons"}
          onClick={() => setActiveTab("icons")}
          label="Icons"
          icon="IconShapesPlusXSquareCircle"
        />
        <TabButton
          active={activeTab === "components"}
          onClick={() => setActiveTab("components")}
          label="Components"
          icon="IconComponents"
        />
        <TabButton
          active={activeTab === "services"}
          onClick={() => setActiveTab("services")}
          label="Services"
          icon="IconServer1"
        />
        <TabButton
          active={activeTab === "data"}
          onClick={() => setActiveTab("data")}
          label="Data"
          icon="IconTable"
        />
        <TabButton
          active={activeTab === "skills"}
          onClick={() => setActiveTab("skills")}
          label="Skills"
          icon="IconBook"
        />
        <TabButton
          active={activeTab === "notes"}
          onClick={() => setActiveTab("notes")}
          label="Notes"
          icon="IconNote1"
        />
        <TabButton
          active={activeTab === "project"}
          onClick={() => setActiveTab("project")}
          label="Project"
          icon="IconFolder1"
        />
        <TabButton
          active={activeTab === "design"}
          onClick={() => setActiveTab("design")}
          label="Design"
          icon="IconColorPalette"
        />
      </div>

      {activeTab === "chat" ? (
      <>
      {messages.length === 0 ? (
        <EmptyState onPick={(s) => setInput(s)} />
      ) : (
        <ChatScrollList messages={messages} />
      )}

      {sketchHint && (
        <div
          className="mx-3 mb-2 rounded-[10px] px-3 py-2 text-[12px]"
          style={{
            color: "var(--state-warn)",
            background: "color-mix(in oklch, var(--state-warn) 14%, var(--surface-1))",
            boxShadow:
              "inset 0 0 0 1px color-mix(in oklch, var(--state-warn) 30%, transparent)",
          }}
        >
          {sketchHint}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        onKeyDown={handleComposerKeyDown}
        className="oc-composer mx-3 mb-3"
      >
        {/* Queued follow-up messages — shown as dismissable chips above
            the input while the agent is still working. */}
        {queuedMessages.length > 0 && (
          <div className="oc-composer-queue" aria-label="Queued messages">
            <span className="oc-composer-queue-badge">
              <QueuedGlyph /> {queuedMessages.length} queued
            </span>
            {queuedMessages.map((m) => (
              <span key={m.id} className="oc-composer-queue-chip" title={m.text}>
                <span className="oc-composer-queue-chip-text">{m.text}</span>
                <button
                  type="button"
                  className="oc-composer-queue-chip-remove"
                  aria-label="Remove from queue"
                  onClick={() => messageQueueStore.remove(m.id)}
                >
                  <CloseGlyph />
                </button>
              </span>
            ))}
            <button
              type="button"
              className="oc-composer-queue-chip-remove"
              title="Clear all queued messages"
              aria-label="Clear queue"
              onClick={() => messageQueueStore.clear()}
              style={{ paddingLeft: 4, paddingRight: 4, width: "auto" }}
            >
              <span style={{ fontSize: 11 }}>Clear</span>
            </button>
          </div>
        )}

        <div className="oc-composer-pill">
          <AnnotationAutocomplete
            input={input}
            setInput={setInput}
            // Keep the textarea interactive while busy so the user can
            // type a follow-up and queue it via Enter.
            disabled={sketchBusy}
            onSubmit={() => handleSubmit(new Event("submit") as unknown as FormEvent)}
            placeholder="Type / for commands, @ for screens, # for pins"
            onSlashCommandPick={dispatchSlashCommand}
            editor={editor}
          />
          <button
            type={isBusy ? "button" : "submit"}
            onClick={isBusy ? handleStop : undefined}
            disabled={!isBusy && (!input.trim() || sketchBusy)}
            className="oc-composer-action"
            data-variant={isBusy ? "stop" : "send"}
            aria-label={isBusy ? "Stop" : "Send message"}
            title={
              isBusy
                ? "Stop (Esc / ⌘.)"
                : input.trim()
                  ? "Send message"
                  : "Type a message first"
            }
          >
            {isBusy ? (
              <ComposerCentralIcon name="IconStop" variant="filled" size={14} />
            ) : (
              <ComposerCentralIcon
                name="IconArrowCornerDownLeft"
                variant="filled"
                size={14}
              />
            )}
          </button>
        </div>

        <div className="oc-composer-toolbar">
          <div className="oc-composer-toolbar-group oc-composer-toolbar-group--leading">
            <button
              type="button"
              onClick={handleSendSketch}
              disabled={isBusy || sketchBusy}
              title="Attach the current selection (or all shapes) as a sketch"
              className="oc-composer-tool oc-composer-tool--icon"
              aria-label="Attach sketch"
            >
              <ComposerCentralIcon name="IconPlusSmall" variant="outlined" size={18} />
            </button>
            <button
              type="button"
              className="oc-composer-tool oc-composer-tool--icon"
              title="Voice input (coming soon)"
              aria-label="Voice input"
              disabled
            >
              <ComposerCentralIcon name="IconMicrophone" variant="outlined" size={18} />
            </button>
          </div>
          <div className="oc-composer-toolbar-group oc-composer-toolbar-group--trailing">
            <ModelPicker />
            <ThinkingToggle />
          </div>
        </div>
      </form>
      </>
      ) : activeTab === "tokens" ? (
        <TokensPanel />
      ) : activeTab === "icons" ? (
        <IconsPanel />
      ) : activeTab === "components" ? (
        <ComponentsPanel />
      ) : activeTab === "services" ? (
        <ServicesPanel />
      ) : activeTab === "data" ? (
        <DataPanel />
      ) : activeTab === "skills" ? (
        <SkillsPanel />
      ) : activeTab === "notes" ? (
        <NotesPanel />
      ) : activeTab === "project" ? (
        <ProjectPanel />
      ) : activeTab === "design" ? (
        <DesignPanel />
      ) : (
        <CodeTabContent />
      )}
    </aside>
  );
}

/**
 * Scrollable container for chat messages with sticky-to-bottom behavior.
 * Follows the latest tokens during streaming — but if the user scrolls
 * up to read earlier content, auto-scroll pauses until they scroll back
 * near the bottom. Same UX as ChatGPT / Gemini.
 */
function ChatScrollList({ messages }: { messages: ChatMessage[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  // Only autoscroll when we're pinned to the bottom. Re-checks on each
  // user scroll event — threshold 80px from the bottom is "close enough"
  // to count as following the stream.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onScroll() {
      const distance = el!.scrollHeight - el!.scrollTop - el!.clientHeight;
      stickRef.current = distance < 80;
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // `messages` reference changes on every token during streaming — the
  // useChat hook returns a fresh array each update. That means this effect
  // fires very frequently; setting scrollTop is cheap (no reflow work
  // beyond the scroll itself) so it's fine.
  useEffect(() => {
    if (!stickRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={containerRef}
      className="flex-1 space-y-4 overflow-y-auto px-4 py-5"
    >
      {messages.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  const suggestions = [
    "Design a sign-in screen",
    "Create a settings page with toggles",
    "Three blue cards in a row",
    "Sketch a checkout flow",
  ];
  return (
    <div className="oc-empty">
      <div className="oc-sparkle oc-sparkle--lg" aria-hidden>
        ✦
      </div>
      <div className="oc-empty-title">Hello, designer</div>
      <div className="oc-empty-sub">
        Describe a screen and I&apos;ll build it, or sketch one with the pen tool.
      </div>
      <div className="oc-suggest-row">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="oc-suggest"
            onClick={() => onPick(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: Array<Record<string, unknown>>;
};

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="oc-msg-user">
          <MessageParts parts={message.parts} role="user" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5">
      <span className="oc-sparkle" aria-hidden>✦</span>
      <div className="oc-msg-agent min-w-0 flex-1">
        <MessageParts parts={message.parts} role="assistant" />
      </div>
    </div>
  );
}

function MessageParts({
  parts,
  role,
}: {
  parts: Array<Record<string, unknown>>;
  role: "user" | "assistant";
}) {
  const grouped = groupMessageParts(parts);
  return (
    <>
      {grouped.map((item, i) => {
        if (item.kind === "tool-group") {
          return <ToolCallGroup key={i} group={item.group} />;
        }
        const part = item.part;
        const type = part.type as string;
        if (type === "text") {
          const text = (part.text as string) ?? "";
          return (
            <div key={i} className="oc-msg-text">
              <ChatMarkdown>{text}</ChatMarkdown>
            </div>
          );
        }
        if (type === "reasoning") {
          return <ReasoningBlock key={i} part={part} />;
        }
        if (type === "file" && (part.mediaType as string | undefined)?.startsWith("image/")) {
          return (
            <img
              key={i}
              src={part.url as string}
              alt={(part.filename as string | undefined) ?? "attachment"}
              className="mt-1.5 block max-h-44 rounded-[10px]"
              style={{
                boxShadow: "0 0 0 1px var(--border-subtle)",
              }}
            />
          );
        }
        if (type === "tool-planTasks") {
          return (
            <PlanCard key={i} part={part as Record<string, unknown>} />
          );
        }
        if (type === "tool-think") {
          return (
            <ThinkCard key={i} part={part as Record<string, unknown>} />
          );
        }
        if (type === "tool-suggestReplies") {
          const tcid = (part as { toolCallId?: string }).toolCallId;
          const input = (part as { input?: { replies?: string[] } }).input;
          if (!tcid || !input?.replies?.length) return null;
          return (
            <QuickReplies
              key={i}
              toolCallId={tcid}
              replies={input.replies}
            />
          );
        }

        if (type === "tool-askClarifyingQuestions") {
          const tcid = (part as { toolCallId?: string }).toolCallId;
          if (!tcid) return null;
          return (
            <ClarifyingQuestionsCard
              key={i}
              toolCallId={tcid}
              onSubmit={(answers) => {
                clarifyingQuestionsStore.markAnswered(tcid, answers);
                // Module-level submitter wired by LeftPanel's effect below.
                submitClarifyingAnswers(tcid, answers);
              }}
            />
          );
        }
        if (type.startsWith("tool-")) {
          return <ToolCallCard key={i} part={part as Record<string, unknown>} />;
        }
        return null;
      })}
      {role === "assistant" && null}
    </>
  );
}

function ReasoningBlock({ part }: { part: Record<string, unknown> }) {
  const text = (part.text as string | undefined) ?? "";
  const state = (part.state as string | undefined) ?? "done";
  const isStreaming = state === "streaming";

  const startRef = useRef<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  useEffect(() => {
    if (isStreaming && startRef.current === null) {
      startRef.current = Date.now();
    }
    if (!isStreaming && startRef.current !== null && durationMs === null) {
      const ms = Date.now() - startRef.current;
      setDurationMs(ms);
      // Hand the duration to the cadence watchdog. consumeNudge() reads the
      // most recent value at sendMessage time; if it crossed the threshold,
      // the next turn gets a <system-reminder> nudging the agent to break
      // its thinking earlier.
      cadenceWatchdog.recordReasoningDuration(ms);
    }
  }, [isStreaming, durationMs]);

  // Live heartbeat: tick elapsed time twice per second while streaming so
  // the label can count up and the outer class can shift to a warning
  // state when thinking runs long without producing an action. When the
  // reasoning finishes the ticker stops immediately.
  useEffect(() => {
    if (!isStreaming) return;
    const start = startRef.current ?? Date.now();
    startRef.current = start;
    setLiveMs(Date.now() - start);
    const id = setInterval(() => setLiveMs(Date.now() - start), 500);
    return () => clearInterval(id);
  }, [isStreaming]);

  // Expanded while streaming so the user sees live thought, auto-collapse
  // when it finishes. User can still click to re-expand.
  const [expanded, setExpanded] = useState(isStreaming);
  const [manuallyToggled, setManuallyToggled] = useState(false);
  useEffect(() => {
    if (manuallyToggled) return;
    setExpanded(isStreaming);
  }, [isStreaming, manuallyToggled]);

  // Cadence signal — agents should emit a tool call or text within a few
  // seconds of starting to think. Long silent rumination is the
  // rumination-loop anti-pattern (see BRAINSTORM.md §14.5). These
  // thresholds escalate the visual state so the user (and the agent, on
  // the next turn) can see when it drifts.
  const liveSecs = Math.floor(liveMs / 1000);
  const warnLevel: "low" | "medium" | "high" | null = isStreaming
    ? liveMs > 90_000
      ? "high"
      : liveMs > 45_000
        ? "medium"
        : liveMs > 15_000
          ? "low"
          : null
    : null;

  const statusLabel = isStreaming
    ? liveSecs >= 15
      ? warnLevel === "high"
        ? `Thinking… ${liveSecs}s — should act soon`
        : `Thinking… ${liveSecs}s`
      : "Thinking…"
    : durationMs
      ? `Thought for ${(durationMs / 1000).toFixed(1)}s`
      : "Thought";

  return (
    <div
      className={
        "oc-reasoning" +
        (isStreaming ? " oc-reasoning--streaming" : "") +
        (expanded ? " oc-reasoning--open" : "") +
        (warnLevel ? ` oc-reasoning--warn-${warnLevel}` : "")
      }
    >
      <button
        type="button"
        className="oc-reasoning-head"
        onClick={() => {
          setManuallyToggled(true);
          setExpanded((v) => !v);
        }}
        aria-expanded={expanded}
      >
        <span className="oc-reasoning-glyph" aria-hidden>
          ◎
        </span>
        <span className="oc-reasoning-label oc-tabular">{statusLabel}</span>
        <span
          className="oc-reasoning-caret"
          data-open={expanded || undefined}
          aria-hidden
        >
          ›
        </span>
      </button>
      {expanded && text && (
        <ReasoningBody text={text} isStreaming={isStreaming} />
      )}
    </div>
  );
}

/**
 * Auto-scrolls to the bottom of the thinking stream as new tokens arrive,
 * so the user sees the latest reasoning without scrolling manually. Same
 * sticky-to-bottom rule as the main chat list: if the user scrolls up in
 * the reasoning body to read earlier thoughts, auto-scroll pauses.
 */
function ReasoningBody({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function onScroll() {
      const d = el!.scrollHeight - el!.scrollTop - el!.clientHeight;
      stickRef.current = d < 40;
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!stickRef.current) return;
    const el = ref.current;
    if (!el) return;
    // Streaming = follow every token. Post-stream = one scroll-to-end so
    // the user lands on the conclusion, not the opening thought.
    el.scrollTop = el.scrollHeight;
  }, [text, isStreaming]);

  return (
    <div ref={ref} className="oc-reasoning-body">
      {text}
    </div>
  );
}

function ToolCallGroup({ group }: { group: ToolGroup }) {
  const [expanded, setExpanded] = useState(false);
  const parts = group.parts;
  const primary = parts[parts.length - 1];
  const attemptCount = parts.length;

  if (attemptCount <= 1) {
    return <ToolCallCard part={primary as unknown as Record<string, unknown>} />;
  }

  return (
    <div className="oc-toolgroup">
      <div className="oc-toolgroup-head">
        <ToolCallCard part={primary as unknown as Record<string, unknown>} />
        <button
          type="button"
          className="oc-toolgroup-badge"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title={`Show all ${attemptCount} attempts`}
        >
          <span className="oc-tabular">{attemptCount} attempts</span>
          <span
            className="oc-toolgroup-caret"
            data-open={expanded || undefined}
            aria-hidden
          >
            ›
          </span>
        </button>
      </div>
      {expanded && (
        <div className="oc-toolgroup-history">
          {parts
            .slice(0, -1)
            .map((p, i) => (
              <ToolCallCard
                key={i}
                part={p as unknown as Record<string, unknown>}
                muted
              />
            ))}
        </div>
      )}
    </div>
  );
}

type ToolPart = {
  type: string;
  state?: string;
  toolCallId?: string;
  input?: {
    name?: string;
    viewportId?: ViewportPresetId;
    code?: string;
    id?: string;
    type?: string;
    text?: string;
    color?: string;
  };
  output?: {
    ok?: boolean;
    id?: string;
    error?: string;
    status?: string;
    noop?: boolean;
    linesAdded?: number;
    linesRemoved?: number;
    totalLines?: number;
  };
  errorText?: string;
};

function resolveToolId(tp: ToolPart): string | undefined {
  return tp.output?.id ?? tp.input?.id;
}

function isScreenOp(tp: ToolPart): boolean {
  return (
    tp.type === "tool-createScreen" ||
    tp.type === "tool-updateScreen" ||
    tp.type === "tool-editScreen" ||
    tp.type === "tool-delegateScreen"
  );
}

type ToolGroup = { key: string; parts: ToolPart[] };

/**
 * Walk raw message parts and coalesce consecutive screen-op tool calls that
 * target the same screen into a single group. Non-screen parts stay on their
 * own (a group of one) so text/files/createShape keep rendering in order.
 */
function groupMessageParts(parts: Array<Record<string, unknown>>): Array<
  { kind: "part"; part: Record<string, unknown> }
  | { kind: "tool-group"; group: ToolGroup }
> {
  const out: Array<
    { kind: "part"; part: Record<string, unknown> }
    | { kind: "tool-group"; group: ToolGroup }
  > = [];
  let current: ToolGroup | null = null;

  const flush = () => {
    if (current) {
      out.push({ kind: "tool-group", group: current });
      current = null;
    }
  };

  for (const p of parts) {
    const tp = p as unknown as ToolPart;
    if (!isScreenOp(tp)) {
      flush();
      out.push({ kind: "part", part: p });
      continue;
    }
    const id = resolveToolId(tp);
    const key = id ?? `solo:${tp.toolCallId ?? Math.random()}`;
    if (current && current.key === key && id) {
      current.parts.push(tp);
    } else {
      flush();
      current = { key, parts: [tp] };
    }
  }
  flush();
  return out;
}

/**
 * Tracks line-count samples over time while a tool call is streaming, then
 * exposes a flat array of normalized points [0..1] for the sparkline.
 */
function useStreamingSparkline(
  isStreaming: boolean,
  lineCount: number,
): number[] {
  const [samples, setSamples] = useState<number[]>([]);
  useEffect(() => {
    if (!isStreaming) return;
    setSamples((prev) => {
      const next = [...prev, lineCount];
      // keep the window bounded so long streams don't bloat state
      return next.length > 48 ? next.slice(-48) : next;
    });
  }, [isStreaming, lineCount]);
  return samples;
}

function StreamingSparkline({ samples }: { samples: number[] }) {
  if (samples.length < 2) return null;
  const max = Math.max(...samples);
  const min = Math.min(...samples);
  const range = Math.max(1, max - min);
  const w = 44;
  const h = 12;
  const step = w / (samples.length - 1);
  const points = samples
    .map((s, i) => {
      const x = i * step;
      const y = h - ((s - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="oc-toolcard-spark"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Tails the last few lines of the in-progress code so users can read along
 * with what the model is writing. Preserves tab indentation.
 */
function StreamingCodeTail({ code }: { code: string }) {
  const lines = code.split("\n");
  const tail = lines.slice(-6);
  // Trim any trailing whitespace-only lines so the newest non-blank line is
  // always the visible "current" one.
  while (tail.length > 1 && tail[tail.length - 1].trim() === "") tail.pop();
  return (
    <pre className="oc-toolcard-code" aria-hidden>
      {tail.map((l, i) => (
        <div key={i} className="oc-toolcard-code-line">
          {l || " "}
        </div>
      ))}
    </pre>
  );
}

function ToolThumbnail({
  viewportId,
  name,
  state,
}: {
  viewportId: ViewportPresetId | undefined;
  name: string;
  state: "streaming" | "done" | "error";
}) {
  const v = viewportId ? VIEWPORT_PRESETS_BY_ID[viewportId] : undefined;
  // Cap thumbnail at 36×56 so tall mobile viewports still fit without
  // pushing the card taller than the rest of the chat rhythm.
  const maxW = 36;
  const maxH = 46;
  let w = maxW;
  let h = maxH;
  if (v) {
    const ar = v.width / v.height;
    if (ar >= 1) {
      w = maxW;
      h = Math.max(18, Math.round(maxW / ar));
    } else {
      h = maxH;
      w = Math.max(16, Math.round(maxH * ar));
    }
  }
  return (
    <div
      className={
        "oc-toolcard-thumb oc-toolcard-thumb--" + state
      }
      style={{ width: w, height: h }}
      aria-hidden
    >
      <span className="oc-toolcard-thumb-label">
        {name.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

function QuickReplies({
  toolCallId,
  replies,
}: {
  toolCallId: string;
  replies: string[];
}) {
  const [consumed, setConsumed] = useState(() =>
    isQuickRepliesConsumed(toolCallId),
  );
  useEffect(() => {
    setConsumed(isQuickRepliesConsumed(toolCallId));
    return subscribeQuickReplies(() =>
      setConsumed(isQuickRepliesConsumed(toolCallId)),
    );
  }, [toolCallId]);

  if (consumed) return null;

  return (
    <div className="oc-quickreplies" role="group" aria-label="Quick replies">
      {replies.map((r, i) => (
        <button
          key={i}
          type="button"
          className="oc-quickreply"
          onClick={() => {
            markQuickRepliesConsumed(toolCallId);
            sendQuickReply(r);
          }}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function PlanCard({ part }: { part: Record<string, unknown> }) {
  const tp = part as unknown as ToolPart;
  const planId = tp.toolCallId ?? "";
  const inputTitle = (tp.input as { title?: string } | undefined)?.title;
  // Subscribe to the store so tasks advance live as screen-op tool calls
  // finish. Match plan by id (= toolCallId); fall back to the current plan.
  const [plan, setPlan] = useState(() => planStore.getCurrent());
  useEffect(() => {
    setPlan(planStore.getCurrent());
    return planStore.subscribe((_cur, all) => {
      setPlan(all.get(planId) ?? planStore.getCurrent());
    });
  }, [planId]);
  // Plan landed in store keyed by our toolCallId, but store API keeps only
  // the "current" plan in getCurrent() — look it up by id to show stable
  // state even after a newer plan replaces current.
  const specific = planStore.getAll().get(planId);
  const p = specific ?? plan;

  const title = p?.title ?? inputTitle ?? "Plan";
  const tasks = p?.tasks ?? [];
  const completed = tasks.filter((t) => t.status === "complete").length;
  const total = tasks.length;
  const progress = total > 0 ? completed / total : 0;

  return (
    <div className="oc-plan">
      <div className="oc-plan-head">
        <span className="oc-plan-title">{title}</span>
        <span className="oc-plan-progress oc-tabular">
          {completed}/{total}
        </span>
      </div>
      <div className="oc-plan-bar" aria-hidden>
        <div
          className="oc-plan-bar-fill"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <ul className="oc-plan-list">
        {tasks.map((t) => (
          <li
            key={t.id}
            className="oc-plan-task"
            data-status={t.status}
          >
            <span className="oc-plan-task-icon" aria-hidden>
              {t.status === "complete"
                ? "✓"
                : t.status === "failed"
                  ? "✗"
                  : t.status === "in_progress"
                    ? "◐"
                    : "○"}
            </span>
            <span className="oc-plan-task-body">
              <span className="oc-plan-task-desc">{t.description}</span>
              {t.parallelizable && t.status === "pending" && (
                <span className="oc-plan-task-par" title="Runs in parallel">
                  ∥
                </span>
              )}
            </span>
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="oc-plan-empty">Planning…</li>
        )}
      </ul>
    </div>
  );
}

function ThinkCard({ part }: { part: Record<string, unknown> }) {
  const tp = part as unknown as ToolPart;
  const input = tp.input as { topic?: string; thought?: string } | undefined;
  const topic = input?.topic;
  const thought = input?.thought;
  const isStreaming = tp.state === "input-streaming";
  const [expanded, setExpanded] = useState(false);

  if (!topic && !thought && !isStreaming) return null;

  const label = topic ?? (isStreaming ? "Thinking…" : "Thought");
  const canToggle = !!thought;

  return (
    <div
      className={
        "oc-think" +
        (isStreaming ? " oc-think--streaming" : "") +
        (expanded ? " oc-think--open" : "")
      }
    >
      <button
        type="button"
        className="oc-think-head"
        onClick={() => {
          if (!canToggle) return;
          setExpanded((v) => !v);
        }}
        aria-expanded={canToggle ? expanded : undefined}
        disabled={!canToggle}
      >
        <span className="oc-think-glyph" aria-hidden>
          ◇
        </span>
        <span className="oc-think-topic">{label}</span>
        {canToggle && (
          <span
            className="oc-think-caret"
            data-open={expanded || undefined}
            aria-hidden
          >
            ›
          </span>
        )}
      </button>
      {expanded && thought && (
        <div className="oc-think-body">{thought}</div>
      )}
    </div>
  );
}

/**
 * Small disclosure button rendered at the bottom of a tool card. Toggles
 * an inline expanded section. Stops propagation so a surrounding
 * clickable card (e.g. screen card's jump-to-screen) doesn't also fire.
 */
function CardExpandButton({
  expanded,
  onToggle,
  openLabel,
  closeLabel,
}: {
  expanded: boolean;
  onToggle: () => void;
  openLabel: string;
  closeLabel: string;
}) {
  return (
    <button
      type="button"
      className="oc-toolcard-expand"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-expanded={expanded}
    >
      <span>{expanded ? closeLabel : openLabel}</span>
      <span className="oc-toolcard-expand-caret" aria-hidden>
        {expanded ? "▴" : "▾"}
      </span>
    </button>
  );
}

/**
 * Scrollable pre-formatted code block shown inside an expanded card. Full
 * content, monospace, syntax-unaware (Sandpack handles real rendering).
 */
function CardFullCode({ code }: { code: string }) {
  return (
    <pre className="oc-toolcard-fullcode" aria-label="Full source">
      {code}
    </pre>
  );
}

/**
 * Scrollable pre block for raw reasoning / transcript dumps (review card,
 * future think-with-large-thought expansions). Italic to distinguish from
 * code content.
 */
function CardReasoningBlock({ text }: { text: string }) {
  return (
    <div className="oc-toolcard-reasoning" aria-label="Reasoning transcript">
      {text || "Reviewer is warming up…"}
    </div>
  );
}

/**
 * Human-readable label + glyph for compact tool chips. The compact-chip
 * fallback path (anything that isn't a screen op, code primitive, or data
 * entity) reads from here so chips render like "Searching web · oranges"
 * instead of the raw machine name "webSearch".
 */
function humanizeToolChipLabel(
  toolName: string,
  tp: ToolPart,
  phase: "streaming" | "running" | "done" | "error",
): { glyph: string; label: string } {
  const input = tp.input as Record<string, unknown> | undefined;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;

  const glyph =
    phase === "error"
      ? "⚠︎"
      : phase === "streaming"
        ? "✍︎"
        : phase === "running"
          ? "⏳"
          : "✨";

  switch (toolName) {
    case "webSearch": {
      const q = str(input?.query);
      return {
        glyph,
        label:
          phase === "error"
            ? `Web search failed${q ? ` — ${q}` : ""}`
            : phase === "done"
              ? `Web search${q ? ` · ${q}` : ""}`
              : q
                ? `Searching the web · ${q}`
                : "Searching the web…",
      };
    }
    case "searchCodebase": {
      const q = str(input?.query);
      const scope = str(input?.scope);
      const where = scope && scope !== "all" ? ` ${scope}` : "";
      return {
        glyph,
        label:
          phase === "error"
            ? `Search failed${q ? ` — ${q}` : ""}`
            : phase === "done"
              ? `Searched${where}${q ? ` · ${q}` : ""}`
              : `Searching${where}${q ? ` · ${q}` : "…"}`,
      };
    }
    case "useSkill": {
      const slug = str(input?.slug);
      return {
        glyph,
        label:
          phase === "error"
            ? `Skill failed${slug ? ` — ${slug}` : ""}`
            : phase === "done"
              ? `Loaded skill${slug ? ` · ${slug}` : ""}`
              : `Loading skill${slug ? ` · ${slug}` : "…"}`,
      };
    }
    case "writeNote": {
      const title = str(input?.title);
      return {
        glyph,
        label:
          phase === "error"
            ? `Note save failed${title ? ` — ${title}` : ""}`
            : phase === "done"
              ? `Saved note${title ? ` · ${title}` : ""}`
              : `Saving note${title ? ` · ${title}` : "…"}`,
      };
    }
    case "readNote":
      return {
        glyph,
        label:
          phase === "error"
            ? "Note open failed"
            : phase === "done"
              ? "Opened note"
              : "Opening note…",
      };
    case "reviewScreen":
      return {
        glyph,
        label:
          phase === "error"
            ? "Review failed"
            : phase === "done"
              ? "Review complete"
              : "Reviewing screen…",
      };
    case "createShape":
      return {
        glyph,
        label:
          phase === "error"
            ? "Sketch failed"
            : phase === "done"
              ? "Sketched on canvas"
              : "Sketching on canvas…",
      };
    default:
      return {
        glyph,
        label: toolName + (phase === "streaming" || phase === "running" ? "…" : ""),
      };
  }
}

/**
 * Rich card for `createComponent` / `createService` — code primitives that
 * stream their body like a screen does but aren't screens. We reuse the
 * same card shell (StreamingCodeTail + sparkline + status) so the agent
 * writing a shared Button feels identical to writing a screen.
 */
function CodePrimitiveCard({ part }: { part: Record<string, unknown> }) {
  const tp = part as unknown as ToolPart;
  const toolName = tp.type.replace("tool-", "");
  const state = tp.state;
  const isError =
    state === "output-error" ||
    (state === "output-available" && tp.output?.ok === false);
  const isStreaming = state === "input-streaming";
  const isRunning = state === "input-available";
  const isDone = state === "output-available" && !isError;

  const input = tp.input as
    | { name?: string; description?: string; code?: string }
    | undefined;
  const name = input?.name ?? "";
  const description = input?.description;
  const code = input?.code ?? "";
  const lineCount = code ? code.split("\n").length : 0;

  const sparkSamples = useStreamingSparkline(isStreaming, lineCount);

  const [expanded, setExpanded] = useState(false);

  const isComponent = toolName === "createComponent";
  const kindLabel = isComponent ? "component" : "service";
  const glyph = isComponent ? "◨" : "⚙︎";
  const verbStreaming = isComponent ? "Extracting" : "Creating";
  const verbDone = isComponent ? "Extracted" : "Created";
  const verbError = isComponent ? "Extract" : "Create";

  const nameSuffix = name ? ` '${name}'` : "";
  const title = isError
    ? `${verbError} ${kindLabel}${nameSuffix} failed`
    : isDone
      ? `${verbDone} ${kindLabel}${nameSuffix}`
      : `${verbStreaming} ${kindLabel}${nameSuffix}`;

  const status = isError
    ? "Error"
    : isStreaming
      ? `Writing${lineCount ? ` · ${lineCount} ${lineCount === 1 ? "line" : "lines"}` : "…"}`
      : isRunning
        ? "Saving…"
        : isDone
          ? tp.output?.noop
            ? "No change"
            : "Ready"
          : "";

  const errorMsg =
    (tp.output?.error as string | undefined) ??
    tp.errorText ??
    (isError ? "Tool returned an error" : undefined);

  return (
    <div
      className={
        "oc-toolcard" +
        (isStreaming ? " oc-toolcard--streaming" : "") +
        (isError ? " oc-toolcard--error" : "") +
        (isDone ? " oc-toolcard--done" : "")
      }
    >
      <div className="oc-toolcard-icon" aria-hidden>
        {glyph}
      </div>
      <div className="oc-toolcard-body">
        <div className="oc-toolcard-title">
          <span className="oc-toolcard-verb">{title}</span>
        </div>
        {description && !isError && (
          <div className="oc-toolcard-sub">{description}</div>
        )}
        {status && !isError && (
          <div className="oc-toolcard-status">
            <span className="oc-toolcard-dot" aria-hidden />
            <span className="oc-tabular">{status}</span>
            {isStreaming && sparkSamples.length > 1 && (
              <StreamingSparkline samples={sparkSamples} />
            )}
          </div>
        )}
        {isStreaming && code && <StreamingCodeTail code={code} />}
        {isError && errorMsg && (
          <div className="oc-toolcard-err" title={errorMsg}>
            {errorMsg}
          </div>
        )}
        {code && !isError && (
          <CardExpandButton
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            openLabel={isDone ? "Show full code" : "Show full stream"}
            closeLabel={isDone ? "Hide full code" : "Hide full stream"}
          />
        )}
        {expanded && code && !isError && <CardFullCode code={code} />}
      </div>
    </div>
  );
}

/**
 * Rich card for `defineDataEntity`. No streaming code tail — the schema
 * arrives small and fast, and row seeds are generated by a background
 * sub-agent that isn't visible to this card. We show the fields as small
 * pills and the row count as the headline number.
 */
function DataEntityCard({ part }: { part: Record<string, unknown> }) {
  const tp = part as unknown as ToolPart;
  const state = tp.state;
  const isError =
    state === "output-error" ||
    (state === "output-available" && tp.output?.ok === false);
  const isStreaming = state === "input-streaming";
  const isRunning = state === "input-available";
  const isDone = state === "output-available" && !isError;

  const input = tp.input as
    | {
        name?: string;
        singular?: string;
        description?: string;
        fields?: Array<{ name?: string; type?: string; description?: string }>;
        rowCount?: number;
      }
    | undefined;

  const name = input?.name ?? "";
  const singular = input?.singular;
  const description = input?.description;
  const fields = Array.isArray(input?.fields) ? input!.fields! : [];
  const rowCount =
    typeof input?.rowCount === "number" ? input!.rowCount! : undefined;

  const [expanded, setExpanded] = useState(false);

  const nameSuffix = name ? ` '${name}'` : "";
  const title = isError
    ? `Define data${nameSuffix} failed`
    : isDone
      ? `Defined data${nameSuffix}`
      : `Defining data${nameSuffix}`;

  const status = isError
    ? "Error"
    : isStreaming
      ? fields.length > 0
        ? `Writing schema · ${fields.length} field${fields.length === 1 ? "" : "s"}`
        : "Writing schema…"
      : isRunning
        ? rowCount
          ? `Seeding ${rowCount} rows…`
          : "Seeding rows…"
        : isDone
          ? rowCount
            ? `${rowCount} rows ready`
            : "Schema ready"
          : "";

  const errorMsg =
    (tp.output?.error as string | undefined) ??
    tp.errorText ??
    (isError ? "Tool returned an error" : undefined);

  return (
    <div
      className={
        "oc-toolcard" +
        (isStreaming ? " oc-toolcard--streaming" : "") +
        (isError ? " oc-toolcard--error" : "") +
        (isDone ? " oc-toolcard--done" : "")
      }
    >
      <div className="oc-toolcard-icon" aria-hidden>
        ▦
      </div>
      <div className="oc-toolcard-body">
        <div className="oc-toolcard-title">
          <span className="oc-toolcard-verb">{title}</span>
          {singular && !isError && (
            <>
              <span className="oc-toolcard-sep">·</span>
              <span className="oc-toolcard-viewport">{singular}</span>
            </>
          )}
        </div>
        {description && !isError && (
          <div className="oc-toolcard-sub">{description}</div>
        )}
        {status && !isError && (
          <div className="oc-toolcard-status">
            <span className="oc-toolcard-dot" aria-hidden />
            <span className="oc-tabular">{status}</span>
          </div>
        )}
        {fields.length > 0 && !isError && !expanded && (
          <div className="oc-toolcard-fields">
            {fields.slice(0, 10).map((f, i) => (
              <span key={i} className="oc-toolcard-field">
                <span className="oc-toolcard-field-name">
                  {f.name ?? "field"}
                </span>
                {f.type && (
                  <span className="oc-toolcard-field-type">{f.type}</span>
                )}
              </span>
            ))}
            {fields.length > 10 && (
              <span className="oc-toolcard-field oc-toolcard-field--more">
                +{fields.length - 10}
              </span>
            )}
          </div>
        )}
        {isError && errorMsg && (
          <div className="oc-toolcard-err" title={errorMsg}>
            {errorMsg}
          </div>
        )}
        {fields.length > 0 && !isError && (
          <CardExpandButton
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            openLabel={`Show all ${fields.length} field${fields.length === 1 ? "" : "s"}`}
            closeLabel="Hide fields"
          />
        )}
        {expanded && fields.length > 0 && !isError && (
          <ul className="oc-toolcard-fields-full">
            {fields.map((f, i) => (
              <li key={i} className="oc-toolcard-field-row">
                <span className="oc-toolcard-field-name">
                  {f.name ?? "field"}
                </span>
                {f.type && (
                  <span className="oc-toolcard-field-type">{f.type}</span>
                )}
                {f.description && (
                  <span className="oc-toolcard-field-desc">
                    {f.description}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Card for `reviewScreen`. The reviewer runs its own Kimi call server-side
 * with thinking ON; `/api/review-screen` streams both the reasoning and
 * the JSON body back as NDJSON, which the client pushes into
 * reviewStreamStore. This card subscribes so the user can watch the
 * reviewer think in real time, and after it finishes the same transcript
 * stays expandable so you can read back what it concluded.
 */
function ReviewScreenCard({ part }: { part: Record<string, unknown> }) {
  const { editor } = useEditorRef();
  const tp = part as unknown as ToolPart;
  const toolCallId = tp.toolCallId ?? "";
  const state = tp.state;
  const isError =
    state === "output-error" ||
    (state === "output-available" && tp.output?.ok === false);
  const isRunning = state === "input-available";
  const isDone = state === "output-available" && !isError;

  const [streamEntry, setStreamEntry] = useState(() =>
    reviewStreamStore.get(toolCallId),
  );
  useEffect(() => {
    if (!toolCallId) return;
    setStreamEntry(reviewStreamStore.get(toolCallId));
    return reviewStreamStore.subscribe(toolCallId, setStreamEntry);
  }, [toolCallId]);

  const output = tp.output as
    | {
        ok?: boolean;
        id?: string;
        screenName?: string;
        summary?: string;
        issues?: Array<{
          severity?: string;
          category?: string;
          location?: string;
          problem?: string;
          fix?: string;
        }>;
        error?: string;
      }
    | undefined;

  const screenId = output?.id ?? (tp.input?.id as string | undefined);
  const shape =
    screenId && editor
      ? (editor.getShape(screenId as ScreenShape["id"]) as
          | ScreenShape
          | undefined)
      : undefined;
  const screenName = output?.screenName ?? shape?.props.name ?? "screen";

  // Prefer live store issues while streaming so the card populates without
  // waiting for the final tool result. Fall back to the tool result's
  // issues array once the run finishes (covers consumers that mount AFTER
  // the stream completed).
  const liveIssues = streamEntry.issues ?? [];
  const issues =
    isDone && output?.issues && output.issues.length > 0
      ? output.issues
      : liveIssues.length > 0
        ? liveIssues
        : (output?.issues ?? []);
  const issueCount = issues.length;
  const summary = output?.summary ?? streamEntry.summary;
  const errorMsg =
    output?.error ?? streamEntry.error ?? tp.errorText ??
    (isError ? "Reviewer failed" : undefined);

  const isStreaming = streamEntry.status === "streaming" && !isDone && !isError;
  const hasReasoning = streamEntry.reasoning.length > 0;
  const thinks = streamEntry.thinks ?? [];
  const subReviewers = streamEntry.subReviewers ?? [];

  const [expanded, setExpanded] = useState(false);
  // Auto-expand while streaming so the user sees the live reasoning
  // without having to click. Collapse once done so the chat stays clean;
  // user can re-open to read the full transcript.
  useEffect(() => {
    if (isStreaming) setExpanded(true);
    else if (isDone) setExpanded(false);
  }, [isStreaming, isDone]);

  const runningSubs = subReviewers.filter((s) => s.status === "running").length;
  const statusLabel = isError
    ? "Error"
    : isStreaming
      ? runningSubs > 0
        ? `${runningSubs} specialist${runningSubs === 1 ? "" : "s"} running · ${issueCount} issue${issueCount === 1 ? "" : "s"}`
        : issueCount > 0
          ? `${issueCount} issue${issueCount === 1 ? "" : "s"} so far…`
          : hasReasoning
            ? `Thinking · ${streamEntry.reasoning.length} chars`
            : "Reading code…"
      : isRunning
        ? "Finalising…"
        : isDone
          ? issueCount > 0
            ? `${issueCount} issue${issueCount === 1 ? "" : "s"}`
            : "Clean"
          : "";

  const title = isError
    ? `Review of '${screenName}' failed`
    : isDone
      ? `Reviewed '${screenName}'`
      : `Reviewing '${screenName}'…`;

  const clickable = isDone && !!screenId && !!editor;
  const jumpToScreen = () => {
    if (!editor || !screenId) return;
    editor.select(screenId as ScreenShape["id"]);
    editor.zoomToSelection({ animation: { duration: 250 } });
  };

  return (
    <div
      className={
        "oc-toolcard oc-toolcard--review" +
        (isStreaming ? " oc-toolcard--streaming" : "") +
        (isError ? " oc-toolcard--error" : "") +
        (isDone ? " oc-toolcard--done" : "") +
        (clickable ? " oc-toolcard--clickable" : "") +
        (expanded ? " oc-toolcard--expanded" : "")
      }
      onClick={clickable ? jumpToScreen : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                jumpToScreen();
              }
            }
          : undefined
      }
    >
      <div className="oc-toolcard-icon" aria-hidden>
        🔍
      </div>
      <div className="oc-toolcard-body">
        <div className="oc-toolcard-title">
          <span className="oc-toolcard-verb">{title}</span>
        </div>
        {statusLabel && !isError && (
          <div className="oc-toolcard-status">
            <span className="oc-toolcard-dot" aria-hidden />
            <span className="oc-tabular">{statusLabel}</span>
          </div>
        )}
        {summary && !isError && (
          <div className="oc-toolcard-sub">{summary}</div>
        )}
        {isError && errorMsg && (
          <div className="oc-toolcard-err" title={errorMsg}>
            {errorMsg}
          </div>
        )}
        {(hasReasoning || issueCount > 0 || isStreaming) && !isError && (
          <CardExpandButton
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            openLabel={
              isStreaming
                ? "Show live thinking"
                : issueCount > 0
                  ? "Show issues + reasoning"
                  : "Show reasoning"
            }
            closeLabel={
              isStreaming
                ? "Hide live thinking"
                : issueCount > 0
                  ? "Hide issues + reasoning"
                  : "Hide reasoning"
            }
          />
        )}
        {expanded && !isError && (
          <div className="oc-toolcard-expanded-body">
            {subReviewers.length > 0 && (
              <div className="oc-review-subs">
                {subReviewers.map((s) => (
                  <span
                    key={s.focus}
                    className="oc-review-sub-chip"
                    data-status={s.status}
                    title={
                      s.status === "running"
                        ? `Running ${s.focus} specialist…`
                        : s.status === "error"
                          ? `Failed: ${s.error ?? "error"}`
                          : `${s.focus}: ${s.issueCount} issue${s.issueCount === 1 ? "" : "s"}`
                    }
                  >
                    <span className="oc-review-sub-dot" />
                    {s.focus}
                    {s.status === "done" && s.issueCount > 0 && (
                      <span className="oc-review-sub-count">
                        {s.issueCount}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
            {thinks.length > 0 && (
              <div className="oc-review-thinks">
                {thinks.map((t, i) => (
                  <div key={i} className="oc-review-think">
                    <span className="oc-review-think-topic">{t.topic}</span>
                    <span className="oc-review-think-body">{t.thought}</span>
                  </div>
                ))}
              </div>
            )}
            {issues.length > 0 && (
              <ul className="oc-review-issues">
                {issues.map((iss, i) => (
                  <li
                    key={i}
                    className="oc-review-issue"
                    data-severity={iss.severity ?? "low"}
                  >
                    <div className="oc-review-issue-head">
                      <span
                        className="oc-review-issue-sev"
                        data-severity={iss.severity ?? "low"}
                      >
                        {iss.severity ?? "low"}
                      </span>
                      {iss.category && (
                        <span className="oc-review-issue-cat">
                          {iss.category}
                        </span>
                      )}
                      {iss.location && (
                        <span className="oc-review-issue-loc">
                          {iss.location}
                        </span>
                      )}
                    </div>
                    {iss.problem && (
                      <div className="oc-review-issue-problem">
                        {iss.problem}
                      </div>
                    )}
                    {iss.fix && (
                      <div className="oc-review-issue-fix">
                        <span className="oc-review-issue-fix-label">Fix</span>
                        <span>{iss.fix}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {hasReasoning && (
              <div className="oc-review-reasoning-wrap">
                <div className="oc-review-reasoning-label">
                  Reviewer reasoning
                </div>
                <CardReasoningBlock text={streamEntry.reasoning} />
              </div>
            )}
          </div>
        )}
      </div>
      {clickable && (
        <span className="oc-toolcard-cta" aria-hidden>
          View →
        </span>
      )}
    </div>
  );
}

function ToolCallCard({
  part,
  muted,
}: {
  part: Record<string, unknown>;
  muted?: boolean;
}) {
  const { editor } = useEditorRef();
  const tp = part as unknown as ToolPart;
  const toolName = tp.type.replace("tool-", "");
  const state = tp.state;
  const isError =
    state === "output-error" ||
    (state === "output-available" && tp.output?.ok === false);
  const isStreaming = state === "input-streaming";
  const isRunning = state === "input-available";
  const isDone = state === "output-available" && !isError;

  // Expand-to-inspect state. Separate from click-to-jump (which stays
  // tied to the card body) so the user can do either action without
  // losing the other. Controlled by CardExpandButton, which
  // stopPropagation's the click.
  const [expanded, setExpanded] = useState(false);

  const errorMsg =
    (tp.output?.error as string | undefined) ??
    tp.errorText ??
    (isError ? "Tool returned an error" : undefined);

  // Route to dedicated cards for code primitives + data entities + review
  // first. They have their own streaming models — code via tp.input.code
  // for createComponent/createService; schema + async seeds for
  // defineDataEntity; reasoning + NDJSON for reviewScreen — and don't fit
  // the screen-card shape cleanly.
  if (toolName === "createComponent" || toolName === "createService") {
    return <CodePrimitiveCard part={part} />;
  }
  if (toolName === "defineDataEntity") {
    return <DataEntityCard part={part} />;
  }
  if (toolName === "reviewScreen") {
    return <ReviewScreenCard part={part} />;
  }

  // Screen-card category — createSheetView joins the usual screen ops
  // because its client-side handler streams code into subAgentCodeStore
  // under the same toolCallId as delegateScreen and produces a real
  // screen shape with an output.id we can click-to-jump to.
  const isScreenCard =
    toolName === "createScreen" ||
    toolName === "updateScreen" ||
    toolName === "editScreen" ||
    toolName === "delegateScreen" ||
    toolName === "createSheetView";

  // Live code stream: for delegateScreen and createSheetView the code
  // doesn't arrive in the tool-input stream — it arrives via our own
  // client-side fetch into subAgentCodeStore. Subscribe so the card
  // re-renders as chunks land.
  const subAgentToolCallId =
    (toolName === "delegateScreen" || toolName === "createSheetView")
      ? tp.toolCallId
      : null;
  const [subAgentCode, setSubAgentCode] = useState<string>(() =>
    subAgentToolCallId ? subAgentCodeStore.get(subAgentToolCallId) : "",
  );
  useEffect(() => {
    if (!subAgentToolCallId) return;
    setSubAgentCode(subAgentCodeStore.get(subAgentToolCallId));
    return subAgentCodeStore.subscribe(subAgentToolCallId, setSubAgentCode);
  }, [subAgentToolCallId]);

  // For createScreen/updateScreen the code arrives via tool-input stream;
  // for delegateScreen + createSheetView it arrives via subAgentCodeStore.
  // Unify both paths into a single "live code" value the card can read.
  const liveStreamingCode = subAgentToolCallId
    ? subAgentCode
    : (tp.input?.code as string | undefined) ?? "";
  // delegateScreen + createSheetView stay "working" after the tool-input
  // finishes because our own background fetch is still streaming. Treat
  // as streaming as long as there's sub-agent code actively growing and
  // no final output yet.
  const isDelegateStreaming =
    !!subAgentToolCallId && !isDone && !isError && !!subAgentCode;
  const effectiveIsStreaming = isStreaming || isDelegateStreaming;
  const streamingLines = liveStreamingCode
    ? liveStreamingCode.split("\n").length
    : 0;
  const sparkSamples = useStreamingSparkline(
    effectiveIsStreaming && isScreenCard,
    streamingLines,
  );

  // Everything else (webSearch, searchCodebase, useSkill, writeNote,
  // readNote, reviewScreen, createShape, and any future tool we haven't
  // dressed up) renders as a humanized compact chip.
  if (!isScreenCard) {
    const phase: "streaming" | "running" | "done" | "error" = isError
      ? "error"
      : isStreaming
        ? "streaming"
        : isRunning
          ? "running"
          : "done";
    const { glyph, label } = humanizeToolChipLabel(toolName, tp, phase);
    if (isError) {
      return (
        <div>
          <span className="oc-msg-tool oc-msg-tool--error" title={errorMsg}>
            <span aria-hidden>{glyph}</span>
            <span className="truncate">{label}</span>
          </span>
        </div>
      );
    }
    return (
      <div>
        <span
          className={
            "oc-msg-tool" + (isStreaming ? " oc-msg-tool--streaming" : "")
          }
        >
          <span aria-hidden>{glyph}</span>
          <span className="truncate">{label}</span>
        </span>
      </div>
    );
  }

  // delegateScreen tool cards get a personal name prefix ("Henk", "May") so
  // a list of six parallel cards feels like six individual workers and not
  // a faceless stack of "Sub-agent building X" lines.
  const agentName =
    toolName === "delegateScreen" && tp.toolCallId
      ? getAgentName(tp.toolCallId)
      : undefined;
  const verb = agentName
    ? "is building"
    : toolName === "createScreen"
      ? "Creating"
      : toolName === "delegateScreen"
        ? "Sub-agent building"
        : toolName === "createSheetView"
          ? "Adding sheet"
          : toolName === "editScreen"
            ? "Editing"
            : "Updating";
  const doneVerb = agentName
    ? "built"
    : toolName === "createScreen"
      ? "Created"
      : toolName === "delegateScreen"
        ? "Built"
        : toolName === "createSheetView"
          ? "Added sheet"
          : toolName === "editScreen"
            ? "Edited"
            : "Updated";

  // Resolve the screen name — prefer streaming input, fall back to shape
  // lookup (so an updateScreen without an input.name still gets a label).
  const inputName = tp.input?.name;
  const outputId = tp.output?.id;
  const inputId = tp.input?.id;
  const resolvedId = outputId ?? inputId;
  const shape =
    resolvedId && editor
      ? (editor.getShape(resolvedId as ScreenShape["id"]) as
          | ScreenShape
          | undefined)
      : undefined;
  const shapeName = !inputName ? shape?.props.name : undefined;
  const displayName = inputName ?? shapeName ?? "screen";

  const viewportId = tp.input?.viewportId ?? shape?.props.viewportId;
  const viewport = viewportId
    ? VIEWPORT_PRESETS_BY_ID[viewportId]
    : undefined;
  const viewportLabel = viewport?.label;

  const statusLabel = isError
    ? "Error"
    : effectiveIsStreaming
      ? `Writing${streamingLines ? ` · ${streamingLines} ${streamingLines === 1 ? "line" : "lines"}` : "…"}`
      : isRunning
        ? "Compiling…"
        : isDone
          ? tp.output?.noop
            ? "No change"
            : "Ready"
          : "";

  const jumpToScreen = () => {
    if (!editor || !resolvedId) return;
    const s = editor.getShape(resolvedId as ScreenShape["id"]);
    if (!s) return;
    editor.select(resolvedId as ScreenShape["id"]);
    editor.zoomToSelection({ animation: { duration: 250 } });
  };

  const clickable = isDone && !!resolvedId && !!editor && !muted;

  const linesAdded = tp.output?.linesAdded ?? 0;
  const linesRemoved = tp.output?.linesRemoved ?? 0;
  const totalLines = tp.output?.totalLines ?? 0;
  const hasDiff = isDone && (linesAdded > 0 || linesRemoved > 0 || totalLines > 0);

  const thumbState: "streaming" | "done" | "error" = isError
    ? "error"
    : isDone
      ? "done"
      : "streaming";

  return (
    <div
      className={
        "oc-toolcard" +
        (isStreaming ? " oc-toolcard--streaming" : "") +
        (isError ? " oc-toolcard--error" : "") +
        (isDone ? " oc-toolcard--done" : "") +
        (clickable ? " oc-toolcard--clickable" : "") +
        (muted ? " oc-toolcard--muted" : "")
      }
      onClick={clickable ? jumpToScreen : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                jumpToScreen();
              }
            }
          : undefined
      }
    >
      {isDone || isError ? (
        <ToolThumbnail
          viewportId={viewportId}
          name={displayName}
          state={thumbState}
        />
      ) : (
        <div className="oc-toolcard-icon" aria-hidden>
          {toolName === "createScreen" ||
          toolName === "delegateScreen" ||
          toolName === "createSheetView"
            ? "✦"
            : "✎"}
        </div>
      )}
      <div className="oc-toolcard-body">
        <div className="oc-toolcard-title">
          <span className="oc-toolcard-verb">
            {agentName ? (
              <>
                <span className="oc-toolcard-agent">{agentName}</span>
                {" " + (isError ? `${verb} ${displayName} — failed` : isDone ? `${doneVerb} ${displayName}` : `${verb} ${displayName}`)}
              </>
            ) : isError ? (
              `${doneVerb} ${displayName} failed`
            ) : isDone ? (
              `${doneVerb} ${displayName}`
            ) : (
              `${verb} ${displayName}`
            )}
          </span>
          {viewportLabel && !isError && (
            <>
              <span className="oc-toolcard-sep">·</span>
              <span className="oc-toolcard-viewport oc-tabular">
                {viewportLabel}
              </span>
            </>
          )}
        </div>
        {statusLabel && !isError && (
          <div className="oc-toolcard-status">
            <span className="oc-toolcard-dot" aria-hidden />
            <span className="oc-tabular">{statusLabel}</span>
            {isStreaming && sparkSamples.length > 1 && (
              <StreamingSparkline samples={sparkSamples} />
            )}
            {hasDiff && !isStreaming && !isRunning && (
              <span className="oc-toolcard-diff oc-tabular" aria-hidden>
                {linesAdded > 0 && (
                  <span className="oc-toolcard-diff-add">+{linesAdded}</span>
                )}
                {linesRemoved > 0 && (
                  <span className="oc-toolcard-diff-rem">−{linesRemoved}</span>
                )}
                {linesAdded === 0 && linesRemoved === 0 && totalLines > 0 && (
                  <span className="oc-toolcard-diff-neutral">
                    {totalLines} lines
                  </span>
                )}
              </span>
            )}
          </div>
        )}
        {effectiveIsStreaming && liveStreamingCode && (
          <StreamingCodeTail code={liveStreamingCode} />
        )}
        {isError && errorMsg && (
          <div className="oc-toolcard-err" title={errorMsg}>
            {errorMsg}
          </div>
        )}
        {(() => {
          // Expanded view reads the authoritative source from the screen
          // shape when the tool is done (so the user sees the final
          // post-compile code, not a truncated stream tail); falls back to
          // the live streaming buffer while the sub-agent is still writing.
          const fullCode =
            (isDone && shape?.props.code) ||
            (effectiveIsStreaming && liveStreamingCode) ||
            "";
          if (!fullCode || isError) return null;
          return (
            <>
              <CardExpandButton
                expanded={expanded}
                onToggle={() => setExpanded((v) => !v)}
                openLabel={isDone ? "Show full code" : "Show full stream"}
                closeLabel={isDone ? "Hide full code" : "Hide full stream"}
              />
              {expanded && <CardFullCode code={fullCode} />}
            </>
          );
        })()}
      </div>
      {clickable && (
        <span className="oc-toolcard-cta" aria-hidden>
          View →
        </span>
      )}
    </div>
  );
}

function PaperclipIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10.5 4 5.7 8.8a1.8 1.8 0 1 0 2.6 2.5l5-5a3 3 0 0 0-4.2-4.3L3.8 7.2a4.2 4.2 0 1 0 5.9 5.9l3.8-3.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Small "reset" icon button in the chat header. Confirms before nuking
 * every persisted store and reloading the page — purely a
 * testing-affordance, not something we'd expose to real end users.
 */
function ResetButton() {
  return (
    <button
      type="button"
      className="oc-header-reset"
      title="Reset the whole project (clears canvas, chat, notes, tokens, everything)"
      aria-label="Reset project"
      onClick={() => {
        const ok = window.confirm(
          "Reset the entire project?\n\nThis clears the canvas, chat history, notes, tokens, components, services, data, review streams, and reloads the page.\n\nCan't be undone.",
        );
        if (ok) resetProject();
      }}
    >
      <ResetGlyph />
    </button>
  );
}

function ResetGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8a5 5 0 1 0 1.5-3.5M3 3v2.5h2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function QueuedGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M1.5 2.5h7M1.5 5h7M1.5 7.5h4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M2 2l6 6M8 2l-6 6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Code tab — full-project file explorer. Left: grouped file tree
 * (/screens, /components, /services, /data, /tokens.css). Right: CodeEditor
 * bound to whichever file the user selected. Screens/components/services are
 * editable; data and tokens.css are synthesized views (read-only) whose
 * source-of-truth is the structured editor in the Data/Tokens tabs.
 *
 * Active file persists across selections in memory for the session; when the
 * user selects a screen on the canvas, we auto-switch the viewer to its file
 * so the Code tab always reflects the canvas focus without replacing the
 * file-tree navigation.
 */
type CodeFileKey =
  | `screen:${string}`
  | `component:${string}`
  | `service:${string}`
  | `data:${string}`
  | "tokens";

function CodeTabContent() {
  const { editor } = useEditorRef();
  const tick = useCanvasTick();

  const [components, setComponents] = useState<DesignComponent[]>(() =>
    designComponentsStore.get(),
  );
  const [services, setServices] = useState<DesignService[]>(() =>
    designServicesStore.get(),
  );
  const [entities, setEntities] = useState<DataEntity[]>(() =>
    designDataStore.get(),
  );
  const [tokensVersion, setTokensVersion] = useState(0);

  useEffect(() => {
    const uC = designComponentsStore.subscribe(setComponents);
    const uS = designServicesStore.subscribe(setServices);
    const uD = designDataStore.subscribe(setEntities);
    const uT = designTokensStore.subscribe(() =>
      setTokensVersion((v) => v + 1),
    );
    return () => {
      uC();
      uS();
      uD();
      uT();
    };
  }, []);

  const screens = useMemo(() => {
    if (!editor) return [] as ScreenShape[];
    return editor.getCurrentPageShapes();
    // tick is the dependency — re-reads the store whenever any shape mutates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, tick]);

  const [active, setActive] = useState<CodeFileKey | null>(null);

  // Auto-target the canvas-selected screen so jumping between screens on the
  // canvas keeps the Code tab in sync. Never overrides a manual pick of a
  // non-screen file (e.g. the user opened /tokens.css — stay there).
  const canvasSelectedScreenId = useValue(
    "code-tab-canvas-selection",
    () => {
      if (!editor) return null;
      const ids = editor.getSelectedShapeIds();
      if (ids.length !== 1) return null;
      const shape = editor.getShape(ids[0]);
      if (!shape || shape.type !== "screen") return null;
      return shape.id as string;
    },
    [editor],
  );
  useEffect(() => {
    if (!canvasSelectedScreenId) return;
    if (active && !active.startsWith("screen:")) return;
    setActive(`screen:${canvasSelectedScreenId}`);
  }, [canvasSelectedScreenId, active]);

  // Pick a sensible first file on mount if nothing is active yet.
  useEffect(() => {
    if (active !== null) return;
    if (screens.length > 0) {
      setActive(`screen:${screens[0].id}`);
    } else if (components.length > 0) {
      setActive(`component:${components[0].id}`);
    } else {
      setActive("tokens");
    }
  }, [active, screens, components]);

  const tokensCss = useMemo(
    () => buildTokensCss(designTokensStore.get()),
    // tokensVersion advances on every token-store emit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tokensVersion],
  );

  const dataFiles = useMemo(() => buildDataFiles(entities), [entities]);

  const file = useMemo((): {
    key: CodeFileKey;
    path: string;
    code: string;
    readOnly: boolean;
    onChange?: (next: string) => void;
  } | null => {
    if (!active) return null;
    if (active === "tokens") {
      return {
        key: "tokens",
        path: "/tokens.css",
        code: tokensCss,
        readOnly: true,
      };
    }
    if (active.startsWith("screen:")) {
      const id = active.slice("screen:".length);
      const s = screens.find((x) => String(x.id) === id);
      if (!s || !editor) return null;
      return {
        key: active,
        path: `/screens/${s.props.name}.tsx`,
        code: s.props.code,
        readOnly: false,
        onChange: (next) =>
          editor.updateShape({
            id: s.id,
            type: "screen",
            props: { code: next },
          }),
      };
    }
    if (active.startsWith("component:")) {
      const id = active.slice("component:".length);
      const c = components.find((x) => x.id === id);
      if (!c) return null;
      return {
        key: active,
        path: `/components/${c.name}.tsx`,
        code: c.code,
        readOnly: false,
        onChange: (next) => designComponentsStore.upsert({ ...c, code: next }),
      };
    }
    if (active.startsWith("service:")) {
      const id = active.slice("service:".length);
      const s = services.find((x) => x.id === id);
      if (!s) return null;
      return {
        key: active,
        path: `/services/${s.name}.ts`,
        code: s.code,
        readOnly: false,
        onChange: (next) => designServicesStore.upsert({ ...s, code: next }),
      };
    }
    if (active.startsWith("data:")) {
      const id = active.slice("data:".length);
      const e = entities.find((x) => x.id === id);
      if (!e) return null;
      const fpath = `/data/${e.name}.js`;
      return {
        key: active,
        path: fpath,
        code: dataFiles[fpath] ?? "",
        readOnly: true,
      };
    }
    return null;
  }, [active, screens, components, services, entities, dataFiles, tokensCss, editor]);

  return (
    <div className="oc-code-tab">
      <aside className="oc-code-tree" aria-label="Project files">
        <CodeTreeGroup
          label="screens"
          count={screens.length}
          items={screens.map((s) => ({
            key: `screen:${String(s.id)}` as CodeFileKey,
            name: `${s.props.name}.tsx`,
          }))}
          active={active}
          onSelect={setActive}
        />
        <CodeTreeGroup
          label="components"
          count={components.length}
          items={components.map((c) => ({
            key: `component:${c.id}` as CodeFileKey,
            name: `${c.name}.tsx`,
          }))}
          active={active}
          onSelect={setActive}
        />
        <CodeTreeGroup
          label="services"
          count={services.length}
          items={services.map((s) => ({
            key: `service:${s.id}` as CodeFileKey,
            name: `${s.name}.ts`,
          }))}
          active={active}
          onSelect={setActive}
        />
        <CodeTreeGroup
          label="data"
          count={entities.length}
          items={entities.map((e) => ({
            key: `data:${e.id}` as CodeFileKey,
            name: `${e.name}.js`,
            badge: "ro",
          }))}
          active={active}
          onSelect={setActive}
        />
        <CodeTreeGroup
          label="tokens"
          count={1}
          items={[
            { key: "tokens" as CodeFileKey, name: "tokens.css", badge: "ro" },
          ]}
          active={active}
          onSelect={setActive}
        />
      </aside>

      <div className="oc-code-view">
        {file ? (
          <>
            <div className="oc-code-path" title={file.path}>
              <span style={{ color: "var(--text-tertiary)" }}>
                {file.path.slice(0, file.path.lastIndexOf("/") + 1)}
              </span>
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                {file.path.slice(file.path.lastIndexOf("/") + 1)}
              </span>
              {file.readOnly && (
                <span className="oc-code-readonly" aria-label="Read only">
                  read-only
                </span>
              )}
            </div>
            <div className="oc-code-editor-wrap">
              <CodeEditor
                key={file.key}
                value={file.code}
                onChange={file.onChange ?? (() => {})}
                readOnly={file.readOnly}
                fillParent
              />
            </div>
          </>
        ) : (
          <div
            className="flex flex-1 items-center justify-center p-6 text-center text-[13px]"
            style={{ color: "color-mix(in oklch, white 55%, transparent)" }}
          >
            <span>Select a file to view its source.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CodeTreeGroup({
  label,
  count,
  items,
  active,
  onSelect,
}: {
  label: string;
  count: number;
  items: Array<{ key: CodeFileKey; name: string; badge?: string }>;
  active: CodeFileKey | null;
  onSelect: (key: CodeFileKey) => void;
}) {
  return (
    <div className="oc-code-tree-group">
      <div className="oc-code-tree-head">
        <span>{label}</span>
        <span className="oc-tabular" style={{ color: "var(--text-tertiary)" }}>
          {count}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="oc-code-tree-empty">—</div>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                className="oc-code-tree-item"
                data-active={active === it.key || undefined}
                onClick={() => onSelect(it.key)}
                title={it.name}
              >
                <span className="oc-code-tree-name">{it.name}</span>
                {it.badge && (
                  <span className="oc-code-tree-badge">{it.badge}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  const variant = active ? "filled" : "outlined";
  const Icon = getIconComponent(icon, variant);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="oc-tab"
      data-active={active || undefined}
    >
      <span className="oc-tab-icon-wrap" aria-hidden>
        {Icon
          ? createElement(Icon, {
              size: 20,
              color: "currentColor",
              ariaHidden: true,
            })
          : null}
      </span>
    </button>
  );
}

export const ChatPanel = LeftPanel;


/**
 * The chat composer textarea, plus a minimal autocomplete popover that
 * surfaces agentation annotations when the user types `#`. Picking a row
 * inserts a `#N` token at the caret — `expandAnnotationReferences` later
 * expands each token into full annotation context at send time.
 */
function AnnotationAutocomplete({
  input,
  setInput,
  disabled,
  onSubmit,
  placeholder,
  onSlashCommandPick,
  editor,
}: {
  input: string;
  setInput: (s: string) => void;
  disabled: boolean;
  onSubmit: () => void;
  placeholder?: string;
  onSlashCommandPick?: (command: SlashCommand, args: string) => void;
  editor?: Editor | null;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [annotations, setAnnotations] = useState(() =>
    agentationAnnotationsStore.get(),
  );
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    setAnnotations(agentationAnnotationsStore.get());
    return agentationAnnotationsStore.subscribe(setAnnotations);
  }, []);

  // Work out whether the caret sits inside a `#N?` token. If so, expose the
  // token's start position + current query; otherwise the popover is closed.
  const token = useMemo(() => {
    const upTo = input.slice(0, caret);
    const m = /(^|\s)(#\d*)$/.exec(upTo);
    if (!m) return null;
    const full = m[2];
    return {
      start: upTo.length - full.length,
      query: full.slice(1), // drop leading '#'
    };
  }, [input, caret]);

  const matches = useMemo(() => {
    if (!token) return [];
    if (token.query === "") return annotations.map((a, i) => ({ ann: a, pin: i + 1 }));
    return annotations
      .map((a, i) => ({ ann: a, pin: i + 1 }))
      .filter(({ pin }) => String(pin).startsWith(token.query));
  }, [annotations, token]);

  // Slash-command detection — fires when the input is a leading `/token` with
  // NO trailing space yet. Once the user types a space after the command name
  // they're filling in args, so we close the popover and let them type freely.
  const slashToken = useMemo(() => {
    if (!onSlashCommandPick) return null;
    const m = /^\s*\/([a-z0-9-]*)$/i.exec(input);
    if (!m) return null;
    return { query: "/" + m[1].toLowerCase() };
  }, [input, onSlashCommandPick]);
  const slashMatches = useMemo(() => {
    if (!slashToken) return [];
    return matchSlashCommands(slashToken.query);
  }, [slashToken]);

  // @screen detection — anywhere in the input, caret immediately after a
  // `@slug-prefix` token. Matches only when the preceding character is
  // whitespace or the caret is at position 0 so email-like text doesn't
  // trigger the popover accidentally.
  const screenToken = useMemo(() => {
    if (!editor) return null;
    const upTo = input.slice(0, caret);
    const m = /(^|\s)@([a-z0-9-]*)$/i.exec(upTo);
    if (!m) return null;
    const full = "@" + m[2];
    return {
      start: upTo.length - full.length,
      query: m[2].toLowerCase(),
    };
  }, [input, caret, editor]);
  const screenList = useMemo(
    () => listScreenRefs(editor ?? null),
    [editor, input],
  );
  const screenMatches = useMemo(() => {
    if (!screenToken) return [];
    if (screenToken.query === "") return screenList;
    return screenList.filter(
      (s) =>
        s.slug.startsWith(screenToken.query) ||
        s.name.toLowerCase().includes(screenToken.query),
    );
  }, [screenList, screenToken]);

  useEffect(() => {
    setHighlight(0);
  }, [
    token?.query,
    matches.length,
    slashToken?.query,
    slashMatches.length,
    screenToken?.query,
    screenMatches.length,
  ]);

  const isOpen = !!token && matches.length > 0 && !disabled;
  const isSlashOpen =
    !!slashToken && slashMatches.length > 0 && !disabled && !isOpen;
  const isScreenOpen =
    !!screenToken &&
    screenMatches.length > 0 &&
    !disabled &&
    !isOpen &&
    !isSlashOpen;

  function insertPin(pin: number) {
    if (!token) return;
    const before = input.slice(0, token.start);
    const after = input.slice(caret);
    const next = `${before}#${pin} ${after}`;
    setInput(next);
    // Caret after the inserted token + space so typing continues naturally.
    const newCaret = before.length + `#${pin} `.length;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(newCaret, newCaret);
      setCaret(newCaret);
    });
  }

  // Pick a screen from the @ popover — writes the slug into the input
  // in place of the partial `@foo` token. Trailing space so the user
  // can keep typing or Enter to send.
  function pickScreen(ref: ScreenRef) {
    if (!screenToken) return;
    const before = input.slice(0, screenToken.start);
    const after = input.slice(caret);
    const next = `${before}@${ref.slug} ${after}`;
    setInput(next);
    const newCaret = before.length + `@${ref.slug} `.length;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(newCaret, newCaret);
      setCaret(newCaret);
    });
  }

  // Pick a slash command from the popover: commands with `noArgs` fire
  // immediately via the parent's dispatcher; commands with args get their
  // slug + a trailing space written into the input so the user can type
  // the args and hit Enter to submit.
  function pickSlashCommand(cmd: SlashCommand) {
    if (!onSlashCommandPick) return;
    if (cmd.noArgs) {
      onSlashCommandPick(cmd, "");
      return;
    }
    const next = cmd.slug + " ";
    setInput(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
      setCaret(next.length);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (isOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, matches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        const pick = matches[highlight];
        if (pick) {
          e.preventDefault();
          insertPin(pick.pin);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        // Drop the partial `#…` back to the prior character position so
        // the popover closes without erasing user text.
        const el = textareaRef.current;
        if (el) el.setSelectionRange(caret, caret);
        setCaret((c) => c); // no-op, forces re-render
        return;
      }
    }
    if (isSlashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, slashMatches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
        return;
      }
      if ((e.key === "Tab" || e.key === "Enter") && !e.shiftKey) {
        const pick = slashMatches[highlight];
        if (pick) {
          e.preventDefault();
          pickSlashCommand(pick);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        return;
      }
    }
    if (isScreenOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, screenMatches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
        return;
      }
      if ((e.key === "Tab" || e.key === "Enter") && !e.shiftKey) {
        const pick = screenMatches[highlight];
        if (pick) {
          e.preventDefault();
          pickScreen(pick);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        // Close the popover by stepping the caret back to where it was
        // so the partial `@...` stays in the input but popover closes.
        const el = textareaRef.current;
        if (el) el.setSelectionRange(caret, caret);
        setCaret((c) => c);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  // Resolve every distinct #N currently in the input so we can render a
  // "referenced pins" row below the textarea — makes it obvious which
  // annotations will be expanded at send time.
  const referenced = useMemo(() => {
    const set = new Set<number>();
    for (const m of input.matchAll(/(?:^|\s)#(\d+)\b/g)) {
      set.add(Number(m[1]));
    }
    return Array.from(set)
      .map((n) => ({ pin: n, ann: agentationAnnotationsStore.getByPinNumber(n) }))
      .filter((r) => !!r.ann);
  }, [input, annotations]);

  // Mirror of `referenced` but for `@screen` mentions.
  const referencedScreenList = useMemo(
    () => referencedScreens(input, editor ?? null),
    [input, editor],
  );

  return (
    <>
      {isScreenOpen && (
        <div className="oc-screen-autocomplete" role="listbox">
          <div className="oc-screen-autocomplete-head">
            {screenList.length === 0
              ? "No screens on the canvas yet"
              : "Reference a screen"}
          </div>
          {screenMatches.slice(0, 8).map((s, i) => (
            <button
              type="button"
              key={s.id}
              role="option"
              aria-selected={i === highlight}
              data-active={i === highlight || undefined}
              className="oc-screen-autocomplete-item"
              onMouseDown={(e) => {
                e.preventDefault();
                pickScreen(s);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="oc-screen-autocomplete-slug">@{s.slug}</span>
              <span className="oc-screen-autocomplete-name">{s.name}</span>
              <span className="oc-screen-autocomplete-viewport">
                {s.viewportId}
              </span>
            </button>
          ))}
        </div>
      )}
      {isSlashOpen && (
        <div className="oc-slash-autocomplete" role="listbox">
          <div className="oc-slash-autocomplete-head">Commands</div>
          {slashMatches.map((cmd, i) => (
            <button
              type="button"
              key={cmd.slug}
              role="option"
              aria-selected={i === highlight}
              data-active={i === highlight || undefined}
              className="oc-slash-autocomplete-item"
              onMouseDown={(e) => {
                e.preventDefault();
                pickSlashCommand(cmd);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="oc-slash-autocomplete-slug">{cmd.slug}</span>
              <span className="oc-slash-autocomplete-label">{cmd.label}</span>
              <span className="oc-slash-autocomplete-hint">
                {cmd.noArgs
                  ? cmd.hint
                  : cmd.argPlaceholder
                    ? `${cmd.hint} — ${cmd.argPlaceholder}`
                    : cmd.hint}
              </span>
            </button>
          ))}
          <div className="oc-slash-autocomplete-foot">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <span>navigate</span>
            <kbd>↵</kbd>
            <span>pick</span>
            <kbd>esc</kbd>
            <span>cancel</span>
          </div>
        </div>
      )}
      {isOpen && (
        <div className="oc-pin-autocomplete" role="listbox">
          <div className="oc-pin-autocomplete-head">
            Reference an annotation
          </div>
          {matches.slice(0, 6).map(({ ann, pin }, i) => (
            <button
              type="button"
              key={ann.id}
              role="option"
              aria-selected={i === highlight}
              data-active={i === highlight || undefined}
              className="oc-pin-autocomplete-item"
              onMouseDown={(e) => {
                e.preventDefault();
                insertPin(pin);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="oc-pin-autocomplete-num">#{pin}</span>
              <span className="oc-pin-autocomplete-el">{ann.element}</span>
              <span className="oc-pin-autocomplete-cm">
                {ann.comment.slice(0, 48)}
                {ann.comment.length > 48 ? "…" : ""}
              </span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setCaret(e.target.selectionStart);
        }}
        onKeyUp={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onClick={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? "Ask Claude to build a screen…  (type # to reference an annotation)"}
        disabled={disabled}
        rows={1}
      />
      {(referenced.length > 0 || referencedScreenList.length > 0) && (
        <div className="oc-pin-refs-row">
          {referencedScreenList.map((s) => (
            <span
              key={s.id}
              className="oc-pin-ref-chip oc-pin-ref-chip--screen"
              title={`@${s.slug} — ${s.name} (${s.viewportId})`}
            >
              <span className="oc-pin-ref-chip-num oc-pin-ref-chip-num--screen">
                @
              </span>
              <span className="oc-pin-ref-chip-el">{s.name}</span>
            </span>
          ))}
          {referenced.map(({ pin, ann }) =>
            ann ? (
              <span
                key={pin}
                className="oc-pin-ref-chip"
                title={`#${pin} — ${ann.element}: ${ann.comment.slice(0, 80)}`}
              >
                <span className="oc-pin-ref-chip-num">#{pin}</span>
                <span className="oc-pin-ref-chip-el">{ann.element}</span>
              </span>
            ) : null,
          )}
        </div>
      )}
    </>
  );
}
