/**
 * Project-wide reusable React components. The user maintains a small library
 * here; the store seeds with a handful of defaults, and every Sandpack
 * screen automatically imports them via `/components/{Name}.tsx`. The AI is
 * told about available components so it composes with them instead of
 * inlining the same markup across screens.
 *
 * This is the v1 surface for the Components track (BRAINSTORM §7). Later
 * work adds "promote-to-component" (extract an existing JSX element into a
 * component — needs JSX parsing), rich prop schemas with typed variant
 * enums, and an instance-level inspector that surfaces the props. For now:
 * hand-authored library, shared across screens, visible to the agent.
 */

export type DesignComponent = {
  id: string;
  name: string; // PascalCase, must be unique: "Button", "Card", "ChipRow"
  description: string; // one line, shown in UI + sent to AI
  code: string; // the full TSX source, default-exported
  aliases?: string[]; // alternate names users/agents may use for this pattern
  tags?: string[]; // machine-readable categories for retrieval/reuse
  useWhen?: string[]; // concrete usage triggers
  avoidWhen?: string[]; // cases where this component is the wrong primitive
  props?: Array<{
    name: string;
    description: string;
    required?: boolean;
    example?: string;
  }>;
  canonical?: boolean; // preferred component for its pattern
  replaces?: string[]; // older names this component supersedes
  reserved?: boolean; // baseline component; createComponent may not overwrite it
};

// v30: structured component metadata for retrieval/reuse enforcement.
// v29: add reserved BottomTabBar baseline and merge missing defaults into
// hydrated projects so older localStorage libraries pick it up.
// v28: large NavBar tightens space above title, adds bottom breathing room.
// v27: NavBar large variant + badges.
const STORAGE_KEY = "oc:design-components:v30";

const BUTTON_CODE = `import React, { useState } from 'react';
import { STYLE } from '../component-tokens';

/** Button — three shapes driven by composition (no shape prop):
 *
 *   • Label only:    <Button>Save</Button>
 *   • Icon + label:  <Button leadingIcon={<Icon name="IconHeart" />}>Like</Button>
 *   • Icon only:     <Button iconOnly={<Icon name="IconHeart" />} ariaLabel="Like" />
 *
 *  Corner shape via \`capsule\` prop: false (default) = rounded rect
 *  (\`radius.md\` from the token), true = fully-rounded pill. Set
 *  capsule for primary CTAs that should read as iOS-style pills.
 *
 *  Surface + ink + radius + weight come from the component-tokens
 *  registry (\`button-primary\`, \`button-secondary\`, \`button-ghost\` and
 *  their \`-pressed\` / \`-disabled\` variants). Icon-only renders a 44x44
 *  square with no horizontal padding and REQUIRES \`ariaLabel\`. */
export default function Button({
  children,
  variant = 'primary',
  type = 'button',
  onClick,
  disabled = false,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  iconOnly,
  ariaLabel,
  capsule = false,
}) {
  const [pressed, setPressed] = useState(false);
  const [focusVisible, setFocusVisible] = useState(false);
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const baseKey = 'button-' + variant;
  const stateKey = pressed && !disabled
    ? baseKey + '-pressed'
    : disabled
      ? baseKey + '-disabled'
      : null;
  const tokenStyle = {
    ...(STYLE[baseKey] || {}),
    ...(stateKey ? STYLE[stateKey] || {} : {}),
  };
  const focusRingStyle = focusVisible ? STYLE['focus-ring'] || {} : {};
  const isIconOnly = !!iconOnly;
  // Square 44x44 hit + visual when icon-only: override the token's
  // padding (which is sized for a labeled pill) and lock width=height.
  const shapeOverrides = isIconOnly
    ? { width: 44, height: 44, minWidth: 44, padding: 0 }
    : null;
  // Capsule wins over the token's borderRadius. Use 999px (effectively
  // infinite radius — the height clamps it to a perfect pill).
  const radiusOverride = capsule ? { borderRadius: 999 } : null;
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-sm)',
    minHeight: 44,
    width: fullWidth ? '100%' : 'auto',
    whiteSpace: 'nowrap',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    // Disabled visuals come from the *-disabled token (fg-tertiary
    // surface, fg-secondary ink). Opacity dimming would compound with
    // the muted colors and make the button nearly invisible.
    touchAction: 'manipulation',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    WebkitFontSmoothing: 'antialiased',
    transform: pressed && !disabled ? 'scale(0.97)' : 'scale(1)',
    transition: reduceMotion
      ? 'none'
      : 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1), background 140ms ease, opacity 140ms ease',
    ...tokenStyle,
    ...focusRingStyle,
    ...shapeOverrides,
    ...radiusOverride,
  };
  return (
    <button
      type={type}
      style={style}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onFocus={(e) => {
        if (e.target.matches(':focus-visible')) setFocusVisible(true);
      }}
      onBlur={() => setFocusVisible(false)}
    >
      {isIconOnly ? (
        iconOnly
      ) : (
        <>
          {leadingIcon}
          {children}
          {trailingIcon}
        </>
      )}
    </button>
  );
}
`;

const CARD_CODE = `import React, { useState } from 'react';
import { STYLE } from '../component-tokens';

/** Card — bg-secondary fill, lg radius, lg padding (all from
 *  component-tokens). \`interactive\` flips the surface to a button
 *  with press-scale + the \`card-interactive-pressed\` token applied
 *  during press. Allows local props (\`gap\`, \`direction\`,
 *  \`padding\` override) for layout flexibility — those don't belong
 *  in tokens since they vary per usage. */
export default function Card({
  children,
  padding,
  gap = 'var(--space-md)',
  direction = 'column',
  interactive = false,
  onClick,
  ariaLabel,
}) {
  const [pressed, setPressed] = useState(false);
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tokenStyle = STYLE['card'] || {};
  const pressedStyle =
    interactive && pressed
      ? STYLE['card-interactive-pressed'] || {}
      : {};
  const base = {
    display: 'flex',
    flexDirection: direction,
    gap,
    isolation: 'isolate',
    boxSizing: 'border-box',
    ...tokenStyle,
    ...(padding ? { padding } : null),
    ...pressedStyle,
  };
  if (!interactive) return <div style={base}>{children}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        ...base,
        width: '100%',
        textAlign: 'inherit',
        font: 'inherit',
        border: 'none',
        cursor: 'pointer',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        transform: pressed ? 'scale(0.985)' : 'scale(1)',
        transition: reduceMotion
          ? 'none'
          : 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1), background 160ms ease',
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
    >
      {children}
    </button>
  );
}
`;

