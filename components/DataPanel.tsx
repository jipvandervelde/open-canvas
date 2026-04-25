"use client";

import { useEffect, useMemo, useState } from "react";
import {
  designDataStore,
  type DataEntity,
  type DataField,
  type DataFieldType,
} from "@/lib/design-data-store";

const FIELD_TYPES: DataFieldType[] = [
  "string",
  "number",
  "boolean",
  "image",
  "date",
];

export function DataPanel() {
  const [entities, setEntities] = useState<DataEntity[]>(() =>
    designDataStore.get(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const first = designDataStore.get()[0];
    return first?.id ?? null;
  });

  useEffect(() => {
    setEntities(designDataStore.get());
    return designDataStore.subscribe(setEntities);
  }, []);

  const selected = useMemo(
    () => entities.find((e) => e.id === selectedId) ?? null,
    [entities, selectedId],
  );

  const addEntity = () => {
    const id = `e_${Date.now().toString(36)}`;
    const existing = new Set(entities.map((e) => e.name));
    let base = "items";
    let i = 2;
    while (existing.has(base)) base = `items${i++}`;
    const singular = base.slice(0, 1).toUpperCase() + base.slice(1, -1);
    const e: DataEntity = {
      id,
      name: base,
      singular: singular || "Item",
      description: "",
      fields: [
        { name: "id", type: "string" },
        { name: "name", type: "string" },
      ],
      seeds: [{ id: "1", name: "First item" }],
    };
    designDataStore.upsert(e);
    setSelectedId(id);
  };

  const removeSelected = () => {
    if (!selected) return;
    if (!window.confirm(`Remove entity "${selected.name}"?`)) return;
    designDataStore.remove(selected.id);
    setSelectedId(entities.find((e) => e.id !== selected.id)?.id ?? null);
  };

  const updateSelected = (patch: Partial<DataEntity>) => {
    if (!selected) return;
    designDataStore.upsert({ ...selected, ...patch });
  };

  return (
    <div className="oc-components">
      <aside className="oc-components-list" aria-label="Data entities">
        <header className="oc-components-list-head">
          <span className="oc-tokens-title">Data</span>
          <button
            type="button"
            className="oc-tokens-add"
            onClick={addEntity}
            title="Add entity"
          >
            + New
          </button>
        </header>
        <ul>
          {entities.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="oc-components-item"
                data-selected={e.id === selectedId || undefined}
                onClick={() => setSelectedId(e.id)}
              >
                <span className="oc-components-item-name">{e.name}</span>
                <span className="oc-components-item-desc">
                  {e.seeds.length} row{e.seeds.length === 1 ? "" : "s"}
                  {e.description ? ` · ${e.description}` : ""}
                </span>
              </button>
            </li>
          ))}
          {entities.length === 0 && (
            <li className="oc-tokens-empty">No entities yet.</li>
          )}
        </ul>
      </aside>
      {selected ? (
        <section className="oc-components-edit">
          <div className="oc-components-meta">
            <input
              className="oc-tokens-name oc-components-name"
              value={selected.name}
              onChange={(ev) => {
                const v = ev.target.value.replace(/[^a-zA-Z0-9]/g, "");
                updateSelected({ name: v });
              }}
              spellCheck={false}
              aria-label="Entity name (plural camelCase)"
            />
            <input
              className="oc-tokens-name oc-components-name"
              value={selected.singular}
              onChange={(ev) => {
                const v = ev.target.value.replace(/[^a-zA-Z0-9]/g, "");
                updateSelected({ singular: v });
              }}
              spellCheck={false}
              aria-label="Singular PascalCase"
              style={{ maxWidth: 120 }}
            />
            <button
              type="button"
              className="oc-components-remove"
              onClick={removeSelected}
              title="Remove entity"
            >
              Remove
            </button>
          </div>
          <input
            className="oc-tokens-value oc-components-desc"
            placeholder="One-line description (shown to the AI)"
            value={selected.description}
            onChange={(ev) => updateSelected({ description: ev.target.value })}
            spellCheck={false}
            aria-label="Entity description"
          />

          <div className="oc-data-section">
            <header className="oc-data-section-head">
              <span>Fields</span>
              <button
                type="button"
                className="oc-data-section-add"
                onClick={() => {
                  const fields: DataField[] = [
                    ...selected.fields,
                    {
                      name: `field${selected.fields.length + 1}`,
                      type: "string",
                    },
                  ];
                  updateSelected({ fields });
                }}
              >
                + Field
              </button>
            </header>
            <div className="oc-data-fields">
              {selected.fields.map((f, i) => (
                <div key={i} className="oc-data-field">
                  <input
                    value={f.name}
                    onChange={(ev) => {
                      const v = ev.target.value.replace(/[^a-zA-Z0-9]/g, "");
                      const fields = selected.fields.map((x, j) =>
                        j === i ? { ...x, name: v } : x,
                      );
                      updateSelected({ fields });
                    }}
                    spellCheck={false}
                    aria-label="Field name"
                  />
                  <select
                    value={f.type}
                    onChange={(ev) => {
                      const fields = selected.fields.map((x, j) =>
                        j === i
                          ? { ...x, type: ev.target.value as DataFieldType }
                          : x,
                      );
                      updateSelected({ fields });
                    }}
                    aria-label="Field type"
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="oc-data-field-remove"
                    onClick={() => {
                      const fields = selected.fields.filter((_, j) => j !== i);
                      updateSelected({ fields });
                    }}
                    aria-label={`Remove field ${f.name}`}
                    title="Remove field"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="oc-data-section oc-data-section--rows">
            <header className="oc-data-section-head">
              <span>
                Rows{" "}
                <span className="oc-tabular">· {selected.seeds.length}</span>
              </span>
              <button
                type="button"
                className="oc-data-section-add"
                onClick={() => {
                  const blank: Record<string, unknown> = {};
                  for (const f of selected.fields) {
                    if (f.type === "number") blank[f.name] = 0;
                    else if (f.type === "boolean") blank[f.name] = false;
                    else blank[f.name] = "";
                  }
                  updateSelected({ seeds: [...selected.seeds, blank] });
                }}
              >
                + Row
              </button>
            </header>
            <div
              className="oc-data-table"
              style={{
                gridTemplateColumns: `${selected.fields.map(() => "minmax(80px, 1fr)").join(" ")} 24px`,
              }}
            >
              {selected.fields.map((f) => (
                <span key={f.name} className="oc-data-cell-head">
                  {f.name}
                </span>
              ))}
              <span aria-hidden />
              {selected.seeds.map((row, ri) => (
                <RowCells
                  key={ri}
                  fields={selected.fields}
                  row={row}
                  onChange={(next) => {
                    const seeds = selected.seeds.map((r, j) =>
                      j === ri ? next : r,
                    );
                    updateSelected({ seeds });
                  }}
                  onRemove={() => {
                    const seeds = selected.seeds.filter((_, j) => j !== ri);
                    updateSelected({ seeds });
                  }}
                />
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="oc-components-empty">
          Add an entity to define a shared data model. Screens will import from
          <code style={{ margin: "0 4px" }}>./data/{"{name}"}</code>
          instead of hardcoding arrays.
        </section>
      )}
    </div>
  );
}

function RowCells({
  fields,
  row,
  onChange,
  onRemove,
}: {
  fields: DataField[];
  row: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  return (
    <>
      {fields.map((f) => (
        <RowCell
          key={f.name}
          field={f}
          value={row[f.name]}
          onChange={(v) => onChange({ ...row, [f.name]: v })}
        />
      ))}
      <button
        type="button"
        className="oc-data-row-remove"
        aria-label="Remove row"
        title="Remove row"
        onClick={onRemove}
      >
        ×
      </button>
    </>
  );
}

function RowCell({
  field,
  value,
  onChange,
}: {
  field: DataField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label className="oc-data-cell oc-data-cell--bool">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(ev) => onChange(ev.target.checked)}
        />
      </label>
    );
  }
  if (field.type === "number") {
    return (
      <input
        className="oc-data-cell"
        type="number"
        value={(value as number | string | undefined) ?? ""}
        onChange={(ev) =>
          onChange(ev.target.value === "" ? 0 : Number(ev.target.value))
        }
      />
    );
  }
  return (
    <input
      className="oc-data-cell"
      value={(value as string | undefined) ?? ""}
      onChange={(ev) => onChange(ev.target.value)}
      placeholder={field.type === "image" ? "https://…" : undefined}
      spellCheck={false}
    />
  );
}
