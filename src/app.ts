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
  listAllPages,
  listBacklinks,
  listNamespacePages,
  listOrphanPages,
  listPageRevisions,
  listRecentChanges,
  listWantedPages,
  pagePath,
  savePage,
  searchPages,
  type CurrentPage,
  type PageRevision
} from "./wiki/page-service";
import { renderWikiText } from "./wiki/render";

type AssetFallback = () => Promise<Response>;
const RENDER_CACHE_TTL_SECONDS = 60 * 60;

interface RenderCacheEntry {
  revisionId: string;
  title: string;
  html: string;
}

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

  if (url.pathname === "/index") {
    return htmlResponse(
      await renderNamespaceIndexPage(env, cleanPageId(url.searchParams.get("ns") ?? ""))
    );
  }

  if (url.pathname === "/wanted") {
    return htmlResponse(await renderWantedPage(env));
  }

  if (url.pathname === "/orphans") {
    return htmlResponse(await renderOrphanPage(env));
  }

  if (url.pathname === "/sitemap.xml" || url.pathname === "/sitemap") {
    return xmlResponse(await renderSitemap(env, url));
  }

  if (url.pathname === "/feed.php" || url.pathname === "/feed" || url.pathname === "/feed.xml") {
    return xmlResponse(await renderRssFeed(env, url), "application/rss+xml; charset=utf-8");
  }

  if (url.pathname === "/atom.xml") {
    return xmlResponse(await renderAtomFeed(env, url), "application/atom+xml; charset=utf-8");
  }

  if (url.pathname === "/lib/exe/opensearch.php" || url.pathname === "/opensearch.xml") {
    return xmlResponse(renderOpenSearch(env, url));
  }

  if (url.pathname === "/lib/exe/manifest.php" || url.pathname === "/manifest.webmanifest") {
    return manifestResponse(renderWebManifest(env));
  }

  if (url.pathname === "/robots.txt") {
    return new Response(
      `User-agent: *\nAllow: /\nSitemap: ${new URL("/sitemap.xml", url).href}\n`,
      {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff"
        }
      }
    );
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

    if (url.searchParams.get("do") === "index") {
      return htmlResponse(await renderNamespaceIndexPage(env, namespaceForIndex(id)));
    }

    if (url.searchParams.get("do") === "backlink" || url.searchParams.get("do") === "backlinks") {
      return htmlResponse(await renderBacklinksPage(env, id));
    }

    if (url.searchParams.get("do") === "wanted") {
      return htmlResponse(await renderWantedPage(env));
    }

    if (url.searchParams.get("do") === "orphan" || url.searchParams.get("do") === "orphans") {
      return htmlResponse(await renderOrphanPage(env));
    }

    const revisionId = url.searchParams.get("rev");
    if (revisionId) {
      const revision = await getPageRevision(env.DB, revisionId);
      if (!revision || revision.pageId !== id) {
        return notFoundResponse(`Revision '${revisionId}' was not found.`);
      }
      return htmlResponse(
        await renderPageHtml(
          env,
          revision.pageId,
          revision.content,
          revision.id,
          revision.createdAt
        )
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

    return htmlResponse(
      await renderPageHtml(env, id, page.content, page.revisionId, undefined, page)
    );
  }

  if (assetFallback) {
    return assetFallback();
  }

  return notFoundResponse("Not found.");
}

