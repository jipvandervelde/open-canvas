---
name: benji-consumer-craft
description: "Philosophy and specific patterns for building crafted, personal, high-touch consumer software — the opposite of generic SaaS. Synthesizes Family (crypto wallet) and Honk (real-time chat) design writing by Benji Taylor. Use this skill when building consumer apps, chat/messaging, wallets or financial apps, real-time experiences, apps that should feel 'indie' or 'native', or any time the user wants a product that feels like a person made it with care — not a committee. Covers: progressive disclosure (Dynamic Tray pattern), fluid transitions (spatial continuity, text morphing), the Delight-Impact Curve (inverse relationship of frequency and delight), presence signaling (real-time typing/arrival/attention), interactions as physics objects, intentional pacing (fast + deliberate contrast), bespoke typography and sound, and the 'sum of thoughtful small details' philosophy."
scope: orchestrator
triggers: consumer, indie, native, crafted, polished, premium, personal, wallet, finance, crypto, banking, chat, messaging, social, realtime, real-time, playful, delight, presence
---

# Benji Consumer Craft

Two seminal consumer apps — [Family](https://benji.org/family-values) (crypto wallet) and [Honk](https://benji.org/honkish) (real-time chat) — were designed by Benji Taylor with a shared conviction: **software should feel like a person crafted it**, not like a team composed it from checklists. Both documents are fine-grained design essays; this skill is their unified throughline.

Use this skill when you are building anything in the **consumer** category — wallets, financial tools, chat apps, social products, indie utilities, native-feeling apps. Don't use it for internal dashboards, admin tools, or enterprise SaaS — different values apply there (speed and density over craft and presence).

## Sub-files

- **[fluidity](benji-consumer-craft/fluidity)** — Family's Simplicity / Fluidity / Delight principles, the Dynamic Tray pattern, fluid transitions, text morphing, directional motion, the Delight-Impact Curve. Auto-injected for screens matching: tray, drawer, sheet, modal, flow, multi-step, wallet, finance, transition.
- **[tactile-delight](benji-consumer-craft/tactile-delight)** — Honk's real-time presence patterns, interactions-as-physics-objects, intentional pacing, bespoke typography + sound, "sum of thoughtful small details." Auto-injected for screens matching: chat, message, realtime, presence, typing, reaction, emoji, playful, social, game, avatar.

Pull the sub-file that most matches what you're building rather than this combined SKILL.md when you need the implementable details.

---

## The through-lines

These are the cross-cutting convictions both apps share. The sub-files contain the domain-specific patterns; this list is what makes the philosophy *portable*.

### 1. Restraint is the craft

Both apps are more defined by what they refused to ship than by what they included. Family uses progressive disclosure to hide every non-essential control until the moment it matters. Honk ships with two chat bubbles, no history, no draft, no send button.

> "Everything else would appear as it became most relevant to you." — Family

The inverse of "more features = better" is "fewer, more considered = trusted." When a brief expects a kitchen-sink screen, push back: surface the one primary action, move everything else one layer down.

### 2. The moment matters more than the page

Family thinks in expanding sheets and trays, not routed screens. Honk thinks in real-time bursts, not message history. Both refuse the web's default mental model of "each thing is a separate page you navigate to."

Apply: default to **trays/sheets** that overlay the current surface rather than navigate away. Keep context visible at all times. Hard navigation is disorienting; a rising sheet is fluid.

### 3. Physics is emotional

Family moves wallet cards between screens like they have mass. Honk's emojis collide with each other when sent simultaneously. Both products treat UI elements as **objects with weight and velocity** rather than labels that appear/disappear.

Practical implications:
- Never cut — always morph. Text changing from "Continue" → "Confirm" should transition through its shared letters, not flash-swap.
- Motion should track the gesture. A tray being dragged settles where the finger let go, with a spring; not a fixed snap.
- Simultaneous actions can collide — give them a reward (a bounce, a collision, a tiny easter egg).

### 4. Delight is a budget — spend it inversely to frequency

Family makes this explicit as the **Delight-Impact Curve**: the potential for delight goes UP as a feature's usage frequency goes DOWN. Daily actions (send, type, tap) should be instant and invisible. Rare actions (first-run setup, a completed backup, an error recovered from) get the full treatment — sound, animation, a genuine moment.

Honk proves the corollary: the chat composer has zero animation (instant feedback), but "I'm feeling lucky" plays a slot-machine, and signing your name before meeting a stranger is a deliberate-slow moment.

When adding delight to a screen, ask: *how often will the user see this?* If the answer is "many times per day," skip it. If the answer is "once a week at most," go big.

### 5. Personal > generic

Both apps pay for **bespoke typography** (Family's custom wordmark; Honk's Sans + Chat typefaces) and **bespoke sound** (Family's trash deletion; Honk's Honk button). Stock type and generic UI beeps read as "we shipped a template." Custom craft reads as "a human made this."

If you can't ship fully bespoke: at minimum, pick a distinctive licensed face and pair it consistently. Generic system-ui is fine for docs and admin; never for consumer.

### 6. Respond, don't just execute

Every interaction in both apps has a *visible reaction* beyond the state change. Clearing the chat: trash can shakes, fills, empties. Adding a wallet: card slides in, button text morphs. Completing backup: confetti. The response is the product.

If a button's only feedback is the page changing — add a pressed state, a small bounce, a morphing label, a sound. The user's input should always feel *received*.

### 7. Accountability through friction, not through rules

Both apps use **deliberate slow moments** for gravity. Honk makes you sign your name before chatting with a stranger — non-binding, but it works. Family lets you confirm a destructive action with a red-background tray you have to acknowledge.

When an action has weight, give it weight. Don't hide it behind a confirmation dialog — make the whole surface change to communicate gravity.

---

## The "sum of thoughtful small details"

Honk's summary phrase is the summary of this whole skill: **great consumer software is the sum of its thoughtful small details**. Individually, no single micro-interaction matters. Collectively, they are the difference between "this is fine" and "this feels special."

When writing a screen:
- For every button: what's its pressed state?
- For every state change: does the change morph or cut?
- For every piece of dynamic text: can you use tabular-nums to prevent shift?
- For every rare moment: is there a chance for delight?
- For every input: does it have the right keyboard, the right autocomplete, the right focus state?

If the answers are no, you're building a web page. If they're yes, you're building a product.

---

## When NOT to use this skill

- Dashboards, admin tools, or internal tooling where speed and density outweigh craft.
- B2B SaaS where users want to get in, do the thing, and get out.
- Anything with a time-to-information constraint (news readers, search).
- Power-user tools where every pixel of custom motion is a pixel of wasted time.

For those categories, use `emil-design-engineering` directly. That skill is the *floor* for all quality; this skill is the *ceiling* specifically for consumer craft.
