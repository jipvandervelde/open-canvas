---
name: safe-area
description: Safe-area insets for mobile screens — exact pixel values per viewport, how to apply them, and when to bleed edge-to-edge versus inset. Auto-inject on any mobile viewport.
scope: sub-agent
triggers: safe area, safe-area, inset, notch, dynamic island, home indicator, status bar, notch-aware, env safe-area-inset, ios inset, mobile padding
viewports: iphone-17, iphone-17-pro-max, ipad
---

# Safe Area Insets

The non-negotiable mobile rule: content lives INSIDE the safe area; backgrounds bleed OUTSIDE it.

## Inset values per viewport

| Viewport | Top (Dynamic Island / status bar) | Bottom (home indicator) | Left/Right |
|---|---|---|---|
| `iphone-17` (393×852) | **62** (Dynamic Island) | 34 | 0 |
| `iphone-17-pro` (402×874) — **default** | **62** (Dynamic Island) | 34 | 0 |
| `iphone-17-pro-max` (440×956) | **62** (Dynamic Island) | 34 | 0 |
| `ipad` (820×1180) | 24 | 20 | 0 |
| `desktop-*` | 0 | 0 | 0 |

**Every modern iPhone (14 Pro / 15 / 16 / 17, all sizes) uses a 62px Dynamic Island safe-area top.** Older notch-only iPhones (X-14 non-Pro) were 47px, but they're no longer the target — our default viewport is `iphone-17-pro` and the whole pipeline assumes Dynamic Island. If you do end up designing for an older notch iPhone, the extra 15px of top padding reads as slightly generous but acceptable — the opposite (47px padding on a 62px inset) would put content under the Island and is never acceptable.

Prefer design tokens over literal pixels whenever possible: `paddingTop: 'var(--space-safe-top)'` resolves to `62px` and stays consistent across every screen in the project.

When `env(safe-area-inset-*)` is available (real iOS Safari), it takes precedence. Our Sandpack iframes don't provide it, so use literal pixel values (or the token) as fallbacks:

```jsx
paddingTop: 'env(safe-area-inset-top, 62px)',
paddingBottom: 'env(safe-area-inset-bottom, 34px)',
```

## The two-layer pattern

**Outer wrapper**: full bleed edge-to-edge, with the base background color. No inset here — the background SHOULD touch all four edges.

**Inner content**: inset from the safe-area edges. This is where you put the top bar, content area, and bottom CTA/tab bar.

```jsx
// Outer: edge-to-edge, solid background
<div style={{
  minHeight: '100vh',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: '#FFFFFF',
}}>
  {/* Inner: safe-area-inset */}
  <div style={{
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 'var(--space-safe-top)',    // 62 — Dynamic Island
    paddingBottom: 'var(--space-safe-bottom)', // 34 — home indicator
  }}>
    <header>...</header>
    <main style={{ flex: 1 }}>...</main>
    <footer>...</footer>
  </div>
</div>
```

**Why two layers?** A common bug: applying `backgroundColor` on the inset container leaves a stripe of missing color above/below because the container is inset. The outer layer covers that — the status bar area and home indicator area get the SAME background as the rest of the screen.

## Status bar tint

When content sits directly under the status bar (no opaque app header), the bar text (clock, battery) needs to be legible against that background:

- Light background (white, light gray) → **dark** status bar text (default).
- Dark background (black, dark blue, photo overlay) → **light** status bar text.

In our tool, set it via a data attribute on the outer wrapper that the debug chrome reads:

```jsx
<div data-status-bar="light" style={{ background: '#000', /* ... */ }}>
```

For mid-brightness photos (hero images), dim the top 80px with a gradient so light text stays readable:

```jsx
background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 80px), url(...)'
```

## When to bleed under the status bar

**Bleed (content extends into the safe-area top)**:
- Hero images. Video players. Photo galleries. Immersive content.
- Apply a dimming gradient so the status bar text stays readable.

**Don't bleed**:
- Forms. Lists. Settings screens. Any screen with a traditional top bar.
- The top bar itself should start AT the inset edge (y = 62 on iPhone 17 — Dynamic Island), not above it.

## Common mistakes

| ❌ Don't | ✅ Do |
|---|---|
| Put the logo/title at y=0 | Inset by 62px from the top (Dynamic Island clearance) |
| Put a bottom CTA at y = 100vh - 48 | Inset by 34px from the bottom for home indicator |
| Use `padding: 16px` everywhere without thinking about safe area | Use `paddingTop: 'var(--space-safe-top)'`, `paddingBottom: 'var(--space-safe-bottom)'`, `paddingX: 'var(--space-screen-px)'` |
| Apply backgroundColor only to the inset container | Apply it to the outer full-bleed wrapper |
| Place horizontal swipe actions in the bottom 34px | Keep interactive gestures above the home-indicator zone |
| Pad the top by 47 (old notch value) | Pad by 62 — every modern iPhone has a Dynamic Island |

## Edge cases

- **Top-bar hero overlap**: when a screen has both a hero image AND a top bar, the top bar sits OVER the hero with a translucent / blur backdrop, starting at y = 47. Scroll causes the bar to become opaque.
- **Modal that takes full viewport**: inherits the parent's safe area, don't double-inset.
- **Full-screen modal that covers the status bar**: the modal's background extends to the top edge; apply its own safe-area inset to its content.
