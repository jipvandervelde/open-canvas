---
name: ios-vs-android
scope: sub-agent
triggers: ios, android, platform convention, material design, human interface, back gesture, system font, cupertino, system colors, platform specific, ios blue, android green
viewports: iphone-17, iphone-17-pro-max, ipad
---

# iOS vs Android Conventions

Most consumer apps lean **iOS-first** for aesthetics and default conventions. If the user explicitly asks for Android / Material, switch to the Material column. The tool's default viewport is iPhone-shaped, so default to iOS unless told otherwise.

## System colors

| Role | iOS | Material You |
|---|---|---|
| Accent / primary | `#007AFF` (iOS blue) | Dynamic (brand-derived) |
| Destructive / red | `#FF3B30` | `#B3261E` |
| Success / green | `#34C759` | `#006C40` |
| Warning / orange | `#FF9500` | `#824D00` |
| Text primary (light mode) | `#000000` | `#1C1B1F` |
| Text secondary | `rgba(60, 60, 67, 0.6)` | `#49454F` |
| Separator | `rgba(60, 60, 67, 0.29)` (0.5px) | `#CAC4D0` |
| Background (grouped) | `#F2F2F7` | `#F3EDF7` |

Use `var(--color-*)` tokens from the project if present. Otherwise fallback to these hex values — they're tuned for legibility and familiarity.

## Typography

| | iOS | Android |
|---|---|---|
| System font | `-apple-system, SF Pro, system-ui` | `Roboto, system-ui` |
| Large title | 34px, bold | 28px, regular |
| Title 1 | 28px, bold | 24px, medium |
| Body | 17px, regular | 16px, regular |
| Caption | 13px, regular | 12px, regular |

Default font stack that covers both: `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;`

## Back navigation

**iOS**:
- Edge-swipe from the left screen edge → pops the stack.
- Top-left chevron + previous screen's title label.
- No "up" button — there's never an "up" in iOS navigation.

**Android**:
- Hardware/software back button → pops or dismisses.
- Top-left arrow without a label (Material).
- "Up" navigation vs. "back" can differ when deep-linked.

In web mobile: implement a top-left chevron-with-label for iOS feel. Swipe-from-left gesture is optional (heavy to implement correctly).

## Tab bar

| | iOS | Android |
|---|---|---|
| Position | Bottom | Bottom (Material 3 "Navigation bar") |
| Height | 49pt + safe area | 80dp |
| Icon size | 24×24 | 24×24 |
| Label | 10pt, below icon, always visible | 12sp, below icon OR on active only |
| Active state | Accent color on icon + label | Pill background on active item |
| Divider | 0.5px top border with 29% alpha | Elevated (subtle shadow) |

iOS tabs use a blurred translucent background over content behind; Android tabs use a solid surface color.

## Top bar (header)

| | iOS | Android |
|---|---|---|
| Height | 44pt (88pt large title) | 64dp |
| Title alignment | Center | Left |
| Back | Chevron + label | Arrow only |
| Background | Translucent blur on scroll | Solid, elevated |

## Buttons

**iOS**:
- Primary: filled, solid color (accent), full-width on confirmation screens.
- Secondary: "plain" buttons (text only, accent color, no border).
- Destructive: red variant.
- Corner radius: 14–20px for primary, 10px for inline.
- Tap feedback: brightness reduction on press OR scale(0.97).

**Android**:
- Primary: Material "Filled" button, 40dp height, 20dp corner radius.
- Secondary: "Tonal" or "Outlined".
- Destructive: no special variant — use red on Filled.
- Tap feedback: Material ripple.

## Form controls

| | iOS | Android |
|---|---|---|
| Text field | Rounded (10–12px radius), subtle fill background `#F2F2F7` | Underlined or "Filled" (Material) |
| Switch | iOS-style rounded toggle, 51×31pt | Material switch, thinner |
| Checkbox | Filled circle on iOS-style, 22×22 | Material square with ripple |
| Slider | Thin track with grabber | Material slider |

## Icons

- **iOS**: SF Symbols. For web, use Lucide / Heroicons which closely mirror SF style. Weight: regular (400) by default, bold for emphasis.
- **Android**: Material Icons. For web, use Material Symbols.

When in doubt: Lucide icons look right on both platforms. They're thin, clean, and avoid the "Android feel" that Material icons have.

## Gestures (shared)

- **Tap**: always <44×44 tap target.
- **Long-press**: 500ms for context menus.
- **Swipe-to-dismiss**: horizontal swipe on list items reveals actions.
- **Pull-to-refresh**: vertical swipe down at top of list.
- **Pinch-to-zoom**: images, maps.

## Haptics (intent, not implementation)

Our web environment can't fire haptics, but design AS IF they exist. Places native apps use haptics:

- **Light**: tab switch, toggle flipped, card picked up.
- **Medium**: success confirmation, message sent.
- **Heavy**: error, destructive action confirmation.
- **Selection**: scrubbing through a picker / slider.

If these moments don't have a visual or motion cue, add one — they should FEEL like something happened even without the haptic.

## When mixed is OK

Some hybrid apps (Notion, Linear, Figma) use iOS-style navigation + Material-style density. If the user asks for this, prefer iOS chrome (top bar, tab bar, buttons) with denser information layout (closer to Material's compact rows). Don't mix ripple effects with iOS cards — pick one feedback vocabulary per app.
