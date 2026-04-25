"use client";

import { useEffect, useMemo, useState } from "react";
import {
  designServicesStore,
  type DesignService,
} from "@/lib/design-services-store";
import { CodeEditor } from "@/components/CodeEditor";

const STARTER_CODE = `/** Describe what this service does in one line. */

export function doSomething() {
  // ...
}
`;

export function ServicesPanel() {
  const [services, setServices] = useState<DesignService[]>(() =>
    designServicesStore.get(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const first = designServicesStore.get()[0];
    return first?.id ?? null;
  });

  useEffect(() => {
    setServices(designServicesStore.get());
    return designServicesStore.subscribe(setServices);
  }, []);

  const selected = useMemo(
    () => services.find((s) => s.id === selectedId) ?? null,
    [services, selectedId],
  );

  const addService = () => {
    const id = `s_${Date.now().toString(36)}`;
    const existingNames = new Set(services.map((s) => s.name));
    let name = "newService";
    let i = 2;
    while (existingNames.has(name)) {
      name = `newService${i++}`;
    }
    const s: DesignService = {
      id,
      name,
      description: "",
      code: STARTER_CODE,
    };
    designServicesStore.upsert(s);
    setSelectedId(id);
  };

  const removeSelected = () => {
    if (!selected) return;
    if (!window.confirm(`Remove service "${selected.name}"?`)) return;
    designServicesStore.remove(selected.id);
    setSelectedId(services.find((s) => s.id !== selected.id)?.id ?? null);
  };

  const updateSelected = (patch: Partial<DesignService>) => {
    if (!selected) return;
    designServicesStore.upsert({ ...selected, ...patch });
  };

  return (
    <div className="oc-components">
      <aside className="oc-components-list" aria-label="Services">
        <header className="oc-components-list-head">
          <span className="oc-tokens-title">Services</span>
          <button
            type="button"
            className="oc-tokens-add"
            onClick={addService}
            title="Add service"
          >
            + New
          </button>
        </header>
        <ul>
          {services.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="oc-components-item"
                data-selected={s.id === selectedId || undefined}
                onClick={() => setSelectedId(s.id)}
              >
                <span className="oc-components-item-name">{s.name}</span>
                {s.description && (
                  <span className="oc-components-item-desc">
                    {s.description}
                  </span>
                )}
              </button>
            </li>
          ))}
          {services.length === 0 && (
            <li className="oc-tokens-empty">No services yet.</li>
          )}
        </ul>
      </aside>
      {selected ? (
        <section className="oc-components-edit">
          <div className="oc-components-chrome">
            <div className="oc-components-meta">
              <input
                className="oc-tokens-name oc-components-name"
                value={selected.name}
                onChange={(e) =>
                  updateSelected({
                    name: e.target.value.replace(/[^A-Za-z0-9]/g, ""),
                  })
                }
                spellCheck={false}
                aria-label="Service name"
              />
              <button
                type="button"
                className="oc-components-remove"
                onClick={removeSelected}
                title="Remove service"
              >
                Remove
              </button>
            </div>
            <input
              className="oc-tokens-value oc-components-desc"
              placeholder="One-line description (shown to the AI)"
              value={selected.description}
              onChange={(e) => updateSelected({ description: e.target.value })}
              spellCheck={false}
              aria-label="Service description"
            />
          </div>
          <div className="oc-components-code">
            <CodeEditor
              value={selected.code}
              onChange={(next) => updateSelected({ code: next })}
              fillParent
            />
          </div>
        </section>
      ) : (
        <section className="oc-components-empty">
          Select a service to edit, or click <strong>+ New</strong>.
        </section>
      )}
    </div>
  );
}
