/**
 * Named animation presets. Each preset encodes a Framer-Motion `variants` +
 * `transition` config so screens can write `<AnimatedItem preset="slideUp">`
 * instead of hand-rolling motion configs. Tokens → components → services →
 * motion follows the same pattern as the other stores.
 *
 * The Sandpack iframe imports `/motion.js` which exports the presets + a
 * `<Motion>` helper that wraps a child with the named preset.
 */

export type MotionPreset = {
  id: string;
  name: string;
  description: string;
  /** Serialized as a plain object — emitted verbatim into /motion.js. */
  config: {
    initial: Record<string, number | string>;
    animate: Record<string, number | string>;
    exit?: Record<string, number | string>;
    transition: {
      type?: "spring" | "tween";
      duration?: number;
      stiffness?: number;
      damping?: number;
      mass?: number;
      delay?: number;
      ease?: string | number[];
    };
  };
};

const STORAGE_KEY = "oc:design-motion";

const DEFAULTS: MotionPreset[] = [
  {
    id: "m_fade",
    name: "fade",
    description: "Soft cross-fade. Quick, subtle — good default for content swaps.",
    config: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.22, ease: "easeOut" },
    },
  },
  {
    id: "m_slideUp",
    name: "slideUp",
    description: "Rises 12px + fades in. Good for content appearing below the fold.",
    config: {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -8 },
      transition: { type: "spring", stiffness: 420, damping: 30 },
    },
  },
  {
    id: "m_slideDown",
    name: "slideDown",
    description: "Drops 12px + fades in. Good for dropdowns / toasts.",
    config: {
      initial: { opacity: 0, y: -12 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 12 },
      transition: { type: "spring", stiffness: 420, damping: 30 },
    },
  },
  {
    id: "m_scale",
    name: "scale",
    description: "Pop from 92% → 100% with fade. Good for modals / dialogs.",
    config: {
      initial: { opacity: 0, scale: 0.92 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.96 },
      transition: { type: "spring", stiffness: 380, damping: 28 },
    },
  },
  {
    id: "m_bouncy",
    name: "bouncy",
    description: "Playful overshoot. Good for affirming actions (likes, saves).",
    config: {
      initial: { scale: 0.5, opacity: 0 },
      animate: { scale: 1, opacity: 1 },
      transition: { type: "spring", stiffness: 540, damping: 18, mass: 0.8 },
    },
  },
  {
    id: "m_pushLeft",
    name: "pushLeft",
    description: "Slides in from the right. Use for forward navigation.",
    config: {
      initial: { x: "100%", opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: "-100%", opacity: 0 },
      transition: { type: "spring", stiffness: 320, damping: 34 },
    },
  },
];

type Listener = (presets: MotionPreset[]) => void;

class DesignMotionStore {
  private current: MotionPreset[] = DEFAULTS.map((p) => ({
    ...p,
    config: JSON.parse(JSON.stringify(p.config)),
  }));
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): MotionPreset[] {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    if (typeof window === "undefined") return this.current;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MotionPreset[];
        if (Array.isArray(parsed)) this.current = parsed;
      }
    } catch {
      /* ignore */
    }
    return this.current;
  }

  get(): MotionPreset[] {
    if (!this.hydrated) this.hydrate();
    return this.current;
  }

  upsert(p: MotionPreset) {
    const i = this.current.findIndex((x) => x.id === p.id);
    if (i >= 0) this.current = this.current.map((x, j) => (j === i ? p : x));
    else this.current = [...this.current, p];
    this.persist();
    this.notify();
  }

  remove(id: string) {
    this.current = this.current.filter((p) => p.id !== id);
    this.persist();
    this.notify();
  }

  resetToDefaults() {
    this.current = DEFAULTS.map((p) => ({
      ...p,
      config: JSON.parse(JSON.stringify(p.config)),
    }));
    this.persist();
    this.notify();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  /** Generate the `/motion.js` source for Sandpack. */
  toMotionJs(): string {
    const entries = this.current
      .map(
        (p) =>
          `  ${JSON.stringify(p.name)}: ${JSON.stringify(p.config, null, 2).replace(/\n/g, "\n  ")}`,
      )
      .join(",\n");

    return `import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const PRESETS = {
${entries}
};

/** Motion — named-preset wrapper. Usage:
 *    <Motion preset="slideUp"><div>hello</div></Motion>
 *  Falls through to a plain div if the preset doesn't exist. */
export function Motion({ preset = 'fade', children, as = 'div', style, ...rest }) {
  const cfg = PRESETS[preset];
  if (!cfg) return React.createElement(as, { style, ...rest }, children);
  const Component = motion[as] ?? motion.div;
  return (
    <Component
      initial={cfg.initial}
      animate={cfg.animate}
      exit={cfg.exit}
      transition={cfg.transition}
      style={style}
      {...rest}
    >
      {children}
    </Component>
  );
}

/** Animated list: stagger children in with the given preset. */
export function MotionList({ preset = 'slideUp', stagger = 0.05, children, style }) {
  const cfg = PRESETS[preset] ?? PRESETS.fade;
  return (
    <motion.ul
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
      style={{ listStyle: 'none', margin: 0, padding: 0, ...style }}
    >
      {React.Children.map(children, (child, i) => (
        <motion.li
          key={i}
          variants={{ hidden: cfg.initial, visible: cfg.animate }}
          transition={cfg.transition}
          style={{ listStyle: 'none' }}
        >
          {child}
        </motion.li>
      ))}
    </motion.ul>
  );
}

export { motion, AnimatePresence };
`;
  }

  toPromptDescription(): string {
    if (this.current.length === 0) return "";
    const lines = [
      "Motion presets available from './motion.js' — import Motion, MotionList, or raw framer-motion:",
    ];
    for (const p of this.current) {
      lines.push(`- ${p.name} — ${p.description}`);
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

export const designMotionStore = new DesignMotionStore();

if (typeof window !== "undefined") {
  (
    window as unknown as { __designMotionStore: DesignMotionStore }
  ).__designMotionStore = designMotionStore;
  designMotionStore.hydrate();
}