const STACK_CODE = `import React from 'react';

/** Stack — vertical or horizontal auto-layout container. Thin wrapper
 *  over flex so auto-layout is a single import on every screen. No
 *  visual surface of its own by design; drop a Card inside when you
 *  need a filled container. */
export default function Stack({
  children,
  direction = 'column',
  gap = 'var(--space-md)',
  align = 'stretch',
  justify = 'flex-start',
  padding = 0,
  wrap = 'nowrap',
  as: As = 'div',
}) {
  return (
    <As
      style={{
        display: 'flex',
        flexDirection: direction,
        flexWrap: wrap,
        gap,
        alignItems: align,
        justifyContent: justify,
        padding,
        // Bleed-free stacking — prevents child z-index leaking upward.
        isolation: 'isolate',
      }}
    >
      {children}
    </As>
  );
}
`;

const TEXT_FIELD_CODE = `import React, { useState, useId } from 'react';
import { STYLE } from '../component-tokens';

/** TextField — reads surface + label + ring + message styles from
 *  component-tokens (\`text-field\`, \`text-field-filled\`,
 *  \`text-field-label\`, \`text-field-placeholder\`,
 *  \`text-field-focus-ring\`, \`text-field-error-ring\`,
 *  \`text-field-error-message\`, \`text-field-helper-message\`).
 *  ::placeholder is styled via a scoped class + token color
 *  (\`text-field-placeholder\` — fg-tertiary at 50% via \`color-mix\`). Type is
 *  \`typography.body\`; filled value uses \`text-field-filled\` to apply
 *  \`--font-callout-weight\` (thicker than empty/placeholder). */
export default function TextField({
  label,
  placeholder,
  value,
  defaultValue,
  onChange,
  type = 'text',
  error,
  helper,
  disabled = false,
  fullWidth = true,
  autoComplete = 'off',
  autoCapitalize = 'none',
  autoCorrect = 'off',
  spellCheck = false,
  inputMode,
  name,
}) {
  const id = useId();
  const [internal, setInternal] = useState(defaultValue ?? '');
  const [focused, setFocused] = useState(false);
  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const hasValue = String(current ?? '').length > 0;
  const handleChange = (e) => {
    if (!controlled) setInternal(e.target.value);
    onChange && onChange(e);
  };
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const inputStyle = STYLE['text-field'] || {};
  const labelStyle = STYLE['text-field-label'] || {};
  const filledStyle = hasValue ? STYLE['text-field-filled'] || {} : {};
  const phToken = STYLE['text-field-placeholder'] || {};
  const phColor =
    phToken.color != null && phToken.color !== ''
      ? phToken.color
      : 'color-mix(in oklch, var(--color-fg-tertiary) 50%, transparent)';
  const focusRing = STYLE['text-field-focus-ring'] || {};
  const errorRing = STYLE['text-field-error-ring'] || {};
  const errorMsg = STYLE['text-field-error-message'] || {};
  const helperMsg = STYLE['text-field-helper-message'] || {};
  const ringStyle = error
    ? errorRing
    : focused
      ? focusRing
      : { boxShadow: 'inset 0 0 0 0 transparent' };
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        width: fullWidth ? '100%' : 'auto',
        WebkitFontSmoothing: 'antialiased',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html:
            '.oc-tf__input::placeholder, .oc-tf__input::-webkit-input-placeholder, .oc-tf__input::-moz-placeholder { color: ' +
            phColor +
            '; }',
        }}
      />
      {label && (
        <label
          htmlFor={id}
          style={{
            ...labelStyle,
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        >
          {label}
        </label>
      )}
      <input
        className="oc-tf__input"
        id={id}
        name={name}
        type={type}
        value={current}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        spellCheck={spellCheck}
        inputMode={inputMode}
        data-lpignore="true"
        data-1p-ignore=""
        aria-invalid={!!error || undefined}
        style={{
          border: 'none',
          outline: 'none',
          WebkitAppearance: 'none',
          appearance: 'none',
          width: '100%',
          boxSizing: 'border-box',
          touchAction: 'manipulation',
          transition: reduceMotion
            ? 'none'
            : 'box-shadow 140ms cubic-bezier(0.22, 1, 0.36, 1)',
          ...inputStyle,
          ...filledStyle,
          ...ringStyle,
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {(error || helper) && (
        <span
          role={error ? 'alert' : undefined}
          style={error ? errorMsg : helperMsg}
        >
          {error || helper}
        </span>
      )}
    </div>
  );
}
`;

