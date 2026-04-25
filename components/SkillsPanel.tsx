"use client";

import { useEffect, useMemo, useState } from "react";
import { skillsUiStore } from "@/lib/skills-ui-store";

type SkillEntry = {
  slug: string;
  name: string;
  description: string;
  scope: "orchestrator" | "sub-agent" | "both";
  triggers: string[];
  bodyBytes: number;
  subfiles: string[];
};

type LoadedBody = {
  slug: string;
  name: string;
  bodyBytes: number;
  bodyPreview: string;
};

/**
 * Skills tab — sidebar layout matching ServicesPanel / ComponentsPanel.
 * Left sidebar lists every skill in the registry with a tiny enabled/
 * disabled dot; the right pane shows the selected skill's full
 * metadata, triggers, sub-files, body preview, and an enable toggle.
 *
 * Skills aren't user-creatable from the UI — they're seeded from the
 * repo's filesystem (see lib/skills-registry.ts). So no "+ New" button
 * in the sidebar header. Disabling a skill removes it from both the
 * orchestrator's skill index and the sub-agent auto-injection picker.
 */
export function SkillsPanel() {
  const [skills, setSkills] = useState<SkillEntry[] | null>(null);
  const [disabled, setDisabled] = useState<Set<string>>(() =>
    skillsUiStore.get(),
  );
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Map<string, LoadedBody>>(new Map());
  const [fetching, setFetching] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/skills-debug")
      .then((r) => r.json())
      .then((data: { skills: SkillEntry[] }) => {
        if (cancelled) return;
        setSkills(data.skills);
        // Auto-select the first skill so the right pane has content
        // without an explicit click.
        if (data.skills.length > 0) {
          setSelectedSlug((current) => current ?? data.skills[0].slug);
        }
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDisabled(skillsUiStore.get());
    return skillsUiStore.subscribe(setDisabled);
  }, []);

  const selected = useMemo(
    () => skills?.find((s) => s.slug === selectedSlug) ?? null,
    [skills, selectedSlug],
  );
  const selectedBody = selectedSlug
    ? bodies.get(selectedSlug) ?? null
    : null;
  const isFetching = selectedSlug ? fetching.has(selectedSlug) : false;

  // Lazy-load the body preview when a skill becomes selected.
  useEffect(() => {
    if (!selectedSlug) return;
    if (bodies.has(selectedSlug) || fetching.has(selectedSlug)) return;
    setFetching((s) => new Set(s).add(selectedSlug));
    let cancelled = false;
    void fetch("/api/skills-debug", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: selectedSlug }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<LoadedBody>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setBodies((b) => new Map(b).set(data.slug, data));
      })
      .catch(() => {
        /* swallow — UI shows the loading shell */
      })
      .finally(() => {
        if (cancelled) return;
        setFetching((s) => {
          const n = new Set(s);
          n.delete(selectedSlug);
          return n;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSlug, bodies, fetching]);

  function toggle(slug: string) {
    const enabled = !disabled.has(slug);
    skillsUiStore.setEnabled(slug, !enabled);
  }

  if (skills === null) {
    return (
      <div className="oc-components">
        <aside className="oc-components-list" aria-label="Skills">
          <header className="oc-components-list-head">
            <span className="oc-tokens-title">Skills</span>
          </header>
          <div className="oc-skills-loading">Loading skills…</div>
        </aside>
        <section className="oc-components-empty">Loading…</section>
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="oc-components">
        <aside className="oc-components-list" aria-label="Skills">
          <header className="oc-components-list-head">
            <span className="oc-tokens-title">Skills</span>
          </header>
          <div className="oc-skills-empty">
            No skills yet. Drop a folder with SKILL.md at the repo root and
            register it in <code>lib/skills-registry.ts</code>.
          </div>
        </aside>
        <section className="oc-components-empty">
          Add a skill to get started.
        </section>
      </div>
    );
  }

  return (
    <div className="oc-components">
      <aside className="oc-components-list" aria-label="Skills">
        <header className="oc-components-list-head">
          <span className="oc-tokens-title">Skills</span>
          <span className="oc-skills-list-count oc-tabular">
            {skills.length}
          </span>
        </header>
        <ul>
          {skills.map((s) => {
            const isEnabled = !disabled.has(s.slug);
            return (
              <li key={s.slug}>
                <button
                  type="button"
                  className="oc-components-item"
                  data-selected={s.slug === selectedSlug || undefined}
                  onClick={() => setSelectedSlug(s.slug)}
                >
                  <span className="oc-components-item-name oc-skills-item-name">
                    <span
                      className="oc-skills-status-dot"
                      data-enabled={isEnabled || undefined}
                      aria-hidden
                    />
                    {s.name}
                  </span>
                  {s.description && (
                    <span className="oc-components-item-desc">
                      {s.description}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      {selected ? (
        <section className="oc-components-edit oc-skills-detail">
          <header className="oc-skills-detail-head">
            <div className="oc-skills-detail-title-row">
              <h3 className="oc-skills-detail-title">{selected.name}</h3>
              <span
                className="oc-skills-scope"
                data-scope={selected.scope}
                title={`Scope: ${selected.scope}`}
              >
                {selected.scope}
              </span>
            </div>
            <p className="oc-skills-detail-desc">{selected.description}</p>
            <div className="oc-skills-detail-toggle">
              <Switch
                on={!disabled.has(selected.slug)}
                onChange={() => toggle(selected.slug)}
                label={`${disabled.has(selected.slug) ? "Enable" : "Disable"} ${selected.name}`}
              />
              <span className="oc-skills-detail-toggle-label">
                {disabled.has(selected.slug)
                  ? "Disabled — hidden from the agent this session"
                  : "Enabled — available to the agent"}
              </span>
            </div>
          </header>

          {selected.triggers.length > 0 && (
            <DetailSection label="Triggers">
              <div className="oc-skills-chips">
                {selected.triggers.map((t) => (
                  <span key={t} className="oc-skills-trigger-chip">
                    {t}
                  </span>
                ))}
              </div>
            </DetailSection>
          )}

          {selected.subfiles.length > 0 && (
            <DetailSection label="Sub-files">
              <div className="oc-skills-chips">
                {selected.subfiles.map((sf) => (
                  <span key={sf} className="oc-skills-subfile-chip">
                    {sf}
                  </span>
                ))}
              </div>
            </DetailSection>
          )}

          <DetailSection label="Body preview">
            {selectedBody ? (
              <>
                <div className="oc-skills-body-meta oc-tabular">
                  {selectedBody.bodyBytes.toLocaleString()} bytes total
                </div>
                <pre className="oc-skills-body-preview">
                  {selectedBody.bodyPreview}
                  {selectedBody.bodyBytes >
                    selectedBody.bodyPreview.length && "\n\n…"}
                </pre>
              </>
            ) : isFetching ? (
              <div className="oc-skills-body-loading">Loading…</div>
            ) : (
              <div className="oc-skills-body-loading">
                Failed to load body preview.
              </div>
            )}
          </DetailSection>
        </section>
      ) : (
        <section className="oc-components-empty">
          Select a skill to inspect its details.
        </section>
      )}
    </div>
  );
}

function DetailSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="oc-skills-detail-section">
      <header className="oc-skills-detail-section-head">{label}</header>
      {children}
    </section>
  );
}

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="oc-skills-switch"
      data-on={on || undefined}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      <span className="oc-skills-switch-knob" />
    </button>
  );
}
