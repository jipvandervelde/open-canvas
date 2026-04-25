---
name: react-native-mastery
description: How to build mobile screens that feel like native iOS / Android apps — the conventions, spacing, gestures, and platform details that separate a "web app shrunk to phone width" from something that genuinely feels native. Use this skill FIRST whenever building for any mobile viewport (iphone-17, iphone-17-pro-max, ipad). Covers safe-area insets (notch / Dynamic Island / home indicator), navigation patterns (stack / tab / modal / drawer), bottom sheets, keyboard handling, pull-to-refresh, iOS vs Android conventions, and the status bar chrome. This skill's default assumption is that the tool builds apps meant to feel native, NOT responsive websites.
scope: orchestrator
triggers: mobile, ios, android, react native, native app, native-feeling, iphone, ipad, safe area, status bar, keyboard, pull to refresh, tab bar, bottom sheet, gesture, swipe, home indicator, notch, dynamic island
---

# React Native Mastery

**The user's mental model for this tool is "I'm building a native-feeling mobile app."** Even though the actual implementation is React web rendered inside a phone-shaped viewport, every screen should LOOK and BEHAVE like a native app would. That's the whole point of simulating iPhone / iPad viewports instead of just making things responsive.

This skill captures the conventions that make that illusion work. Lean on the sub-files for implementation specifics.

## The #1 rule: respect the safe area

The single most common mistake: placing content at the literal edge of the screen. On a real iPhone, the top 62px is the Dynamic Island area (iPhone 14 Pro / 15 / 16 / 17), older notch iPhones are ~47px, and the bottom 34px is the home indicator. Content there gets clipped, obscured, or fights the system gesture area.

**Default to the Dynamic Island value (62px).** The default viewport in this tool is `iphone-17-pro` (402×874), which has a Dynamic Island. All three iPhone 17 variants (standard, Pro, Pro Max) have Dynamic Islands in this pipeline. On older notch-only devices the extra 15px reads as slightly generous top padding — acceptable. The opposite (47px padding on a 62px inset) puts content directly under the Island, which is NOT acceptable.

Every screen MUST account for safe area insets:

```jsx
<div style={{
  minHeight: '100vh',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  paddingTop: 'env(safe-area-inset-top, 62px)',      // iPhone Dynamic Island
  paddingBottom: 'env(safe-area-inset-bottom, 34px)', // home indicator
  paddingLeft: 'env(safe-area-inset-left, 0px)',
  paddingRight: 'env(safe-area-inset-right, 0px)',
  background: '#FFFFFF',
}}>
  {/* content */}
</div>
```

For viewports without `env()` support (our Sandpack iframes), use the fallback values: 47px top for iPhone 17, 34px bottom. iPad has smaller insets (24px top, 20px bottom for non-Pro); desktops have none.

**See `react-native-mastery/safe-area` for the full table, status-bar-color conventions, and what goes inside vs outside the inset.**

## The second rule: the tab bar is anchored, not scrolled

If a screen has a bottom tab bar, it sits FIXED above the home indicator. The scroll happens in the content area between the top bar and the tab bar — not above or below. Classic mistake: making the tab bar part of the scrollable content.

```jsx
<div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
  <header style={{ /* top bar */ }}>...</header>
  <main style={{ flex: 1, overflowY: 'auto' }}>...</main>
  <nav style={{
    height: 83,                         // iOS tab bar height w/ home indicator
    paddingBottom: 'env(safe-area-inset-bottom, 34px)',
    flexShrink: 0,
  }}>...</nav>
</div>
```

## Sub-files

- **[safe-area](react-native-mastery/safe-area)** — exact inset values per viewport, status-bar tint conventions, when to inset and when to bleed edge-to-edge. Auto-injected for mobile viewports.
- **[navigation](react-native-mastery/navigation)** — stack / tab / modal / drawer patterns, directional transitions, when to use which.
- **[bottom-sheets](react-native-mastery/bottom-sheets)** — sheet patterns (peek/half/full stops), gestures, backdrop, sibling to Family's Dynamic Tray.
- **[keyboard-handling](react-native-mastery/keyboard-handling)** — KeyboardAvoidingView equivalents for mobile web, scroll-on-focus, input dismissal, sticky composer patterns.
- **[ios-vs-android](react-native-mastery/ios-vs-android)** — platform conventions (colors, icons, back behavior, gesture vs button). Most consumer apps lean iOS; respect when the user asks for Android-specific.
- **[tab-bar](react-native-mastery/tab-bar)** — the bottom tab pattern in depth: heights, active/inactive states, icon + label conventions, haptic on tap.

## Principles that apply to every mobile screen

1. **Edge-to-edge, inset-aware.** The OUTER container (`minHeight: 100vh, width: 100%`) bleeds edge-to-edge with a solid background. INNER content is inset from the safe-area edges.
2. **Tap targets ≥ 44×44 pt.** Apple's HIG minimum. Use padding on the hit zone, not visible sizing — a 24×24 icon can still be a 44×44 tap target.
3. **One primary action per screen.** The CTA lives at the bottom (above the tab bar if present). Secondary actions live in the top bar or as swipe actions.
4. **Status bar matches content.** Light bar on dark hero, dark bar on light screen. Set the background color behind the status bar to match the top of your screen — see `safe-area`.
5. **No hover, only pressed.** Phones don't have hover. All feedback states are `:active` (scale(0.97)) or focus.
6. **Respect the home-gesture area.** Don't put horizontal swipe actions in the bottom 34px — they compete with system-level swipe-to-home.
7. **Mobile keyboards change layout.** When an input focuses, the bottom half of the screen is covered. Plan for this — inputs near the bottom should scroll up OR the composer should stick to the keyboard top.

## When the viewport is desktop

This skill does not apply. Use `emil-design-engineering` or `make-interfaces-feel-better` for desktop conventions. Safe area insets are always 0 on desktop; don't add them.
