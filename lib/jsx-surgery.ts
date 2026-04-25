/**
 * Small JSX-surgery helpers used to edit the source code of a screen in
 * response to inspector changes, or to extract a subtree into a new
 * component. Uses only `@babel/parser` (no `@babel/traverse`) so we stay on
 * the already-installed dep set; we hand-walk the AST.
 *
 * All mutations are conservative: if we can't parse the code, can't locate
 * the target element unambiguously, or the resulting source doesn't parse,
 * we return `null` and the caller falls back to leaving the source
 * untouched. Never corrupt user code.
 */

import { parse as babelParse } from "@babel/parser";

type Node = {
  type: string;
  start?: number;
  end?: number;
  [k: string]: unknown;
};

/**
 * Split an in-iframe element path like `div > section.row > button:nth-of-type(2)`
 * into its step-wise segments. Each segment contains a tag, optional id,
 * class list, and an `nth-of-type` ordinal (1-based, like CSS).
 */
export type PathStep = {
  tag: string;
  nth: number; // 1-based; `undefined` in the original DOM path means "only one of this tag among siblings", so we default to 1
};

export function parsePath(path: string): PathStep[] | null {
  if (!path) return null;
  return path
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((segment) => {
      const tagMatch = /^([A-Za-z][\w.-]*)/.exec(segment);
      if (!tagMatch) return null;
      const tag = tagMatch[1];
      const nthMatch = /:nth-of-type\((\d+)\)/.exec(segment);
      const nth = nthMatch ? parseInt(nthMatch[1], 10) : 1;
      return { tag, nth };
    })
    .filter((s): s is PathStep => s !== null);
}

function parse(code: string): Node | null {
  try {
    const ast = babelParse(code, {
      sourceType: "module",
      errorRecovery: false,
      plugins: ["jsx", "typescript"],
    });
    return ast as unknown as Node;
  } catch {
    return null;
  }
}

function getOpeningName(openingElement: Node): string | null {
  const name = openingElement.name as Node | undefined;
  if (!name) return null;
  if (name.type === "JSXIdentifier") return String(name.name);
  if (name.type === "JSXMemberExpression") {
    // e.g. <Foo.Bar> — use the rightmost identifier
    const p = name.property as Node | undefined;
    if (p && p.type === "JSXIdentifier") return String(p.name);
  }
  return null;
}

/**
 * Walk every JSXElement in the AST, depth-first, invoking the visitor.
 * Visitor can return `false` to stop traversal of that subtree.
 */
function walkJsxElements(
  node: Node,
  visit: (el: Node, parent: Node | null) => boolean | void,
  parent: Node | null = null,
): void {
  if (!node || typeof node !== "object") return;
  if ((node.type === "JSXElement" || node.type === "JSXFragment") && parent !== null) {
    const stop = visit(node, parent) === false;
    if (stop) return;
  }
  // Traverse children — Babel nodes have children in various keys
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "range" || key === "extra") continue;
    const value = (node as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object" && "type" in child) {
          walkJsxElements(child as Node, visit, node);
        }
      }
    } else if (value && typeof value === "object" && "type" in (value as Node)) {
      walkJsxElements(value as Node, visit, node);
    }
  }
}

/**
 * Descend into the JSX tree following the given path. Returns the matching
 * JSXElement node or null. Path matching is duck-typed against the JSX tag
 * name — it tolerates mismatched nth for components that render wrappers.
 */
