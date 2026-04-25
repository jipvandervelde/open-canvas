export type ViewportPresetId =
  | "iphone-17"
  | "iphone-17-pro"
  | "iphone-17-pro-max"
  | "ipad"
  | "desktop-1280"
  | "desktop-1536"
  | "custom";

export type ViewportPreset = {
  id: ViewportPresetId;
  label: string;
  width: number;
  height: number;
  category: "mobile" | "tablet" | "desktop" | "custom";
};

export const VIEWPORT_PRESETS: ViewportPreset[] = [
  { id: "iphone-17", label: "iPhone 17", width: 393, height: 852, category: "mobile" },
  { id: "iphone-17-pro", label: "iPhone 17 Pro", width: 402, height: 874, category: "mobile" },
  { id: "iphone-17-pro-max", label: "iPhone 17 Pro Max", width: 440, height: 956, category: "mobile" },
  { id: "ipad", label: "iPad", width: 820, height: 1180, category: "tablet" },
  { id: "desktop-1280", label: "Desktop (1280)", width: 1280, height: 800, category: "desktop" },
  { id: "desktop-1536", label: "Desktop (1536)", width: 1536, height: 960, category: "desktop" },
  { id: "custom", label: "Custom", width: 800, height: 600, category: "custom" },
];

export const VIEWPORT_PRESETS_BY_ID: Record<ViewportPresetId, ViewportPreset> =
  VIEWPORT_PRESETS.reduce(
    (acc, p) => {
      acc[p.id] = p;
      return acc;
    },
    {} as Record<ViewportPresetId, ViewportPreset>,
  );

export function getViewport(id: ViewportPresetId): ViewportPreset {
  return VIEWPORT_PRESETS_BY_ID[id] ?? VIEWPORT_PRESETS_BY_ID["iphone-17-pro"];
}

export const DEFAULT_VIEWPORT_ID: ViewportPresetId = "iphone-17-pro";

/** Default React component code shown in a freshly-created screen. */
export const DEFAULT_SCREEN_CODE = `export default function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-screen-px)',
        background: 'var(--color-bg-primary)',
        color: 'var(--color-fg-secondary)',
        fontFamily: 'var(--font-body-family)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 'var(--space-sm)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-largeTitle-family)',
            fontSize: 'var(--font-largeTitle-size)',
            fontWeight: 'var(--font-largeTitle-weight)',
            lineHeight: 'var(--font-largeTitle-line-height)',
            letterSpacing: 'var(--font-largeTitle-letter-spacing)',
            color: 'var(--color-fg-primary)',
          }}
        >
          👋
        </div>
        <div
          style={{
            fontFamily: 'var(--font-title-family)',
            fontSize: 'var(--font-title-size)',
            fontWeight: 'var(--font-title-weight)',
            lineHeight: 'var(--font-title-line-height)',
            letterSpacing: 'var(--font-title-letter-spacing)',
            color: 'var(--color-fg-primary)',
          }}
        >
          Hello World!
        </div>
        <div
          style={{
            fontFamily: 'var(--font-footnote-family)',
            fontSize: 'var(--font-footnote-size)',
            fontWeight: 'var(--font-footnote-weight)',
            lineHeight: 'var(--font-footnote-line-height)',
            letterSpacing: 'var(--font-footnote-letter-spacing)',
            color: 'var(--color-fg-secondary)',
            maxWidth: '20rem',
          }}
        >
          Prompt the agent to design something here.
        </div>
      </div>
    </div>
  );
}
`;
