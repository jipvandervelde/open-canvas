/**
 * Shared data entities (the app's data model). Each entity is a typed
 * collection with seed rows; every Sandpack gets `/data/{name}.js` so
 * screens can `import { recipes, findRecipe } from './data/recipes';`
 * and stay consistent with each other.
 *
 * The whole point of this layer is to stop the agent from hardcoding a
 * different `recipes = [...]` inside each screen — instead Overview uses
 * `import { recipes }`, Detail uses `findRecipe(id)`, and clicking a card
 * in Overview navigates to `/recipes/:id` which Detail reads via params.
 *
 * Mirrors `design-services-store.ts` exactly: pub/sub + localStorage +
 * toSandpackFiles + toPromptDescription.
 */

export type DataFieldType =
  | "string"
  | "number"
  | "boolean"
  | "image"
  | "date";

export type DataField = {
  name: string; // camelCase
  type: DataFieldType;
  description?: string;
};

export type DataEntity = {
  id: string;
  /** camelCase plural, used for filename + import. e.g. "recipes", "users". */
  name: string;
  /** Singular, used in prompt descriptions + generated helpers. e.g. "Recipe". */
  singular: string;
  description: string;
  fields: DataField[];
  /** One row per item; keys correspond to `fields[].name`. */
  seeds: Record<string, unknown>[];
};

const STORAGE_KEY = "oc:design-data";

const DEFAULTS: DataEntity[] = [];

type Listener = (entities: DataEntity[]) => void;

class DesignDataStore {
  private current: DataEntity[] = DEFAULTS.map((e) => ({ ...e }));
  private listeners = new Set<Listener>();
  private hydrated = false;

  hydrate(): DataEntity[] {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    if (typeof window === "undefined") return this.current;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DataEntity[];
        if (Array.isArray(parsed)) this.current = parsed;
      }
    } catch {
      /* ignore */
    }
    return this.current;
  }

  get(): DataEntity[] {
    if (!this.hydrated) this.hydrate();
    return this.current;
  }

  upsert(e: DataEntity) {
    const i = this.current.findIndex((x) => x.id === e.id);
    if (i >= 0) this.current = this.current.map((x, j) => (j === i ? e : x));
    else this.current = [...this.current, e];
    this.persist();
    this.notify();
  }

  remove(id: string) {
    this.current = this.current.filter((e) => e.id !== id);
    this.persist();
    this.notify();
  }

  clearAll() {
    this.current = [];
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
   * Serialize every entity to a Sandpack file. Each entity produces a file
   * at `/data/{name}.js` that exports:
   *   - the seeds array (named after the entity, e.g. `recipes`)
   *   - a `find{Singular}(id)` lookup helper
   *   - a `list{Singular}s()` list helper (so screens don't import the raw
   *     array directly — keeps a stable API when we later swap in a real
   *     datastore behind it).
   */
  toSandpackFiles(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.current) {
      if (!/^[a-z][a-zA-Z0-9]*$/.test(e.name)) continue;
      if (!/^[A-Z][A-Za-z0-9]*$/.test(e.singular)) continue;
      out[`/data/${e.name}.js`] = this.toFile(e);
    }
    return out;
  }

  private toFile(e: DataEntity): string {
    const seedsJson = JSON.stringify(e.seeds ?? [], null, 2);
    return `// Auto-generated from the Data tab. Edit fields & rows there; this file
// regenerates automatically. Screens import from it to stay in sync.

export const ${e.name} = ${seedsJson};
export const ${e.name}Ready = ${e.name}.length > 0;

export function find${e.singular}(id) {
  return ${e.name}.find((item) => String(item.id) === String(id)) || null;
}

export function list${e.singular}s() {
  return ${e.name};
}
`;
  }

  toPromptDescription(): string {
    if (this.current.length === 0) return "";
    const lines = [
      "Shared data entities (import via `import { name, findX } from './data/{name}';`):",
    ];
    for (const e of this.current) {
      const fieldList = e.fields.map((f) => `${f.name}:${f.type}`).join(", ");
      lines.push(
        `- ${e.name} (${e.singular}) — ${e.description} · fields: ${fieldList} · ${e.seeds.length} seed row${e.seeds.length === 1 ? "" : "s"}`,
      );
    }
    lines.push(
      "Screens that show lists (Home, Favorites, Search) should import these entities and render their items. Screens that show a single item (Detail) should read the id from `useParams()` (services/router) and call `find{Singular}(id)`. NEVER re-inline a parallel hardcoded array for the same entity — the whole point is that all screens see the same data.",
    );
    lines.push(
      "Seed rows may be temporarily empty while the background seed agent finishes. In that case render a loading/empty state from the shared entity; do NOT create fallback domain rows inside a screen.",
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

export const designDataStore = new DesignDataStore();

if (typeof window !== "undefined") {
  (
    window as unknown as { __designDataStore: DesignDataStore }
  ).__designDataStore = designDataStore;
  designDataStore.hydrate();
}
