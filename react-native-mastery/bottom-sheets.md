---
name: bottom-sheets
scope: sub-agent
triggers: bottom sheet, sheet, drawer from bottom, action sheet, half modal, peek, snap point, detent, expandable sheet
viewports: iphone-17, iphone-17-pro-max, ipad
---

# Bottom Sheets (iOS-Style Detents)

Bottom sheets are the single most useful mobile pattern the web tradition gets wrong. A bottom sheet is an overlay that rises from the bottom edge, exposes information at one of several DETENT points, and dismisses via drag-down or backdrop-tap.

## The detent model

A sheet has named stops (detents). iOS 15+ uses:
- **Small** — 25% of viewport height. A preview (one line + CTAs).
- **Medium** — 50%. Most common default. Form fits without scrolling.
- **Large** — ~90% viewport. Near-full-screen but keeps 10% of parent visible on top.

Choose based on content: filter chips might need only "medium", a full form might need "large", a quick confirmation just "small".

```jsx
const DETENTS = { small: 0.25, medium: 0.5, large: 0.9 };
const [detent, setDetent] = useState('medium');
const viewportH = window.innerHeight;
const heightPx = DETENTS[detent] * viewportH;
```

## Visual contract

```jsx
<>
  {/* Backdrop: dims parent, tap to dismiss */}
  <div onClick={dismiss} style={{
    position: 'fixed', inset: 0,
    background: 'rgba(0, 0, 0, 0.4)',
    opacity: isOpen ? 1 : 0,
    transition: 'opacity 280ms ease-out',
    pointerEvents: isOpen ? 'auto' : 'none',
  }} />

  {/* Sheet */}
  <div style={{
    position: 'fixed', left: 0, right: 0, bottom: 0,
    height: heightPx,
    background: 'var(--color-surface)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.2)',
    transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
    transition: 'transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1), height 240ms ease-out',
    paddingBottom: 'env(safe-area-inset-bottom, 34px)',
    display: 'flex',
    flexDirection: 'column',
  }}>
    {/* Grabber — tap-sized handle at the top */}
    <div style={{
      width: 36, height: 5,
      background: 'rgba(60, 60, 67, 0.3)',
      borderRadius: 3,
      alignSelf: 'center',
      marginTop: 6, marginBottom: 8,
    }} />
    {/* Content */}
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
      {children}
    </div>
  </div>
</>
```

## Gestures

The magic of a native sheet is the drag. From any detent:
- Drag down → snap to smaller detent, or dismiss if smallest.
- Drag up → snap to larger detent.
- Velocity-aware: a fast flick down dismisses even if dragged only 10px.

Simplest web approximation: a draggable handle that updates height during drag, then snaps on release.

```jsx
const [dragY, setDragY] = useState(0);
const startY = useRef(null);
const handleStart = (e) => { startY.current = e.clientY ?? e.touches[0].clientY; };
const handleMove = (e) => {
  if (startY.current == null) return;
  const y = e.clientY ?? e.touches[0].clientY;
  setDragY(Math.max(0, y - startY.current));
};
const handleEnd = () => {
  const threshold = heightPx * 0.25;
  if (dragY > threshold) dismiss();
  setDragY(0);
  startY.current = null;
};
// Apply: `transform: translateY(${dragY}px)` + lower transition during drag
```

## Backdrop behavior

- Tap on backdrop → dismiss.
- Backdrop stays fully opaque when sheet is at its largest detent; dims less when sheet is smaller (more parent visible = more dimming isn't needed).
- Backdrop blur (`backdrop-filter: blur(8px)` on the dim layer) if you have GPU cycles to spare and the context is a consumer app.

## What goes in a sheet vs a new screen

| Use a sheet | Use a new screen |
|---|---|
| Filter options | Browsing a new section |
| Share menu | Composing a detailed post |
| Quick confirm | A multi-step form |
| Item preview | Dedicated detail page |
| Comment thread | Messages thread with history |

If the content is TRANSIENT — the user opens it to do one thing and returns to where they were — use a sheet. If the content has its own presence and history, use a screen.

## iOS-specific details worth mimicking

- **Grabber indicator**: 36×5, rounded, gray, top-centered. Signals draggability.
- **Corner radius**: 16px at the top. Straight at the bottom.
- **Shadow**: soft upward-facing only. `0 -8px 32px rgba(0,0,0,0.2)`.
- **Sheet inset horizontally**: 0. Full-width — looks anchored.
- **Animation curve**: `cubic-bezier(0.2, 0.8, 0.2, 1)`. "iOS ease."
- **Duration**: 320ms open/close.
- **Sheet shows parent through rounded corners**: the parent screen shrinks slightly when sheet opens (scale 0.95) for a card-on-card effect. Implement with a coordinated transform on the parent container.

## Anti-patterns

- Sheets that take the whole screen with no grabber, no dismiss button, no backdrop → users get trapped.
- Sheets that animate in with bounce → iOS doesn't bounce on entry. Subtle.
- Multiple stacked sheets (sheet-on-sheet) → confusing; present a new screen instead.
- Sheets that auto-dismiss on any outside interaction → unexpected; keep dismissal explicit.
