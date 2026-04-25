"use client";

import { useEffect, useState } from "react";
import {
  designTokensStore,
  type DesignTokens,
  type ColorToken,
  type ScalarToken,
  type TypographyToken,
  type TokenKind,
} from "@/lib/design-tokens-store";

const KIND_LABELS: Record<TokenKind, string> = {
  color: "Colors",
  spacing: "Spacing",
  radius: "Radius",
  typography: "Typography",
};

const KIND_ORDER: TokenKind[] = [
  "color",
  "spacing",
  "radius",
  "typography",
];

export function TokensPanel() {
  const [tokens, setTokens] = useState<DesignTokens>(() =>
    designTokensStore.get(),
  );
  useEffect(() => {
    setTokens(designTokensStore.get());
    return designTokensStore.subscribe(setTokens);
  }, []);

  return (
    <div className="oc-tokens">
      <div className="oc-tokens-head">
        <span className="oc-tokens-title">Design tokens</span>
        <button
          type="button"
          className="oc-tokens-reset"
          onClick={() => designTokensStore.resetToDefaults()}
          title="Restore the default iOS-first token set"
        >
          Reset
        </button>
      </div>
      {KIND_ORDER.map((kind) => {
        if (kind === "color") {
          return <ColorGroup key={kind} tokens={tokens.color} />;
        }
        if (kind === "typography") {
          return (
            <TypographyGroup key={kind} tokens={tokens.typography} />
          );
        }
        return (
          <ScalarGroup
            key={kind}
            kind={kind}
            tokens={tokens[kind] as ScalarToken[]}
          />
        );
      })}
    </div>
  );
}

// ─── Colors (light + dark per row) ─────────────────────────────────────────

function ColorGroup({ tokens }: { tokens: ColorToken[] }) {
  const addToken = () => {
    designTokensStore.upsertColorToken({
      id: `color_${Date.now().toString(36)}`,
      name: "new",
      light: "#CCCCCC",
      dark: "#333333",
    });
  };
  return (
    <section className="oc-tokens-group">
      <header className="oc-tokens-group-head">
        <span className="oc-tokens-group-label">{KIND_LABELS.color}</span>
        <span className="oc-tokens-group-hint">light / dark</span>
        <button
          type="button"
          className="oc-tokens-add"
          onClick={addToken}
          title="Add color token"
        >
          + Add
        </button>
      </header>
      <ul className="oc-tokens-list">
        {tokens.map((t) => (
          <ColorRow key={t.id} token={t} />
        ))}
        {tokens.length === 0 && (
          <li className="oc-tokens-empty">No tokens yet.</li>
        )}
      </ul>
    </section>
  );
}

function ColorRow({ token }: { token: ColorToken }) {
  const [name, setName] = useState(token.name);
  const [light, setLight] = useState(token.light);
  const [dark, setDark] = useState(token.dark);
  useEffect(() => {
    setName(token.name);
    setLight(token.light);
    setDark(token.dark);
  }, [token.name, token.light, token.dark]);

  const commit = (next: Partial<ColorToken>) => {
    designTokensStore.upsertColorToken({ ...token, ...next });
  };

  return (
    <li className="oc-tokens-row oc-tokens-row--color">
      <div className="oc-tokens-dual-swatch" aria-hidden>
        <label
          className="oc-tokens-swatch oc-tokens-swatch--half oc-tokens-swatch--light"
          style={{ background: light }}
          title={`Light: ${light}`}
        >
          <input
            type="color"
            value={toHex(light)}
            onChange={(e) => {
              setLight(e.target.value);
              commit({ light: e.target.value });
            }}
          />
        </label>
        <label
          className="oc-tokens-swatch oc-tokens-swatch--half oc-tokens-swatch--dark"
          style={{ background: dark }}
          title={`Dark: ${dark}`}
        >
          <input
            type="color"
            value={toHex(dark)}
            onChange={(e) => {
              setDark(e.target.value);
              commit({ dark: e.target.value });
            }}
          />
        </label>
      </div>
      <input
        className="oc-tokens-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={(e) => commit({ name: e.target.value.trim() || token.name })}
        spellCheck={false}
      />
      <input
        className="oc-tokens-value oc-tokens-value--light"
        value={light}
        onChange={(e) => setLight(e.target.value)}
        onBlur={(e) => commit({ light: e.target.value })}
        spellCheck={false}
        aria-label={`${token.name} light value`}
        title="Light value"
      />
      <input
        className="oc-tokens-value oc-tokens-value--dark"
        value={dark}
        onChange={(e) => setDark(e.target.value)}
        onBlur={(e) => commit({ dark: e.target.value })}
        spellCheck={false}
        aria-label={`${token.name} dark value`}
        title="Dark value"
      />
      <button
        type="button"
        className="oc-tokens-remove"
        onClick={() => designTokensStore.removeToken("color", token.id)}
        title="Remove token"
        aria-label="Remove token"
      >
        ×
      </button>
    </li>
  );
}

