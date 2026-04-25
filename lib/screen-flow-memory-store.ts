import type { ScreenShape } from "@/components/ScreenShapeUtil";
import { routeTableStore } from "@/lib/route-table-store";

export type ScreenMemory = {
  screenId: string;
  screenName: string;
  purpose: string;
  dependsOn: string[];
  shows: string[];
  navigation: string[];
  invariants: string[];
  openQuestions: string[];
  todos: string[];
  updatedAt: number;
};

export type FlowMemory = {
  id: string;
  title: string;
  screenIds: string[];
  scope: string;
  sharedState: string[];
  navigation: string[];
  invariants: string[];
  outOfScope: string[];
  openQuestions: string[];
  todos: string[];
  updatedAt: number;
};

type State = {
  screens: ScreenMemory[];
  flows: FlowMemory[];
};

type Listener = (state: State) => void;
type UpsertOptions = {
  preserveCurated?: boolean;
};

const STORAGE_KEY = "oc:screen-flow-memory:v1";

function unique(items: string[], limit = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = item.trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function namesFromImports(code: string, folder: "services" | "data" | "components") {
  return Array.from(
    code.matchAll(new RegExp(`from\\s+['"]\\.\\/${folder}\\/([^'"]+)['"]`, "g")),
  ).map((m) => `${folder}/${m[1]}`);
}

function literalTexts(code: string): string[] {
  return unique(
    Array.from(code.matchAll(/>\s*([A-Z][^<>{}]{2,48})\s*</g)).map((m) =>
      m[1].replace(/\s+/g, " "),
    ),
    6,
  );
}

function routeLinks(code: string): string[] {
  return unique(
    Array.from(
      code.matchAll(/<Link\b[^>]*\bto=(?:"([^"]+)"|'([^']+)')/g),
    ).map((m) => `links to ${(m[1] ?? m[2] ?? "").split("?")[0]}`),
    8,
  );
}

export function deriveScreenMemory(screen: ScreenShape): ScreenMemory {
  const code = screen.props.code;
  const lower = code.toLowerCase();
  const dependsOn = unique([
    ...namesFromImports(code, "services"),
    ...namesFromImports(code, "data"),
    ...namesFromImports(code, "components"),
  ]);
  const shows = unique([
    ...literalTexts(code),
    lower.includes("total") ? "transaction total" : "",
    lower.includes("subtotal") ? "subtotal" : "",
    lower.includes("payment") ? "payment method" : "",
    lower.includes("address") ? "address" : "",
    lower.includes("cart") ? "cart state" : "",
  ]);
  const navigation = routeLinks(code);
  const invariants = unique([
    lower.includes("total") || lower.includes("subtotal")
      ? "Totals shown here must come from the shared flow service and match sibling screens."
      : "",
    namesFromImports(code, "data").length > 0
      ? "Rows/details must come from the imported data entity, not inline fallback arrays."
      : "",
    navigation.length > 0
      ? "Navigation targets must exist in the route table and keep query params intact."
      : "",
  ]);

  return {
    screenId: String(screen.id),
    screenName: screen.props.name,
    purpose: `Screen in the ${screen.props.name} part of the product flow.`,
    dependsOn,
    shows,
    navigation,
    invariants,
    openQuestions: [],
    todos: [],
    updatedAt: Date.now(),
  };
}

export function deriveFlowMemory(title: string, screens: ScreenShape[]): FlowMemory {
  const screenIds = screens.map((s) => String(s.id));
  const code = screens.map((s) => s.props.code).join("\n\n");
  const lower = code.toLowerCase();
  const sharedState = unique([
    ...screens.flatMap((s) => namesFromImports(s.props.code, "services")),
    ...screens.flatMap((s) => namesFromImports(s.props.code, "data")),
  ]);
  const navigation = unique(
    routeTableStore
      .get()
      .filter((r) => screenIds.includes(r.id))
      .map((r) => `${r.name} -> ${r.path}`),
    12,
  );
  const invariants = unique([
    lower.includes("cart") || lower.includes("checkout") || lower.includes("total")
      ? "Cart/order quantities, subtotal, fees, tax, total, address, payment, and order id must come from one shared service."
      : "",
    lower.includes("detail") || lower.includes("find")
      ? "List-to-detail screens must pass ids through query params and use shared data lookup helpers."
      : "",
    "All screens in this flow should share route paths, core components, typography rhythm, and token usage.",
  ]);
  return {
    id: `flow_${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || Date.now().toString(36)}`,
    title,
    screenIds,
    scope: `Small complete slice across ${screens.map((s) => s.props.name).join(", ")}.`,
    sharedState,
    navigation,
    invariants,
    outOfScope: [],
    openQuestions: [],
    todos: [],
    updatedAt: Date.now(),
  };
}

class ScreenFlowMemoryStore {
  private current: State = { screens: [], flows: [] };
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): State {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    if (typeof window === "undefined") return this.current;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as State;
        if (Array.isArray(parsed.screens) && Array.isArray(parsed.flows)) {
          this.current = parsed;
        }
      }
    } catch {
      /* ignore */
    }
    return this.current;
  }

  get(): State {
    if (!this.hydrated) this.hydrate();
    return this.current;
  }

  upsertScreen(memory: ScreenMemory, options: UpsertOptions = {}) {
    const existing = this.get().screens.find((m) => m.screenId === memory.screenId);
    const preserveCurated = options.preserveCurated && existing;
    const next = {
      ...existing,
      ...memory,
      purpose: preserveCurated ? existing.purpose : memory.purpose,
      invariants: preserveCurated
        ? unique([...(memory.invariants ?? []), ...(existing.invariants ?? [])], 12)
        : memory.invariants,
      openQuestions: preserveCurated
        ? existing.openQuestions
        : memory.openQuestions,
      todos: preserveCurated ? existing.todos : memory.todos,
      updatedAt: Date.now(),
    };
    this.current = {
      ...this.current,
      screens: [
        ...this.current.screens.filter((m) => m.screenId !== memory.screenId),
        next,
      ],
    };
    this.persist();
    this.notify();
    return next;
  }

  upsertFlow(memory: FlowMemory, options: UpsertOptions = {}) {
    const existing = this.get().flows.find(
      (m) => m.id === memory.id || m.title === memory.title,
    );
    const preserveCurated = options.preserveCurated && existing;
    const next = {
      ...existing,
      ...memory,
      id: existing?.id ?? memory.id,
      scope: preserveCurated ? existing.scope : memory.scope,
      sharedState: preserveCurated
        ? unique([...(memory.sharedState ?? []), ...(existing.sharedState ?? [])], 12)
        : memory.sharedState,
      navigation: preserveCurated
        ? unique([...(memory.navigation ?? []), ...(existing.navigation ?? [])], 12)
        : memory.navigation,
      invariants: preserveCurated
        ? unique([...(memory.invariants ?? []), ...(existing.invariants ?? [])], 12)
        : memory.invariants,
      outOfScope: preserveCurated ? existing.outOfScope : memory.outOfScope,
      openQuestions: preserveCurated
        ? existing.openQuestions
        : memory.openQuestions,
      todos: preserveCurated
        ? unique([...(memory.todos ?? []), ...(existing.todos ?? [])], 12)
        : memory.todos,
      updatedAt: Date.now(),
    };
    this.current = {
      ...this.current,
      flows: [...this.current.flows.filter((m) => m.id !== next.id), next],
    };
    this.persist();
    this.notify();
    return next;
  }

  removeScreen(screenId: string) {
    this.current = {
      screens: this.get().screens.filter((m) => m.screenId !== screenId),
      flows: this.get().flows.map((f) => ({
        ...f,
        screenIds: f.screenIds.filter((id) => id !== screenId),
      })),
    };
    this.persist();
    this.notify();
  }

  toPromptBlock(screenIds?: string[]): string {
    const state = this.get();
    const idSet = screenIds ? new Set(screenIds) : null;
    const screens = idSet
      ? state.screens.filter((m) => idSet.has(m.screenId))
      : [...state.screens]
          .sort((a, b) => a.updatedAt - b.updatedAt)
          .slice(-12);
    const flows = idSet
      ? state.flows.filter((f) => f.screenIds.some((id) => idSet.has(id)))
      : [...state.flows]
          .sort((a, b) => a.updatedAt - b.updatedAt)
          .slice(-6);
    if (screens.length === 0 && flows.length === 0) return "";

    const lines = [
      "Structured screen/flow memory (source of truth for concise cross-screen context):",
    ];
    if (flows.length > 0) {
      lines.push("Flows:");
      for (const f of flows) {
        lines.push(
          `- ${f.title}: scope=${f.scope}; screens=${f.screenIds.join(", ")}; shared=${f.sharedState.join(", ") || "none"}; invariants=${f.invariants.join(" | ") || "none"}; todos=${f.todos.join(" | ") || "none"}`,
        );
      }
    }
    if (screens.length > 0) {
      lines.push("Screens:");
      for (const s of screens) {
        lines.push(
          `- ${s.screenName} (${s.screenId}): purpose=${s.purpose}; dependsOn=${s.dependsOn.join(", ") || "none"}; shows=${s.shows.join(", ") || "unspecified"}; nav=${s.navigation.join(", ") || "none"}; invariants=${s.invariants.join(" | ") || "none"}; todos=${s.todos.join(" | ") || "none"}`,
        );
      }
    }
    return lines.join("\n");
  }

  clearAll() {
    this.current = { screens: [], flows: [] };
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
      /* ignore */
    }
  }

  private notify() {
    for (const l of this.listeners) l(this.current);
  }
}

export const screenFlowMemoryStore = new ScreenFlowMemoryStore();

if (typeof window !== "undefined") {
  (
    window as unknown as { __screenFlowMemoryStore: ScreenFlowMemoryStore }
  ).__screenFlowMemoryStore = screenFlowMemoryStore;
  screenFlowMemoryStore.hydrate();
}
