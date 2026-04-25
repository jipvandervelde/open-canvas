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
};

// v13: Button drops the disabled opacity dimming — the new fg-tertiary
// surface + fg-secondary ink in the *-disabled tokens are the visual
// signal instead. Compounding both made disabled buttons nearly
// invisible. v12 added the capsule prop; older context in git history.
const STORAGE_KEY = "oc:design-components:v13";

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
 *  component-tokens (\`text-field\`, \`text-field-label\`,
 *  \`text-field-focus-ring\`, \`text-field-error-ring\`,
 *  \`text-field-error-message\`, \`text-field-helper-message\`).
 *  Behavior (controlled/uncontrolled, focus tracking, iOS
 *  autocapitalize opt-outs) stays here. */
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
          fontFamily: 'inherit',
          fontWeight: 400,
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
    top: 2,
    left: 2,
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
        fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        WebkitFontSmoothing: 'antialiased',
        fontSize: 'var(--font-body)',
        fontWeight: 400,
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

const TAB_BAR_CODE = `import React, { useState } from 'react';
// Shared components live at /components/*, so the icons module is one
// level up. Screens at the root use './centralIcons' instead.
import { Icon } from '../centralIcons';
import { STYLE } from '../component-tokens';

/** TabBar — iOS-style bottom tab bar. 3-5 items. The bar sits on
 *  bg-secondary (one notch up from the bg-primary screen) so the
 *  surface-contrast alone defines its edge — no border, no inset line.
 *  Active item uses the filled icon + brand color; inactive is outlined
 *  + fg-secondary. Font weight is CONSTANT across states (no layout
 *  shift). Press-scale is reduced-motion-aware. */
export default function TabBar({
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
        paddingTop: 6,
        paddingBottom: 'var(--space-safe-bottom)',
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
      <span
        style={{
          fontSize: 10,
          // fontWeight inherited from the parent button's tab-item-*
          // token — keeps active + inactive at the SAME weight (no
          // layout shift), only color flips.
          letterSpacing: 0.1,
        }}
      >
        {tab.label}
      </span>
    </button>
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
  },
  {
    id: "c_card",
    name: "Card",
    description:
      "Surface with padding, radius, and soft shadow. Props: padding, gap, direction.",
    code: CARD_CODE,
  },
  {
    id: "c_stack",
    name: "Stack",
    description:
      "Auto-layout container. Props: direction ('row'|'column'), gap, align, justify, padding.",
    code: STACK_CODE,
  },
  {
    id: "c_text_field",
    name: "TextField",
    description:
      "iOS text input with stacked label + optional helper/error. Props: label, placeholder, value, onChange, type, error, helper, disabled, fullWidth, autoComplete.",
    code: TEXT_FIELD_CODE,
  },
  {
    id: "c_tab_bar",
    name: "TabBar",
    description:
      "iOS bottom tab bar, 3-5 items. Active = filled icon + brand; inactive = outlined + fg-secondary. Props: items (key, label, icon), activeKey, onChange.",
    code: TAB_BAR_CODE,
  },
  {
    id: "c_switch",
    name: "Switch",
    description:
      "iOS toggle switch. 51x31 track, brand when on. Props: checked, defaultChecked, onChange, disabled, label, ariaLabel.",
    code: SWITCH_CODE,
  },
  {
    id: "c_segmented_control",
    name: "SegmentedControl",
    description:
      "iOS segmented picker. Active pill floats on bg-primary. Props: options (value, label), value, defaultValue, onChange, fullWidth, disabled.",
    code: SEGMENTED_CONTROL_CODE,
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
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DesignComponent[];
        if (Array.isArray(parsed)) this.current = parsed;
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
    const lines = ["Shared components available (import from '/components/{Name}'):"];
    for (const c of this.current) {
      lines.push(`- ${c.name} — ${c.description}`);
    }
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

export const designComponentsStore = new DesignComponentsStore();

if (typeof window !== "undefined") {
  (
    window as unknown as { __designComponentsStore: DesignComponentsStore }
  ).__designComponentsStore = designComponentsStore;
  designComponentsStore.hydrate();
}