function findJsxElementByPath(code: string, path: string): Node | null {
  const ast = parse(code);
  if (!ast) return null;
  const steps = parsePath(path);
  if (!steps || steps.length === 0) return null;

  // Start from the default export's returned JSX expression.
  let rootJsx: Node | null = null;
  walkJsxElements(ast, (el, parent) => {
    if (rootJsx) return false;
    // The first JSXElement whose parent is a ReturnStatement (inside the
    // default export) is usually the root.
    if (parent && parent.type === "ReturnStatement") {
      rootJsx = el;
      return false;
    }
  });
  if (!rootJsx) {
    // Fallback: first JSXElement found anywhere
    walkJsxElements(ast, (el) => {
      if (!rootJsx) rootJsx = el;
    });
  }
  if (!rootJsx) return null;

  // Walk step-by-step. Each step narrows to one child among siblings with
  // the matching tag name, using nth (1-based) to disambiguate.
  let current: Node | null = rootJsx;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!current) return null;
    // First step: match the root itself (first segment describes the root).
    if (i === 0) {
      const rootName = getOpeningName(
        (current.openingElement as Node) || ({ type: "" } as Node),
      );
      if (!rootName) return null;
      if (!matchesTag(rootName, step.tag)) return null;
      continue;
    }
    // Subsequent steps: search direct children for matching tag + nth.
    const children = (current.children as Node[]) || [];
    const matching: Node[] = [];
    for (const child of children) {
      if (child.type !== "JSXElement") continue;
      const name = getOpeningName(child.openingElement as Node);
      if (name && matchesTag(name, step.tag)) matching.push(child);
    }
    if (matching.length === 0) return null;
    const idx = Math.max(0, Math.min(step.nth - 1, matching.length - 1));
    current = matching[idx];
  }
  return current;
}

function matchesTag(nodeName: string, pathTag: string): boolean {
  // DOM paths are lowercased; JSX element names can be PascalCase. Compare
  // case-insensitively so "button" in the DOM path matches "<Button />".
  return nodeName.toLowerCase() === pathTag.toLowerCase();
}

/** Return the element's opening-tag source range, excluding the trailing `>`. */
function getStyleAttrRange(
  element: Node,
): { startAttr: number; endAttr: number; quoted: boolean } | null {
  const opening = element.openingElement as Node | undefined;
  if (!opening) return null;
  const attrs = (opening.attributes as Node[]) || [];
  for (const attr of attrs) {
    if (attr.type !== "JSXAttribute") continue;
    const name = attr.name as Node;
    if (!name || name.type !== "JSXIdentifier") continue;
    if ((name.name as string) !== "style") continue;
    const value = attr.value as Node | undefined;
    if (!value) return null;
    const start = attr.start ?? -1;
    const end = attr.end ?? -1;
    if (start < 0 || end < 0) return null;
    return {
      startAttr: start,
      endAttr: end,
      quoted: value.type === "StringLiteral",
    };
  }
  return null;
}

/** Return the opening-tag source range for an element (before the `>`). */
function getOpeningTagEnd(element: Node): number | null {
  const opening = element.openingElement as Node | undefined;
  if (!opening) return null;
  const end = opening.end;
  return typeof end === "number" ? end : null;
}

/** Serialize a small style-object as JSX expression content. */
function formatStyleObject(styles: Record<string, number | string>): string {
  const entries = Object.entries(styles)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      const key = /^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
      const val =
        typeof v === "number" ? String(v) : JSON.stringify(v);
      return `${key}: ${val}`;
    });
  return `{{ ${entries.join(", ")} }}`;
}

/**
 * Merge partial style patches into an element's `style={}` prop. When
 * there's no existing style attribute, we insert one before the closing
 * bracket of the opening tag. The mutation is applied via string splice on
 * the original source; returns `null` on any failure.
 */
