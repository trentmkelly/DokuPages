import type { Env } from "./env";
import { healthResponse } from "./http/health";
import {
  conflictResponse,
  htmlResponse,
  jsonResponse,
  notFoundResponse,
  redirectResponse
} from "./http/responses";
import { cleanPageId } from "./wiki/page-id";
import { getCurrentPage, pagePath, savePage } from "./wiki/page-service";
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

  if (url.pathname === "/api/pages" && request.method === "POST") {
    return handleSave(request, env);
  }

  if (url.pathname === "/api/pages/preview" && request.method === "POST") {
    const form = await request.formData();
    const content = String(form.get("content") ?? "");
    return jsonResponse(renderWikiText(content));
  }

  if (url.pathname.startsWith("/wiki/")) {
    const rawId = decodeURIComponent(url.pathname.slice("/wiki/".length));
    const id = cleanPageId(rawId);

    if (!id) {
      return notFoundResponse("Missing wiki page id.");
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, { status: 405 });
    }

    const page = await getCurrentPage(env.DB, id);

    if (url.searchParams.get("do") === "edit") {
      return htmlResponse(renderEditPage(id, page, env));
    }

    if (url.searchParams.get("do") === "source") {
      if (!page) {
        return notFoundResponse(`Wiki page '${id}' was not found.`);
      }
      return new Response(page.content, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff"
        }
      });
    }

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

async function handleSave(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const id = cleanPageId(String(form.get("id") ?? ""));

  if (!id) {
    return jsonResponse({ error: "Missing page id." }, { status: 400 });
  }

  const result = await savePage(env.DB, {
    id,
    content: String(form.get("content") ?? ""),
    summary: String(form.get("summary") ?? ""),
    baseRevisionId: String(form.get("baseRevisionId") || "") || null,
    ip: request.headers.get("cf-connecting-ip") ?? null
  });

  if (!result.ok) {
    return conflictResponse("The page changed before your edit could be saved.");
  }

  await purgePageCache(env, id, result.page.revisionId);

  return redirectResponse(pagePath(id));
}

function renderEditPage(
  id: string,
  page: Awaited<ReturnType<typeof getCurrentPage>>,
  env: Env
): string {
  const title = page?.title ?? id;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Edit ${escapeHtml(title)} - ${escapeHtml(env.SITE_NAME ?? "DokuWiki Pages")}</title>
</head>
<body>
  <main>
    <h1>Edit ${escapeHtml(title)}</h1>
    <form method="post" action="/api/pages">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <input type="hidden" name="baseRevisionId" value="${escapeHtml(page?.revisionId ?? "")}">
      <p>
        <label for="content">Wiki text</label><br>
        <textarea id="content" name="content" rows="24" cols="100">${escapeHtml(page?.content ?? "")}</textarea>
      </p>
      <p>
        <label for="summary">Summary</label><br>
        <input id="summary" name="summary" type="text" value="">
      </p>
      <button type="submit">Save</button>
    </form>
  </main>
</body>
</html>`;
}

async function purgePageCache(env: Env, id: string, revisionId: string): Promise<void> {
  await Promise.all([
    env.RENDER_CACHE.delete(`page:${id}`),
    env.RENDER_CACHE.delete(`page:${id}:${revisionId}`)
  ]);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
