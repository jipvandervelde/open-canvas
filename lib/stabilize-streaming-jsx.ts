/**
 * Make partial JSX/JS source renderable while it's still being streamed from
 * an LLM. Strategy (informed by v0's LLM-Suspense and Streamdown's `remend`):
 *
 *   1. If the raw source parses cleanly (Babel errorRecovery reports 0
 *      errors), return it unchanged.
 *   2. Try to close off the partial source with a stack balancer, then
 *      re-parse; if THAT's clean, return it.
 *   3. Otherwise fall back to the last-known-good code for this screen —
 *      better to show the previous valid frame than Sandpack's runtime
 *      error overlay flashing red.
 *
 * The per-screen "last good" cache lives here; call `resetLastGood(screenId)`
 * when starting a fresh stream so stale content isn't carried between turns.
 */

import { parse as babelParse } from "@babel/parser";

const lastGoodByScreen = new Map<string, string>();

/**
 * Strict parse gate — Babel must accept the source with NO errors and no
 * recovery. If this fails, the source is not safe to hand to Sandpack. The
 * previous permissive check (errorRecovery: true) let through inputs where
 * Babel attached errors to `result.errors` but still produced an AST,
 * which Sandpack then tried to render and flashed runtime errors for.
 */
function isParseable(source: string): boolean {
  try {
    babelParse(source, {
      sourceType: "module",
      errorRecovery: false,
      plugins: ["jsx", "typescript"],
    });
    return true;
  } catch {
    return false;
  }
}

export function resetLastGood(screenId: string): void {
  lastGoodByScreen.delete(screenId);
}

/**
 * Seed the last-known-good cache for a screen. Call this at the start of a
 * new stream with the screen's current code so the fallback for early partial
 * frames (imports / consts before the component body exists) is the screen's
 * existing render — not a blank `return null` stub.
 */
export function primeLastGood(screenId: string, code: string): void {
  if (!screenId || !code) return;
  lastGoodByScreen.set(screenId, code);
}

export function stabilizeStreamingJsx(
  source: string,
  screenId?: string,
): string {
  if (!source || !source.trim()) return source;

  // Try 1: raw source already parses cleanly.
  if (isParseable(source) && hasDefaultExport(source)) {
    if (screenId) lastGoodByScreen.set(screenId, source);
    return source;
  }

  // Try 2: synthesize closers for open tags / brackets / strings, then ensure
  // there's a mountable `export default` so Sandpack always has something to
  // render — even while the model is still writing top-level constants.
  const closed = appendSynthesizedClosers(source);
  const closedHasRealExport = hasDefaultExport(closed);
  const mounted = ensureMountable(closed);
  if (isParseable(mounted)) {
    if (closedHasRealExport) {
      if (screenId) lastGoodByScreen.set(screenId, mounted);
      return mounted;
    }
    // The stabilized source has no real default export — we'd be returning
    // our `return null` stub, which renders a blank screen. If we have any
    // prior good frame for this screen, prefer it so the preview keeps the
    // last working UI visible while the model is still writing imports /
    // constants. Only commit the stub when there's nothing else to show.
    if (screenId) {
      const prior = lastGoodByScreen.get(screenId);
      if (prior) return prior;
    }
    return mounted;
  }

  // Fall back: last-known-good code for this screen (if any).
  if (screenId) {
    const prior = lastGoodByScreen.get(screenId);
    if (prior) return prior;
  }

  // Last resort: return the best-effort mounted version even though Babel
  // still complains. Renders *something* rather than nothing.
  return mounted;
}

function hasDefaultExport(source: string): boolean {
  // Cheap regex — a false hit inside a string/comment is harmless here; it
  // just means we won't append the stub, which is fine because the real
  // export will arrive shortly.
  return /\bexport\s+default\b/.test(source);
}

function ensureMountable(source: string): string {
  if (hasDefaultExport(source)) return source;
  return (
    source +
    "\n\nexport default function App() { return null; }\n"
  );
}

type BracketOpener = "{" | "(" | "[";
const BRACKET_CLOSE: Record<BracketOpener, string> = {
  "{": "}",
  "(": ")",
  "[": "]",
};

type OpenTag = {
  name: string;
  needsGt: boolean;
  /**
   * Depth of the shared `brackets` stack at the moment this tag's `<` was
   * encountered. The suffix builder uses this to flush any brackets that were
   * opened INSIDE the tag (attribute expressions etc.) before emitting the
   * `</name>` closer — so the JSX close lands inside the `return (...)` it
   * belongs to, not after it.
   */
  bracketsOutside: number;
};

