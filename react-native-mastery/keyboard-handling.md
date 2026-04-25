---
name: keyboard-handling
scope: sub-agent
triggers: keyboard, keyboard avoid, input focus, scroll to input, dismiss keyboard, sticky composer, chat input, comment box, form on mobile, keyboard inset, input zoom, ios zoom
viewports: iphone-17, iphone-17-pro-max, ipad
---

# Keyboard Handling on Mobile

When an input focuses, the OS keyboard covers roughly the bottom 40% of the viewport. The screen below the input gets occluded. A screen that works perfectly without a keyboard can become unusable when it appears. This is the single most common mobile-UX failure.

## Rule 1: inputs must be ≥ 16px font-size

iOS Safari zooms into any input with `font-size < 16px` when focused. The zoom is jarring and breaks layout. ALWAYS use 16px or larger for:
- `<input>` of any type
- `<textarea>`
- `<select>`

```jsx
<input style={{ fontSize: 16, /* ... */ }} />
```

## Rule 2: use the right `type` and `inputMode`

Different keyboards for different data. Wrong keyboard = 20% slower typing = drop-offs.

| Data | type | inputMode | autoComplete |
|---|---|---|---|
| Email | `email` | `email` | `email` |
| Phone | `tel` | `tel` | `tel` |
| Numeric PIN | `password` | `numeric` | `one-time-code` |
| Zip code | `text` | `numeric` | `postal-code` |
| URL | `url` | `url` | — |
| Search | `search` | `search` | — |
| Integer | `number` | `numeric` | — |
| Decimal | `number` | `decimal` | — |
| Full name | `text` | `text` | `name` |

Also set `autoCapitalize` correctly: `off` for emails/usernames, `words` for names, `sentences` for messages.

## Rule 3: position the composer ABOVE the keyboard, not below it

For any sticky bottom input (chat composer, comment box):

```jsx
<div style={{
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
}}>
  <main style={{ flex: 1, overflowY: 'auto' }}>...</main>
  <form style={{
    position: 'sticky',
    bottom: 0,
    padding: 12,
    paddingBottom: 'env(safe-area-inset-bottom, 34px)',
    background: 'var(--color-surface)',
    borderTop: '0.5px solid var(--color-separator)',
  }}>
    <input placeholder="Message..." style={{ fontSize: 16, /* ... */ }} />
  </form>
</div>
```

On real iOS Safari, when the keyboard opens, the `visualViewport` API exposes the new height. In web-mobile apps (ours), we rely on `100vh` being static — the sticky composer naturally floats above the keyboard because the main scroll content is what gets clipped.

## Rule 4: scroll focused input into view

When focusing an input that's near the bottom of a scroll container, manually scroll it into view so the keyboard doesn't cover it:

```jsx
<input
  ref={inputRef}
  onFocus={() => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 300); // wait for keyboard to animate in
  }}
/>
```

## Rule 5: one-tap dismissal

The user needs an obvious way to dismiss the keyboard without submitting. Provide at least one of:
- **Tap outside the input** — backdrop or empty area dismisses.
- **Submit handler clears focus** — `inputRef.current.blur()` after submit.
- **Scroll dismisses** — when the main content scrolls far enough, blur the input:

```jsx
<main
  style={{ flex: 1, overflowY: 'auto' }}
  onScroll={() => document.activeElement?.blur?.()}
>
```

## Rule 6: submit on Enter (single-line), Cmd+Enter (textarea)

Single-line inputs submit on Enter. Multi-line textareas submit on Cmd/Ctrl+Enter (Enter inserts a newline). This is the universal convention.

```jsx
<input onKeyDown={(e) => {
  if (e.key === 'Enter') handleSubmit();
}} />

<textarea onKeyDown={(e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit();
}} />
```

## Rule 7: minimal friction

- **Don't auto-focus on mount** for touch devices — it pops the keyboard before the user has seen the screen. If autofocus IS needed (single-input screens like a chat), OK.
- **Disable autocorrect + spellcheck** on usernames, emails, passwords, codes: `spellCheck={false} autoCorrect="off" autoCapitalize="off"`.
- **Show "Done" / "Go" / "Search" on the keyboard return key** by using appropriate `type`: search → "Search", email → "Go", default → "Done".
- **Don't validate on every keystroke**. Validate on blur or submit. Red borders while typing is hostile.

## Rule 8: sticky composer when keyboard opens

For chat-like screens: the composer is bottom-sticky. When the keyboard opens, the OS pushes the composer UP (above the keyboard). DON'T use `position: fixed` on the composer — that prevents the OS from lifting it. Use `position: sticky; bottom: 0` inside a flex container.

## Edge cases

- **Modal with a focused input inside**: same rules apply, but the modal's own safe-area handling affects positioning.
- **Chat where the last message must stay visible**: after sending, scroll to bottom. On keyboard open, scroll to the most recent message so the composer's new text doesn't occlude it.
- **Form with inputs at different heights**: the focused input should end up at roughly 30% viewport height from top — well above the keyboard.
- **iPad split-keyboard**: rarer. The keyboard doesn't fully cover on iPad, so the above is conservative; you have more room.
