/**
 * Always-on "HOW" layer injected into every agent's system prompt
 * (orchestrator, reviewer, focused sub-reviewers, screen sub-agents,
 * seed sub-agent).
 *
 * This is the counterpart to `project.md` — the user's `project.md`
 * describes WHAT the product is; this describes HOW Open Canvas builds
 * any product. It codifies the runtime stack (React in Sandpack, no
 * Tailwind, inline styles, framer-motion presets) and the shared-file
 * conventions (`./components/`, `./services/`, `./data/`, `./motion.js`,
 * `./services/router.js`) so every agent — regardless of which part of
 * the pipeline it sits in — emits code that composes with the rest of
 * the canvas.
 *
 * Keeping this in one file means a convention change lands everywhere
 * at once instead of drifting across five system prompts.
 */

export const STACK_GUIDELINES = `# Stack & conventions (how we build — always applies)

## Runtime
- Every screen is a React component running in a Sandpack iframe. No build step, no bundler config.
- Plain React: \`export default function App() { ... }\`. If you use any hooks, the FIRST line MUST be \`import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';\` (import only the hooks you need, always React itself).
- Only these packages are available inside Sandpack: \`react\`, \`react-dom\`, \`framer-motion\`, and the project's own \`./components/\`, \`./services/\`, \`./data/\`, \`./motion.js\`, \`./services/router.js\`, \`./centralIcons\` (icon component — see Icons section below), \`./component-tokens\` (per-component style contract — see Component tokens section below). Do NOT \`import\` anything else — Sandpack will throw ModuleNotFound.

## Component tokens — the per-component style contract
Component-level styling lives in a projected Sandpack file at \`/component-tokens.js\`. Every seeded component (Button, Card, TextField, Switch, SegmentedControl, TabBar, NavBar, IconSwap) reads its surface/ink/radius/padding from there. Agent-generated screens should do the same when they want to match the system:

\`\`\`jsx
// From a screen (/App.js) — drop the resolved style into the element:
import { STYLE } from './component-tokens';
<button style={{ ...STYLE['button-primary'], minHeight: 44 }}>Continue</button>

// From a shared component (/components/MyThing.js) — one level up:
import { STYLE } from '../component-tokens';
\`\`\`

Available entries: \`button-primary\`, \`button-primary-pressed\`, \`button-primary-disabled\`, \`button-secondary\`, \`button-secondary-pressed\`, \`button-ghost\`, \`button-ghost-pressed\`, \`card\`, \`card-interactive-pressed\`, \`text-field\`, \`text-field-label\`, \`text-field-focus-ring\`, \`text-field-error-ring\`, \`text-field-error-message\`, \`text-field-helper-message\`, \`text-field-placeholder\`, \`text-field-filled\`, \`switch-track-off\`, \`switch-track-on\`, \`switch-thumb\`, \`segmented-control\`, \`segmented-control-pill\`, \`segmented-control-label-active\`, \`segmented-control-label-inactive\`, \`tab-bar\`, \`tab-item-active\`, \`tab-item-inactive\`, \`nav-bar\`, \`nav-bar-title\`, \`nav-bar-title-large\`, \`nav-bar-subtitle\`, \`nav-bar-badge\`, \`nav-bar-icon-button\`, \`nav-bar-text-action\`, \`icon-swap-plain\`, \`icon-swap-tinted\`, \`icon-swap-filled\`, \`focus-ring\`. The \`components:\` section of the DESIGN.md YAML front matter (prepended to design.md) is the authoritative list — check it for the current contract.

## Styling
- Inline styles via \`style={{...}}\`. NO Tailwind, NO CSS imports, NO className utilities, NO \`<style>\` tags.
- Reference design tokens as CSS variables: \`var(--color-*)\`, \`var(--space-*)\`, \`var(--radius-*)\`, \`var(--font-*)\`. The canvas context each turn lists which tokens are defined, with both light and dark values.
- **Dual-syntax references in design.md prose.** Tokens can be referenced two equivalent ways — both are valid and interchangeable:
  - **CSS-var form** (what you emit in JSX \`style={{…}}\` inline styles): \`var(--color-brand)\`, \`var(--space-screen-px)\`, \`var(--radius-md)\`, \`var(--font-body-size)\`.
  - **Google-DESIGN.md form** (what the YAML front matter + component-tokens use): \`{colors.brand}\`, \`{spacing.screen-px}\`, \`{radius.md}\`, \`{typography.body}\`.
  When writing code, always use the CSS-var form (that's what the browser understands). When writing design.md prose or component-tokens, either form is fine — the linter validates both. Rule of thumb: code → \`var(--…)\`; tokens.json export + DESIGN.md YAML → \`{group.name}\`.
- Colors have a defined palette — 3 backgrounds, 3 foregrounds, brand, 3 state colors — each with light + dark variants baked into the CSS vars. Use the semantic name (\`var(--color-bg-primary)\`, \`var(--color-fg-secondary)\`, \`var(--color-brand)\`, \`var(--color-state-error)\`); dark-mode values swap automatically via \`[data-theme="dark"]\` + \`@media (prefers-color-scheme: dark)\`.
- Spacing has both a numeric scale (\`var(--space-xs)\`..\`var(--space-3xl)\`) and conventional semantic tokens — prefer the semantic ones where they fit: \`var(--space-screen-px)\` (horizontal screen padding), \`var(--space-safe-top)\` (iPhone Dynamic Island clearance), \`var(--space-safe-bottom)\` (home indicator), \`var(--space-inset)\` (card / list-row inset), \`var(--space-stack-gap)\` (default vertical stack gap), \`var(--space-section-gap)\` (gap between major sections).
- Default font: \`fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif'\` — we target iOS-native feel.
- Layout is flex-first: \`display: 'flex'\`, \`flexDirection\`, \`gap\`, \`justifyContent\`, \`alignItems\`. NEVER absolute positioning for structural layout, NEVER margin-based horizontal alignment.
- Top-level wrapper MUST be \`<div style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column' }}>\` with the screen background (\`var(--color-bg-primary)\`) set on it so it bleeds edge-to-edge.

## Shared files (the project's internal library)
- \`./components/{Name}.js\` — shared UI primitives (Button, Card, ListRow, TabBar, NavBar, EmptyState). PascalCase name. Import as \`import Name from './components/Name';\`. Idempotent by name — calling createComponent again with the same name updates in place.
- \`./services/{name}.js\` — shared logic / state / side-effects. camelCase name. Import as \`import { hook } from './services/{name}';\`. Examples: \`gameState\`, \`session\`, \`toast\`, \`router\`.
- \`./data/{entity}.js\` — seeded domain data entities. camelCase plural (\`recipes\`, \`users\`). Import as \`import { recipes, findRecipe } from './data/recipes';\`. Defined via defineDataEntity; seeds fill asynchronously.
- \`./motion.js\` — named framer-motion presets (fade, slideUp, slideDown, scale, bouncy, pushLeft) plus \`<Motion>\` and \`<MotionList>\` helpers. Use \`<Motion preset="slideUp">\` for reveals; drop to raw \`motion.*\` only when the preset library doesn't cover the case.
- \`./services/router.js\` — Link + useParams. Use \`<Link to="/detail?id={id}">...</Link>\` for internal nav. Detail screens read params with \`const { id } = useParams();\`. NEVER use \`<a href="/internal-path">\` for internal nav.

## Data flow between screens
- List → detail: querystring params. \`<Link to={\\\`/recipe-detail?id=\${recipe.id}\\\`}>\` on the list row; \`const { id } = useParams(); const recipe = findRecipe(id);\` on the detail screen.
- Never inline two different hardcoded arrays of the same entity across screens — clicking row A must show row A in the detail screen. Either defineDataEntity once and import it, or createService with a shared hook.
- Transactional flows (cart, checkout, booking, ordering, finance) need a shared service for active state and derived values: selected items, quantities, subtotal, fees, tax, total, address/payment selections, confirmation/order ids, and mutating actions. If two screens show the same value, they import it from the same service/helper. Do not let each screen hardcode or independently recompute totals.

## Mobile conventions — iOS-first (Android: support, don't optimize)
**This tool designs iOS apps.** Android ships because React Native makes it cheap; every design decision is made for iOS and Android just renders it. Default viewport is \`iphone-17-pro\` (402×874) — use the plain \`iphone-17\` or \`iphone-17-pro-max\` variants only when the brief specifically calls for a smaller or larger device.
- Design edge-to-edge like a real iOS app: status-bar area at top, content fills width, primary action pinned bottom above the home indicator.
- Safe-area padding via tokens: \`paddingTop: 'var(--space-safe-top)'\` (62px — Dynamic Island clearance on iPhone 14 Pro / 15 / 16 / 17), \`paddingBottom: 'var(--space-safe-bottom)'\` (34px — home indicator). Never literal pixel values — the tokens keep this consistent across every screen.
- Aesthetic is Apple HIG, NOT Material. No FABs. No hamburger drawers. No Material ripple. Tab bar (3-5 items) for top-level destinations.
- \`transform: scale(0.97)\` on \`:active\` for every tappable element. Tap targets ≥ 44×44. This is the #1 "feels native" win on iOS.
- \`@media (hover: hover)\` gates every hover state so hovers don't stick on touch.
- Inputs ≥ 16px font-size to prevent iOS zoom-on-focus.
- Status-bar ink color: dark on light backgrounds, light on dark/hero screens.

## Icons — via the centralIcons virtual file (the ONLY supported path)
**ALWAYS import from the project's \`centralIcons\` module. NEVER from \`'@central-icons-react/…'\`.** The npm packages are NOT available inside Sandpack — the bundler will throw \`DependencyNotFoundError\`. The project ships the entire 1970-icon set (both filled + outlined variants) pre-bundled as a Sandpack virtual file at the PROJECT ROOT (\`/centralIcons.js\`). Use the right RELATIVE path based on where YOUR file sits:

- Screens (\`/App.js\` at root): \`import { Icon } from './centralIcons';\`
- Shared components (\`/components/Foo.js\`): \`import { Icon } from '../centralIcons';\`
- Services (\`/services/foo.js\`): \`import { Icon } from '../centralIcons';\` (rarely needed there, but same relative depth)

\`\`\`jsx
// In a screen:
import { Icon } from './centralIcons';

// In a component inside /components/:
import { Icon } from '../centralIcons';

// Default (outlined, size 24, inherits color from parent):
<Icon name="IconHome" />

// Filled for active / selected state:
<Icon name="IconHome" variant="filled" color="var(--color-brand)" />

// Meaningful icon with label — becomes role="img":
<Icon name="IconBell" ariaLabel="Notifications" size={20} />
\`\`\`

Props: \`name\` (required, PascalCase starting with "Icon"), \`variant\` ("filled" | "outlined", default "outlined"), \`size\` (number | string, default 24), \`color\` (CSS color, default "currentColor"), \`ariaLabel\` (makes it accessible; omit for decorative icons — they're aria-hidden by default). Any other prop passes through to the underlying \`<svg>\`.

- **Search BEFORE writing \`<Icon name="…">\`.** Call \`searchIcons({ query: "chart statistics" })\` to get exact names; guessing will render null + report a runtime error. Names are specific: "IconCreditCard1" not "IconCreditCard", "IconSettingsGear1" not "IconSettings", "IconChart1" not "IconBarChart".
- Screen sub-agents can call \`searchIcons\` before final code when they need an exact name, but the orchestrator should still pass an "Approved icons" list in the brief/sharedContext when it already knows the icons. Screen/component code may use ONLY searched or approved names verbatim. If no approved icon exists for a concept, use text or a non-icon visual instead of inventing a name.
- Variant rule of thumb (iOS convention): **outlined** for default / inactive / decorative (nav bar buttons, disclosure arrows, list accessories, empty-state illustrations). **Filled** for selected / active / primary (the active tab-bar icon, toggle on-state, primary CTA accent). Mixing filled-in-active + outlined-in-inactive within the same tab bar / button group is the canonical iOS pattern.
- Size by role: 16 for inline badges, 20 for text-row accessories, 24 for primary UI icons (default), 28 for tab-bar icons, 40+ for empty-state hero icons. Keep tap targets ≥ 44×44 even if the glyph is 24 — pad the hit zone on the wrapping button/element.
- Color via the \`color\` prop (or CSS \`color\` inheritance from the wrapper). Use token vars: \`color="var(--color-fg-primary)"\` for body icons, \`"var(--color-fg-secondary)"\` for muted accessories, \`"var(--color-brand)"\` on active nav state, \`"var(--color-state-error)"\` on destructive.

## Accessibility & motion defaults
- Icon-only buttons have \`aria-label\`. Visible focus state on every interactive element.
- Animations on \`transform\` / \`opacity\` only — never \`width\`, \`height\`, \`top\`, \`left\`, \`margin\`. No \`transition: all\`.
- Easing: ease-out for enters, ease-in for exits, ease-in-out for movement. Respect \`prefers-reduced-motion\`.
- Dynamic numbers: \`fontVariantNumeric: 'tabular-nums'\` to prevent layout shift on counters/timers/prices.

## Content
- Realistic placeholder text — real-sounding names, prices, dates. NEVER Lorem ipsum, NEVER "Example 1 / Example 2".
- If you reference a shared data entity (defineDataEntity), render rows from it; do NOT invent inline duplicates.
`;
