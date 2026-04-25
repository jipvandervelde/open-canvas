"use client";

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import styles from "./styles.module.scss";
import { IconTrash } from "../icons";
import { originalSetTimeout } from "../../utils/freeze-animations";

// =============================================================================
// Helpers
// =============================================================================

/** Focus an element while temporarily blocking focus-trap libraries (e.g. Radix
 *  FocusScope) from reclaiming focus via focusin/focusout handlers. */
function focusBypassingTraps(el: HTMLElement | null) {
  if (!el) return;
  const trap = (e: Event) => e.stopImmediatePropagation();
  document.addEventListener("focusin", trap, true);
  document.addEventListener("focusout", trap, true);
  try {
    el.focus();
  } finally {
    document.removeEventListener("focusin", trap, true);
    document.removeEventListener("focusout", trap, true);
  }
}

// =============================================================================
// Types
// =============================================================================

export interface AnnotationPopupCSSProps {
  /** Element name to display in header */
  element: string;
  /** Optional timestamp display (e.g., "@ 1.23s" for animation feedback) */
  timestamp?: string;
  /** Optional selected/highlighted text */
  selectedText?: string;
  /** Placeholder text for the textarea */
  placeholder?: string;
  /** Initial value for textarea (for edit mode) */
  initialValue?: string;
  /** Label for submit button (default: "Add") */
  submitLabel?: string;
  /** Called when annotation is submitted with text */
  onSubmit: (text: string) => void;
  /** Called when popup is cancelled/dismissed */
  onCancel: () => void;
  /** Called when delete button is clicked (only shown if provided) */
  onDelete?: () => void;
  /** Called on every keystroke (debounced by caller if needed) so the popup
   *  can autosave without a dedicated save button. When provided, the
   *  "Cancel" and "Add/Save" buttons disappear and the submit button
   *  becomes a "Fix" action instead. */
  onAutoSave?: (text: string) => void;
  /** Called when the "Fix" button is clicked. Receives the current text so
   *  the caller can package element context + text into a chat prompt. */
  onFix?: (text: string) => void;
  /** Position styles (left, top) */
  style?: React.CSSProperties;
  /** Custom color for submit button and textarea focus (hex) */
  accentColor?: string;
  /** External exit state (parent controls exit animation) */
  isExiting?: boolean;
  /** Light mode styling */
  lightMode?: boolean;
  /** Computed styles for the selected element */
  computedStyles?: Record<string, string>;
  /** Existing messages in this annotation's thread — rendered as small
   *  bubbles above the textarea so the user can see what they've said so
   *  far before composing the next reply. */
  threadMessages?: Array<{
    id: string;
    role?: "human" | "agent";
    content: string;
    timestamp?: number;
  }>;
  /** Fires when the user clicks the Reply button or presses Enter with a
   *  non-empty textarea. The caller is responsible for appending the text
   *  to the annotation's thread; the popup then clears the textarea so the
   *  user can keep replying. When provided, the "Cancel" button is
   *  replaced with a "Reply" action. */
  onReply?: (text: string) => void;
}

export interface AnnotationPopupCSSHandle {
  /** Shake the popup (e.g., when user clicks outside) */
  shake: () => void;
}

// =============================================================================
// Component
// =============================================================================

