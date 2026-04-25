---
name: tactile-delight
scope: sub-agent
triggers: chat, message, messaging, conversation, real-time, realtime, live, presence, online status, typing indicator, reaction, emoji, sticker, game, playful, consumer social, social app, dm, direct message, haptic, sound, bubble, audio, voice note, avatar, friend
---

# Tactile Delight & Presence

Source: [Honkish](https://benji.org/honkish) — the Honk real-time-chat design essay by Benji Taylor.

---

## The core insight: real-time is a foundation, not a feature

Most chat apps treat real-time as a garnish — a "typing..." indicator, a green dot. Honk treats it as the **entire substrate** of the product. Every keystroke, every typo, every hesitation appears live on the other person's screen as it happens. The app is not a series of messages you send; it's a shared surface you're both present on.

This reframes almost every decision:

- **No send button.** You're already there, already seen.
- **No chat history.** Everything is the moment.
- **No drafts.** You can't edit what the other person is already reading.
- **Two chat bubbles, one per person.** Messages don't accumulate; they replace.
- **Clear to reset.** Wipe the whiteboard when you're done.

Apply this framing to any product that hinges on shared presence — collaborative documents, multiplayer tools, voice rooms, live streams. The product's *foundation* is that both people are here, now, together. Everything else follows.

---

## Making presence tangible

Honk's presence signaling is aggressive by design. The other person's state should be *visible*, not inferred from a timestamp.

### Arrival & departure rituals

- **Arrival**: the border around the friend's avatar *fills up* to announce their entry, accompanied by a sound. A tangible, multi-sensory event — not a silent append to a list.
- **Departure**: contextual emoji burst (waving hands) with a sound effect. The exit is acknowledged with a ritual, not just the other user disappearing.

Implementation hint: use a small SVG ring animation for the border fill, pair with a short audio cue. The visual + audio together land differently than either alone.

### Partial attention — the dashed outline

When the friend navigates to another part of the app but hasn't left the chat, the avatar becomes a **dashed outline**. They're still there, but their attention is elsewhere. This is subtle but profound: it tells the user "they can still see this, but they're not fully engaged right now."

```jsx
<div style={{
  borderRadius: '50%',
  outline: isFocused
    ? '2px solid var(--color-accent)'
    : '2px dashed color-mix(in oklch, var(--color-accent) 45%, transparent)',
  outlineOffset: 2,
  transition: 'outline 200ms ease',
}} />
```

### Live typing — dynamic bubble resizing

The chat bubble grows as the friend types, shrinks during pauses. No separate "..." indicator — the *bubble itself* is the indicator. The bubble's size communicates both that they're typing and roughly how much.

```jsx
<div style={{
  minWidth: '44px',
  padding: '12px 16px',
  transition: 'width 180ms ease-out, height 180ms ease-out',
  borderRadius: 18,
  background: 'var(--color-bubble-them)',
}}>
  {typingText}
</div>
```

### Simultaneous typing — 50/50 split

When both users are typing at the same time, the screen splits equally down the middle so each can see the other's composition in real time. This mirrors the natural back-and-forth of conversation and de-escalates the "whose turn is it" friction that plagues non-real-time chat.

### Presence-gated features

If one player leaves, **games pause**. If one person navigates away, **collaborative features freeze**. Presence isn't decoration; it's a **hard requirement** for features that depend on it. This creates accountability — you can't half-participate.

---

## Interactions as physics objects

Honk's most copied idea: reactions, emojis, stickers are treated as **objects with position, velocity, and occasional collisions** — not labels that appear and disappear.

### Exact-position reactions

Double-tap places a heart *exactly where you tapped* — not in a corner, not on the message, at the pixel. Relative coordinates like `top: 20%, left: 40%` within the bubble. Accompanied by a faint animated circle and **simultaneous haptic felt by BOTH users**.

The haptic-for-both detail is critical. It makes the reaction feel shared, not just received.

```jsx
<div style={{
  position: 'absolute',
  top: `${reaction.yPercent}%`,
  left: `${reaction.xPercent}%`,
  transform: 'translate(-50%, -50%)',
  animation: 'reactionPop 480ms cubic-bezier(0.22, 1, 0.36, 1)',
}}>
  {reaction.emoji}
</div>
```

### Customizable reactions

Users pick which emoji triggers on double-tap. Critically: they test it in a **little testing tray** so they can see how it feels before committing. The testing tray is the craft move — most apps would settle for a dropdown.

### Emoji collision physics

When both users send emojis at the exact same time, the emojis *collide* mid-flight, driven by a tiny physics engine. This is an easter egg rewarding serendipity — an accidental synchronization becomes a discovery.

Apply more broadly: any time two user actions can coincide, give that coincidence a delightful outcome. Most apps do nothing; make it something.

### Real-time flight

Emojis fly across the screen as they're typed/sent, rather than appearing statically. Users can spam them; the screen fills with motion. This creates visual chaos by design — the chaos IS the feature.

### Magic Words

Users configure custom words or phrases that trigger mini emoji bursts. "Thankssss" might trigger smiley-heart faces at the exact position of the typed word. These become **inside jokes between two specific people** — personalization at the per-relationship level, not just per-user.

This is a very copyable pattern. Any text app can let users configure "when I type X, show Y at the type position." Lightweight, personal, surprising.

---

## Honk-button mechanics

The "Honk" button is Honk's signature notification mechanism. Worth studying as a pattern:

- **Burst delivery**: sends a spray of emojis/stickers TOWARDS the friend's avatar. Directional motion — not a static notification.
- **Paired sound**: every burst has a matching sound effect.
- **User-customizable**: the Honk button's emojis/stickers are chosen per-user. Two friends can honk each other with completely different effects.
- **Rapid-tap scaling**: tapping quickly fills the screen with "delightful chaos." The more you tap, the more absurd it gets. This rewards repeated interaction.

Portable lesson: notification mechanisms shouldn't be neutral. If you build a "ping" or "nudge" feature, give it visual and audio drama. Let it reflect the sender's personality.

---

## Intentional friction & pacing

Honk deliberately contrasts **rapid, instant** interactions (chat, reactions, typing) with **slow, deliberate** moments (discovery, ratings, stranger introductions). The pacing variety is the product's rhythm.

### Slow moments of discovery

- **"I'm Feeling Lucky"** — a slot-machine animation for finding friends. The delay is the delight. The user WANTS it to take a beat.
- **"Top Picks"** — icons cycle through a deck before suggesting friends in a card stack. Anticipation builds before the reveal.
- **Star Field Matching** — during stranger matching, a star field animates representing "the universe of people out there." The user can tap to speed it up, smoothly transitioning to a profile slideshow.

These moments are *deliberately slow*. Not because the backend requires it, but because the emotional payoff requires time. The user's hand wants to wait.

### Signing your name

Before chatting with strangers, users sign their name **directly onscreen**. It's non-binding, not legally enforced — but:

> "this gesture noticeably reduced bad behavior."

The friction IS the mechanism. The pause to physically sign introduces accountability without enforcement. Apply wherever you want to slow someone down before a weight-bearing action — posting something public, sending a large payment, inviting a stranger.

### Feedback slider as logo

Post-conversation rating uses a slider **shaped like the Honk logo** with a face that animates based on the feedback value. Rating becomes tactile and expressive rather than clinical (five stars, five buttons, five whatever). The product's personality shows up even in the telemetry.

---

## Tactile feedback for mundane actions

### The fill-state trash can

When clearing messages: the trash can icon at the bottom of the composer fills as the message bubble fills, shakes when the bubble reaches capacity, and empties with a soft burst when cleared. The **clearing action has physics** — it doesn't just disappear.

### Destructive color coding

Deleting your account turns the **entire background red**. Not just the button — the whole surface. The gravity of the action is carried by the screen itself. Extends to chat theme colors; destructive surfaces lean red.

Apply: for any destructive action, shift the surface color rather than tinting a single button. The emotional weight should be carried by the whole context, not a detail.

### Animated notification borders

In-app notifications have a **border that counts down** visibly, showing time remaining. Urgency is visual, not numeric. A border draining over 6 seconds communicates "you're running out of time" in a way "6s" never could.

---

## Bespoke typography & sound

### Honk Sans + Honk Chat

Two custom typefaces designed with Seb McLauchlan:
- **Honk Sans** — UI typography, navigation, labels.
- **Honk Chat** — exclusive to message bubbles.

Message bubbles using a dedicated face creates a distinct visual register for *what the user said* vs *what the app said*. It's subtle, and it's huge.

> "creating the exact look we wanted required the perfect font."

If bespoke fonts aren't feasible: pair two licensed faces (e.g. a distinctive display face for chat content, a neutral face for UI). The separation of registers is the point, not the exact fonts.

### Sound designed after the motion

Honk collaborated with composer Ethan Mueller. Critical detail: sound was **composed AFTER** the motion design, so the audio precisely matches the timing of the interaction. Not retrofitted, not generic — bespoke to the specific animation curve.

Sound categories across the app: Adding Friends, Alerts, Chat, Games, Navigation, Honks, etc. Every major category gets its own audio palette.

For implementations without bespoke sound: at minimum, design the motion *as if* there's a sound at the key beats. That constraint alone improves the motion — you start asking "what sound would this make?" and the timing tightens up.

---

## Game design patterns

Honk includes a suite of mini-games. Their design patterns are portable:

- **Best-of-five** cycles — short enough to keep momentum, long enough to have narrative.
- **Immediate feedback** — results display instantly. True/False, Tic-Tac-Toe, Rock-Paper-Scissors all resolve in the same frame as the input.
- **Unmistakable win indicators** — Four-in-a-Row places the Honk logo in the winning row and drops an emoji crown on the winner's avatar. You know who won at a glance.
- **Metaphorical outcome matching** — Rock-Paper-Scissors uses the collision physics engine: emojis smash into each other, and the survivor wins. The MECHANIC is the ANIMATION.
- **Presence gated** — games pause if either player leaves. Engagement is mandatory.

Broader pattern: when designing any interaction that has a decisive outcome, find a metaphorical visual for it. "The two options collide; one survives" is more memorable than "A: 52% / B: 48%."

---

## The "sum of thoughtful small details"

This is the core conviction the article closes with:

> "Great software is defined by the sum of all its thoughtful small details."

Individually, no single micro-interaction matters. Collectively, they are the difference between "this is fine" and "this feels like a person made it."

Honk's examples:
- Skin-tone customization on reactions propagates to every emoji automatically.
- Countdown timers use animated borders, not numbers.
- The brand logo appears as a slider thumb, a rating shape, a crown that drops on game winners.
- Reaction placement remembers the user's typical drop zones (if they always double-tap bottom-right, hints live there).

The lesson: **don't ship a consumer app in MVP form**. The details ARE the product. If you don't have resources for a hundred thoughtful details, you don't have resources to ship this category.

---

## Practical rules for a sub-agent writing a screen

- For chat screens: show typing state live (bubble resizes with content, settles on pause). Show arrival/departure explicitly (avatar border fill + haptic + optional sound). Use dashed outline for partial attention.
- For reactions: place at exact tap coordinates as relative positions. Small bounce animation. Support customization.
- For consumer-social screens: use distinctive typography for display AND chat content (separate from UI body).
- For any "what just happened" moment: audio-visual pairing. If sound isn't implementable, still DESIGN the motion as if it had sound.
- Frequency ↔ delight inverse: primary composer gets no animation; rare discovery gets a full slot-machine moment.
- Destructive actions: shift whole background to red/danger, don't just tint a button.
- Presence is mandatory for shared features: pause games / freeze collab when one party leaves.
- Replace loading spinners with narrative moments where the wait is appropriate (star field, slot machine, progress that tells a story).
- Mini emoji bursts for user-configured "magic words" — a nearly-free personalization layer per relationship.