const SWITCH_CODE = `import React, { useState, useId } from 'react';
import { STYLE } from '../component-tokens';

/** Switch — iOS toggle. Track + thumb dimensions, fills, and shadow
 *  come from component-tokens (\`switch-track-off\`, \`switch-track-on\`,
 *  \`switch-thumb\`). Behavior (focus, translate, controlled state)
 *  stays here. Label row is 44px to eliminate dead zones. */
export default function Switch({
  checked,
  defaultChecked = false,
  onChange,
  disabled = false,
  label,
  ariaLabel,
}) {
  const id = useId();
  const [internal, setInternal] = useState(defaultChecked);
  const [focusVisible, setFocusVisible] = useState(false);
  const controlled = checked !== undefined;
  const on = controlled ? checked : internal;
  const toggle = () => {
    if (disabled) return;
    const next = !on;
    if (!controlled) setInternal(next);
    onChange && onChange(next);
  };
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const trackToken = on
    ? STYLE['switch-track-on'] || {}
    : STYLE['switch-track-off'] || {};
  const thumbToken = STYLE['switch-thumb'] || {};
  const focusRing = focusVisible ? STYLE['focus-ring'] || {} : {};
  const trackStyle = {
    position: 'relative',
    padding: 0,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: reduceMotion
      ? 'none'
      : 'background 220ms cubic-bezier(0.22, 1, 0.36, 1)',
    outline: '2px solid transparent',
    outlineOffset: 2,
    flexShrink: 0,
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
    display: 'inline-block',
    verticalAlign: 'middle',
    ...trackToken,
    ...focusRing,
  };
  const thumbStyle = {
    position: 'absolute',
    top: 3,
    left: 3,
    transform: on ? 'translateX(20px)' : 'translateX(0)',
    transition: reduceMotion
      ? 'none'
      : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
    pointerEvents: 'none',
    ...thumbToken,
  };
  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}
      onClick={toggle}
      disabled={disabled}
      onFocus={(e) => {
        if (e.target.matches(':focus-visible')) setFocusVisible(true);
      }}
      onBlur={() => setFocusVisible(false)}
      style={trackStyle}
    >
      <span style={thumbStyle} aria-hidden />
    </button>
  );
  if (!label) return control;
  // Wrap the whole row in the label so the label + whitespace between
  // text and control is also tappable (no dead zone).
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-md)',
        minHeight: 44,
        width: '100%',
        color: 'var(--color-fg-primary)',
        fontFamily: 'var(--font-body-family)',
        WebkitFontSmoothing: 'antialiased',
        fontSize: 'var(--font-body-size)',
        fontWeight: 'var(--font-body-weight)',
        lineHeight: 'var(--font-body-line-height)',
        letterSpacing: 'var(--font-body-letter-spacing)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
      }}
    >
      <span>{label}</span>
      {control}
    </label>
  );
}
`;

const SEGMENTED_CONTROL_CODE = `import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { STYLE } from '../component-tokens';

/** SegmentedControl — iOS segmented picker. Track + pill + active/
 *  inactive label styles come from component-tokens. The pill slide
 *  animation (measure DOM rect, translate between segments, ease-out-
 *  quint at 280ms) stays here since it's behavior, not static tokens.
 *  Font weight stays constant across states (no layout shift). */
export default function SegmentedControl({
  options = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
  ],
  value,
  defaultValue,
  onChange,
  fullWidth = true,
  disabled = false,
  ariaLabel,
}) {
  const first = options[0]?.value;
  const [internal, setInternal] = useState(defaultValue ?? first);
  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const pick = (v) => {
    if (disabled) return;
    if (!controlled) setInternal(v);
    onChange && onChange(v);
  };
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Measured position + width of the active segment. The pill element
  // is absolutely positioned and slides via transform.
  const containerRef = useRef(null);
  const segmentRefs = useRef({});
  const [rect, setRect] = useState({ x: 0, w: 0, ready: false });
  // First render: show the pill at its measured position without any
  // transition, so it doesn't animate in from (0, 0) on mount.
  const firstRenderRef = useRef(true);

  const measure = () => {
    const c = containerRef.current;
    const seg = segmentRefs.current[current];
    if (!c || !seg) return;
    const cRect = c.getBoundingClientRect();
    const sRect = seg.getBoundingClientRect();
    setRect({ x: sRect.left - cRect.left, w: sRect.width, ready: true });
  };

  // useLayoutEffect so the pill position is committed before paint —
  // avoids a one-frame flash at the wrong place when \`current\` changes.
  useLayoutEffect(() => {
    measure();
    // After the first measurement, re-enable transitions.
    if (firstRenderRef.current) {
      // Defer the flag flip one frame so the pill's initial placement
      // isn't animated.
      const id = requestAnimationFrame(() => {
        firstRenderRef.current = false;
      });
      return () => cancelAnimationFrame(id);
    }
  }, [current, fullWidth, options.length]);

  // Re-measure on container resize (viewport flips, theme changes that
  // adjust padding, etc.).
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const c = containerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(c);
    return () => ro.disconnect();
  }, [current, options.length]);

  const transition =
    reduceMotion || firstRenderRef.current
      ? 'none'
      : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1), width 280ms cubic-bezier(0.22, 1, 0.36, 1)';

  const trackToken = STYLE['segmented-control'] || {};
  const pillToken = STYLE['segmented-control-pill'] || {};
  const labelActiveToken = STYLE['segmented-control-label-active'] || {};
  const labelInactiveToken = STYLE['segmented-control-label-inactive'] || {};

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: fullWidth ? '100%' : 'auto',
        WebkitFontSmoothing: 'antialiased',
        opacity: disabled ? 0.4 : 1,
        boxSizing: 'border-box',
        isolation: 'isolate',
        ...trackToken,
      }}
    >
      {/* Sliding pill. Sits behind the buttons; translateX + width
          animate as \`current\` changes. Hidden until first measure
          lands to prevent a frame at (0, 0). */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 2,
          bottom: 2,
          left: 0,
          width: rect.w,
          transform: \`translateX(\${rect.x}px)\`,
          transition,
          opacity: rect.ready ? 1 : 0,
          pointerEvents: 'none',
          zIndex: 0,
          ...pillToken,
        }}
      />
      {options.map((opt) => {
        const active = opt.value === current;
        const labelToken = active ? labelActiveToken : labelInactiveToken;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              segmentRefs.current[opt.value] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => pick(opt.value)}
            disabled={disabled}
            style={{
              position: 'relative',
              zIndex: 1,
              flex: fullWidth ? 1 : '0 0 auto',
              minHeight: 32,
              padding: '4px var(--space-md)',
              background: 'transparent',
              border: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: reduceMotion ? 'none' : 'color 160ms ease',
              whiteSpace: 'nowrap',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              outline: 'none',
              ...labelToken,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
`;

