import type { Env } from "../env";
import { jsonResponse } from "./responses";

export function healthResponse(env: Env): Response {
  return jsonResponse({
    ok: true,
    service: "dokuwiki-pages-dev-port",
    siteName: env.SITE_NAME ?? "DokuWiki Pages.dev Port",
    bindings: {
      d1: Boolean(env.DB),
      r2: Boolean(env.MEDIA_BUCKET),
      kv: Boolean(env.RENDER_CACHE),
      durableObjects: Boolean(env.PAGE_LOCKS)
    }
  });
}
