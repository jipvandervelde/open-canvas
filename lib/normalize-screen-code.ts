/**
 * Lightweight safety net: ensure generated React component code is valid for
 * Sandpack's react template. The model is instructed to import React explicitly,
 * but if it forgets we patch it on the way in.
 */
export function normalizeScreenCode(code: string): string {
  if (!code) return code;

  const usesReactNamespace = /\bReact\./.test(code);
  const usesBareHook = /\b(useState|useEffect|useRef|useMemo|useCallback|useReducer|useContext|useLayoutEffect)\s*\(/.test(
    code,
  );

  if (!usesReactNamespace && !usesBareHook) return code;

  // Already imports React in some form? Match all common shapes:
  //   import React from 'react'
  //   import { useState } from 'react'
  //   import React, { useState } from 'react'
  //   import * as React from 'react'
  const alreadyImports = /^\s*import\s+[^;]*\bfrom\s+['"]react['"]/m.test(code);
  if (alreadyImports) return code;

  const hooksUsed = new Set<string>();
  for (const m of code.matchAll(
    /\b(useState|useEffect|useRef|useMemo|useCallback|useReducer|useContext|useLayoutEffect)\s*\(/g,
  )) {
    hooksUsed.add(m[1]);
  }

  const named =
    hooksUsed.size > 0 ? `, { ${Array.from(hooksUsed).join(", ")} }` : "";
  return `import React${named} from 'react';\n\n${code}`;
}