const BOTTOM_TAB_BAR_CODE = `import React, { useState } from 'react';
// Shared components live at /components/*, so the icons module is one
// level up. Screens at the root use './centralIcons' instead.
import { Icon } from '../centralIcons';
import { STYLE } from '../component-tokens';

/** BottomTabBar — iOS-style bottom tab bar. 3-5 items. The bar uses bg-primary
 *  (same base surface as the main screen) — no border, no inset line.
 *  Active item uses the filled icon + brand color; inactive is outlined
 *  + fg-secondary. Font weight is CONSTANT across states (no layout
 *  shift). Press-scale is reduced-motion-aware. */
export default function BottomTabBar({
  items,
  activeKey,
  onChange,
}) {
  const tabs = items && items.length > 0
    ? items
    : [
        { key: 'home', label: 'Home', icon: 'IconHome' },
        { key: 'search', label: 'Search', icon: 'IconMagnifyingGlass' },
        { key: 'profile', label: 'Profile', icon: 'IconUser' },
      ];
  const currentKey = activeKey ?? tabs[0]?.key;
  const barToken = STYLE['tab-bar'] || {};
  return (
    <nav
      role="tablist"
      aria-label="Primary"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        // Padding (top + safe-bottom) comes from the tab-bar token so the
        // bar is consistent across screens and easy to retune from one place.
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        WebkitFontSmoothing: 'antialiased',
        isolation: 'isolate',
        ...barToken,
      }}
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.key}
          tab={tab}
          active={tab.key === currentKey}
          onClick={() => onChange && onChange(tab.key)}
        />
      ))}
    </nav>
  );
}

function TabItem({ tab, active, onClick }) {
  const [pressed, setPressed] = useState(false);
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const itemToken = active
    ? STYLE['tab-item-active'] || {}
    : STYLE['tab-item-inactive'] || {};
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        flex: 1,
        minWidth: 44,
        minHeight: 44,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        padding: '4px 2px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        transform: pressed ? 'scale(0.94)' : 'scale(1)',
        transition: reduceMotion
          ? 'none'
          : 'transform 140ms cubic-bezier(0.22, 1, 0.36, 1), color 160ms ease',
        outline: 'none',
        ...itemToken,
      }}
    >
      <Icon
        name={tab.icon}
        variant={active ? 'filled' : 'outlined'}
        size={26}
        color="currentColor"
      />
      <span>{tab.label}</span>
    </button>
  );
}
`;

const TAB_BAR_CODE = `import BottomTabBar from './BottomTabBar';

/** TabBar — compatibility alias.
 *  Prefer importing BottomTabBar for top-level mobile navigation. */
export default BottomTabBar;
`;

const ICON_SWAP_CODE = `import React, { useState, useEffect, useRef, useId } from 'react';
import { Icon } from '../centralIcons';
import { STYLE } from '../component-tokens';

/** IconSwap — central icon with two superpowers:
 *
 *  1. Display chip:      \`display\` ∈ 'plain' | 'tinted' | 'filled'
 *                        Pulls the chip surface + ink from the
 *                        \`icon-swap-*\` component tokens.
 *  2. Animated swap:     when \`name\` or \`variant\` changes, the outgoing
 *                        glyph scales down + blurs out and the incoming
 *                        glyph scales up + blurs in (Emil-style blur
 *                        crossfade). Bridges the visual gap so the swap
 *                        reads as one motion, not two cuts.
 *
 *  When \`onClick\` is provided, IconSwap renders as a button with the
 *  Button-style press scale (0.92). Otherwise it's a passive <span>.
 *
 *  Props: name (required), variant ('outlined'|'filled'),
 *  size (number, default 24), color (CSS, used for 'plain' display),
 *  display ('plain'|'tinted'|'filled'), onClick, disabled, ariaLabel.
 *  Pass \`ariaLabel\` whenever the icon is interactive or stands alone
 *  as content. Decorative icons stay aria-hidden. */
export default function IconSwap({
  name,
  variant = 'outlined',
  size = 24,
  color = 'currentColor',
  display = 'plain',
  onClick,
  disabled = false,
  ariaLabel,
}) {
  const reactId = useId();
  const styleId = 'oc-icon-swap-anim';
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [pressed, setPressed] = useState(false);
  const sig = name + ':' + variant;
  const [active, setActive] = useState({ name, variant, key: sig + ':0' });
  const [previous, setPrevious] = useState(null);
  const tickRef = useRef(0);

  useEffect(() => {
    if (active.name === name && active.variant === variant) return;
    if (reduceMotion) {
      tickRef.current += 1;
      setActive({ name, variant, key: sig + ':' + tickRef.current });
      setPrevious(null);
      return;
    }
    tickRef.current += 1;
    setPrevious(active);
    setActive({ name, variant, key: sig + ':' + tickRef.current });
    const t = setTimeout(() => setPrevious(null), 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, variant]);

  const chipToken = STYLE['icon-swap-' + display] || STYLE['icon-swap-plain'] || {};
  // Chip is square + sized relative to the glyph. Plain skips padding so
  // the icon sits flush with its neighbors.
  const chipDim = display === 'plain' ? size : Math.round(size * 1.6);
  const chipStyle = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: chipDim,
    height: chipDim,
    flexShrink: 0,
    boxSizing: 'border-box',
    overflow: 'hidden',
    color: display === 'plain' ? color : undefined,
    ...chipToken,
  };
  const layerStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    transformOrigin: '50% 50%',
    willChange: 'transform, filter, opacity',
  };

  // Inline keyframes — scoped via shared id so multiple IconSwaps
  // coexist without re-declaring the rules.
  const keyframes =
    '@keyframes ocIconSwapIn{from{opacity:0;transform:scale(0.6);filter:blur(8px);}' +
    'to{opacity:1;transform:scale(1);filter:blur(0);}}' +
    '@keyframes ocIconSwapOut{from{opacity:1;transform:scale(1);filter:blur(0);}' +
    'to{opacity:0;transform:scale(0.6);filter:blur(8px);}}';

  const glyph = (layer, kind) => (
    <span
      key={layer.key}
      aria-hidden
      style={{
        ...layerStyle,
        animation: reduceMotion
          ? 'none'
          : (kind === 'in'
              ? 'ocIconSwapIn 280ms cubic-bezier(0.22, 1, 0.36, 1) both'
              : 'ocIconSwapOut 280ms cubic-bezier(0.22, 1, 0.36, 1) both'),
      }}
    >
      <Icon
        name={layer.name}
        variant={layer.variant}
        size={size}
        color="currentColor"
      />
    </span>
  );

  const inner = (
    <>
      <style id={styleId} dangerouslySetInnerHTML={{ __html: keyframes }} />
      {previous ? glyph(previous, 'out') : null}
      {glyph(active, 'in')}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        style={{
          ...chipStyle,
          padding: 0,
          border: 'none',
          background: chipStyle.background,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
          outline: 'none',
          transform: pressed && !disabled ? 'scale(0.92)' : 'scale(1)',
          transition: reduceMotion
            ? 'none'
            : 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {inner}
      </button>
    );
  }

  return (
    <span
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      style={chipStyle}
      data-icon-id={reactId}
    >
      {inner}
    </span>
  );
}
`;

