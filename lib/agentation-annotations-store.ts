/**
 * Mirror of agentation's current annotations list, kept in sync from the
 * AgentationBar bridge via the library's onAnnotationAdd/Update/Delete/Clear
 * callbacks. Lets non-agentation parts of the app — the chat composer,
 * notifications, future surfaces — reference annotations by their visible
 * pin number (#1, #2…) without reaching into the library internals.
 */

import type { Annotation } from "@/components/Agentation";

type Listener = (list: Annotation[]) => void;

const listeners = new Set<Listener>();
let current: Annotation[] = [];

export const agentationAnnotationsStore = {
  get(): Annotation[] {
    return current;
  },
  set(list: Annotation[]): void {
    current = list;
    for (const l of listeners) l(current);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** Look up an annotation by its 1-indexed pin number (the visible
   *  number on its marker). Returns null if the index is out of range. */
  getByPinNumber(n: number): Annotation | null {
    if (n < 1 || n > current.length) return null;
    return current[n - 1] ?? null;
  },
};

/** Same markdown shape `AgentationBar` ships on "Fix" — reused for chat-
 *  composer chaining so the agent sees identical structure regardless of
 *  how the annotation entered the prompt. */
export function formatAnnotationAsFixPrompt(
  a: Annotation,
  pinNumber?: number,
): string {
  const lines: string[] = [];
  const header = pinNumber
    ? `### Feedback #${pinNumber} — \`${a.element}\``
    : `### Feedback on \`${a.element}\``;
  lines.push(header);
  lines.push("");
  lines.push(`**Selector:** \`${a.elementPath}\``);
  if (a.reactComponents) lines.push(`**Component:** ${a.reactComponents}`);
  if (a.sourceFile) lines.push(`**Source:** ${a.sourceFile}`);
  if (a.boundingBox) {
    lines.push(
      `**Box:** ${Math.round(a.boundingBox.width)}×${Math.round(a.boundingBox.height)}px @ (${Math.round(a.boundingBox.x)}, ${Math.round(a.boundingBox.y)})`,
    );
  }
  if (a.selectedText) {
    lines.push(`**Selected text:** "${a.selectedText.slice(0, 140)}"`);
  }
  lines.push("");
  lines.push("**Comment:**");
  lines.push(`> ${a.comment.split("\n").join("\n> ")}`);
  return lines.join("\n");
}

/** Expand `#N` tokens in a user message into full annotation-context
 *  markdown blocks, appended after the original text. Unrecognized numbers
 *  are left as literal text so the user sees what failed. */
export function expandAnnotationReferences(rawMessage: string): string {
  const matches = Array.from(rawMessage.matchAll(/(?:^|\s)#(\d+)\b/g));
  if (matches.length === 0) return rawMessage;

  const seen = new Set<number>();
  const blocks: string[] = [];
  const missing: number[] = [];
  for (const m of matches) {
    const n = Number(m[1]);
    if (seen.has(n)) continue;
    seen.add(n);
    const ann = agentationAnnotationsStore.getByPinNumber(n);
    if (ann) {
      blocks.push(formatAnnotationAsFixPrompt(ann, n));
    } else {
      missing.push(n);
    }
  }
  if (blocks.length === 0) return rawMessage;

  const parts: string[] = [rawMessage.trim(), ""];
  if (missing.length > 0) {
    parts.push(
      `*(no annotation matched ${missing.map((n) => `#${n}`).join(", ")})*`,
      "",
    );
  }
  parts.push("---", "", ...blocks);
  return parts.join("\n");
}
