/**
 * Serves the pre-rendered centralIcons.js source — every icon from both
 * variant packages, bundled as a single JS module Sandpack loads as a
 * virtual `/centralIcons.js` file.
 *
 * See lib/icon-registry.ts for why we do this instead of letting
 * Sandpack resolve the npm packages directly.
 *
 * Long cache headers so the client only pays the transfer cost once per
 * session. The module contents are deterministic (driven by the
 * installed package versions) so `immutable` is safe in local dev —
 * bumping either package's version invalidates the response anyway
 * because the route re-renders from fresh imports.
 */

import { getIconRegistryJs } from "@/lib/icon-registry";

export async function GET() {
  const js = getIconRegistryJs();
  return new Response(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      // The Sandpack preview iframe lives on a different origin
      // (codesandbox.io) — the virtual file is injected by the host, not
      // fetched by the iframe, so CORS isn't strictly required. Setting
      // it anyway costs nothing and would make a future runtime-fetch
      // path work without a server change.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