const NAV_BAR_CODE = `import React, { useState } from 'react';
import { Icon } from '../centralIcons';
import { STYLE } from '../component-tokens';

/** NavBar — iOS-style top bar with a unified action API.
 *
 *  Variants:
 *   • 'centered' (default) — small headline title centered between leading
 *     and trailing actions. The classic iOS detail bar.
 *   • 'large'              — large-title pattern (Mail, Notes, Settings).
 *     Title is left-aligned in its own row beneath the action row, uses
 *     \`largeTitle\` typography. Optional \`subtitle\` sits below the title
 *     in \`footnote\` ink. \`leading\` is silently ignored in this mode —
 *     iOS large-title bars don't carry a leading action.
 *
 *  Props:
 *   • title              — string or node (optional)
 *   • subtitle           — string (only shown in 'large' variant)
 *   • variant            — 'centered' | 'large'  (default 'centered')
 *   • leading            — { kind: 'icon' | 'text', ... } (optional;
 *                           ignored when variant === 'large')
 *   • trailing           — { kind: 'icon' | 'text', ... } (optional)
 *   • secondaryTrailing  — { icon, onClick?, ariaLabel, badge? } (icon-only,
 *                           optional; renders only when \`trailing\` is set,
 *                           sits to its left like iOS detail screens)
 *   • ariaLabel          — \`role="banner"\` label (default "Main")
 *
 *  Action shape:
 *    { kind: 'icon', icon: 'IconArrowLeft', onClick?, ariaLabel?, badge? }
 *    { kind: 'text', label: 'Cancel',       onClick?, ariaLabel?, badge? }
 *
 *  \`badge\` accepts:
 *    true                — solid 8px dot (no number)
 *    number | string     — pill with the value (e.g. 3, '99+')
 *
 *  Tokens: \`nav-bar\`, \`nav-bar-title\`, \`nav-bar-title-large\`,
 *  \`nav-bar-subtitle\`, \`nav-bar-icon-button\`, \`nav-bar-text-action\`,
 *  \`nav-bar-badge\`. Press feedback is a small scale transform — no fill. */
export default function NavBar({
  title,
  subtitle,
  variant = 'centered',
  leading,
  trailing,
  secondaryTrailing,
  ariaLabel = 'Main',
}) {
  const barToken = STYLE['nav-bar'] || {};
  const titleToken = STYLE['nav-bar-title'] || {};
  const titleLargeToken = STYLE['nav-bar-title-large'] || {};
  const subtitleToken = STYLE['nav-bar-subtitle'] || {};
  const iconBase = STYLE['nav-bar-icon-button'] || {};
  const textBase = STYLE['nav-bar-text-action'] || {};
  const badgeToken = STYLE['nav-bar-badge'] || {};
  // Secondary trailing only makes sense when there's a primary trailing
  // action — silently ignored otherwise so callers don't have to guard.
  const secondary = trailing ? secondaryTrailing : null;
  // The 'large' variant intentionally hides any leading action — iOS
  // large-title bars don't carry one.
  const showLeading = variant !== 'large' && leading;
  const isLarge = variant === 'large';
  return (
    <header
      role="banner"
      aria-label={ariaLabel}
      style={{
        position: 'relative',
        zIndex: 10,
        WebkitFontSmoothing: 'antialiased',
        ...barToken,
      }}
    >
      <div
        style={{
          position: 'relative',
          // Lock the row directly under the safe-area inset to 44px.
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
          }}
        >
          {showLeading ? (
            <NavAction
              action={leading}
              iconBase={iconBase}
              textBase={textBase}
              badgeToken={badgeToken}
            />
          ) : null}
        </div>
        {!isLarge && title != null ? (
          <h1
            style={{
              margin: 0,
              maxWidth: '100%',
              padding: '0 88px',
              boxSizing: 'border-box',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'center',
              width: '100%',
              lineHeight: 1.2,
              ...titleToken,
            }}
          >
            {title}
          </h1>
        ) : null}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 4,
          }}
        >
          {secondary ? (
            <NavAction
              action={{ kind: 'icon', ...secondary }}
              iconBase={iconBase}
              textBase={textBase}
              badgeToken={badgeToken}
            />
          ) : null}
          {trailing ? (
            <NavAction
              action={trailing}
              iconBase={iconBase}
              textBase={textBase}
              badgeToken={badgeToken}
            />
          ) : null}
        </div>
      </div>
      {isLarge && (title != null || subtitle) ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 2,
            // Tight against the action row above, but with a comfortable
            // gap below to the screen content.
            paddingTop: 0,
            paddingBottom: 'var(--space-md)',
          }}
        >
          {title != null ? (
            <h1
              style={{
                margin: 0,
                width: '100%',
                lineHeight: 1.15,
                ...titleLargeToken,
              }}
            >
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <span style={{ ...subtitleToken }}>{subtitle}</span>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

function NavAction({ action, iconBase, textBase, badgeToken }) {
  const [pressed, setPressed] = useState(false);
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!action) return null;
  const isText = action.kind === 'text';
  const baseStyle = isText ? textBase : iconBase;
  const ariaLabel =
    action.ariaLabel || (isText ? action.label : undefined);
  const hasBadge = action.badge != null && action.badge !== false;
  return (
    <button
      type="button"
      onClick={() => action.onClick && action.onClick()}
      aria-label={ariaLabel}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        position: 'relative',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        outline: 'none',
        // Match the Button press feel: small scale-down only, no fill.
        transform: pressed ? 'scale(0.92)' : 'scale(1)',
        transition: reduceMotion
          ? 'none'
          : 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1)',
        ...baseStyle,
      }}
    >
      {isText ? (
        action.label
      ) : (
        <Icon
          name={action.icon}
          variant="outlined"
          size={22}
          color="currentColor"
        />
      )}
      {hasBadge ? (
        <NavBadge value={action.badge} token={badgeToken} />
      ) : null}
    </button>
  );
}

function NavBadge({ value, token }) {
  // \`true\` => bare dot (no label). number/string => pill with content.
  const isDot = value === true;
  const dotStyle = {
    ...token,
    minWidth: 8,
    width: 8,
    height: 8,
    padding: 0,
  };
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        pointerEvents: 'none',
        ...(isDot ? dotStyle : token),
      }}
    >
      {isDot ? null : value}
    </span>
  );
}
`;