export const AnnotationPopupCSS = forwardRef<AnnotationPopupCSSHandle, AnnotationPopupCSSProps>(
  function AnnotationPopupCSS(
    {
      element,
      timestamp,
      selectedText,
      placeholder = "What should change?",
      initialValue = "",
      submitLabel = "Add",
      onSubmit,
      onCancel,
      onDelete,
      onAutoSave,
      onFix,
      threadMessages,
      onReply,
      style,
      accentColor = "#3c82f7",
      isExiting = false,
      lightMode = false,
      computedStyles,
    },
    ref
  ) {
    const [text, setText] = useState(initialValue);
    const [isShaking, setIsShaking] = useState(false);
    const [animState, setAnimState] = useState<"initial" | "enter" | "entered" | "exit">("initial");
    const [isFocused, setIsFocused] = useState(false);
    const [isStylesExpanded, setIsStylesExpanded] = useState(false); // Computed styles accordion state
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync with parent exit state
    useEffect(() => {
      if (isExiting && animState !== "exit") {
        setAnimState("exit");
      }
    }, [isExiting, animState]);

    // Animate in on mount and focus textarea
    useEffect(() => {
      // Start enter animation (use originalSetTimeout to bypass freeze patch)
      originalSetTimeout(() => {
        setAnimState("enter");
      }, 0);
      // Transition to entered state after animation completes
      const enterTimer = originalSetTimeout(() => {
        setAnimState("entered");
      }, 200); // Match animation duration
      const focusTimer = originalSetTimeout(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          focusBypassingTraps(textarea);
          textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
          textarea.scrollTop = textarea.scrollHeight;
        }
      }, 50);
      return () => {
        clearTimeout(enterTimer);
        clearTimeout(focusTimer);
        if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
        if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      };
    }, []);

    // Shake animation
    const shake = useCallback(() => {
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      setIsShaking(true);
      shakeTimerRef.current = originalSetTimeout(() => {
        setIsShaking(false);
        focusBypassingTraps(textareaRef.current);
      }, 250);
    }, []);

    // Expose shake to parent via ref
    useImperativeHandle(ref, () => ({
      shake,
    }), [shake]);

    // Handle cancel with exit animation
    const handleCancel = useCallback(() => {
      setAnimState("exit");
      cancelTimerRef.current = originalSetTimeout(() => {
        onCancel();
      }, 150); // Match exit animation duration
    }, [onCancel]);

    // Handle submit — legacy "commit and close" flow (used when no onAutoSave
    // is wired). Kept for any call site that still wants the old Add/Save
    // behavior.
    const handleSubmit = useCallback(() => {
      if (!text.trim()) return;
      onSubmit(text.trim());
    }, [text, onSubmit]);

    // Track whether the first commit has happened. In autosave mode, a
    // pending annotation promotes to an editable one on its first real
    // `onSubmit` call; subsequent edits flow through `onAutoSave`. In
    // thread mode, any existing thread message counts as "committed" so
    // new typing routes through `onReply` instead of `onSubmit`.
    const hasCommittedRef = useRef(
      initialValue.trim().length > 0 || (threadMessages?.length ?? 0) > 0,
    );

    // Save (Enter in autosave mode) — commits the current text and keeps the
    // popup open. For the very first save, this promotes a pending annotation
    // into a real one via `onSubmit`; after that, it routes through
    // `onAutoSave` for update-in-place.
    const handleSaveKeepOpen = useCallback(() => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!hasCommittedRef.current) {
        hasCommittedRef.current = true;
        onSubmit(trimmed);
        return;
      }
      onAutoSave?.(trimmed);
    }, [text, onAutoSave, onSubmit]);

    // Reply — append the current text as a new thread message, then clear
    // the textarea and re-focus for the next entry. Keeps the popup open.
    const handleReply = useCallback(() => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!hasCommittedRef.current) {
        // First message doubles as the annotation's primary comment.
        hasCommittedRef.current = true;
        onSubmit(trimmed);
      } else {
        onReply?.(trimmed);
      }
      setText("");
      requestAnimationFrame(() => {
        focusBypassingTraps(textareaRef.current);
      });
    }, [text, onSubmit, onReply]);

    // Fix — save latest text (or post it as the final reply), fire the
    // caller's hook, then close the popup. In thread mode the textarea can
    // be empty as long as there's at least one saved reply to ship.
    const handleFix = useCallback(() => {
      const trimmed = text.trim();
      const hasExistingThread = (threadMessages?.length ?? 0) > 0;
      if (!trimmed && !hasExistingThread) return;
      if (trimmed) {
        if (!hasCommittedRef.current) {
          hasCommittedRef.current = true;
          onSubmit(trimmed);
        } else if (onReply) {
          onReply(trimmed);
        } else if (onAutoSave) {
          onAutoSave(trimmed);
        }
      }
      onFix?.(trimmed);
      setAnimState("exit");
      cancelTimerRef.current = originalSetTimeout(() => {
        onCancel();
      }, 150);
    }, [text, threadMessages, onAutoSave, onReply, onSubmit, onFix, onCancel]);

    // Handle keyboard.
    // - Thread mode (onReply set): Enter posts a reply (keeps popup open);
    //   Shift+Enter inserts a newline; Cmd+Enter fires Fix; Esc closes.
    // - Autosave-only mode: Enter saves current comment; Cmd+Enter = Fix.
    // - Legacy mode: Enter submits + closes (old Add/Save).
    const autosaveMode = Boolean(onAutoSave || onFix);
    const threadMode = Boolean(onReply);
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") {
          if (e.shiftKey) return; // newline — default behavior
          e.preventDefault();
          if (autosaveMode && (e.metaKey || e.ctrlKey)) {
            handleFix();
            return;
          }
          if (threadMode) {
            handleReply();
            return;
          }
          if (autosaveMode) {
            handleSaveKeepOpen();
            return;
          }
          handleSubmit();
        }
        if (e.key === "Escape") {
          handleCancel();
        }
      },
      [autosaveMode, threadMode, handleSubmit, handleCancel, handleSaveKeepOpen, handleFix, handleReply]
    );

    const popupClassName = [
      styles.popup,
      lightMode ? styles.light : "",
      animState === "enter" ? styles.enter : "",
      animState === "entered" ? styles.entered : "",
      animState === "exit" ? styles.exit : "",
      isShaking ? styles.shake : "",
    ].filter(Boolean).join(" ");

    return (
      <div
        ref={popupRef}
        className={popupClassName}
        data-annotation-popup
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          {computedStyles && Object.keys(computedStyles).length > 0 ? (
            <button
              className={styles.headerToggle}
              onClick={() => {
                const wasExpanded = isStylesExpanded;
                setIsStylesExpanded(!isStylesExpanded);
                if (wasExpanded) {
                  // Refocus textarea when closing
                  originalSetTimeout(() => focusBypassingTraps(textareaRef.current), 0);
                }
              }}
              type="button"
            >
              <svg
                className={`${styles.chevron} ${isStylesExpanded ? styles.expanded : ""}`}
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5.5 10.25L9 7.25L5.75 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className={styles.element}>{element}</span>
            </button>
          ) : (
            <span className={styles.element}>{element}</span>
          )}
          {timestamp && <span className={styles.timestamp}>{timestamp}</span>}
        </div>

        {/* Collapsible computed styles section - uses grid-template-rows for smooth animation */}
        {computedStyles && Object.keys(computedStyles).length > 0 && (
          <div className={`${styles.stylesWrapper} ${isStylesExpanded ? styles.expanded : ""}`}>
            <div className={styles.stylesInner}>
              <div className={styles.stylesBlock}>
                {Object.entries(computedStyles).map(([key, value]) => (
                  <div key={key} className={styles.styleLine}>
                    <span className={styles.styleProperty}>
                      {key.replace(/([A-Z])/g, "-$1").toLowerCase()}
                    </span>
                    : <span className={styles.styleValue}>{value}</span>;
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedText && (
          <div className={styles.quote}>
            &ldquo;{selectedText.slice(0, 80)}
            {selectedText.length > 80 ? "..." : ""}&rdquo;
          </div>
        )}

        {threadMessages && threadMessages.length > 0 && (
          <div
            className="oc-ann-thread"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginBottom: 8,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {threadMessages.map((m) => (
              <div
                key={m.id}
                className={`oc-ann-thread-msg oc-ann-thread-msg--${m.role ?? "human"}`}
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  background:
                    m.role === "agent"
                      ? "color-mix(in srgb, var(--agentation-color-accent) 12%, transparent)"
                      : lightMode
                        ? "rgba(0,0,0,0.05)"
                        : "rgba(255,255,255,0.06)",
                  color: lightMode ? "#18181b" : "#fafafa",
                  fontSize: 12,
                  lineHeight: 1.4,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {m.content}
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className={styles.textarea}
          style={{ borderColor: isFocused ? accentColor : undefined }}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          rows={2}
          onKeyDown={handleKeyDown}
        />

        <div className={styles.actions}>
          {onDelete && (
            <div className={styles.deleteWrapper}>
              <button className={styles.deleteButton} onClick={onDelete} type="button">
                <IconTrash size={22} />
              </button>
            </div>
          )}
          {autosaveMode ? (
            // Autosave mode — Enter posts a reply (keeps popup open) when
            // onReply is wired; otherwise it saves the root comment in
            // place. Fix ships the whole thread to the chat composer.
            <>
              {threadMode ? (
                <button
                  className={styles.cancel}
                  onClick={handleReply}
                  disabled={!text.trim()}
                  title="Post a reply (Enter)"
                  style={{ opacity: text.trim() ? 1 : 0.4 }}
                >
                  Reply
                </button>
              ) : (
                <button
                  className={styles.cancel}
                  onClick={handleCancel}
                  title="Close (Esc)"
                >
                  Cancel
                </button>
              )}
              <button
                className={styles.submit}
                style={{
                  backgroundColor: accentColor,
                  opacity: text.trim() || (threadMessages && threadMessages.length > 0) ? 1 : 0.4,
                }}
                onClick={handleFix}
                disabled={
                  !text.trim() && (!threadMessages || threadMessages.length === 0)
                }
                title="Send this thread to the chat so the agent can fix it (⌘⏎)"
              >
                Fix
              </button>
            </>
          ) : (
            <>
              <button className={styles.cancel} onClick={handleCancel}>
                Cancel
              </button>
              <button
                className={styles.submit}
                style={{
                  backgroundColor: accentColor,
                  opacity: text.trim() ? 1 : 0.4,
                }}
                onClick={handleSubmit}
                disabled={!text.trim()}
              >
                {submitLabel}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }
);

export default AnnotationPopupCSS;
