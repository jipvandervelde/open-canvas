/**
 * Legacy re-export shim. The screen runtime moved to `@/lib/screen-runtime`
 * when we swapped tldraw for the native OpenCanvas. Existing imports like
 * `import type { ScreenShape } from "@/components/ScreenShapeUtil"` and the
 * build helper functions keep resolving via this module.
 */
export type { ScreenShape, ScreenShapeProps } from "@/lib/shape-types";
export {
  SANDPACK_INDEX_JS_FOR_THEME,
  buildComponentFiles,
  buildServiceFiles,
  buildDataFiles,
  buildTokensCss,
  designTokensSignature,
  ScreenBody,
} from "@/lib/screen-runtime";