const DEFAULTS: DesignComponent[] = [
  {
    id: "c_button",
    name: "Button",
    description:
      "Primary / secondary / ghost button. Props: variant, onClick, disabled, fullWidth.",
    code: BUTTON_CODE,
    aliases: ["CTA", "PrimaryButton", "IconButton", "ActionButton"],
    tags: ["control", "button", "cta", "form", "interactive"],
    useWhen: [
      "primary, secondary, or ghost action buttons",
      "icon-only 44px tap targets",
      "form submit or screen-level CTA",
    ],
    avoidWhen: ["navigation tabs", "plain list rows", "text links"],
    props: [
      { name: "children", description: "Button label or inline content." },
      { name: "variant", description: "'primary' | 'secondary' | 'ghost'.", example: "primary" },
      { name: "fullWidth", description: "Stretch to parent width.", example: "true" },
      { name: "iconOnly", description: "Icon node for square icon-only button." },
      { name: "ariaLabel", description: "Required when iconOnly is used." },
      { name: "capsule", description: "Use pill shape instead of rounded rectangle." },
    ],
    canonical: true,
    reserved: true,
  },
  {
    id: "c_card",
    name: "Card",
    description:
      "Surface with padding, radius, and soft shadow. Props: padding, gap, direction.",
    code: CARD_CODE,
    aliases: ["Surface", "Panel", "Tile", "Container"],
    tags: ["surface", "card", "container", "panel", "layout"],
    useWhen: [
      "a grouped surface needs padding, radius, and tokenized fill",
      "a tappable card/list tile should share press feedback",
    ],
    avoidWhen: ["full page sections", "bottom navigation bars", "toolbars"],
    props: [
      { name: "children", description: "Content inside the card.", required: true },
      { name: "interactive", description: "Render as pressable button.", example: "true" },
      { name: "padding", description: "Optional padding override.", example: "var(--space-lg)" },
      { name: "gap", description: "Flex gap between children." },
      { name: "direction", description: "'column' | 'row'." },
    ],
    canonical: true,
    reserved: true,
  },
  {
    id: "c_stack",
    name: "Stack",
    description:
      "Auto-layout container. Props: direction ('row'|'column'), gap, align, justify, padding.",
    code: STACK_CODE,
    aliases: ["VStack", "HStack", "Flex", "AutoLayout"],
    tags: ["layout", "flex", "stack", "auto-layout"],
    useWhen: [
      "screen or section layout needs consistent flex/gap primitives",
      "you would otherwise write repeated display:flex containers",
    ],
    avoidWhen: ["visual surfaces that need background/radius", "semantic form controls"],
    props: [
      { name: "direction", description: "'column' or 'row'.", example: "column" },
      { name: "gap", description: "Spacing between children.", example: "var(--space-md)" },
      { name: "align", description: "alignItems value." },
      { name: "justify", description: "justifyContent value." },
      { name: "padding", description: "Container padding." },
    ],
    canonical: true,
    reserved: true,
  },
  {
    id: "c_text_field",
    name: "TextField",
    description:
      "iOS text input, stacked label (slight horizontal inset) + ::placeholder (fg-tertiary 50%) + medium weight when filled. Props: label, placeholder, value, onChange, type, error, helper, disabled, fullWidth, autoComplete.",
    code: TEXT_FIELD_CODE,
    aliases: ["Input", "TextInput", "Field", "SearchField"],
    tags: ["form", "input", "text-field", "ios", "control"],
    useWhen: [
      "text, email, search, or password inputs",
      "forms that need label/helper/error states",
    ],
    avoidWhen: ["static display text", "segmented filters", "freeform rich text editors"],
    props: [
      { name: "label", description: "Visible label above the field." },
      { name: "placeholder", description: "Placeholder text." },
      { name: "value", description: "Controlled value." },
      { name: "onChange", description: "Input change handler." },
      { name: "error", description: "Error message and invalid styling." },
      { name: "helper", description: "Helper text under the field." },
    ],
    canonical: true,
    reserved: true,
  },
  {
    id: "c_tab_bar",
    name: "TabBar",
    description:
      "Compatibility alias for BottomTabBar. Do not import in new screens; use BottomTabBar instead.",
    code: TAB_BAR_CODE,
    aliases: ["LegacyTabBar"],
    tags: ["navigation", "bottom-tabs", "alias", "legacy"],
    useWhen: ["only to keep older screens importing TabBar working"],
    avoidWhen: ["new top-level mobile navigation", "new generated screens"],
    props: [
      { name: "items", description: "Same as BottomTabBar items." },
      { name: "activeKey", description: "Same as BottomTabBar activeKey." },
      { name: "onChange", description: "Same as BottomTabBar onChange." },
    ],
    canonical: false,
    replaces: [],
    reserved: true,
  },
  {
    id: "c_bottom_tab_bar",
    name: "BottomTabBar",
    description:
      "Canonical iOS bottom tab bar for top-level mobile navigation, 3-5 items. Props: items (key, label, icon), activeKey, onChange. Import this instead of creating or inlining tab markup.",
    code: BOTTOM_TAB_BAR_CODE,
    aliases: ["TabBar", "BottomNavigation", "BottomNav", "MobileTabBar", "PrimaryTabs"],
    tags: ["navigation", "mobile", "ios", "bottom-tabs", "tab-bar", "canonical"],
    useWhen: [
      "top-level mobile navigation between 3-5 app sections",
      "screens share the same bottom nav labels, icons, order, and active state",
      "the brief says tab bar, bottom nav, bottom navigation, or primary tabs",
    ],
    avoidWhen: [
      "segmented filters inside content",
      "desktop sidebar navigation",
      "one-off icon rows that do not navigate between app sections",
    ],
    props: [
      { name: "items", description: "Array of { key, label, icon }.", required: true, example: "[{ key: 'today', label: 'Today', icon: 'IconCalendar' }]" },
      { name: "activeKey", description: "Key of the active tab.", required: true, example: "today" },
      { name: "onChange", description: "Called with the picked key." },
    ],
    canonical: true,
    replaces: ["TabBar"],
    reserved: true,
  },
  {
    id: "c_nav_bar",
    name: "NavBar",
    description:
      "iOS top nav bar with two layouts. variant='centered' (default): small headline title centered, optional leading/trailing/secondary actions. variant='large': big left-aligned largeTitle row + optional subtitle (no leading); trailing icons can carry a numeric/dot badge. Props: title, subtitle, variant, leading, trailing, secondaryTrailing, ariaLabel.",
    code: NAV_BAR_CODE,
    aliases: ["TopBar", "Header", "AppBar", "NavigationBar"],
    tags: ["navigation", "header", "top-bar", "ios", "toolbar"],
    useWhen: [
      "mobile top navigation/header",
      "screen title with leading back/cancel and trailing action icons",
      "large-title iOS screens",
    ],
    avoidWhen: ["bottom tabs", "inline section headers", "desktop global nav"],
    props: [
      { name: "title", description: "Title string or node." },
      { name: "variant", description: "'centered' | 'large'.", example: "large" },
      { name: "leading", description: "Optional icon/text action." },
      { name: "trailing", description: "Optional icon/text action." },
      { name: "secondaryTrailing", description: "Optional second icon action when trailing exists." },
    ],
    canonical: true,
    reserved: true,
  },
  {
    id: "c_switch",
    name: "Switch",
    description:
      "iOS toggle switch. 51x31 track, brand when on. Props: checked, defaultChecked, onChange, disabled, label, ariaLabel.",
    code: SWITCH_CODE,
    aliases: ["Toggle", "ToggleSwitch"],
    tags: ["form", "control", "toggle", "switch", "settings"],
    useWhen: ["binary settings", "enable/disable options", "preference rows"],
    avoidWhen: ["multi-option choices", "navigation", "form submission"],
    props: [
      { name: "checked", description: "Controlled boolean value." },
      { name: "defaultChecked", description: "Initial uncontrolled boolean value." },
      { name: "onChange", description: "Called with next boolean." },
      { name: "label", description: "Optional row label." },
      { name: "ariaLabel", description: "Required when no visible label." },
    ],
    canonical: true,
    reserved: true,
  },
  {
    id: "c_icon_swap",
    name: "IconSwap",
    description:
      "Central icon with optional display chip (plain | tinted | filled) and a blur+scale crossfade when name/variant changes. Pass onClick to make it a press-scale button. Props: name, variant, size, color, display, onClick, disabled, ariaLabel.",
    code: ICON_SWAP_CODE,
    aliases: ["IconButton", "IconChip", "AnimatedIcon"],
    tags: ["icon", "animation", "control", "chip"],
    useWhen: [
      "central icon display with optional tinted/filled chip",
      "icon changes should animate smoothly",
      "standalone icon button with press feedback",
    ],
    avoidWhen: ["bottom tab icons inside BottomTabBar", "large illustrations"],
    props: [
      { name: "name", description: "Exact Central Icons name.", required: true },
      { name: "variant", description: "'outlined' | 'filled'." },
      { name: "display", description: "'plain' | 'tinted' | 'filled'." },
      { name: "onClick", description: "Makes it interactive." },
      { name: "ariaLabel", description: "Required when interactive or standalone." },
    ],
    canonical: true,
    reserved: true,
  },
  {
    id: "c_segmented_control",
    name: "SegmentedControl",
    description:
      "iOS segmented picker. Active pill floats on bg-primary. Props: options (value, label), value, defaultValue, onChange, fullWidth, disabled.",
    code: SEGMENTED_CONTROL_CODE,
    aliases: ["SegmentedPicker", "Tabs", "FilterTabs", "PillTabs"],
    tags: ["control", "segmented-control", "filter", "picker", "ios"],
    useWhen: [
      "switching filters or modes within the same screen",
      "2-5 mutually exclusive local options",
    ],
    avoidWhen: [
      "top-level app navigation between screens",
      "bottom tab bars",
      "multi-select filters",
    ],
    props: [
      { name: "options", description: "Array of { value, label }.", required: true },
      { name: "value", description: "Controlled active value." },
      { name: "defaultValue", description: "Initial uncontrolled value." },
      { name: "onChange", description: "Called with picked value." },
      { name: "fullWidth", description: "Stretch to parent width." },
    ],
    canonical: true,
    reserved: true,
  },
];

