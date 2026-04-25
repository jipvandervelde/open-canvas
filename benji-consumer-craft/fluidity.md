---
name: fluidity
scope: sub-agent
triggers: tray, drawer, sheet, bottom sheet, modal, overlay, expand, collapse, progressive disclosure, flow, multi-step, wizard, checkout flow, wallet, finance, banking, crypto, tab switch, page transition, navigation pattern, hide, reveal, onboarding
---

# Fluidity & Progressive Disclosure

Source: [Family Values](https://benji.org/family-values) — the Family crypto wallet design essay by Benji Taylor.

---

## The three principles, in order

Family is organized around three principles, and the order is important. **Simplicity** constrains what exists on-screen. **Fluidity** dictates how things transition between states. **Delight** is applied sparingly where it has the most emotional impact.

### Simplicity — reveal complexity only when it's relevant

The default state should show only what the user needs at THIS moment. Everything else appears contextually as it becomes relevant.

> "Hundreds of potential user paths reduced through intentional design. Everything else would appear as it became most relevant to you."

Practical implications:
- Home screen shows balance + send + receive + swap. Not a dense feed, not a grid of 14 icons.
- Advanced settings live one layer down behind a clear entry point ("Security," "Connected apps"), not spread across multiple top-level tabs.
- In onboarding, do NOT present every option upfront. Map the path and reveal alternatives as the user traverses it.

### Fluidity — transitions as physical space

Every movement between screens or states should feel like natural progression through space. Nothing should teleport; everything should *travel*.

> "Each transition should feel like a natural progression, smoothly guiding the user from one point to the next. We fly instead of teleport."

Practical implications:
- Tapping a left tab animates from left; tapping right animates from right. Direction is meaning.
- Chevrons rotate during multi-step progression so the user sees where they are in the stack.
- Components that persist across screens (wallet cards, the primary CTA, the navigation) should stay anchored visually and move as one object, not disappear-reappear.
- Avoid static transitions even for micro-interactions. Even a button changing label should morph.

### Delight — spend sparingly where it hits hardest

Interactive moments of joy are a budget. Spend them on moments the user will genuinely notice — wallet setup, completing a security backup, discovering an easter egg — not on routine actions they'll do a hundred times a day.

> "Make software feel human and responsive." (via targeted surprise and tactile feedback)

Practical implications:
- Completing a backup for the first time: confetti + sound. One time, memorable.
- Tapping a QR code: ripple animation; swipe the code to reveal a sequin-like transformation. Easter eggs, not always-on decoration.
- Trash deletion: paired visual animation + sound. A moment.

---

## The Dynamic Tray pattern

Family's most copied pattern. A tray is an expandable/contractible overlay that surfaces a focused task above the current screen without taking you away from it.

### Core rules

- **One piece of content or one primary action per tray.** Trays are not mini-screens — they are focused moments.
- **Subsequent trays vary in height** based on their content. Consistent widths, variable heights. The height itself communicates how much work this step requires.
- **Initiated by user action** — tap, notification, error. Not auto-presented.
- **Top-aligned title + icon.** Icon either dismisses or navigates back. Consistent across every tray in the app.
- **Theme adapts to flow.** A receive-tokens flow is bright; a destructive confirm flow turns the background red. The whole surface carries the emotional weight.

### What trays are for

- Transient actions (confirm, warn, acknowledge)
- Educational overlays — "here's what's happening with your transaction"
- Complex flows that need to gracefully transition to full-screen when the user opts in
- Distilling an overwhelming action ("Send $2,400 USDC") into a calm sequence of manageable steps

### The mental model

> "Seeing parts of a room through an open doorway. As you approach and enter, the space and its contents are gradually revealed."

Trays preserve context because the screen behind them is still visible (dimmed). The user never loses their place. This is the essential advantage over route-based navigation: with trays, "back" means "dismiss" — trivially discoverable. With routes, "back" means "somewhere, hopefully the previous page."

### Implementation notes

- Multiple stop points per tray (peek / half / full) based on content needs, not fixed percentages.
- Physics-feeling motion — a spring (stiffness ~280, damping ~28) reads as "natural." Linear easing reads as "technical."
- The tray tracks the finger during drag; it settles to the nearest stop on release, not to wherever the drag ended.
- Dismissal on backdrop tap OR swipe-down, both supported. Never either-or.
- Preserve tray state across dismiss + reopen within a session — if the user opened the Send tray, typed an amount, and dismissed it, reopening should show the amount still there.

---

## Fluid transitions

These are the specific motion techniques Family uses to make the app feel like it has spatial continuity.

### Directional motion in tab switching

Left tab → content slides in from the left. Right tab → slides from the right. This is a subtle but powerful cue: the direction communicates the spatial relationship between tabs. Without it, switching feels random. With it, the tabs feel like a row of rooms.

### Text morphing for state changes

When button text changes, the letters morph from the old text into the new text, leveraging shared characters.

Examples from Family:
- "Continue" → "Confirm" when moving from drafting a transaction to signing it. The shared "Con" transitions smoothly; the rest morphs.
- "Add wallet" → "Add wallet (2)" → "Add wallet (3)" as the user stacks wallets, the number incrementing with a subtle morph so the user sees the count changing without shift.

The purpose: "reinforces the user's awareness of their action" without the jarring of a static text swap. Implement with a text crossfade + letter-spacing micro-animation, or use a library like `react-number-flow` for numeric values.

### Component persistence across screens

When a visual element exists in both the before-state and after-state, it should move, not disappear-reappear.

> "If a component occupies a space and will persist in the next phase of the user's journey, it should remain consistent."

Examples from Family:
- Wallet cards move seamlessly between screens as the user navigates the app. Same card, repositioned — not a new render.
- Empty-state text stays constant across related screens; only the updated portion changes in place.
- A transaction spinner moves into the navigation bar after confirmation, visually linking the action to its status indicator.

Implementation via shared-element transitions (Framer Motion's `layoutId`, or iOS's matched geometry effect). The payoff is narrative continuity — the user sees *one app*, not a sequence of disconnected screens.

### Onboarding as stacked cards

Family's onboarding uses a stack-of-cards transition that visually maps the user's journey. As you move past the splash screen, a stack of cards flies into view representing the flow's full shape. You see where you are, where you're going, and what alternative paths exist.

This is dramatically better than a linear one-card-at-a-time flow because it gives the user spatial awareness of the whole onboarding without summarizing it textually.

---

## The Delight-Impact Curve

This is Family's most portable framework. It's an inverse relationship:

```
        Delight
        opportunity
           │
           │   ● (onboarding, backup success, first tx)
           │     ●
           │       ●
           │         ● (settings change, secondary flows)
           │            ● (primary CTA, daily taps)
           └──────────────────────── Frequency of use
```

- **Rare features** (onboarding, security backup, migration, first success): **maximum delight**. Slot machines, confetti, sounds, bespoke animation.
- **Occasional features** (adding a wallet, changing a token, reviewing history): **moderate delight**. Small morphs, subtle sounds, thoughtful empty states.
- **Frequent features** (send, confirm, type, swipe): **zero delight**. Instant, invisible, no animation longer than 150ms. Any decoration here is friction.

> "No matter the context, the 'specialness of a moment' generally decreases with repeated encounters."

**How to apply**: for every interaction on a screen, estimate its usage frequency. If 100+/day, kill the animation. If 1–10/day, small touches. If <1/week, go for it.

This one principle eliminates most of the "is this animation too much?" debate. If it's a rare moment, it can be lavish. If it's hourly, it can't be anything.

---

## Specific Family interactions worth stealing

These are from the article, each immediately portable:

- **Stealth mode shimmer**: when hidden values are updating discreetly, use a gentle shimmer in place of the numbers. Communicates "data is fresh" without revealing the data.
- **Chart scrubber**: the direction arrow flips to match positive/negative change as the user scrubs. The value's sign is visually paired with its motion.
- **Speed-up transaction**: tapping speed-up makes the spinner move into the original pending tray, showing the user that the action applies *there* — not creating a new pending item.
- **QR code easter egg**: tap → ripple animation; swipe → sequin-like transformation. The discovery is the surprise.
- **Drag-and-drop with attraction**: when reordering, cards magnetically stack into place with a slight overshoot. Reordering feels satisfying instead of tedious.
- **Empty-state guidance**: animated arrows or subtle hints point the user toward their first action. The empty state is not blank; it's a gentle nudge.

---

## Implementation philosophy

The article closes with a conviction worth quoting directly:

> "Adopting our core principles meant making conscious trade-offs while building Family. We prioritised creating a world-class experience, with the knowledge that it could slow down our pace to launch. Users notice when parts of an app are less polished, which detracts from the overall experience. Thoughtfully crafted software showcases a deep respect for the user."

The product's pace of shipping is subordinate to the polish of what ships. Every part must meet the same quality bar. A dashboard that's 90% polished feels worse than one that's 95% polished, because users spot the inconsistency.

---

## Practical rules for a sub-agent writing a screen

- Use a tray/sheet pattern for focused tasks over full-screen routes whenever possible.
- When text changes, morph it (crossfade + subtle scale/position transition), don't cut.
- Tab switches go left-to-right or right-to-left; pick based on tab ORDER.
- Components persisting across screens must visually persist (use a shared layout id pattern).
- On a rare moment (first-run success, completion, backup), go big — sound, animation, color.
- On a frequent moment (primary CTA, tab, input), go quiet — instant feedback, no animation over 200ms.
- Destructive tray shifts background to red/danger token; confirmations use neutral.
- Spring physics for anything the user can drag: stiffness ~280, damping ~28.
- Empty states have a gentle nudge animation, not a blank space.
