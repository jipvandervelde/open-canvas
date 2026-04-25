"use client";

import { useEffect, useState } from "react";
import {
  modelSettingsStore,
  MODEL_BY_ID,
  type ModelSettings,
} from "@/lib/model-settings-store";

/**
 * Composer-level controls. Redesigned to match the Claude Code message bar:
 * model info renders as inline text ("Kimi K2.6 · Think on"), not a pill
 * button. Clicking the text toggles the Think state inline.
 */
export function ModelPicker() {
  const [settings, setSettings] = useState<ModelSettings>(() =>
    modelSettingsStore.get(),
  );
  useEffect(() => {
    setSettings(modelSettingsStore.get());
    return modelSettingsStore.subscribe(setSettings);
  }, []);

  const current =
    MODEL_BY_ID[settings.modelId] ?? MODEL_BY_ID["kimi-k2.6"];

  return (
    <span
      className="oc-composer-tool-label"
      title={`Model: ${current.label} · ${current.description}`}
      aria-label={`Using ${current.label}`}
    >
      {current.label}
    </span>
  );
}

/**
 * Think toggle — shows the thinking state inline with the model label.
 * Uses the composer-tool button style but switches to accent color when on.
 */
export function ThinkingToggle() {
  const [settings, setSettings] = useState<ModelSettings>(() =>
    modelSettingsStore.get(),
  );
  useEffect(() => {
    setSettings(modelSettingsStore.get());
    return modelSettingsStore.subscribe(setSettings);
  }, []);

  const model = MODEL_BY_ID[settings.modelId];
  const disabled = !model?.supportsThinking;
  const on = settings.thinking && !disabled;

  return (
    <button
      type="button"
      className="oc-composer-tool"
      data-on={on || undefined}
      onClick={() => modelSettingsStore.setThinking(!on)}
      disabled={disabled}
      title={
        disabled
          ? "This model does not support extended thinking"
          : on
            ? "Extended thinking is on — click to turn off"
            : "Turn on extended thinking for harder problems"
      }
    >
      <ThinkGlyph />
      <span>Think {on ? "on" : "off"}</span>
    </button>
  );
}

function ThinkGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 2.5a4.5 4.5 0 0 0-2.4 8.3V12a1 1 0 0 0 1 1h2.8a1 1 0 0 0 1-1v-1.2A4.5 4.5 0 0 0 8 2.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 14h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