function appendSynthesizedClosers(source: string): string {
  const brackets: BracketOpener[] = [];
  const tags: OpenTag[] = []; // open JSX tags, innermost last
  let inString: '"' | "'" | "`" | null = null;
  let inTemplateExpr = 0; // depth of `${ ... }` inside a template literal
  let inLineComment = false;
  let inBlockComment = false;

  // Walk the source character by character.
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    // Comments
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // Strings & template literals
    if (inString) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (inString === "`" && c === "$" && next === "{") {
        inTemplateExpr++;
        brackets.push("{");
        i += 2;
        continue;
      }
      if (c === inString) {
        inString = null;
      }
      i++;
      continue;
    }

    // Enter comments
    if (c === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }

    // Enter string / template
    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      i++;
      continue;
    }

    // Closing `${...}` expression returns us to template literal mode.
    if (c === "}" && inTemplateExpr > 0 && brackets[brackets.length - 1] === "{") {
      brackets.pop();
      inTemplateExpr--;
      inString = "`";
      i++;
      continue;
    }

    // Brackets
    if (c === "{" || c === "(" || c === "[") {
      brackets.push(c);
      i++;
      continue;
    }
    if (c === "}" || c === ")" || c === "]") {
      // Pop only if it matches the top; otherwise ignore (recover).
      const top = brackets[brackets.length - 1];
      if (
        (c === "}" && top === "{") ||
        (c === ")" && top === "(") ||
        (c === "]" && top === "[")
      ) {
        brackets.pop();
      }
      i++;
      continue;
    }

    // JSX-ish detection: `<Tagname …>` and `</Tagname>` and `<Tag … />`
    if (c === "<") {
      // Closing tag: </Tagname>
      if (next === "/") {
        const match = /^<\/([A-Za-z][\w.-]*)\s*>?/.exec(source.slice(i));
        if (match) {
          const name = match[1];
          // Pop the last matching open tag (some tolerance for mismatched tags).
          for (let k = tags.length - 1; k >= 0; k--) {
            if (tags[k].name === name) {
              tags.splice(k, 1);
              break;
            }
          }
          i += match[0].length;
          continue;
        }
      }

      // JSX opening tag or self-closing tag.
      const open = /^<([A-Za-z][\w.-]*)/.exec(source.slice(i));
      if (open) {
        const name = open[1];
        // Snapshot the bracket depth AT tag-open. Any brackets pushed during
        // the tag scan that remain open at EOF will be closed BEFORE the
        // synthesized `</name>` so the JSX close stays inside its enclosing
        // `return (...)`.
        const bracketsOutside = brackets.length;
        let j = i + open[0].length;
        let selfClosing = false;
        let closed = false;
        while (j < source.length) {
          const cc = source[j];
          const nn = source[j + 1];
          if (cc === '"' || cc === "'" || cc === "`") {
            // Skip string in attribute value.
            const quote = cc;
            j++;
            while (j < source.length && source[j] !== quote) {
              if (source[j] === "\\") j++;
              j++;
            }
            j++;
            continue;
          }
          if (cc === "{") {
            // Attribute expression — walk until matching `}`, tracking all
            // bracket types and strings so nested objects / function calls /
            // array literals inside the attribute are accurately represented
            // on the shared `brackets` stack if they stay open at EOF.
            brackets.push("{");
            let depth = 1;
            j++;
            while (j < source.length && depth > 0) {
              const k = source[j];
              if (k === '"' || k === "'" || k === "`") {
                const q = k;
                j++;
                while (j < source.length && source[j] !== q) {
                  if (source[j] === "\\") j++;
                  j++;
                }
                j++;
                continue;
              }
              if (k === "{") {
                depth++;
                brackets.push("{");
              } else if (k === "}") {
                depth--;
                if (brackets[brackets.length - 1] === "{") brackets.pop();
              } else if (k === "(") {
                brackets.push("(");
              } else if (k === ")") {
                if (brackets[brackets.length - 1] === "(") brackets.pop();
              } else if (k === "[") {
                brackets.push("[");
              } else if (k === "]") {
                if (brackets[brackets.length - 1] === "[") brackets.pop();
              }
              if (depth === 0) {
                j++;
                break;
              }
              j++;
            }
            continue;
          }
          if (cc === "/" && nn === ">") {
            selfClosing = true;
            closed = true;
            j += 2;
            break;
          }
          if (cc === ">") {
            closed = true;
            j++;
            break;
          }
          j++;
        }

        if (!closed) {
          // We ran out of source mid-tag — treat as open element; the closer
          // will be synthesized. Move i to end so we don't loop forever.
          // `needsGt: true` tells the suffix builder to emit `>` to terminate
          // the dangling open-tag declaration before writing `</name>`.
          tags.push({ name, needsGt: true, bracketsOutside });
          i = source.length;
          break;
        }
        if (!selfClosing) {
          // Only treat as an element that needs closing if it's not an
          // "HTML void" element (br, img, input, hr, meta, link, etc).
          if (!VOID_ELEMENTS.has(name.toLowerCase())) {
            tags.push({ name, needsGt: false, bracketsOutside });
          }
        }
        i = j;
        continue;
      }
    }

    i++;
  }

  // Build the synthesized suffix in the right order.
  let suffix = "";

  // Close any unterminated string/template first.
  if (inString) {
    suffix += inString;
  }

  // Close JSX tags innermost-first. For each one, first flush any brackets
  // that were opened INSIDE this tag (attribute expressions, object
  // literals, etc.), then emit `>` if the open-tag declaration was dangling,
  // then emit `</name>`. This keeps each JSX close inside its containing
  // expression (e.g. inside `return (…)`) instead of leaking past it.
  while (tags.length > 0) {
    const t = tags.pop() as OpenTag;
    while (brackets.length > t.bracketsOutside) {
      suffix += BRACKET_CLOSE[brackets.pop() as BracketOpener];
    }
    if (t.needsGt) suffix += ">";
    suffix += `</${t.name}>`;
  }

  // Finally close any remaining outer brackets (the ones outside of all the
  // open JSX elements — e.g. the `)` of `return (` and the `}` of the
  // function body).
  while (brackets.length > 0) {
    suffix += BRACKET_CLOSE[brackets.pop() as BracketOpener];
  }

  return source + suffix;
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
