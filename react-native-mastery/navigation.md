---
name: navigation
scope: sub-agent
triggers: navigation, nav bar, tab bar, back button, stack navigator, modal, drawer, side menu, routing, push, pop, screen transition, directional motion
viewports: iphone-17, iphone-17-pro-max, ipad
---

# Mobile Navigation Patterns

Four canonical native patterns. Pick based on what the screen is DOING, not just what looks cool.

## 1. Stack navigation (push / pop)

The most common pattern: Home → Detail → Nested Detail. Each push slides the new screen in from the right; pop slides it back. Back is reached via the top-left arrow OR an edge-swipe from the left.

**Visual contract:**
- Top bar height: 44 pt (88 pt with a large title on iOS).
- Back button: chevron + previous screen's title, top-left, tappable area 44×44.
- Title: centered (iOS) or left-aligned (Material/Android).
- Optional right action: single tap target, 44×44, top-right.

```jsx
<header style={{
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 16px',
  background: 'var(--color-surface)',
  borderBottom: '0.5px solid var(--color-separator)',
}}>
  <button onClick={goBack} style={{ minWidth: 44, minHeight: 44 }} aria-label="Back">
    <ChevronLeft /> Back
  </button>
  <span style={{ fontWeight: 600 }}>Title</span>
  <button onClick={onAction} style={{ minWidth: 44, minHeight: 44 }}>Save</button>
</header>
```

Back button has a concrete label ("Back" or the previous screen's title). Never "<" alone — users want to know where they're going.

## 2. Tab navigation (bottom tab bar)

Persistent bottom bar with 2–5 tabs. Each tap switches the visible section instantly. Tap the ACTIVE tab again → scroll to top of that section.

**Visual contract:**
- Tab bar height: 49 pt + safe-area bottom inset (so total ≈ 83 pt on iPhone).
- Each tab: icon (24×24) + label (10–11 pt), stacked vertically.
- Active state: tinted color (iOS blue by default, brand color common). Inactive: gray.
- Labels are SHORT (1 word, 2 max): Home, Search, Activity, Profile.

```jsx
<nav style={{
  height: 49,
  paddingBottom: 'env(safe-area-inset-bottom, 34px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-around',
  background: 'rgba(255, 255, 255, 0.9)',
  backdropFilter: 'blur(20px)',
  borderTop: '0.5px solid var(--color-separator)',
  position: 'sticky',
  bottom: 0,
}}>
  {tabs.map(t => (
    <button key={t.id} onClick={() => setActive(t.id)} style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 3,
      color: t.id === active ? 'var(--color-accent)' : 'var(--color-text-muted)',
      padding: '8px 0',
      minHeight: 49,
    }}>
      <Icon name={t.icon} size={24} />
      <span style={{ fontSize: 10, fontWeight: 500 }}>{t.label}</span>
    </button>
  ))}
</nav>
```

**When NOT to use tabs**: if one section is "obviously primary" and others are settings/profile, don't force them into peer tabs. Use stack navigation with Profile as a top-right avatar tap.

## 3. Modal (full-screen presentation)

Used for self-contained flows: compose a post, create a new item, share-sheet-like choices. Slides up from bottom; dismissal via X button (top-left or top-right) or swipe-down.

**Visual contract:**
- Top bar: X button left, title center, primary action right (Post / Send / Done).
- Primary action is ENABLED only when the form is valid.
- Dismissal: tapping X asks "Discard draft?" if there are unsaved changes.

```jsx
<div style={{
  position: 'fixed',
  inset: 0,
  background: 'var(--color-surface)',
  display: 'flex',
  flexDirection: 'column',
}}>
  <header style={{ display: 'flex', justifyContent: 'space-between', padding: 16 }}>
    <button onClick={dismiss}>X</button>
    <span>New Post</span>
    <button disabled={!isValid} onClick={submit}>Post</button>
  </header>
  {/* ... */}
</div>
```

When the modal slides in, the parent screen shrinks slightly and tints (iOS 13+ card-style modal). This detail matters for it to feel native.

## 4. Drawer (side menu)

**Use sparingly.** Drawers are a fallback for "we have too many sections to fit in a tab bar." Consumer apps prefer tab + profile-avatar. Drawers show up in enterprise / admin mobile.

If used: slides in from the left (right in RTL). Covers 80% of the viewport. Backdrop dim + tap-to-dismiss + edge swipe to open.

## Transition motion

All four patterns use DIRECTIONAL motion matching the gesture:

- **Push**: new screen slides in from right (`translateX: 100%` → `0`). Previous screen parallaxes 30% to the left (`translateX: 0` → `-30%`).
- **Pop**: reverse.
- **Modal**: slides up from bottom (`translateY: 100%` → `0`). Parent screen stays, dims.
- **Tab switch**: no transition on iOS (instant), subtle crossfade on Android.
- **Drawer**: slides from side.

Timing: 280–320ms, `cubic-bezier(0.2, 0.8, 0.2, 1)` — the "iOS ease." Never linear.

## Cross-screen state preservation

When pushing a new screen, the previous one STAYS MOUNTED. When popping back, its scroll position and state should be preserved. This means:

- Use `position: absolute` or similar to stack screens rather than unmounting.
- Keep inputs in state so coming back shows what the user was typing.

In our Sandpack tool, the simplest pattern is a state machine inside one screen that switches between "sub-views." A proper multi-screen flow uses `<Link>` + `useParams()` from `./services/router` — see those for inter-screen navigation.

## Decision guide

| Pattern | When |
|---|---|
| Stack | Drilling into a detail (Home → Recipe → Ingredient) |
| Tabs | Top-level sections the user moves between many times per session |
| Modal | Self-contained flow that starts and ends with a dedicated task |
| Drawer | Enterprise / when >5 top-level destinations |

Default for a consumer app: Stack + Tabs. Everything else is a specialization.