type Listener = (cs: DesignComponent[]) => void;

class DesignComponentsStore {
  private current: DesignComponent[] = DEFAULTS.map((c) => ({ ...c }));
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): DesignComponent[] {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    if (typeof window === "undefined") return this.current;
    try {
      const raw =
        window.localStorage.getItem(STORAGE_KEY) ??
        window.localStorage.getItem("oc:design-components:v29") ??
        window.localStorage.getItem("oc:design-components:v28");
      if (raw) {
        const parsed = JSON.parse(raw) as DesignComponent[];
        if (Array.isArray(parsed)) {
          this.current = mergeDefaultComponents(parsed);
        }
      }
    } catch {
      /* ignore */
    }
    return this.current;
  }

  get(): DesignComponent[] {
    if (!this.hydrated) this.hydrate();
    return this.current;
  }

  upsert(c: DesignComponent) {
    const i = this.current.findIndex((x) => x.id === c.id);
    if (i >= 0) this.current = this.current.map((x, j) => (j === i ? c : x));
    else this.current = [...this.current, c];
    this.persist();
    this.notify();
  }

  remove(id: string) {
    this.current = this.current.filter((c) => c.id !== id);
    this.persist();
    this.notify();
  }

  resetToDefaults() {
    this.current = DEFAULTS.map((c) => ({ ...c }));
    this.persist();
    this.notify();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  /**
   * Files map fragment to merge into Sandpack: { "/components/Button.tsx":
   * "...", ... }. Components are TSX because most AI output is TypeScript;
   * Sandpack's react template tolerates both.
   */
  toSandpackFiles(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const c of this.current) {
      // Only include components with a valid PascalCase name.
      if (!/^[A-Z][A-Za-z0-9]*$/.test(c.name)) continue;
      out[`/components/${c.name}.js`] = c.code;
    }
    return out;
  }

  /** Short human-readable inventory for the agent's system prompt. */
  toPromptDescription(): string {
    if (this.current.length === 0) return "";
    const sorted = [...this.current].sort((a, b) => {
      if (a.canonical !== b.canonical) return a.canonical ? -1 : 1;
      if (a.name === "BottomTabBar") return -1;
      if (b.name === "BottomTabBar") return 1;
      return a.name.localeCompare(b.name);
    });
    const lines = [
      "Shared component registry (use exact imports; compose instead of inlining covered patterns):",
    ];
    for (const c of sorted) {
      lines.push(componentPromptLine(c));
    }
    lines.push(
      "Canonical names win over aliases. If a component's aliases/tags/useWhen match the UI you need, import that component and pass props; do not recreate its markup inline.",
    );
    return lines.join("\n");
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      /* ignore */
    }
  }

  private notify() {
    for (const l of this.listeners) l(this.current);
  }
}

