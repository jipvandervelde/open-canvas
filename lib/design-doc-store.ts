/**
 * Design brief (`design.md`) — the taste profile every agent consults
 * for "what should this look and feel like." Sits alongside project.md
 * (WHAT) and stack-guidelines (HOW) in the agent framing block.
 *
 * Unlike project.md (which starts empty and gates the agent until the
 * user describes what they're building), design.md ships **pre-seeded**
 * with a default taste profile distilled from the repo's embedded
 * skills (emil-design-engineering, benji-consumer-craft, make-interfaces-
 * feel-better, react-native-mastery) plus the industry convergence on
 * DESIGN.md structure documented in 2026:
 *
 * - [getdesign.md](https://getdesign.md)
 * - [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)
 * - [Google Stitch's design.md pattern](https://www.mindstudio.ai/blog/what-is-google-stitch-design-md-file)
 * - [designproject.io — how to write a design.md AI agents actually follow](https://designproject.io/blog/design-md-file/)
 *
 * The default is not a placeholder: it's a working taste manifesto the
 * user can ship with as-is. Jip refines it over time — that's the "living
 * personal-design-intelligence" pattern — and both the user and the agent
 * can `writeDesignDoc({ markdown })` to evolve it.
 */

const STORAGE_KEY = "oc:design-doc:v1";

/**
 * Default taste manifesto — seeded from the embedded skill library. The
 * deeper skill files (emil/*, benji/*, mifb/*, rnm/*) remain authoritative
 * for specifics; this is the synthesized top-level that applies to every
 * screen regardless of which skill was pulled.
 *
 * Design goal for this text: concise enough that Jip reads it in 90 seconds
 * and recognizes his own taste, specific enough that the model doesn't
 * default to generic SaaS rounded-gradient slop when it references it.
 */
