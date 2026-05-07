import type { Env } from "./env";
import { healthResponse } from "./http/health";
import { htmlResponse, notFoundResponse } from "./http/responses";
import { cleanPageId } from "./wiki/page-id";
import { getCurrentPage } from "./wiki/page-service";
import { renderWikiText } from "./wiki/render";

type AssetFallback = () => Promise<Response>;

export async function handleRequest(
  request: Request,
  env: Env,
  assetFallback?: AssetFallback
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return healthResponse(env);
  }

  if (url.pathname.startsWith("/wiki/")) {
    const rawId = decodeURIComponent(url.pathname.slice("/wiki/".length));
    const id = cleanPageId(rawId);

    if (!id) {
      return notFoundResponse("Missing wiki page id.");
    }

    const page = await getCurrentPage(env.DB, id);

    if (!page) {
      return notFoundResponse(`Wiki page '${id}' was not found.`);
    }

    const rendered = renderWikiText(page.content);
    const title = rendered.title ?? page.title ?? id;

    return htmlResponse(
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - ${escapeHtml(env.SITE_NAME ?? "DokuWiki Pages")}</title>
</head>
<body>
  <main>
    ${rendered.html}
  </main>
</body>
</html>`
    );
  }

  if (assetFallback) {
    return assetFallback();
  }

  return notFoundResponse("Not found.");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
