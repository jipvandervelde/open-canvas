"use client";

import { useEffect, useMemo, useState } from "react";
import {
  designDocStore,
  DESIGN_DOC_DEFAULT,
} from "@/lib/design-doc-store";
import { designTokensStore } from "@/lib/design-tokens-store";
import { designComponentTokensStore } from "@/lib/design-component-tokens-store";
import {
  buildDesignMdFrontMatter,
  prefixDesignMdWithYaml,
} from "@/lib/design-md-yaml";
import type { LintReport, LintFinding } from "@/lib/design-lint";
import { ChatMarkdown } from "@/components/ChatMarkdown";

/**
 * Design brief panel — the taste manifesto every agent reads. Unlike the
 * project brief (which starts empty and gates builds), the design brief
 * ships pre-seeded from the embedded skills: emil-design-engineering,
 * benji-consumer-craft, make-interfaces-feel-better, react-native-mastery.
 *
 * The panel reuses the ProjectPanel visual language (view / edit toggle,
 * markdown rendering, full-height layout) so the two briefs read as
 * siblings. The only material UI difference: a "Seeded from skills" badge
 * replaces the established/empty pill while the doc hasn't been edited.
 */
export function DesignPanel() {
  const [doc, setDoc] = useState(() => designDocStore.get());
  useEffect(() => {
    setDoc(designDocStore.get());
    return designDocStore.subscribe(setDoc);
  }, []);

  const [mode, setMode] = useState<"view" | "edit" | "yaml" | "lint">(
    "view",
  );
  const [draft, setDraft] = useState(doc.markdown);
  const [dirty, setDirty] = useState(false);

  // Lint state: report (null = not yet run), loading flag, error msg.
  const [lintReport, setLintReport] = useState<LintReport | null>(null);
  const [lintBusy, setLintBusy] = useState(false);
  const [lintError, setLintError] = useState<string | null>(null);

  // YAML-projection view — subscribes to the token + component-token
  // stores so the emitted YAML stays live with any tokens-panel edit.
  const [tokens, setTokens] = useState(() => designTokensStore.get());
  const [componentTokens, setComponentTokens] = useState(() =>
    designComponentTokensStore.get(),
  );
  useEffect(() => designTokensStore.subscribe(setTokens), []);
  useEffect(
    () => designComponentTokensStore.subscribe(setComponentTokens),
    [],
  );

  const yamlUnified = useMemo(() => {
    const yaml = buildDesignMdFrontMatter({
      tokens: designTokensStore.snapshot(),
      componentTokens,
    });
    return prefixDesignMdWithYaml(doc.markdown, yaml);
    // designTokensStore.snapshot() reads `tokens`; include it to trigger
    // recomputation on token edits.
  }, [doc.markdown, tokens, componentTokens]);

  useEffect(() => {
    if (!dirty) setDraft(doc.markdown);
  }, [doc.markdown, dirty]);

  const updatedAgo = useMemo(() => {
    if (!doc.updatedAt) return null;
    const s = Math.round((Date.now() - doc.updatedAt) / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    return `${d}d ago`;
  }, [doc.updatedAt]);

  const save = () => {
    designDocStore.set(draft, "user");
    setDirty(false);
    setMode("view");
  };

  const cancelEdit = () => {
    setDraft(doc.markdown);
    setDirty(false);
    setMode("view");
  };

  const startEdit = () => {
    setDraft(doc.markdown);
    setMode("edit");
  };

  const runLint = async () => {
    setLintBusy(true);
    setLintError(null);
    try {
      const res = await fetch("/api/design/lint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokens: designTokensStore.snapshot(),
          componentTokens,
          designDoc: doc.markdown,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`HTTP ${res.status}: ${msg}`);
      }
      const report = (await res.json()) as LintReport;
      setLintReport(report);
      setMode("lint");
    } catch (err) {
      setLintError(
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLintBusy(false);
    }
  };

  const resetDefault = () => {
    if (
      !window.confirm(
        "Reset the design brief to the shipped default? Any edits will be lost.",
      )
    ) {
      return;
    }
    designDocStore.resetToDefault();
    setDraft(DESIGN_DOC_DEFAULT);
    setDirty(false);
    setMode("view");
  };

  return (
    <div className="oc-project-panel">
      <header className="oc-project-head">
        <div className="oc-project-head-main">
          <div className="oc-project-title">Design brief</div>
          <div className="oc-project-subtitle">
            The <code>design.md</code> taste profile applied to every screen.
            Seeded from the embedded skills — refine as your taste sharpens.
          </div>
        </div>
        <span
          className="oc-project-state"
          data-state={doc.isDefault ? "seeded" : "established"}
          title={
            doc.isDefault
              ? "Seeded from the embedded skill library — you haven't changed anything yet"
              : doc.lastWriter === "agent"
                ? "Last written by the agent"
                : "You've edited this"
          }
        >
          <span className="oc-project-state-dot" />
          {doc.isDefault ? "Seeded" : "Refined"}
        </span>
      </header>

      <div className="oc-project-toolbar">
        {mode === "view" ? (
          <>
            <button
              type="button"
              className="oc-project-btn oc-project-btn--primary"
              onClick={startEdit}
            >
              Edit
            </button>
            <button
              type="button"
              className="oc-project-btn"
              onClick={() => setMode("yaml")}
              title="Preview the DESIGN.md Google-schema export — the same YAML + prose the agent reads each turn"
            >
              YAML export
            </button>
            <button
              type="button"
              className="oc-project-btn"
              onClick={runLint}
              disabled={lintBusy}
              title="Run the design-system linter: broken references, duplicate section headings, and WCAG AA contrast on every component surface + ink pair."
            >
              {lintBusy ? "Linting…" : "Lint"}
            </button>
            {!doc.isDefault && (
              <button
                type="button"
                className="oc-project-btn"
                onClick={resetDefault}
                title="Reset to the shipped default taste profile"
              >
                Reset to default
              </button>
            )}
            <span className="oc-project-meta">
              {doc.lastWriter === "agent"
                ? `Written by agent · ${updatedAgo}`
                : doc.lastWriter === "user"
                  ? `Edited by you · ${updatedAgo}`
                  : "Default seed · from embedded skills"}
            </span>
          </>
        ) : mode === "yaml" ? (
          <>
            <button
              type="button"
              className="oc-project-btn oc-project-btn--primary"
              onClick={() => setMode("view")}
            >
              Back
            </button>
            <button
              type="button"
              className="oc-project-btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(yamlUnified);
                } catch {
                  /* silent */
                }
              }}
              title="Copy the full YAML + prose file"
            >
              Copy
            </button>
            <span className="oc-project-meta">
              Live projection of tokens + component-tokens · matches what
              the agent sees each turn
            </span>
          </>
        ) : mode === "lint" ? (
          <>
            <button
              type="button"
              className="oc-project-btn oc-project-btn--primary"
              onClick={() => setMode("view")}
            >
              Back
            </button>
            <button
              type="button"
              className="oc-project-btn"
              onClick={runLint}
              disabled={lintBusy}
              title="Run the linter again against the latest tokens + prose"
            >
              {lintBusy ? "Re-linting…" : "Re-run"}
            </button>
            <span className="oc-project-meta">
              {lintReport ? (
                <>
                  {lintReport.summary.errors} error
                  {lintReport.summary.errors === 1 ? "" : "s"} ·{" "}
                  {lintReport.summary.warnings} warning
                  {lintReport.summary.warnings === 1 ? "" : "s"} ·{" "}
                  {lintReport.summary.info} note
                  {lintReport.summary.info === 1 ? "" : "s"}
                </>
              ) : (
                "Loading…"
              )}
            </span>
          </>
        ) : (
          <>
            <button
              type="button"
              className="oc-project-btn oc-project-btn--primary"
              onClick={save}
              disabled={!dirty}
            >
              {dirty ? "Save" : "Saved"}
            </button>
            <button
              type="button"
              className="oc-project-btn"
              onClick={cancelEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              className="oc-project-btn"
              onClick={() => {
                setDraft(DESIGN_DOC_DEFAULT);
                setDirty(true);
              }}
              title="Replace with the shipped default"
            >
              Load default
            </button>
            <span className="oc-project-meta">
              Markdown · auto-saves on blur
            </span>
          </>
        )}
      </div>

      <div className="oc-project-body">
        {mode === "view" ? (
          <div className="oc-project-rendered">
            <ChatMarkdown>{doc.markdown}</ChatMarkdown>
          </div>
        ) : mode === "yaml" ? (
          <pre className="oc-project-yaml">{yamlUnified}</pre>
        ) : mode === "lint" ? (
          <LintFindingsList report={lintReport} error={lintError} />
        ) : (
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            onBlur={() => {
              if (dirty) {
                designDocStore.set(draft, "user");
                setDirty(false);
              }
            }}
            spellCheck={false}
            className="oc-project-editor"
            autoFocus
          />
        )}
      </div>
    </div>
  );
}