export const DESIGN_DOC_DEFAULT = `# Design brief

## Platform target — iOS first, Android second

**This tool designs iOS apps.** Android is a "ship, don't optimize" target — we support it because React Native makes universal shipping cheap, but every design decision should be made as if iOS is the only platform, and then we verify nothing actively breaks on Android.

- **Default viewport is \`iphone-17-pro\` (402×874).** Every screen you build is designed against iPhone Pro first. Dynamic Island at top, home indicator at bottom, iOS system fonts, iOS blue accent, iOS System Colors palette. The standard \`iphone-17\` and \`iphone-17-pro-max\` variants are available when the brief calls for a smaller or larger device; in every other case, Pro is the target.
- **Aesthetic is Apple HIG, not Material.** No elevation cards with colored shadows. No FAB. No hamburger drawers. No bottom-nav labels that flip between filled-when-active and outlined-when-active in Material style.
- **Platform conventions** follow Apple's: tab bar (not bottom app bar), grouped lists with rounded corners, action sheets from the bottom, right-arrow disclosure indicators on list rows, segmented controls instead of tabs-in-body.
- **Android is acceptable drift**, not a design target. If something would look bad on Android, we accept it: ship the iOS-perfect version and let Android render it. Don't compromise iOS to look "balanced" across platforms.
- **Dark mode**: every design token ships with a light + dark value. Design both — not one as the "real" version and the other as an afterthought. iOS users flip between them based on ambient light and time of day.

## Design tokens — the names to reach for

Every value should be a CSS variable. The Tokens panel owns the live map (names + values + light/dark); this section is the role-directory so you know which token to pick for which job. **Current values are injected below \`design.md\` at run time** — the names here are authoritative, the numbers live in the store.

**Colors** — every color token has a light + dark value; dark mode swaps automatically.
- \`var(--color-bg-primary)\` — main screen background
- \`var(--color-bg-secondary)\` — cards, grouped list rows
- \`var(--color-bg-tertiary)\` — inputs inside cards, pressed rows, raised controls inside a secondary surface
- \`var(--color-fg-primary)\` — body copy, icons
- \`var(--color-fg-secondary)\` — muted labels
- \`var(--color-fg-tertiary)\` — placeholders, disabled text
- \`var(--color-brand)\` — the ONE accent. Always exactly one per screen.
- \`var(--color-state-success)\` / \`var(--color-state-warning)\` / \`var(--color-state-error)\` — intent-bearing status colors only; never decorative.

**Mode-invariant constants** — identical value in light and dark; use when the literal color is intentional regardless of theme.
- \`var(--color-white)\` — ink on colored buttons (e.g. white text on a brand-filled CTA), backdrop highlights.
- \`var(--color-black)\` — modal backdrop fills, the ink-on-brand-yellow kind of edge case. NOT a substitute for \`fg.primary\` — \`fg.primary\` inverts in dark mode; \`black\` stays black.

**Spacing** — numeric scale + conventional semantic tokens.
- Scale: \`var(--space-xs)\` → \`var(--space-3xl)\`.
- Semantic: \`var(--space-screen-px)\` (horizontal screen padding) · \`var(--space-safe-top)\` (iPhone Dynamic Island clearance) · \`var(--space-safe-bottom)\` (home indicator) · \`var(--space-inset)\` (card / list-row inset) · \`var(--space-stack-gap)\` (default vertical stack gap) · \`var(--space-section-gap)\` (gap between major sections).
- **Prefer the semantic names over the numeric scale** when they fit — they read as intent ("inset a card", "clear the Dynamic Island") rather than magnitude.

**Radius**: \`var(--radius-xs)\` through \`var(--radius-xl)\` for content, \`var(--radius-pill)\` for fully-rounded CTAs.

**Font size** — rough Apple HIG mapping: \`var(--font-caption)\` · \`footnote\` · \`body\` · \`callout\` · \`title\` · \`headline\` · \`display\`. Three levels per screen is plenty — more usually means the IA is overloaded.

## Visual theme & atmosphere

- **Native-feeling, not web-shrunk.** Every screen should look like a real iOS app, not a responsive website at phone width. Status bar area, edge-to-edge content, bottom-weighted primary actions. The viewport is an iPhone; treat it like one.
- **Crafted, not committee.** Prefer products that feel like a single person made them with care. Restraint IS the craft — progressive disclosure over showing every control at once.
- **Flat with intent.** No decorative gradients. No drop shadows as ornament. Flat color planes, real contrast, shadows used only to carry depth meaning.
- **Specific > accurate.** "Minimal" means nothing. What we mean: flat color planes, inline styles using design tokens, consistent 1px hairlines or no borders at all (shadows instead), no unnecessary chrome, big tap targets, one accent colour used sparingly.

## Color

- **Tokens only.** Raw hex is a smell. Every colour references \`var(--color-*)\` — never inline \`#007AFF\`, use \`var(--color-brand)\`.
- **Semantic roles.** Reach for the role that describes intent: \`bg.primary\` for the screen, \`bg.secondary\` for cards, \`fg.secondary\` for muted labels. Don't invent ad-hoc grays; pick the closest semantic.
- **Three backgrounds, three foregrounds.** The palette is intentionally small. If you find yourself wanting a fourth shade, the IA is probably over-layered — collapse a layer instead of adding a token.
- **Tints via \`color-mix\`.** For a brand-tinted background, write \`color-mix(in oklch, var(--color-brand) 12%, transparent)\`. Never hardcode a "muted blue" — it drifts from the brand when the user changes the accent.
- **State colours are intent-bearing.** Use \`var(--color-state-success/warning/error)\` for validation, toasts, and status pills. Don't use them as decorative accents.
- **High contrast on data-heavy views.** Body text hits AA minimum against its surface. Tabular data uses \`fg.primary\`, never muted.

## Typography

- **System fonts** on both modes: \`fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif'\`. Costs zero bytes, matches the platform, gives native feel.
- **Hierarchy is three steps, not seven.** A screen usually has: title (\`--font-title\` or \`--font-headline\`, 600-700), body (\`--font-body\`, 400), caption/footnote (\`--font-footnote\` or \`--font-caption\`, 500). More levels means the screen has too much; cut it.
- **Tabular numerals on changing numbers.** Counters, timers, prices, percentages — \`fontVariantNumeric: 'tabular-nums'\` prevents layout shift.
- **Optical alignment over geometric.** Buttons with icons, play triangles, and asymmetric glyphs need manual nudges — a 1-2px offset against the math is usually right.
- **Font smoothing on light-on-dark only.** \`-webkit-font-smoothing: antialiased\` is correct there; don't apply it everywhere.

## Layout & spacing

- **Flex-first. Always.** Every multi-child container uses \`display: flex\` with \`flexDirection\`, \`gap\`, \`justifyContent\`, \`alignItems\`. Absolute positioning is for overlays and tooltips, not structural layout.
- **Reach for semantic spacing tokens first.** Screen horizontal padding: \`var(--space-screen-px)\`. Safe-area top/bottom: \`var(--space-safe-top/bottom)\`. Default stack gap: \`var(--space-stack-gap)\`. Gap between major sections: \`var(--space-section-gap)\`. Use the numeric scale (\`xs..3xl\`) only when a semantic token doesn't fit.
- **Edge-to-edge by default on mobile.** Content fills the viewport width. Padding is internal to cards, not around the screen body. The screen background bleeds to all four edges.
- **Concentric border-radius.** Outer radius = inner radius + padding. A 16-radius card with 12 padding holds a 4-radius chip. Mismatched radii are the #1 tell that a screen feels off.

## Surfaces, depth & elevation

- **Shadows > borders.** For elevated surfaces prefer \`boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 4px 12px -2px rgba(0,0,0,0.08)'\` over a 1px stroke. Borders are for INPUTS and list-row separators only.
- **Inset shadows for pressed/held states.** Outset for elevation, inset for depression.
- **Three-tier surface system maps to tokens**: \`bg.primary\` (the screen), \`bg.secondary\` (card / panel), \`bg.tertiary\` (raised controls INSIDE a card, e.g. pill filters, inputs). Don't introduce a fourth shade — collapse the IA if you want to.

## Motion

- **Transform + opacity only.** Never \`width\`, \`height\`, \`top\`, \`left\`, \`margin\`, \`padding\`. Never \`transition: all\`.
- **Easing by intent**: \`cubic-bezier(0.22, 1, 0.36, 1)\` (ease-out) for enters, \`cubic-bezier(0.64, 0, 0.78, 0)\` (ease-in) for exits, \`cubic-bezier(0.65, 0, 0.35, 1)\` (ease-in-out) for movement. Durations: 150ms micro, 220-280ms component, 400-500ms page-level.
- **Spring for tactile.** Press bounce, pull-to-refresh, drag-end. Use framer-motion's \`{ type: 'spring', stiffness: 340, damping: 26 }\` as a default.
- **Respect \`prefers-reduced-motion\`.** Shorten to 80ms or skip the transform entirely; never remove the state change itself.
- **Delight-Impact Curve.** Reserve the most elaborate animation for the most infrequent moment (onboarding complete, first send). Common micro-interactions stay subtle.
- **Staggered reveals on page load** — one well-orchestrated entrance beats scattered micro-interactions.

## Interaction

- **Tap targets ≥ 44×44**, even when the visual element is smaller — expand the hit area with \`padding\` or \`::before\`.
- **\`transform: scale(0.97)\` on \`:active\`** for every tappable surface. Bouncy feedback is the single biggest "feels native" win on iOS.
- **Hover behind \`@media (hover: hover)\`** — always. Hover states that stick on touch devices are the hallmark of a web app pretending to be native.
- **Visible focus state on every interactive element.** \`outline: 2px solid var(--color-brand)\` with \`outline-offset: 2px\` is the floor.
- **Progressive disclosure.** Hide every control until the moment it matters (Dynamic Tray pattern). A screen with 12 equally-weighted buttons has no primary action.
- **Icon-only controls have \`aria-label\`.** Non-negotiable.

## Component patterns

- **Buttons**: primary = filled \`var(--color-brand)\`; secondary = ghost with inset 1px hairline \`var(--color-bg-tertiary)\`; destructive = filled \`var(--color-state-error)\`. Height 48-50 on mobile, 36 on desktop. Border-radius \`var(--radius-md)\` for actions, \`var(--radius-pill)\` for CTAs. Never transparent-over-transparent; always a solid background you can press.
- **Cards**: \`var(--color-bg-secondary)\` background, \`var(--radius-lg)\` radius, shadow for elevation. Inner padding \`var(--space-inset)\`. No border unless paired with zero shadow.
- **Inputs**: minimum 16px font-size on mobile (prevents iOS zoom-on-focus). Height 44-48. Border only on idle; flip to 1px \`var(--color-brand)\` + soft ring on focus. Placeholder uses \`var(--color-fg-tertiary)\`, not a raw gray.
- **Lists & rows**: iOS grouped-list pattern. Row uses \`var(--color-bg-secondary)\` group with hairline separators \`color-mix(in oklch, var(--color-fg-primary) 10%, transparent)\`. Press state scales 0.98. Disclosure indicator (›) right-aligned with \`var(--color-fg-tertiary)\`.
- **Tab bar**: 3-5 items max, 48-56 height, icon 24 + label 10-11px in \`var(--font-caption)\`, \`var(--color-brand)\` fills the active label. Bottom-pinned, above \`var(--space-safe-bottom)\`.

## iOS-first defaults (iphone-*, ipad viewports)

- **Safe-area padding**: \`paddingTop: 'var(--space-safe-top)'\` (Dynamic Island clearance) and \`paddingBottom: 'var(--space-safe-bottom)'\` (home indicator). Always use the tokens; never hardcode the pixel value.
- **Status-bar ink**: dark on light screens, light on dark/hero screens. Set before first paint so the chrome isn't wrong on the first frame.
- **Bottom-weighted primary action**: the CTA sits above the home indicator, never at the top of a long screen.
- **Sheets over new screens for transient tasks.** If dismissing returns you to the same parent, it's a sheet (swipe-down, grabber at top, rounded top corners).
- **Grouped lists by default**, not plain tables — iOS users expect this on Settings-style screens.
- **Never a hamburger.** iOS apps use tab bars for top-level destinations. If the project brief implies more than 5 top-level destinations, use a "More" tab, not a drawer.

## Android — support, don't optimize

- Screens built against iOS conventions render fine on Android via React Native's platform renderers. Don't second-guess.
- Don't add Material ripple effects, FABs, or bottom app bars to "feel Android-native" — the design system is iOS; Android users on our apps know they're getting an iOS-styled experience.
- The ONE Android-specific check worth doing: status-bar colour and insets. Expo's StatusBar defaults work; don't hand-roll Android-specific logic unless the brief demands it.

## Do's

- Use design tokens for every colour, space, radius, font. No raw values.
- Bake in realistic placeholder content — real names, prices, dates.
- Pre-render static frames; animate only what the user needs to perceive.
- Keep line-height tight for headings (1.15-1.25), loose for body (1.5-1.6).
- Design both light AND dark — ship a screen only when both modes read cleanly.

## Don'ts

- ❌ Material-style UI: FAB, ripple, Android-style bottom nav, hamburger drawer.
- ❌ Generic SaaS aesthetic — rounded pastel gradients, glassmorphism without reason, "vibrant" gradient buttons.
- ❌ Lorem ipsum. Example 1/Example 2. "Placeholder".
- ❌ \`transition: all\`.
- ❌ Hover-only affordances.
- ❌ Animating layout properties.
- ❌ Three-plus font families per screen.
- ❌ Raw hex or px values where a token exists.
- ❌ Icon-only buttons without \`aria-label\`.
- ❌ Dark-mode as a "quick swap" — if the design falls apart in dark, redesign it; don't ship it.

## Agent prompt guide (quick reference for sub-agents)

- Given a screen brief, reach for the smallest component set that could deliver it. Re-use before inlining.
- When in doubt on a value: pick the darker text, the larger spacing, the smaller radius, the shorter transition. Restraint wins.
- Surface ONE primary action per screen. Surface ONE accent colour. Surface TWO text weights. Anything more needs to justify itself.
- Default viewport: \`iphone-17-pro\`. Default font: system. Default accent: \`var(--color-brand)\`. Default surface: \`var(--color-bg-primary)\`. These are the answers when the brief doesn't specify.
- If a detail is undefined in the brief and undefined here, look for the answer in the embedded skills (emil-*, benji-*, mifb-*, rnm-*) before guessing.
`;