function mergeDefaultComponents(stored: DesignComponent[]): DesignComponent[] {
  const defaultsByName = new Map(DEFAULTS.map((c) => [c.name, c]));
  const merged = stored.map((c) => {
    const baseline = defaultsByName.get(c.name);
    if (!baseline) return c;
    return {
      ...baseline,
      ...c,
      aliases: c.aliases ?? baseline.aliases,
      tags: c.tags ?? baseline.tags,
      useWhen: c.useWhen ?? baseline.useWhen,
      avoidWhen: c.avoidWhen ?? baseline.avoidWhen,
      props: c.props ?? baseline.props,
      canonical: c.canonical ?? baseline.canonical,
      replaces: c.replaces ?? baseline.replaces,
      reserved: c.reserved ?? baseline.reserved,
    };
  });
  const byName = new Set(merged.map((c) => c.name));
  const missingDefaults = DEFAULTS.filter((c) => !byName.has(c.name)).map((c) => ({
    ...c,
  }));
  return [...merged, ...missingDefaults];
}

export function baselineComponentForName(name: string): DesignComponent | null {
  const needle = name.toLowerCase();
  return (
    DEFAULTS.find(
      (c) =>
        c.name.toLowerCase() === needle ||
        (c.aliases ?? []).some((a) => a.toLowerCase() === needle),
    ) ?? null
  );
}

export function isReservedBaselineComponentName(name: string): boolean {
  return !!baselineComponentForName(name);
}

export function componentPromptLine(c: DesignComponent): string {
  const importPath = `import ${c.name} from './components/${c.name}';`;
  const parts = [
    `- ${c.name}${c.canonical ? " (canonical)" : ""}${c.reserved ? " (baseline)" : ""}: ${importPath} — ${c.description || "(no description)"}`,
  ];
  if (c.aliases?.length) parts.push(`  Aliases/keywords: ${c.aliases.join(", ")}`);
  if (c.tags?.length) parts.push(`  Tags: ${c.tags.join(", ")}`);
  if (c.useWhen?.length) parts.push(`  Use when: ${c.useWhen.join("; ")}`);
  if (c.avoidWhen?.length) parts.push(`  Avoid when: ${c.avoidWhen.join("; ")}`);
  if (c.replaces?.length) parts.push(`  Replaces/prefer over: ${c.replaces.join(", ")}`);
  if (c.props?.length) {
    parts.push(
      "  Props: " +
        c.props
          .map((p) => `${p.name}${p.required ? " (required)" : ""}${p.example ? ` e.g. ${p.example}` : ""} — ${p.description}`)
          .join("; "),
    );
  }
  return parts.join("\n");
}

export const designComponentsStore = new DesignComponentsStore();

if (typeof window !== "undefined") {
  (
    window as unknown as { __designComponentsStore: DesignComponentsStore }
  ).__designComponentsStore = designComponentsStore;
  designComponentsStore.hydrate();
}