/**
 * Findings viewer for the `/api/design/lint` output. Groups by severity,
 * renders each row with path + message + optional contrast meta (so
 * contrast failures show the resolved hex pair + ratio inline).
 */
function LintFindingsList({
  report,
  error,
}: {
  report: LintReport | null;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="oc-project-lint-empty oc-project-lint-empty--error">
        Lint failed: {error}
      </div>
    );
  }
  if (!report) {
    return <div className="oc-project-lint-empty">Loading…</div>;
  }
  if (report.findings.length === 0) {
    return (
      <div className="oc-project-lint-empty">
        ✓ No findings. Every token reference resolves, every section
        heading is unique, and every component with both
        <code> backgroundColor </code> and <code> textColor </code> passes
        WCAG AA contrast in both light and dark mode.
      </div>
    );
  }
  // Order: errors first, then warnings, then info.
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...report.findings].sort(
    (a, b) => order[a.severity] - order[b.severity],
  );
  return (
    <ul className="oc-project-lint-list" role="list">
      {sorted.map((f, i) => (
        <LintFindingRow key={`${f.path}-${i}`} finding={f} />
      ))}
    </ul>
  );
}

function LintFindingRow({ finding }: { finding: LintFinding }) {
  const bg =
    typeof finding.meta?.bg === "string" ? finding.meta.bg : null;
  const fg =
    typeof finding.meta?.fg === "string" ? finding.meta.fg : null;
  return (
    <li
      className="oc-project-lint-row"
      data-severity={finding.severity}
    >
      <span className="oc-project-lint-sev" data-severity={finding.severity}>
        {finding.severity}
      </span>
      <div className="oc-project-lint-body">
        <div className="oc-project-lint-path">{finding.path}</div>
        <div className="oc-project-lint-msg">{finding.message}</div>
        {bg && fg && (
          <div
            className="oc-project-lint-swatch"
            aria-hidden
            title={`${fg} on ${bg}`}
          >
            <span style={{ background: bg, color: fg }}>Aa</span>
            <code>
              {fg} / {bg}
            </code>
          </div>
        )}
      </div>
    </li>
  );
}
