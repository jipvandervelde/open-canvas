---
name: tab-bar
scope: sub-agent
triggers: tab bar, bottom tab, bottom navigation, tab navigation, active tab, navigation bar, tabbar, tab switcher, bottom nav
viewports: iphone-17, iphone-17-pro-max, ipad
---

# The Bottom Tab Bar

The defining element of a mobile app's top-level structure. This doc covers the specific measurements, states, and behaviors that make a tab bar feel native — iOS-first with Android notes.

## Exact measurements (iPhone)

- Bar height: **49pt** (49px in our web-mobile mapping)
- Safe-area inset below: **34px** (home indicator zone)
- Total including inset: **83px**
- Icon size: **24×24**
- Icon-to-label gap: **2–3px**
- Label size: **10pt, weight 500**
- Horizontal padding: **0** (tabs fill full width)

```jsx
<nav style={{
  height: 49,
  paddingBottom: 'env(safe-area-inset-bottom, 34px)',
  display: 'flex',
  alignItems: 'stretch',
  justifyContent: 'space-around',
  background: 'rgba(255, 255, 255, 0.88)',
  backdropFilter: 'saturate(180%) blur(20px)',
  WebkitBackdropFilter: 'saturate(180%) blur(20px)',
  borderTop: '0.5px solid rgba(60, 60, 67, 0.29)',
  position: 'sticky',
  bottom: 0,
}}>
  {tabs.map((t) => (
    <TabButton key={t.id} tab={t} active={t.id === activeId} onClick={() => setActive(t.id)} />
  ))}
</nav>
```

## The translucent blur — non-negotiable for iOS feel

iOS tab bars are not opaque. They use a vibrancy effect — content scrolls UNDER the bar and you can see a blurred version of it through. This is what makes iOS feel iOS.

```css
background: rgba(255, 255, 255, 0.88);
backdrop-filter: saturate(180%) blur(20px);
-webkit-backdrop-filter: saturate(180%) blur(20px);
```

Without this, the tab bar reads as "web app with a bottom bar." With it, it reads as "iOS."

## Tab button anatomy

```jsx
function TabButton({ tab, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: '6px 0 2px',
        background: 'transparent',
        border: 'none',
        color: active ? 'var(--color-accent, #007AFF)' : 'rgba(60, 60, 67, 0.6)',
        minHeight: 49,
        touchAction: 'manipulation',
        transition: 'color 180ms ease',
      }}
      aria-label={tab.label}
      aria-current={active ? 'page' : undefined}
    >
      <Icon name={tab.icon} size={24} filled={active} />
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.1 }}>
        {tab.label}
      </span>
    </button>
  );
}
```

## Active state

The active tab is **tinted** in the accent color. iOS default is `#007AFF`; brand apps substitute their accent (Instagram black, Twitter blue, Spotify green, etc).

**The icon changes**, not just the color. Inactive tabs show outline icons; active tabs show filled icons. SF Symbols have this built-in; Lucide provides `X` and `XFill` variants (or you can toggle the `fill` attribute on the SVG).

Don't change font weight between active and inactive — that causes layout shift. Keep weight constant, color changes.

## Badge indicators

A small red dot on a tab icon (notification count or unread indicator):

```jsx
<div style={{ position: 'relative' }}>
  <Icon name={tab.icon} size={24} />
  {tab.badge > 0 && (
    <span style={{
      position: 'absolute',
      top: -4,
      right: -8,
      minWidth: 16,
      height: 16,
      padding: '0 4px',
      background: '#FF3B30',
      color: 'white',
      borderRadius: 8,
      fontSize: 10,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: 1,
    }}>
      {tab.badge > 99 ? '99+' : tab.badge}
    </span>
  )}
</div>
```

For a "new stuff here" dot without a count, use a 8×8 red circle without text.

## Tap-again-to-scroll-top

A native-feeling detail: tapping the ACTIVE tab a second time scrolls the section's main scroll area to the top.

```jsx
onClick={() => {
  if (tab.id === activeId) {
    scrollViewRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    setActive(tab.id);
  }
}}
```

## Center button (action-bar pattern)

Some apps (Instagram Create, TikTok Record) have a center FAB-like action button in the tab bar. It's visually distinct: larger, filled, not tinted inactive. Typically opens a modal for a creation flow.

```jsx
// The center "+" tab
<button style={{
  width: 56, height: 56,
  marginTop: -12, // pops above the bar
  borderRadius: 14,
  background: 'var(--color-accent)',
  color: 'white',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 4px 12px rgba(0, 122, 255, 0.3)',
}}>
  <PlusIcon />
</button>
```

## Layout orchestration

The tab bar is sibling to the content, not nested inside it:

```jsx
<div style={{
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
}}>
  <main style={{ flex: 1, overflowY: 'auto' }}>
    {/* The current tab's content */}
  </main>
  <TabBar />
</div>
```

The `<main>` flexes to fill all available space; the tab bar takes its intrinsic height. This ensures scroll stays INSIDE main, not above or below the tab bar.

## Counts matter

Tab bars work for **2–5 tabs**. Six or more → use stack-navigation + hamburger drawer or a profile-menu pattern instead.

Common tab compositions:
- **3 tabs**: Home, Activity, Profile
- **4 tabs**: Home, Search, Library, Profile
- **5 tabs**: Home, Search, Create (center), Notifications, Profile

## Anti-patterns

- Tabs that change structure per screen (sometimes visible, sometimes hidden) — user loses orientation.
- "More..." tab that opens a menu with 10 items → use a drawer instead.
- Putting the tab bar inside a scroll container → it scrolls away; bad.
- Visible-but-disabled tabs → confusing. Either show it enabled or hide it.
- Auto-rotating tabs when landscape → tabs should stay at the bottom on phones even in landscape.
