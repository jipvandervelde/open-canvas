"use client";

import { createElement, useEffect, useState } from "react";
import {
  modelSettingsStore,
  MODEL_BY_ID,
  type ModelSettings,
} from "@/lib/model-settings-store";
import { getIconComponent } from "@/lib/icon-render-client";

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
  const ThinkIcon = getIconComponent("IconBrain", on ? "filled" : "outlined");

  return (
    <button
      type="button"
      className="oc-composer-tool oc-composer-tool--think"
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
      {ThinkIcon
        ? createElement(ThinkIcon, {
            size: 16,
            color: "currentColor",
            ariaHidden: true,
          })
        : null}
      <span className="oc-composer-tool-text">Think {on ? "on" : "off"}</span>
    </button>
  );
}
