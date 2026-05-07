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
import {
  getCurrentPage,
  getPageRevision,
  listPageRevisions,
  listRecentChanges,
  pagePath,
  savePage,
  searchPages,
  type CurrentPage,
  type PageRevision
} from "./wiki/page-service";
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

  if (url.pathname === "/recent") {
    return htmlResponse(await renderRecentPage(env));
  }

  if (url.pathname === "/search") {
    return htmlResponse(await renderSearchPage(env, url));
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

    if (url.searchParams.get("do") === "revisions") {
      return htmlResponse(await renderRevisionsPage(env, id));
    }

    if (url.searchParams.get("do") === "diff") {
      return htmlResponse(await renderDiffPage(env, id, url));
    }

    if (url.searchParams.get("do") === "recent") {
      return htmlResponse(await renderRecentPage(env));
    }

    if (url.searchParams.get("do") === "search") {
      return htmlResponse(await renderSearchPage(env, url));
    }

    const revisionId = url.searchParams.get("rev");
    if (revisionId) {
      const revision = await getPageRevision(env.DB, revisionId);
      if (!revision || revision.pageId !== id) {
        return notFoundResponse(`Revision '${revisionId}' was not found.`);
      }
      return htmlResponse(
        renderPageHtml(env, revision.pageId, revision.content, revision.createdAt)
      );
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

    return htmlResponse(renderPageHtml(env, id, page.content, undefined, page));
  }

  if (assetFallback) {
    return assetFallback();
  }

  return notFoundResponse("Not found.");
}

function renderPageHtml(
  env: Env,
  id: string,
  content: string,
  revisionDate?: string,
  page?: CurrentPage
): string {
  const rendered = renderWikiText(content);
  const title = rendered.title ?? page?.title ?? id;
  const revisionNotice = revisionDate
    ? `<p><strong>Old revision:</strong> ${escapeHtml(revisionDate)}</p>`
    : "";

  return htmlShell(env, title, `${revisionNotice}${rendered.html}`);
}

async function renderRevisionsPage(env: Env, id: string): Promise<string> {
  const revisions = await listPageRevisions(env.DB, id);
  const items = revisions
    .map(
      (revision) => `<li>
        <a href="${pagePath(id)}?rev=${encodeURIComponent(revision.id)}">${escapeHtml(revision.createdAt)}</a>
        ${escapeHtml(revision.changeType)}
        ${revision.summary ? ` - ${escapeHtml(revision.summary)}` : ""}
        <a href="${pagePath(id)}?do=diff&rev=${encodeURIComponent(revision.id)}">diff</a>
      </li>`
    )
    .join("");

  return htmlShell(
    env,
    `Revisions for ${id}`,
    `<h1>Revisions for ${escapeHtml(id)}</h1><ul>${items}</ul>`
  );
}

async function renderDiffPage(env: Env, id: string, url: URL): Promise<string> {
  const rev = url.searchParams.get("rev");
  const rev2 = url.searchParams.get("rev2");

  if (!rev) {
    return htmlShell(env, "Missing revision", "<p>Missing revision.</p>");
  }

  const left = await getPageRevision(env.DB, rev);
  const right = rev2 ? await getPageRevision(env.DB, rev2) : await getCurrentPage(env.DB, id);

  if (!left || !right || left.pageId !== id || getComparablePageId(right) !== id) {
    return htmlShell(env, "Diff not found", "<p>Diff source not found.</p>");
  }

  const rows = renderLineDiff(left.content, right.content);

  return htmlShell(
    env,
    `Diff for ${id}`,
    `<h1>Diff for ${escapeHtml(id)}</h1><table><tbody>${rows}</tbody></table>`
  );
}

async function renderRecentPage(env: Env): Promise<string> {
  const changes = await listRecentChanges(env.DB);
  const items = changes
    .map(
      (change) => `<li>
        <a href="${pagePath(change.subjectId)}">${escapeHtml(change.subjectId)}</a>
        ${escapeHtml(change.changeType)}
        ${change.summary ? ` - ${escapeHtml(change.summary)}` : ""}
        <time>${escapeHtml(change.createdAt)}</time>
      </li>`
    )
    .join("");

  return htmlShell(env, "Recent changes", `<h1>Recent changes</h1><ul>${items}</ul>`);
}

async function renderSearchPage(env: Env, url: URL): Promise<string> {
  const query = url.searchParams.get("q")?.trim() ?? "";
  const results = query ? await searchPages(env.DB, query) : [];
  const resultItems = results
    .map(
      (result) => `<li>
        <a href="${pagePath(result.id)}">${escapeHtml(result.title ?? result.id)}</a>
        <p>${escapeHtml(result.snippet)}</p>
        <small>${escapeHtml(result.id)} - score ${result.score}</small>
      </li>`
    )
    .join("");
  const emptyState = query && results.length === 0 ? "<p>No matching pages found.</p>" : "";

  return htmlShell(
    env,
    "Search",
    `<h1>Search</h1>
    <form method="get" action="/search">
      <label for="q">Search pages</label>
      <input id="q" name="q" type="search" value="${escapeHtml(query)}">
      <button type="submit">Search</button>
    </form>
    ${emptyState}
    <ol>${resultItems}</ol>`
  );
}

function renderLineDiff(left: string, right: string): string {
  const oldLines = left.split("\n");
  const newLines = right.split("\n");
  const max = Math.max(oldLines.length, newLines.length);
  const rows: string[] = [];

  for (let index = 0; index < max; index += 1) {
    const oldLine = oldLines[index] ?? "";
    const newLine = newLines[index] ?? "";
    const changed = oldLine !== newLine;

    rows.push(`<tr>
      <td>${index + 1}</td>
      <td>${changed ? `<del>${escapeHtml(oldLine)}</del>` : escapeHtml(oldLine)}</td>
      <td>${changed ? `<ins>${escapeHtml(newLine)}</ins>` : escapeHtml(newLine)}</td>
    </tr>`);
  }

  return rows.join("");
}

function getComparablePageId(page: CurrentPage | PageRevision): string {
  return "pageId" in page ? page.pageId : page.id;
}

function htmlShell(env: Env, title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - ${escapeHtml(env.SITE_NAME ?? "DokuWiki Pages")}</title>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
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