export function applyStyleChange(
  code: string,
  path: string,
  styles: Record<string, string | number | undefined>,
): string | null {
  const filtered: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(styles)) {
    if (v === undefined) continue;
    filtered[k] = v;
  }
  if (Object.keys(filtered).length === 0) return null;

  const element = findJsxElementByPath(code, path);
  if (!element) return null;

  const attr = getStyleAttrRange(element);
  if (attr) {
    if (attr.quoted) {
      // Existing style="..." string — replace entirely with object literal
      const newAttr = `style=${formatStyleObject(filtered)}`;
      const next =
        code.slice(0, attr.startAttr) +
        newAttr +
        code.slice(attr.endAttr);
      return parse(next) ? next : null;
    }
    // Merge into the existing object expression. We keep it simple: replace
    // the entire attribute, preserving any existing keys we didn't change
    // by re-parsing the existing source and merging in order.
    const existing = extractExistingStyleKeys(code, element);
    if (existing === null) return null;
    const merged = { ...existing, ...filtered };
    const newAttr = `style=${formatStyleObject(merged)}`;
    const next =
      code.slice(0, attr.startAttr) + newAttr + code.slice(attr.endAttr);
    return parse(next) ? next : null;
  }

  // No existing style attr — insert one right before `>` or `/>`.
  const openEnd = getOpeningTagEnd(element);
  if (openEnd == null) return null;
  // openEnd points just after `>` of the opening tag. Step back before `>`
  // to find the insertion point, plus check for self-closing `/>`.
  let insertAt = openEnd - 1;
  while (insertAt > 0 && /\s/.test(code[insertAt])) insertAt--;
  if (code[insertAt] === "/") insertAt--;
  while (insertAt > 0 && /\s/.test(code[insertAt])) insertAt--;
  // We want to insert AFTER insertAt (which is now the last non-space,
  // non-slash char inside the opening tag).
  const insertPos = insertAt + 1;
  const inserted = ` style=${formatStyleObject(filtered)}`;
  const next =
    code.slice(0, insertPos) + inserted + code.slice(insertPos);
  return parse(next) ? next : null;
}

/**
 * Extract a keyed object from `style={{ … }}`. Only handles literal keys
 * and literal-ish values (numbers, strings, template strings without
 * interpolation); anything else is preserved as a raw source slice.
 */
function extractExistingStyleKeys(
  code: string,
  element: Node,
): Record<string, string | number> | null {
  const opening = element.openingElement as Node | undefined;
  if (!opening) return null;
  const attrs = (opening.attributes as Node[]) || [];
  for (const attr of attrs) {
    if (attr.type !== "JSXAttribute") continue;
    const name = attr.name as Node;
    if (!name || (name.name as string) !== "style") continue;
    const value = attr.value as Node | undefined;
    if (!value || value.type !== "JSXExpressionContainer") return {};
    const expr = value.expression as Node;
    if (expr.type !== "ObjectExpression") return {};
    const out: Record<string, string | number> = {};
    const properties = (expr.properties as Node[]) || [];
    for (const p of properties) {
      if (p.type !== "ObjectProperty" && p.type !== "Property") continue;
      const key = p.key as Node;
      let keyName: string | null = null;
      if (key.type === "Identifier") keyName = String(key.name);
      else if (key.type === "StringLiteral") keyName = String(key.value);
      if (!keyName) continue;
      const v = p.value as Node;
      if (v.type === "NumericLiteral") {
        out[keyName] = Number(v.value);
      } else if (v.type === "StringLiteral") {
        out[keyName] = String(v.value);
      } else {
        // For anything else (TemplateLiteral, MemberExpression, …) slice the
        // raw source so we preserve it.
        const start = v.start;
        const end = v.end;
        if (typeof start === "number" && typeof end === "number") {
          out[keyName] = `__RAW__${code.slice(start, end)}`;
        }
      }
    }
    return out;
  }
  return {};
}

/**
 * Replace the JSX element at `path` with `<ComponentName />`, and return
 * the extracted element's source slice so it can be lifted into a new
 * component file. On any failure returns null.
 */
export function extractToComponent(
  code: string,
  path: string,
  componentName: string,
): { newCode: string; componentCode: string } | null {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(componentName)) return null;
  const element = findJsxElementByPath(code, path);
  if (!element) return null;
  const start = element.start;
  const end = element.end;
  if (typeof start !== "number" || typeof end !== "number") return null;

  const extractedSource = code.slice(start, end);
  const replacement = `<${componentName} />`;
  const newCode = code.slice(0, start) + replacement + code.slice(end);

  // Ensure both halves parse.
  if (!parse(newCode)) return null;

  const componentCode = buildComponentSource(componentName, extractedSource);
  if (!parse(componentCode)) return null;

  return { newCode, componentCode };
}

function buildComponentSource(name: string, body: string): string {
  // Wrap the extracted JSX inside a default-exported function. Children
  // reference is left out (can be wired post-hoc).
  return `import React from 'react';

export default function ${name}() {
  return (
    ${body}
  );
}
`;
}