// ─── Scalars (spacing / radius — single value) ─────────────────

function ScalarGroup({
  kind,
  tokens,
}: {
  kind: "spacing" | "radius";
  tokens: ScalarToken[];
}) {
  const addToken = () => {
    const defaults: Record<typeof kind, string> = {
      spacing: "16px",
      radius: "8px",
    };
    designTokensStore.upsertScalarToken(kind, {
      id: `${kind}_${Date.now().toString(36)}`,
      name: "new",
      value: defaults[kind],
    });
  };

  return (
    <section className="oc-tokens-group">
      <header className="oc-tokens-group-head">
        <span className="oc-tokens-group-label">{KIND_LABELS[kind]}</span>
        <button
          type="button"
          className="oc-tokens-add"
          onClick={addToken}
          title={`Add ${KIND_LABELS[kind].toLowerCase()} token`}
        >
          + Add
        </button>
      </header>
      <ul className="oc-tokens-list">
        {tokens.map((t) => (
          <ScalarRow key={t.id} kind={kind} token={t} />
        ))}
        {tokens.length === 0 && (
          <li className="oc-tokens-empty">No tokens yet.</li>
        )}
      </ul>
    </section>
  );
}

function ScalarRow({
  kind,
  token,
}: {
  kind: "spacing" | "radius";
  token: ScalarToken;
}) {
  const [name, setName] = useState(token.name);
  const [value, setValue] = useState(token.value);
  useEffect(() => {
    setName(token.name);
    setValue(token.value);
  }, [token.name, token.value]);

  const commit = (next: Partial<ScalarToken>) => {
    designTokensStore.upsertScalarToken(kind, { ...token, ...next });
  };

  return (
    <li className="oc-tokens-row">
      <span className="oc-tokens-swatch oc-tokens-swatch--meta">
        {kind === "spacing" ? "⇆" : "◵"}
      </span>
      <input
        className="oc-tokens-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={(e) => commit({ name: e.target.value.trim() || token.name })}
        spellCheck={false}
      />
      <input
        className="oc-tokens-value"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => commit({ value: e.target.value })}
        spellCheck={false}
      />
      <button
        type="button"
        className="oc-tokens-remove"
        onClick={() => designTokensStore.removeToken(kind, token.id)}
        title="Remove token"
        aria-label="Remove token"
      >
        ×
      </button>
    </li>
  );
}

// ─── Typography (font-family + size + weight + line-height + tracking) ────

function TypographyGroup({ tokens }: { tokens: TypographyToken[] }) {
  const addToken = () => {
    designTokensStore.upsertTypographyToken({
      id: `typography_${Date.now().toString(36)}`,
      name: "new",
      fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      fontSize: "16px",
      fontWeight: 400,
      lineHeight: "1.4",
      letterSpacing: "0",
    });
  };
  return (
    <section className="oc-tokens-group">
      <header className="oc-tokens-group-head">
        <span className="oc-tokens-group-label">Typography</span>
        <span className="oc-tokens-group-hint">family / size / weight / lh / tracking</span>
        <button
          type="button"
          className="oc-tokens-add"
          onClick={addToken}
          title="Add typography token"
        >
          + Add
        </button>
      </header>
      <ul className="oc-tokens-list">
        {tokens.map((t) => (
          <TypographyRow key={t.id} token={t} />
        ))}
        {tokens.length === 0 && (
          <li className="oc-tokens-empty">No tokens yet.</li>
        )}
      </ul>
    </section>
  );
}

