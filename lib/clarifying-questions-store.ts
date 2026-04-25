/**
 * Per-toolCallId store for the askClarifyingQuestions flow. The tool call
 * stays PENDING (no tool result emitted) while the user answers; the
 * client reads the stored questions to render the form, and on submit
 * emits addToolResult with the answers as the tool output — resuming the
 * orchestrator mid-turn.
 *
 * Kept separate from streamingStore / planStore because its lifecycle is
 * human-in-the-loop: it persists only until the user answers, then the
 * UI swaps to a static "your answers" receipt.
 */

export type ClarifyingQuestion = {
  id: string;
  question: string;
  options: string[];
  /** Legacy field, kept for type compatibility with older tool inputs. The
   *  UI now always shows an "Other…" option regardless. */
  allowOther?: boolean;
};

export type ClarifyingSet = {
  title: string;
  questions: ClarifyingQuestion[];
  answered: boolean;
  answers?: Record<string, string>;
};

type Listener = (sets: Map<string, ClarifyingSet>) => void;

class ClarifyingQuestionsStore {
  private sets = new Map<string, ClarifyingSet>();
  private listeners = new Set<Listener>();

  set(toolCallId: string, entry: ClarifyingSet) {
    this.sets.set(toolCallId, entry);
    this.notify();
  }

  get(toolCallId: string): ClarifyingSet | undefined {
    return this.sets.get(toolCallId);
  }

  markAnswered(toolCallId: string, answers: Record<string, string>) {
    const cur = this.sets.get(toolCallId);
    if (!cur) return;
    this.sets.set(toolCallId, { ...cur, answered: true, answers });
    this.notify();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private notify() {
    for (const l of this.listeners) l(new Map(this.sets));
  }
}

export const clarifyingQuestionsStore = new ClarifyingQuestionsStore();

/**
 * Callback installed by the chat hook's owner (LeftPanel) so the
 * ClarifyingQuestionsCard can trigger `addToolResult` without having to
 * be threaded through MessageRow → MessageParts as a prop. Set on mount,
 * cleared on unmount.
 */
let submitHandler:
  | ((toolCallId: string, answers: Record<string, string>) => void)
  | null = null;

export function setClarifyingSubmitHandler(
  fn: ((toolCallId: string, answers: Record<string, string>) => void) | null,
) {
  submitHandler = fn;
}

export function submitClarifyingAnswers(
  toolCallId: string,
  answers: Record<string, string>,
) {
  submitHandler?.(toolCallId, answers);
}