async function renderPageHtml(
  env: Env,
  id: string,
  content: string,
  revisionId: string,
  revisionDate?: string,
  page?: CurrentPage
): Promise<string> {
  const cacheKey = revisionDate ? `page:${id}:${revisionId}` : `page:${id}`;
  const revisionNotice = revisionDate
    ? `<p><strong>Old revision:</strong> ${escapeHtml(revisionDate)}</p>`
    : "";
  const cached = await readRenderCache(env, cacheKey, revisionId);

  if (cached) {
    return htmlShell(env, cached.title, `${revisionNotice}${cached.html}`);
  }

  const rendered = renderWikiText(content);
  const title = rendered.title ?? page?.title ?? id;
  await writeRenderCache(env, cacheKey, {
    revisionId,
    title,
    html: rendered.html
  });

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

async function renderNamespaceIndexPage(env: Env, namespace: string): Promise<string> {
  const pages = await listNamespacePages(env.DB, namespace);
  const title = namespace ? `Index of ${namespace}` : "Index";
  const items = renderPageReferenceList(
    pages.map((page) => ({
      id: page.id,
      title: page.title,
      updatedAt: page.updatedAt
    }))
  );
  const emptyState = pages.length === 0 ? "<p>No pages found in this namespace.</p>" : "";

  return htmlShell(env, title, `<h1>${escapeHtml(title)}</h1>${emptyState}<ul>${items}</ul>`);
}

async function renderBacklinksPage(env: Env, id: string): Promise<string> {
  const backlinks = await listBacklinks(env.DB, id);
  const items = renderPageReferenceList(backlinks);
  const emptyState = backlinks.length === 0 ? "<p>No backlinks found.</p>" : "";

  return htmlShell(
    env,
    `Backlinks for ${id}`,
    `<h1>Backlinks for ${escapeHtml(id)}</h1>${emptyState}<ul>${items}</ul>`
  );
}

async function renderOrphanPage(env: Env): Promise<string> {
  const orphans = await listOrphanPages(env.DB);
  const items = renderPageReferenceList(orphans);
  const emptyState = orphans.length === 0 ? "<p>No orphan pages found.</p>" : "";

  return htmlShell(env, "Orphan pages", `<h1>Orphan pages</h1>${emptyState}<ul>${items}</ul>`);
}

async function renderWantedPage(env: Env): Promise<string> {
  const wanted = await listWantedPages(env.DB);
  const items = wanted
    .map(
      (page) => `<li>
        <a href="${pagePath(page.id)}">${escapeHtml(page.id)}</a>
        <small>${page.referrers.length} referrer${page.referrers.length === 1 ? "" : "s"}</small>
        <ul>${renderPageReferenceList(page.referrers)}</ul>
      </li>`
    )
    .join("");
  const emptyState = wanted.length === 0 ? "<p>No wanted pages found.</p>" : "";

  return htmlShell(env, "Wanted pages", `<h1>Wanted pages</h1>${emptyState}<ul>${items}</ul>`);
}

function renderPageReferenceList(
  pages: Array<{ id: string; title: string | null; updatedAt: string }>
): string {
  return pages
    .map(
      (page) => `<li>
        <a href="${pagePath(page.id)}">${escapeHtml(page.title ?? page.id)}</a>
        <small>${escapeHtml(page.id)} - ${escapeHtml(page.updatedAt)}</small>
      </li>`
    )
    .join("");
}

async function renderSitemap(env: Env, url: URL): Promise<string> {
  const pages = await listAllPages(env.DB);
  const urls = pages
    .map(
      (page) => `<url>
  <loc>${escapeXml(new URL(pagePath(page.id), url).href)}</loc>
  <lastmod>${escapeXml(page.updatedAt)}</lastmod>
</url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

async function renderRssFeed(env: Env, url: URL): Promise<string> {
  const changes = await listRecentChanges(env.DB);
  const title = env.SITE_NAME ?? "DokuWiki Pages";
  const items = changes
    .map(
      (change) => `<item>
  <title>${escapeXml(`${change.changeType}: ${change.subjectId}`)}</title>
  <link>${escapeXml(new URL(pagePath(change.subjectId), url).href)}</link>
  <guid>${escapeXml(change.id)}</guid>
  <pubDate>${escapeXml(new Date(change.createdAt).toUTCString())}</pubDate>
  <description>${escapeXml(change.summary || change.changeType)}</description>
</item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeXml(title)}</title>
  <link>${escapeXml(new URL("/", url).href)}</link>
  <description>${escapeXml(`${title} recent changes`)}</description>
${items}
</channel>
</rss>`;
}

async function renderAtomFeed(env: Env, url: URL): Promise<string> {
  const changes = await listRecentChanges(env.DB);
  const title = env.SITE_NAME ?? "DokuWiki Pages";
  const updated = changes[0]?.createdAt ?? new Date(0).toISOString();
  const entries = changes
    .map(
      (change) => `<entry>
  <title>${escapeXml(`${change.changeType}: ${change.subjectId}`)}</title>
  <link href="${escapeXml(new URL(pagePath(change.subjectId), url).href)}"/>
  <id>${escapeXml(change.id)}</id>
  <updated>${escapeXml(change.createdAt)}</updated>
  <summary>${escapeXml(change.summary || change.changeType)}</summary>
</entry>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(title)}</title>
  <link href="${escapeXml(new URL("/", url).href)}"/>
  <updated>${escapeXml(updated)}</updated>
  <id>${escapeXml(new URL("/", url).href)}</id>
${entries}
</feed>`;
}

function renderOpenSearch(env: Env, url: URL): string {
  const title = env.SITE_NAME ?? "DokuWiki Pages";
  const searchTemplate = `${new URL("/search", url).href}?q={searchTerms}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${escapeXml(title)}</ShortName>
  <Description>${escapeXml(`Search ${title}`)}</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Url type="text/html" template="${escapeXml(searchTemplate)}"/>
</OpenSearchDescription>`;
}

function renderWebManifest(env: Env): Record<string, unknown> {
  const name = env.SITE_NAME ?? "DokuWiki Pages";

  return {
    name,
    short_name: name.slice(0, 24),
    start_url: "/",
    display: "minimal-ui",
    background_color: "#ffffff",
    theme_color: "#0f172a"
  };
}

function namespaceForIndex(id: string): string {
  return id.includes(":") ? id.slice(0, id.lastIndexOf(":")) : id;
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

function xmlResponse(body: string, contentType = "application/xml; charset=utf-8"): Response {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "x-content-type-options": "nosniff"
    }
  });
}

function manifestResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
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

async function readRenderCache(
  env: Env,
  cacheKey: string,
  revisionId: string
): Promise<RenderCacheEntry | null> {
  try {
    const cached = (await env.RENDER_CACHE.get(cacheKey, "json")) as RenderCacheEntry | null;

    if (
      cached?.revisionId === revisionId &&
      typeof cached.title === "string" &&
      typeof cached.html === "string"
    ) {
      return cached;
    }
  } catch {
    return null;
  }

  return null;
}

async function writeRenderCache(
  env: Env,
  cacheKey: string,
  entry: RenderCacheEntry
): Promise<void> {
  try {
    await env.RENDER_CACHE.put(cacheKey, JSON.stringify(entry), {
      expirationTtl: RENDER_CACHE_TTL_SECONDS
    });
  } catch {
    // Rendering should remain available when KV is degraded.
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}
