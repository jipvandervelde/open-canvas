"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clarifyingQuestionsStore,
  type ClarifyingSet,
} from "@/lib/clarifying-questions-store";

/**
 * Interactive quiz card rendered while the askClarifyingQuestions tool
 * call is pending. Presents one question at a time with an "X of Y"
 * progress cue; "Other…" is always available as a last option and, when
 * picked, reveals a text input (Enter submits + advances). The final
 * question's Continue button submits all answers back to the orchestrator.
 *
 * The tool call stays PENDING server-side until the user hits Continue on
 * the final question. That's when the parent calls addToolResult with the
 * structured answers map, unblocking the orchestrator.
 */
export function ClarifyingQuestionsCard({
  toolCallId,
  onSubmit,
}: {
  toolCallId: string;
  onSubmit: (answers: Record<string, string>) => void;
}) {
  const [entry, setEntry] = useState<ClarifyingSet | undefined>(() =>
    clarifyingQuestionsStore.get(toolCallId),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [others, setOthers] = useState<Record<string, string>>({});
  const otherInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setEntry(clarifyingQuestionsStore.get(toolCallId));
    return clarifyingQuestionsStore.subscribe(() => {
      setEntry(clarifyingQuestionsStore.get(toolCallId));
    });
  }, [toolCallId]);

  const total = entry?.questions.length ?? 0;
  const isLast = currentIndex >= total - 1;
  const q = entry?.questions[currentIndex];
  const pick = q ? picks[q.id] : undefined;
  const otherText = q ? others[q.id] ?? "" : "";

  // Can advance if: they picked a preset option, OR they picked Other and
  // typed at least one non-space character.
  const canAdvance = useMemo(() => {
    if (!q) return false;
    if (!pick) return false;
    if (pick === "__other__" && !otherText.trim()) return false;
    return true;
  }, [q, pick, otherText]);

  // Autofocus the Other input the moment the user picks Other so they can
  // start typing without a second click.
  useEffect(() => {
    if (pick === "__other__") {
      // Small defer — the input has to be in the DOM first.
      requestAnimationFrame(() => otherInputRef.current?.focus());
    }
  }, [pick, currentIndex]);

  const advance = useCallback(() => {
    if (!q || !canAdvance) return;
    const pickedValue =
      pick === "__other__" ? otherText.trim() : (pick as string);
    const nextAnswers = { ...picks, [q.id]: pickedValue };
    if (isLast) {
      // Final submit — package up the full answers map, converting any
      // "__other__" markers into their actual text values.
      const final: Record<string, string> = {};
      if (!entry) return;
      for (const ques of entry.questions) {
        const p = nextAnswers[ques.id];
        if (p === "__other__") {
          final[ques.id] = (others[ques.id] ?? "").trim();
        } else if (p) {
          final[ques.id] = p;
        }
      }
      onSubmit(final);
    } else {
      setPicks(nextAnswers);
      setCurrentIndex((i) => i + 1);
    }
  }, [canAdvance, entry, isLast, onSubmit, others, otherText, pick, picks, q]);

  if (!entry) return null;

  // Answered — show the receipt.
  if (entry.answered && entry.answers) {
    return (
      <div className="oc-quiz oc-quiz--answered">
        <div className="oc-quiz-head">
          <span className="oc-quiz-title">{entry.title}</span>
          <span className="oc-quiz-progress oc-tabular">
            {total} of {total}
          </span>
        </div>
        <ul className="oc-quiz-receipt">
          {entry.questions.map((ques) => {
            const a = entry.answers?.[ques.id] ?? "—";
            return (
              <li key={ques.id}>
                <span className="oc-quiz-q">{ques.question}</span>
                <span className="oc-quiz-a">{a}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (!q) return null;

  return (
    <div className="oc-quiz">
      <div className="oc-quiz-head">
        <span className="oc-quiz-title">{entry.title}</span>
        <span className="oc-quiz-progress oc-tabular">
          {currentIndex + 1} of {total}
        </span>
      </div>

      <div className="oc-quiz-bar" aria-hidden>
        <div
          className="oc-quiz-bar-fill"
          style={{
            width: `${Math.round(((currentIndex + (canAdvance ? 1 : 0.3)) / total) * 100)}%`,
          }}
        />
      </div>

      <div className="oc-quiz-q-group">
        <div className="oc-quiz-q-text">{q.question}</div>
        <div className="oc-quiz-options">
          {q.options.map((opt) => (
            <button
              key={opt}
              type="button"
              className="oc-quiz-option"
              data-active={pick === opt || undefined}
              onClick={() => setPicks((p) => ({ ...p, [q.id]: opt }))}
            >
              {opt}
            </button>
          ))}
          {/* "Other" is ALWAYS present — the user can always write their own answer. */}
          <button
            type="button"
            className="oc-quiz-option oc-quiz-option--other"
            data-active={pick === "__other__" || undefined}
            onClick={() => setPicks((p) => ({ ...p, [q.id]: "__other__" }))}
          >
            Other…
          </button>
        </div>
        {pick === "__other__" && (
          <input
            ref={otherInputRef}
            type="text"
            className="oc-quiz-other-input"
            placeholder="Write your answer…"
            value={otherText}
            onChange={(e) =>
              setOthers((o) => ({ ...o, [q.id]: e.target.value }))
            }
            onKeyDown={(e) => {
              // Enter advances (or submits on last question).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                advance();
              }
            }}
          />
        )}
      </div>

      <div className="oc-quiz-actions">
        {currentIndex > 0 && (
          <button
            type="button"
            className="oc-quiz-back"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          >
            Back
          </button>
        )}
        <button
          type="button"
          className="oc-quiz-submit"
          disabled={!canAdvance}
          onClick={advance}
        >
          {isLast ? "Submit" : "Continue"}
        </button>
      </div>
    </div>
  );
}