function TypographyRow({ token }: { token: TypographyToken }) {
  const [local, setLocal] = useState<TypographyToken>(token);
  useEffect(() => {
    setLocal(token);
  }, [token]);

  const commit = (next: Partial<TypographyToken>) => {
    designTokensStore.upsertTypographyToken({ ...token, ...next });
  };

  const previewStyle: React.CSSProperties = {
    fontFamily: local.fontFamily,
    fontSize: local.fontSize,
    fontWeight: local.fontWeight,
    lineHeight: local.lineHeight,
    letterSpacing: local.letterSpacing,
  };

  return (
    <li className="oc-tokens-row oc-tokens-row--typography">
      <span
        className="oc-tokens-swatch oc-tokens-swatch--meta oc-tokens-swatch--typography"
        style={previewStyle}
        aria-hidden
      >
        Aa
      </span>
      <input
        className="oc-tokens-name"
        value={local.name}
        onChange={(e) => setLocal({ ...local, name: e.target.value })}
        onBlur={(e) =>
          commit({ name: e.target.value.trim() || token.name })
        }
        spellCheck={false}
      />
      <input
        className="oc-tokens-value oc-tokens-typography-field"
        title="Font family"
        value={local.fontFamily}
        onChange={(e) => setLocal({ ...local, fontFamily: e.target.value })}
        onBlur={(e) => commit({ fontFamily: e.target.value })}
        spellCheck={false}
      />
      <input
        className="oc-tokens-value oc-tokens-typography-field oc-tokens-typography-size"
        title="Font size"
        value={local.fontSize}
        onChange={(e) => setLocal({ ...local, fontSize: e.target.value })}
        onBlur={(e) => commit({ fontSize: e.target.value })}
        spellCheck={false}
      />
      <input
        className="oc-tokens-value oc-tokens-typography-field oc-tokens-typography-weight"
        title="Font weight (100-900)"
        type="number"
        min={100}
        max={900}
        step={100}
        value={local.fontWeight}
        onChange={(e) =>
          setLocal({ ...local, fontWeight: Number(e.target.value) || 400 })
        }
        onBlur={(e) =>
          commit({ fontWeight: Number(e.target.value) || 400 })
        }
      />
      <input
        className="oc-tokens-value oc-tokens-typography-field oc-tokens-typography-lh"
        title="Line height (e.g. 1.4 or 24px)"
        value={local.lineHeight}
        onChange={(e) => setLocal({ ...local, lineHeight: e.target.value })}
        onBlur={(e) => commit({ lineHeight: e.target.value })}
        spellCheck={false}
      />
      <input
        className="oc-tokens-value oc-tokens-typography-field oc-tokens-typography-tracking"
        title="Letter spacing (e.g. 0, -0.01em)"
        value={local.letterSpacing}
        onChange={(e) =>
          setLocal({ ...local, letterSpacing: e.target.value })
        }
        onBlur={(e) => commit({ letterSpacing: e.target.value })}
        spellCheck={false}
      />
      <button
        type="button"
        className="oc-tokens-remove"
        onClick={() => designTokensStore.removeToken("typography", token.id)}
        title="Remove token"
        aria-label="Remove token"
      >
        ×
      </button>
    </li>
  );
}

// Browser <input type="color"> requires a 6-char hex. Fall back to a neutral
// when the token value is something exotic (rgba(), oklch(), var(), 8-digit
// hex with alpha, etc.) — editing via the text input still works.
function toHex(v: string): string {
  const m = /^#([0-9a-fA-F]{6})\b/.exec(v.trim());
  return m ? `#${m[1]}` : "#000000";
}
