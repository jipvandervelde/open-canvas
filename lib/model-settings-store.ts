/**
 * Session-level model + thinking settings. The entire pipeline is locked on
 * Kimi K2.6 (Moonshot) so the "model picker" is really a presentational
 * chip — no per-call routing happens anymore. The Think toggle still works:
 * it flips the `thinking` object on the outgoing request.
 *
 * Legacy `modelId` values from earlier sessions (haiku/sonnet/opus) are
 * silently upgraded to the current single model id on hydrate.
 */

export type ModelId = "kimi-k2.6";

export type ModelOption = {
  id: ModelId;
  label: string;
  short: string;
  description: string;
  supportsThinking: boolean;
};

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "kimi-k2.6",
    label: "Kimi K2.6",
    short: "K2.6",
    description:
      "Moonshot's flagship thinking model. 256K context, native tool use.",
    supportsThinking: true,
  },
];

export const MODEL_BY_ID: Record<ModelId, ModelOption> = Object.fromEntries(
  MODEL_OPTIONS.map((m) => [m.id, m]),
) as Record<ModelId, ModelOption>;

const STORAGE_KEY = "oc:model-settings";

export type ModelSettings = {
  modelId: ModelId;
  thinking: boolean;
};

const DEFAULTS: ModelSettings = {
  modelId: "kimi-k2.6",
  // Thinking defaults ON for Kimi — the orchestrator uses it for planning
  // and interleaved tool reasoning. User can toggle off from the composer.
  thinking: true,
};

type Listener = (settings: ModelSettings) => void;

class ModelSettingsStore {
  private current: ModelSettings = { ...DEFAULTS };
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): ModelSettings {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    if (typeof window === "undefined") return this.current;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ModelSettings>;
        if (parsed && typeof parsed === "object") {
          // Legacy stored modelIds (haiku/sonnet/opus) get upgraded silently.
          this.current.modelId = "kimi-k2.6";
          if (typeof parsed.thinking === "boolean") {
            this.current.thinking = parsed.thinking;
          }
        }
      }
    } catch {
      /* storage disabled */
    }
    return this.current;
  }

  get(): ModelSettings {
    if (!this.hydrated) this.hydrate();
    return this.current;
  }

  setModel(id: ModelId) {
    if (!MODEL_BY_ID[id] || this.current.modelId === id) return;
    this.current = { ...this.current, modelId: id };
    this.persist();
    this.notify();
  }

  setThinking(enabled: boolean) {
    if (this.current.thinking === enabled) return;
    this.current = { ...this.current, thinking: enabled };
    this.persist();
    this.notify();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      /* storage disabled */
    }
  }

  private notify() {
    for (const l of this.listeners) l(this.current);
  }
}

export const modelSettingsStore = new ModelSettingsStore();

if (typeof window !== "undefined") {
  (
    window as unknown as { __modelSettingsStore: ModelSettingsStore }
  ).__modelSettingsStore = modelSettingsStore;
  modelSettingsStore.hydrate();
}