type DesignDoc = {
  markdown: string;
  updatedAt: number | null;
  lastWriter: "user" | "agent" | "default" | null;
  /** When true, the current markdown is the unmodified default seed. Used
   *  by the UI to show a "seeded from skills" badge; cleared on any user
   *  or agent write. */
  isDefault: boolean;
};

type Listener = (doc: DesignDoc) => void;

const INITIAL: DesignDoc = {
  markdown: DESIGN_DOC_DEFAULT,
  updatedAt: null,
  lastWriter: "default",
  isDefault: true,
};

function safeRead(): DesignDoc {
  if (typeof window === "undefined") return { ...INITIAL };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...INITIAL };
    const parsed = JSON.parse(raw) as Partial<DesignDoc>;
    return {
      markdown:
        typeof parsed.markdown === "string" && parsed.markdown.length > 0
          ? parsed.markdown
          : DESIGN_DOC_DEFAULT,
      updatedAt:
        typeof parsed.updatedAt === "number" ? parsed.updatedAt : null,
      lastWriter:
        parsed.lastWriter === "user" ||
        parsed.lastWriter === "agent" ||
        parsed.lastWriter === "default"
          ? parsed.lastWriter
          : "default",
      isDefault: Boolean(parsed.isDefault),
    };
  } catch {
    return { ...INITIAL };
  }
}

function safeWrite(doc: DesignDoc) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    /* quota / private-browsing — in-memory state still correct */
  }
}

let current: DesignDoc = safeRead();
const listeners = new Set<Listener>();

function emit() {
  const snap = { ...current };
  for (const l of listeners) l(snap);
}

export const designDocStore = {
  get(): DesignDoc {
    return current;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(markdown: string, writer: "user" | "agent") {
    current = {
      markdown,
      updatedAt: Date.now(),
      lastWriter: writer,
      isDefault: false,
    };
    safeWrite(current);
    emit();
  },
  /** Replace current content with the shipped default and mark as default. */
  resetToDefault() {
    current = {
      markdown: DESIGN_DOC_DEFAULT,
      updatedAt: null,
      lastWriter: "default",
      isDefault: true,
    };
    safeWrite(current);
    emit();
  },
};
