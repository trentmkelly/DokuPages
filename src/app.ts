import { getRuntimeConfig, type ConfigValidation } from "./config";
import type { Env } from "./env";
import {
  collectDiagnostics,
  type DiagnosticsSnapshot,
  type ImportJobStatus,
  type MigrationStatus,
  type SchemaVersionStatus,
  type StorageCheck
} from "./http/diagnostics";
import { getClientIp } from "./http/client-ip";
import { healthResponse } from "./http/health";
import { paginationFromUrl, type Pagination } from "./http/pagination";
import {
  htmlResponse,
  jsonResponse,
  notFoundResponse,
  redirectResponse,
  securityHeaders
} from "./http/responses";
import {
  cleanMediaId,
  getCurrentMedia,
  getMediaRevision,
  listNamespaceMedia,
  mediaDetailPath,
  mediaName,
  mediaPath,
  type CurrentMedia,
  type MediaRevision
} from "./wiki/media-service";
import { cleanPageId } from "./wiki/page-id";
import {
  getCurrentPage,
  getPageDraft,
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
  savePageDraft,
  searchPages,
  deletePageDraft,
  type CurrentPage,
  type PageDraft,
  type PageRevision
} from "./wiki/page-service";
import { getWikiRenderDirectives, renderWikiText, type TocItem } from "./wiki/render";
import { findWordblockMatch, WORD_BLOCK_MESSAGE, type WordblockMatch } from "./wiki/wordblock";

type AssetFallback = () => Promise<Response>;
type ExportMode = "raw" | "xhtml" | "xhtmlbody";
const RENDER_CACHE_TTL_SECONDS = 60 * 60;
const DISCOVERY_CACHE_TTL_SECONDS = 5 * 60;
const RENDER_CACHE_VERSION = 16;
const DISCOVERY_CACHE_KINDS = ["sitemap", "rss", "atom"] as const;
type DiscoveryCacheKind = (typeof DISCOVERY_CACHE_KINDS)[number];

interface RenderCacheEntry {
  rendererVersion: number;
  revisionId: string;
  title: string;
  html: string;
  toc: TocItem[];
}

export async function handleRequest(
  request: Request,
  env: Env,
  assetFallback?: AssetFallback
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/") {
    return redirectResponse(pagePath(startPageId(env)), 302);
  }

  if (url.pathname === "/doku.php") {
    return redirectLegacyDokuPhp(url, env);
  }

  if (url.pathname === "/lib/exe/fetch.php") {
    return redirectLegacyMediaFetch(url);
  }

  if (url.pathname === "/lib/exe/detail.php") {
    return redirectLegacyMediaDetail(url);
  }

  if (url.pathname === "/lib/exe/mediamanager.php") {
    return redirectResponse(
      `/media-manager?ns=${encodeURIComponent(cleanPageId(url.searchParams.get("ns") ?? ""))}`,
      301
    );
  }

  if (url.pathname === "/wiki" || url.pathname === "/wiki/") {
    return redirectResponse(pagePath(startPageId(env)), 301);
  }

  if (url.pathname.startsWith("/media/")) {
    return handleMediaFetch(env, url);
  }

  if (url.pathname.startsWith("/media-detail/")) {
    return htmlResponse(await renderMediaDetailPage(env, url));
  }

  if (url.pathname === "/media-manager") {
    return htmlResponse(await renderMediaManagerPage(env, url));
  }

  if (url.pathname === "/api/health") {
    return healthResponse(env);
  }

  if (url.pathname === "/api/diagnostics") {
    return jsonResponse(await collectDiagnostics(env));
  }

  if (url.pathname === "/admin/diagnostics" || url.pathname === "/diagnostics") {
    return htmlResponse(await renderDiagnosticsPage(env));
  }

  if (url.pathname === "/recent") {
    return htmlResponse(await renderRecentPage(env, url));
  }

  if (url.pathname === "/search") {
    return htmlResponse(await renderSearchPage(env, url));
  }

  if (url.pathname === "/index") {
    return htmlResponse(
      await renderNamespaceIndexPage(env, cleanPageId(url.searchParams.get("ns") ?? ""), url)
    );
  }

  if (url.pathname === "/wanted") {
    return htmlResponse(await renderWantedPage(env));
  }

  if (url.pathname === "/orphans") {
    return htmlResponse(await renderOrphanPage(env));
  }

  if (url.pathname === "/sitemap.xml" || url.pathname === "/sitemap") {
    return cachedXmlResponse(env, "sitemap", url, "application/xml; charset=utf-8", () =>
      renderSitemap(env, url)
    );
  }

  if (url.pathname === "/feed.php" || url.pathname === "/feed" || url.pathname === "/feed.xml") {
    return cachedXmlResponse(env, "rss", url, "application/rss+xml; charset=utf-8", () =>
      renderRssFeed(env, url)
    );
  }

  if (url.pathname === "/atom.xml") {
    return cachedXmlResponse(env, "atom", url, "application/atom+xml; charset=utf-8", () =>
      renderAtomFeed(env, url)
    );
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
        headers: securityHeaders({
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff"
        })
      }
    );
  }

  if (url.pathname === "/api/pages" && request.method === "POST") {
    return handleSave(request, env);
  }

  if (url.pathname === "/api/pages/revert" && request.method === "POST") {
    return handleRevert(request, env);
  }

  if (url.pathname === "/api/pages/draft" && request.method === "POST") {
    return handleSaveDraft(request, env);
  }

  if (url.pathname === "/api/pages/draft/delete" && request.method === "POST") {
    return handleDeleteDraft(request, env);
  }

  if (url.pathname === "/api/pages/preview" && request.method === "POST") {
    const form = await request.formData();
    const content = String(form.get("content") ?? "");
    const pageId = cleanPageId(String(form.get("id") ?? ""));
    return jsonResponse(renderWikiText(content, { pageId: pageId || undefined }));
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

    const canonicalPath = pagePath(id);
    if (url.pathname !== canonicalPath) {
      return redirectResponse(`${canonicalPath}${url.search}`, 301);
    }

    if (url.searchParams.get("do") === "revisions") {
      return htmlResponse(await renderRevisionsPage(env, id, url));
    }

    if (url.searchParams.get("do") === "diff") {
      return htmlResponse(await renderDiffPage(env, id, url));
    }

    if (url.searchParams.get("do") === "recent") {
      return htmlResponse(await renderRecentPage(env, url));
    }

    if (url.searchParams.get("do") === "search") {
      return htmlResponse(await renderSearchPage(env, url));
    }

    if (url.searchParams.get("do") === "index") {
      return htmlResponse(await renderNamespaceIndexPage(env, namespaceForIndex(id), url));
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

    if (url.searchParams.get("do") === "revert") {
      return htmlResponse(await renderRevertPage(env, id, url));
    }

    if (url.searchParams.get("do") === "purge") {
      const page = await getCurrentPage(env.DB, id);
      if (!page) {
        return notFoundResponse(`Wiki page '${id}' was not found.`);
      }
      await purgePageCache(env, id, page.revisionId, url.origin);
      return redirectResponse(pagePath(id));
    }

    const exportMode = normalizeExportMode(url.searchParams.get("do"));
    const revisionId = url.searchParams.get("rev");

    if (exportMode) {
      const exportPage = revisionId
        ? await getPageRevision(env.DB, revisionId)
        : await getCurrentPage(env.DB, id);

      if (!exportPage || getComparablePageId(exportPage) !== id) {
        return notFoundResponse(
          revisionId
            ? `Revision '${revisionId}' was not found.`
            : `Wiki page '${id}' was not found.`
        );
      }

      return renderPageExport(env, url, id, exportPage, exportMode);
    }

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
      const draft = await getPageDraft(env.DB, id);
      return htmlResponse(renderEditPage(id, page, draft, env));
    }

    if (url.searchParams.get("do") === "draft") {
      const draft = await getPageDraft(env.DB, id);
      if (!draft) {
        return notFoundResponse(`Draft for '${id}' was not found.`);
      }
      return htmlResponse(renderDraftPage(id, draft, env));
    }

    if (url.searchParams.get("do") === "source") {
      if (!page) {
        return notFoundResponse(`Wiki page '${id}' was not found.`);
      }
      return new Response(page.content, {
        headers: securityHeaders({
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff"
        })
      });
    }

    if (!page) {
      return htmlResponse(renderMissingPage(env, id), { status: 404 });
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

function redirectLegacyDokuPhp(url: URL, env: Env): Response {
  const id = cleanPageId(url.searchParams.get("id") ?? startPageId(env));
  const target = new URL(pagePath(id || startPageId(env)), url);
  const action = normalizeLegacyAction(url.searchParams.get("do"));
  const revisionId = url.searchParams.get("rev");
  const secondRevisionId = url.searchParams.get("rev2");

  if (action) {
    target.searchParams.set("do", action);
  }

  if (revisionId) {
    target.searchParams.set("rev", revisionId);
  }

  if (secondRevisionId) {
    target.searchParams.set("rev2", secondRevisionId);
  }

  return redirectResponse(`${target.pathname}${target.search}`, 301);
}

function redirectLegacyMediaFetch(url: URL): Response {
  const id = cleanMediaId(url.searchParams.get("media") ?? url.searchParams.get("id") ?? "");

  if (!id) {
    return redirectResponse("/media-manager", 301);
  }

  const target = new URL(mediaPath(id), url);
  const revisionId = url.searchParams.get("rev");

  if (revisionId) {
    target.searchParams.set("rev", revisionId);
  }

  if (url.searchParams.get("dl")) {
    target.searchParams.set("download", "1");
  }

  return redirectResponse(`${target.pathname}${target.search}`, 301);
}

function redirectLegacyMediaDetail(url: URL): Response {
  const id = cleanMediaId(url.searchParams.get("id") ?? url.searchParams.get("media") ?? "");

  if (!id) {
    return redirectResponse("/media-manager", 301);
  }

  return redirectResponse(mediaDetailPath(id), 301);
}

async function handleMediaFetch(env: Env, url: URL): Promise<Response> {
  const id = mediaIdFromPath(url, "/media/");

  if (!id) {
    return notFoundResponse("Missing media id.");
  }

  const revisionId = url.searchParams.get("rev");
  const media = revisionId
    ? await getMediaRevision(env.DB, revisionId)
    : await getCurrentMedia(env.DB, id);

  if (!media || getComparableMediaId(media) !== id) {
    return notFoundResponse(`Media '${id}' was not found.`);
  }

  if (!env.MEDIA_BUCKET) {
    return jsonResponse({ error: "Media bucket is not configured." }, { status: 503 });
  }

  const object = await env.MEDIA_BUCKET.get(media.objectKey);

  if (!object) {
    return notFoundResponse(`Media object '${media.objectKey}' was not found.`);
  }

  const headers = securityHeaders();
  headers.set("content-type", media.mimeType);
  headers.set("content-length", String(media.byteLength));
  headers.set("etag", `"${media.contentHash}"`);
  headers.set("last-modified", new Date(getMediaTimestamp(media)).toUTCString());
  headers.set("x-content-type-options", "nosniff");
  headers.set(
    "cache-control",
    revisionId ? "public, max-age=31536000, immutable" : "public, max-age=3600"
  );

  if (url.searchParams.get("download") === "1") {
    headers.set(
      "content-disposition",
      `attachment; filename="${escapeHeaderValue(mediaName(id))}"`
    );
  }

  return new Response(object.body, { headers });
}

async function renderMediaDetailPage(env: Env, url: URL): Promise<string> {
  const id = mediaIdFromPath(url, "/media-detail/");
  const media = id ? await getCurrentMedia(env.DB, id) : null;

  if (!id || !media) {
    return htmlShell(env, "Media not found", "<p>Media not found.</p>");
  }

  const preview = media.mimeType.startsWith("image/")
    ? `<p><a href="${mediaPath(id)}"><img class="media" src="${mediaPath(id)}" alt="${escapeAttribute(mediaName(id))}"></a></p>`
    : `<p><a href="${mediaPath(id)}">Download ${escapeHtml(mediaName(id))}</a></p>`;

  return htmlShell(
    env,
    `Media detail for ${id}`,
    `<h1>Media detail</h1>
    <div id="dokuwiki__detail">
      ${preview}
      <div class="img_detail">
        <dl>
          <dt>Media ID</dt><dd>${escapeHtml(id)}</dd>
          <dt>Namespace</dt><dd>${escapeHtml(media.namespace || "(root)")}</dd>
          <dt>MIME type</dt><dd>${escapeHtml(media.mimeType)}</dd>
          <dt>Size</dt><dd>${media.byteLength.toLocaleString("en-US")} bytes</dd>
          <dt>Updated</dt><dd>${escapeHtml(media.updatedAt)}</dd>
          <dt>Hash</dt><dd><code>${escapeHtml(media.contentHash)}</code></dd>
        </dl>
      </div>
    </div>`
  );
}

async function renderMediaManagerPage(env: Env, url: URL): Promise<string> {
  const namespace = cleanMediaId(url.searchParams.get("ns") ?? "");
  const pagination = paginationFromUrl(url, { defaultLimit: 200, maxLimit: 500 });
  const media = await listNamespaceMedia(env.DB, namespace, pagination.limit, pagination.offset);
  const emptyState = media.length === 0 ? "<p>No media found.</p>" : "";
  const items = media
    .map(
      (item) => `<li>
        <a href="${mediaDetailPath(item.id)}">${escapeHtml(mediaName(item.id))}</a>
        <span>${escapeHtml(item.mimeType)}</span>
        <small>${item.byteLength.toLocaleString("en-US")} bytes</small>
      </li>`
    )
    .join("");

  return htmlShell(
    env,
    `Media manager ${namespace}`,
    `<h1>Media manager</h1>
    <form class="search" method="get" action="/media-manager">
      <label for="media__ns">Namespace</label>
      <input id="media__ns" name="ns" type="search" value="${escapeAttribute(namespace)}">
      <button type="submit">Browse</button>
    </form>
    ${emptyState}
    <ul class="idx media__manager">${items}</ul>
    ${renderPaginationControls(url, pagination, media.length)}`
  );
}

function mediaIdFromPath(url: URL, prefix: string): string {
  return cleanMediaId(decodeURIComponent(url.pathname.slice(prefix.length)));
}

function getComparableMediaId(media: CurrentMedia | MediaRevision): string {
  return "mediaId" in media ? media.mediaId : media.id;
}

function getMediaTimestamp(media: CurrentMedia | MediaRevision): string {
  return "updatedAt" in media ? media.updatedAt : media.createdAt;
}

function normalizeLegacyAction(action: string | null): string | null {
  switch (action) {
    case null:
    case "":
    case "show":
      return null;
    case "edit":
    case "source":
    case "revisions":
    case "recent":
    case "search":
    case "index":
    case "backlink":
    case "backlinks":
    case "wanted":
    case "orphan":
    case "orphans":
    case "revert":
    case "draft":
    case "diff":
    case "export_raw":
    case "export_xhtml":
    case "export_xhtmlbody":
      return action;
    case "export_html":
      return "export_xhtml";
    case "export_htmlbody":
      return "export_xhtmlbody";
    default:
      return null;
  }
}

function normalizeExportMode(action: string | null): ExportMode | null {
  switch (action) {
    case "export_raw":
      return "raw";
    case "export_xhtml":
    case "export_html":
      return "xhtml";
    case "export_xhtmlbody":
    case "export_htmlbody":
      return "xhtmlbody";
    default:
      return null;
  }
}

function startPageId(env: Env): string {
  return getRuntimeConfig(env).startPage;
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
  const directives = getWikiRenderDirectives(content);
  const revisionNotice = revisionDate
    ? `<p><strong>Old revision:</strong> ${escapeHtml(revisionDate)}</p>`
    : "";
  const cached = directives.noCache ? null : await readRenderCache(env, cacheKey, revisionId);

  if (cached) {
    return htmlShell(
      env,
      cached.title,
      `${renderBreadcrumbs(id)}${renderToc(cached.toc)}${revisionNotice}${cached.html}`,
      { pageId: id, updatedAt: revisionDate ?? page?.updatedAt }
    );
  }

  const rendered = renderWikiText(content, { pageId: id });
  const title = rendered.title ?? page?.title ?? id;

  if (!rendered.noCache) {
    await writeRenderCache(env, cacheKey, {
      rendererVersion: RENDER_CACHE_VERSION,
      revisionId,
      title,
      html: rendered.html,
      toc: rendered.toc
    });
  }

  return htmlShell(
    env,
    title,
    `${renderBreadcrumbs(id)}${renderToc(rendered.toc)}${revisionNotice}${rendered.html}`,
    { pageId: id, updatedAt: revisionDate ?? page?.updatedAt }
  );
}

function renderPageExport(
  env: Env,
  url: URL,
  id: string,
  page: CurrentPage | PageRevision,
  mode: ExportMode
): Response {
  const content = page.content;
  const revisionId = "revisionId" in page ? page.revisionId : page.id;
  const rendered = renderWikiText(content, { pageId: id });
  const title = rendered.title ?? ("title" in page ? page.title : null) ?? id;
  const headers = securityHeaders({ "x-robots-tag": "noindex" });
  const language = getRuntimeConfig(env).language;

  if (mode === "raw") {
    headers.set("content-type", "text/plain; charset=utf-8");
    headers.set("content-disposition", `attachment; filename=${exportFileName(id)}.txt`);
    return new Response(content, { headers });
  }

  headers.set("content-type", "text/html; charset=utf-8");

  if (mode === "xhtmlbody") {
    return new Response(rendered.html, { headers });
  }

  const revisionComment = revisionId ? `<!-- revision: ${escapeHtml(revisionId)} -->\n` : "";

  return new Response(
    `<!DOCTYPE html>
<html lang="${escapeAttribute(language)}">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${escapeAttribute(new URL("/dokuwiki.css", url).pathname)}">
</head>
<body>
<div class="dokuwiki export">
${revisionComment}${renderToc(rendered.toc)}
${rendered.html}
</div>
</body>
</html>`,
    { headers }
  );
}

function exportFileName(id: string): string {
  const name = id.split(":").filter(Boolean).at(-1) || "page";
  return name.replace(/[^a-z0-9._-]+/gi, "_");
}

function renderMissingPage(env: Env, id: string): string {
  return htmlShell(
    env,
    id,
    `${renderBreadcrumbs(id)}
    <h1 id="${escapeAttribute(slugForPageHeading(id))}">${escapeHtml(id)}</h1>
    <p>This topic does not exist yet.</p>
    <p>
      <a class="wikilink1" href="${pagePath(id)}?do=edit">Create this page</a>
      <span class="sep"> · </span>
      <a href="/search?q=${encodeURIComponent(id)}">Search for this page title</a>
    </p>`,
    { pageId: id }
  );
}

function slugForPageHeading(id: string): string {
  return id.replaceAll(":", "-").replaceAll("_", "-") || "page";
}

function renderBreadcrumbs(id: string): string {
  const segments = id.split(":").filter(Boolean);
  if (segments.length === 0) return "";

  const crumbs = segments
    .map((segment, index) => {
      const currentId = segments.slice(0, index + 1).join(":");
      const label = escapeHtml(segment);

      if (index === segments.length - 1) {
        return `<span>${label}</span>`;
      }

      return `<a href="/index?ns=${encodeURIComponent(currentId)}">${label}</a>`;
    })
    .join(" / ");

  return `<nav aria-label="Breadcrumb">${crumbs}</nav>`;
}

function renderHeaderBreadcrumbs(pageId: string | undefined, startId: string): string {
  if (!pageId) {
    return `<div class="breadcrumbs"><div class="youarehere"><span>You are here: </span><a href="${pagePath(startId)}">start</a></div></div>`;
  }

  const segments = pageId.split(":").filter(Boolean);
  const crumbs = segments
    .map((segment, index) => {
      const currentId = segments.slice(0, index + 1).join(":");
      const label = escapeHtml(segment);

      if (index === segments.length - 1) {
        return `<span>${label}</span>`;
      }

      return `<a href="${pagePath(currentId)}">${label}</a>`;
    })
    .join(' <span class="bcsep">&raquo;</span> ');

  return `<div class="breadcrumbs"><div class="youarehere"><span>You are here: </span>${crumbs}</div></div>`;
}

function renderToc(toc: TocItem[]): string {
  if (toc.length < 2) return "";

  const items = toc
    .map(
      (item) =>
        `<li class="level${item.level}"><div class="li"><a href="#${escapeHtml(item.id)}">${escapeHtml(item.title)}</a></div></li>`
    )
    .join("");

  return `<nav id="dw__toc" aria-labelledby="dw__toc__heading">
    <h3 class="toggle" id="dw__toc__heading">Table of Contents <strong><span>show</span></strong></h3>
    <div><ul class="toc">${items}</ul></div>
  </nav>`;
}

async function renderRevisionsPage(env: Env, id: string, url: URL): Promise<string> {
  const pagination = paginationFromUrl(url, { defaultLimit: 50, maxLimit: 100 });
  const revisions = await listPageRevisions(env.DB, id, pagination.limit, pagination.offset);
  const items = revisions
    .map(
      (revision) => `<li class="${revision.changeType === "minor" ? "minor" : ""}">
        <span class="date"><a href="${pagePath(id)}?rev=${encodeURIComponent(revision.id)}">${escapeHtml(revision.createdAt)}</a></span>
        <a class="diff_link" href="${pagePath(id)}?do=diff&rev=${encodeURIComponent(revision.id)}">diff</a>
        <a class="revisions_link" href="${pagePath(id)}?rev=${encodeURIComponent(revision.id)}">view</a>
        <a href="${pagePath(id)}?do=revert&rev=${encodeURIComponent(revision.id)}">revert</a>
        <span class="changeType">${escapeHtml(revision.changeType)}</span>
        ${revision.summary ? `<span class="sum">${escapeHtml(revision.summary)}</span>` : ""}
      </li>`
    )
    .join("");

  return htmlShell(
    env,
    `Revisions for ${id}`,
    `<h1>Revisions for ${escapeHtml(id)}</h1>
    <form class="changes" method="get" action="${pagePath(id)}">
      <ul>${items}</ul>
    </form>
    ${renderPaginationControls(url, pagination, revisions.length)}`,
    { pageId: id }
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
    `<h1>Diff for ${escapeHtml(id)}</h1>
    <table class="diff diff_sidebyside">
      <thead>
        <tr>
          <th colspan="2"><a href="${pagePath(id)}?rev=${encodeURIComponent(left.id)}">${escapeHtml(left.createdAt)}</a></th>
          <th colspan="2">${"revisionId" in right ? "Current revision" : escapeHtml(right.createdAt)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`,
    { pageId: id }
  );
}

async function renderRevertPage(env: Env, id: string, url: URL): Promise<string> {
  const revisionId = url.searchParams.get("rev");

  if (!revisionId) {
    return htmlShell(env, "Missing revision", "<p>Missing revision.</p>");
  }

  const revision = await getPageRevision(env.DB, revisionId);
  const current = await getCurrentPage(env.DB, id);

  if (!revision || revision.pageId !== id || !current) {
    return htmlShell(env, "Revision not found", "<p>Revision not found.</p>");
  }

  const summary = `Reverted to ${revision.createdAt}`;

  return htmlShell(
    env,
    `Revert ${id}`,
    `<h1>Revert ${escapeHtml(id)}</h1>
    <p>Restore revision ${escapeHtml(revision.createdAt)}.</p>
    <form method="post" action="/api/pages/revert">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <input type="hidden" name="revisionId" value="${escapeHtml(revision.id)}">
      <input type="hidden" name="baseRevisionId" value="${escapeHtml(current.revisionId)}">
      <p>
        <label for="summary">Summary</label><br>
        <input id="summary" name="summary" type="text" value="${escapeHtml(summary)}">
      </p>
      <button type="submit">Revert</button>
    </form>`
  );
}

async function renderRecentPage(env: Env, url: URL): Promise<string> {
  const pagination = paginationFromUrl(url, { defaultLimit: 50, maxLimit: 100 });
  const changes = await listRecentChanges(env.DB, pagination.limit, pagination.offset);
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

  return htmlShell(
    env,
    "Recent changes",
    `<h1>Recent changes</h1><ul>${items}</ul>${renderPaginationControls(url, pagination, changes.length)}`
  );
}

async function renderDiagnosticsPage(env: Env): Promise<string> {
  const diagnostics = await collectDiagnostics(env);
  const deploymentRows = renderDiagnosticsDefinitionList([
    ["Version", diagnostics.version],
    ["Generated", diagnostics.generatedAt],
    ["Site name", diagnostics.site.siteName],
    ["Start page", diagnostics.site.startPage],
    ["Language", diagnostics.site.language],
    ["Branch", diagnostics.deployment.branch ?? "(not provided)"],
    ["Commit", diagnostics.deployment.commitSha ?? "(not provided)"],
    ["Pages URL", diagnostics.deployment.pagesUrl ?? "(not provided)"]
  ]);

  return htmlShell(
    env,
    "Diagnostics",
    `<h1>Diagnostics</h1>
    <p class="${diagnostics.ok ? "success" : "error"}">
      Runtime status: ${diagnostics.ok ? "healthy" : "attention required"}
    </p>
    <h2>Runtime</h2>
    <dl class="diagnostics">${deploymentRows}</dl>
    <h2>Configuration</h2>
    ${renderConfigValidation(diagnostics.config)}
    <h2>Storage health</h2>
    <table class="diagnostics">
      <thead>
        <tr><th>Binding</th><th>Status</th><th>Latency</th><th>Message</th></tr>
      </thead>
      <tbody>${renderStorageHealthRows(diagnostics)}</tbody>
    </table>
    <h2>Migration status</h2>
    ${renderMigrationStatus(diagnostics.migration)}`
  );
}

function renderDiagnosticsDefinitionList(rows: Array<[string, string]>): string {
  return rows
    .map(
      ([term, value]) =>
        `<dt>${escapeHtml(term)}</dt><dd>${value.startsWith("http") ? `<a href="${escapeAttribute(value)}">${escapeHtml(value)}</a>` : escapeHtml(value)}</dd>`
    )
    .join("");
}

function renderStorageHealthRows(diagnostics: DiagnosticsSnapshot): string {
  const rows: Array<[string, StorageCheck]> = [
    ["D1 database", diagnostics.storage.d1],
    ["Render cache KV", diagnostics.storage.kv],
    ["Media R2 bucket", diagnostics.storage.r2],
    ["Page lock Durable Object", diagnostics.storage.durableObjects]
  ];

  return rows
    .map(
      ([name, check]) => `<tr>
        <th scope="row">${escapeHtml(name)}</th>
        <td>${renderStorageStatus(check)}</td>
        <td>${check.latencyMs === undefined ? "-" : `${check.latencyMs} ms`}</td>
        <td>${escapeHtml(check.message)}</td>
      </tr>`
    )
    .join("");
}

function renderStorageStatus(check: StorageCheck): string {
  return `<span class="diagnostics__status diagnostics__status--${escapeAttribute(check.status)}">${escapeHtml(check.status)}</span>`;
}

function renderConfigValidation(config: ConfigValidation): string {
  if (config.issues.length === 0) {
    return '<p class="success">Runtime configuration is valid.</p>';
  }

  const rows = config.issues
    .map(
      (issue) => `<tr>
        <td>${escapeHtml(issue.severity)}</td>
        <td><code>${escapeHtml(issue.key)}</code></td>
        <td>${escapeHtml(issue.message)}</td>
      </tr>`
    )
    .join("");

  return `<p class="${config.ok ? "success" : "error"}">
      Runtime configuration has ${config.issues.length} issue${config.issues.length === 1 ? "" : "s"}.
    </p>
    <table class="diagnostics">
      <thead><tr><th>Severity</th><th>Key</th><th>Message</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderMigrationStatus(migration: MigrationStatus): string {
  return `<p class="${migration.status === "error" ? "error" : "success"}">
      ${escapeHtml(migration.message)}
    </p>
    <p>Latest schema version: ${migration.latestSchemaVersion ?? "none"}</p>
    <h3>Schema versions</h3>
    ${renderSchemaVersionTable(migration.schemaVersions)}
    <h3>Recent import jobs</h3>
    ${renderImportJobTable(migration.recentImportJobs)}`;
}

function renderSchemaVersionTable(versions: SchemaVersionStatus[]): string {
  if (versions.length === 0) {
    return "<p>No schema versions recorded.</p>";
  }

  const rows = versions
    .map(
      (version) => `<tr>
        <td>${version.version}</td>
        <td>${escapeHtml(version.appliedAt)}</td>
      </tr>`
    )
    .join("");

  return `<table class="diagnostics">
    <thead><tr><th>Version</th><th>Applied</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderImportJobTable(jobs: ImportJobStatus[]): string {
  if (jobs.length === 0) {
    return "<p>No import jobs recorded.</p>";
  }

  const rows = jobs
    .map(
      (job) => `<tr>
        <td><code>${escapeHtml(job.id)}</code></td>
        <td>${escapeHtml(job.status)}</td>
        <td>${escapeHtml(job.sourcePath)}</td>
        <td>${escapeHtml(JSON.stringify(job.counts) ?? "null")}</td>
        <td>${job.errorCount ?? "unknown"}</td>
        <td>${escapeHtml(job.startedAt)}</td>
        <td>${job.finishedAt ? escapeHtml(job.finishedAt) : "-"}</td>
      </tr>`
    )
    .join("");

  return `<table class="diagnostics">
    <thead>
      <tr><th>ID</th><th>Status</th><th>Source</th><th>Counts</th><th>Errors</th><th>Started</th><th>Finished</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function renderSearchPage(env: Env, url: URL): Promise<string> {
  const query = url.searchParams.get("q")?.trim() ?? "";
  const namespace = cleanPageId(url.searchParams.get("ns") ?? "");
  const results = query ? await searchPages(env.DB, query, namespace) : [];
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
      <label for="search__ns">Namespace</label>
      <input id="search__ns" name="ns" type="search" value="${escapeAttribute(namespace)}">
      <button type="submit">Search</button>
    </form>
    ${namespace ? `<p>Search scope: ${escapeHtml(namespace)}</p>` : ""}
    ${emptyState}
    <ol>${resultItems}</ol>`
  );
}

async function renderNamespaceIndexPage(env: Env, namespace: string, url: URL): Promise<string> {
  const pagination = paginationFromUrl(url, { defaultLimit: 200, maxLimit: 500 });
  const pages = await listNamespacePages(env.DB, namespace, pagination.limit, pagination.offset);
  const title = namespace ? `Index of ${namespace}` : "Index";
  const items = renderPageReferenceList(
    pages.map((page) => ({
      id: page.id,
      title: page.title,
      updatedAt: page.updatedAt
    }))
  );
  const emptyState = pages.length === 0 ? "<p>No pages found in this namespace.</p>" : "";

  return htmlShell(
    env,
    title,
    `<h1>${escapeHtml(title)}</h1>${emptyState}<ul>${items}</ul>${renderPaginationControls(url, pagination, pages.length)}`
  );
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

function renderPaginationControls(url: URL, pagination: Pagination, itemCount: number): string {
  const previousOffset = Math.max(0, pagination.offset - pagination.limit);
  const previous =
    pagination.offset > 0
      ? `<a class="prev" href="${escapeAttribute(paginationHref(url, previousOffset, pagination.limit))}">Previous</a>`
      : "";
  const next =
    itemCount === pagination.limit
      ? `<a class="next" href="${escapeAttribute(paginationHref(url, pagination.offset + pagination.limit, pagination.limit))}">Next</a>`
      : "";

  if (!previous && !next) return "";

  return `<nav class="pagination" aria-label="Pagination">${previous}${next}</nav>`;
}

function paginationHref(url: URL, offset: number, limit: number): string {
  const next = new URL(url.href);
  next.searchParams.set("offset", String(offset));
  next.searchParams.set("limit", String(limit));
  return `${next.pathname}${next.search}`;
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
  const title = getRuntimeConfig(env).siteName;
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
  const title = getRuntimeConfig(env).siteName;
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
  const title = getRuntimeConfig(env).siteName;
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
  const name = getRuntimeConfig(env).siteName;

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
      <td class="diff-lineheader">${index + 1}</td>
      <td class="${changed ? "diff-deletedline" : "diff-context"}">${changed ? `<del>${escapeHtml(oldLine)}</del>` : escapeHtml(oldLine)}</td>
      <td class="diff-lineheader">${index + 1}</td>
      <td class="${changed ? "diff-addedline" : "diff-context"}">${changed ? `<ins>${escapeHtml(newLine)}</ins>` : escapeHtml(newLine)}</td>
    </tr>`);
  }

  return rows.join("");
}

function getComparablePageId(page: CurrentPage | PageRevision): string {
  return "pageId" in page ? page.pageId : page.id;
}

interface HtmlShellOptions {
  pageId?: string;
  updatedAt?: string;
}

function htmlShell(env: Env, title: string, body: string, options: HtmlShellOptions = {}): string {
  const config = getRuntimeConfig(env);
  const siteName = config.siteName;
  const appVersion = config.appVersion;
  const startId = startPageId(env);
  const startPath = pagePath(startId);
  const pageId = options.pageId;
  const pageIdHtml = pageId ? `<div class="pageId"><span>${escapeHtml(pageId)}</span></div>` : "";
  const canonicalLink = pageId
    ? `<link rel="canonical" href="${escapeAttribute(pagePath(pageId))}">`
    : "";
  const docInfo = options.updatedAt
    ? `<div class="docInfo">Last modified: ${escapeHtml(options.updatedAt)}</div>`
    : "";
  const pageTools = pageId ? renderPageTools(pageId) : "";

  return `<!doctype html>
<html lang="${escapeAttribute(config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - ${escapeHtml(siteName)}</title>
  <link rel="icon" href="/images/favicon.ico">
  <link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
  ${canonicalLink}
  <link rel="stylesheet" href="/dokuwiki.css">
  <script src="/dokuwiki.js" defer></script>
</head>
<body class="dokuwiki">
  <div id="dokuwiki__site">
    <div id="dokuwiki__top" class="site dokuwiki mode_show tpl_dokuwiki">
      <header id="dokuwiki__header">
        <div class="pad group">
        <div class="headings">
          <h1 class="logo"><a href="${startPath}"><img src="/dokuwiki-logo.png" alt=""><span>${escapeHtml(siteName)}</span></a></h1>
          <p class="claim">Cloudflare Pages DokuWiki port</p>
        </div>
        <div class="tools">
          <nav id="dokuwiki__sitetools" aria-label="Site tools">
            <h3 class="a11y">Site tools</h3>
            <form class="search" method="get" action="/search">
              <input name="q" type="search" placeholder="Search">
              <button type="submit">Search</button>
            </form>
            ${renderMobileTools(pageId)}
            <ul>
              <li><a href="/recent">Recent changes</a></li>
              <li><a href="/index?ns=wiki">Index</a></li>
              <li><a href="/diagnostics">Diagnostics</a></li>
            </ul>
          </nav>
        </div>
        ${renderHeaderBreadcrumbs(pageId, startId)}
        <hr class="a11y">
        </div>
      </header>
      <div class="wrapper group">
        <main id="dokuwiki__content">
          <div class="pad group">
            ${pageIdHtml}
            <div class="page group">
              ${body}
            </div>
            ${docInfo}
          </div>
        </main>
        ${pageTools}
      </div>
      <footer id="dokuwiki__footer">
        <div class="pad">
          <div class="license">Except where otherwise noted, content is available under the original wiki license. Template structure and styling are adapted from DokuWiki's GPL-2.0 default template. DokuWiki Pages.dev Port ${escapeHtml(appVersion)}.</div>
          <div class="buttons">
            <a href="https://validator.w3.org/check/referer" title="Valid HTML5"><img src="/images/button-html5.png" width="80" height="15" alt="Valid HTML5"></a>
            <a href="https://jigsaw.w3.org/css-validator/check/referer?profile=css3" title="Valid CSS"><img src="/images/button-css.png" width="80" height="15" alt="Valid CSS"></a>
            <a href="https://www.dokuwiki.org/" title="Driven by DokuWiki"><img src="/images/button-dw.png" width="80" height="15" alt="Driven by DokuWiki"></a>
          </div>
        </div>
      </footer>
    </div>
  </div>
</body>
</html>`;
}

function renderMobileTools(pageId?: string): string {
  const pageOptions = pageId
    ? `<option value="${pagePath(pageId)}?do=edit">Edit this page</option>
      <option value="${pagePath(pageId)}?do=source">Show source</option>
      <option value="${pagePath(pageId)}?do=revisions">Old revisions</option>
      <option value="${pagePath(pageId)}?do=backlink">Backlinks</option>`
    : "";

  return `<div class="mobileTools">
      <label class="a11y" for="mobile__tools">Tools</label>
      <select id="mobile__tools">
        <option value="">Tools</option>
        ${pageOptions}
        <option value="/recent">Recent changes</option>
        <option value="/index?ns=wiki">Index</option>
        <option value="/search">Search</option>
        <option value="/diagnostics">Diagnostics</option>
      </select>
    </div>`;
}

function renderPageTools(pageId: string): string {
  return `<nav id="dokuwiki__pagetools" aria-labelledby="dokuwiki__pagetools__heading">
    <h3 class="a11y" id="dokuwiki__pagetools__heading">Page tools</h3>
    <div class="tools">
      <ul>
        <li class="edit"><a href="${pagePath(pageId)}?do=edit"><span class="label">Edit</span><span class="icon" aria-hidden="true"></span></a></li>
        <li class="source"><a href="${pagePath(pageId)}?do=source"><span class="label">Source</span><span class="icon" aria-hidden="true"></span></a></li>
        <li class="revisions"><a href="${pagePath(pageId)}?do=revisions"><span class="label">Old revisions</span><span class="icon" aria-hidden="true"></span></a></li>
        <li class="backlink"><a href="${pagePath(pageId)}?do=backlink"><span class="label">Backlinks</span><span class="icon" aria-hidden="true"></span></a></li>
        <li class="purge"><a href="${pagePath(pageId)}?do=purge"><span class="label">Purge cache</span><span class="icon" aria-hidden="true"></span></a></li>
        <li class="top"><a href="#dokuwiki__top"><span class="label">Back to top</span><span class="icon" aria-hidden="true"></span></a></li>
      </ul>
    </div>
  </nav>`;
}

function xmlResponse(
  body: string,
  contentType = "application/xml; charset=utf-8",
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(body, {
    headers: securityHeaders({
      "content-type": contentType,
      "x-content-type-options": "nosniff",
      ...extraHeaders
    })
  });
}

function manifestResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: securityHeaders({
      "content-type": "application/manifest+json; charset=utf-8",
      "x-content-type-options": "nosniff"
    })
  });
}

async function handleSave(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const id = cleanPageId(String(form.get("id") ?? ""));
  const content = String(form.get("content") ?? "");
  const summary = String(form.get("summary") ?? "");

  if (!id) {
    return jsonResponse({ error: "Missing page id." }, { status: 400 });
  }

  const blocked = findWordblockMatch(`${content}\n${summary}`);
  if (blocked) {
    return wordblockResponse(request, env, id, content, blocked);
  }

  const result = await savePage(env.DB, {
    id,
    content,
    summary,
    baseRevisionId: String(form.get("baseRevisionId") || "") || null,
    changeType: form.get("minor") ? "minor" : undefined,
    ip: getClientIp(request)
  });

  if (!result.ok) {
    const current = await getCurrentPage(env.DB, id);
    return htmlResponse(renderConflictPage(env, id, content, current), { status: 409 });
  }

  await purgePageCache(env, id, result.page.revisionId, new URL(request.url).origin);
  await deletePageDraft(env.DB, id);

  return redirectResponse(pagePath(id));
}

async function handleRevert(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const id = cleanPageId(String(form.get("id") ?? ""));
  const revisionId = String(form.get("revisionId") ?? "");

  if (!id || !revisionId) {
    return jsonResponse({ error: "Missing page id or revision id." }, { status: 400 });
  }

  const revision = await getPageRevision(env.DB, revisionId);
  if (!revision || revision.pageId !== id) {
    return notFoundResponse(`Revision '${revisionId}' was not found.`);
  }

  const blocked = findWordblockMatch(`${revision.content}\n${String(form.get("summary") ?? "")}`);
  if (blocked) {
    return wordblockResponse(request, env, id, revision.content, blocked);
  }

  const result = await savePage(env.DB, {
    id,
    content: revision.content,
    summary: String(form.get("summary") || "") || `Reverted to ${revision.createdAt}`,
    baseRevisionId: String(form.get("baseRevisionId") || "") || null,
    changeType: "revert",
    ip: getClientIp(request)
  });

  if (!result.ok) {
    const current = await getCurrentPage(env.DB, id);
    return htmlResponse(renderConflictPage(env, id, revision.content, current), { status: 409 });
  }

  await purgePageCache(env, id, result.page.revisionId, new URL(request.url).origin);

  return redirectResponse(pagePath(id));
}

function wordblockResponse(
  request: Request,
  env: Env,
  id: string,
  content: string,
  blocked: WordblockMatch
): Response {
  if (acceptsJson(request)) {
    return jsonResponse(
      { error: WORD_BLOCK_MESSAGE, blockedText: blocked.match, pattern: blocked.pattern },
      { status: 400 }
    );
  }

  return htmlResponse(renderWordblockPage(env, id, content, blocked), { status: 400 });
}

function renderWordblockPage(
  env: Env,
  id: string,
  content: string,
  blocked: WordblockMatch
): string {
  return htmlShell(
    env,
    `Blocked edit for ${id}`,
    `<h1>Blocked edit</h1>
    <p>${escapeHtml(WORD_BLOCK_MESSAGE)}</p>
    <p><strong>Blocked text:</strong> <code>${escapeHtml(blocked.match)}</code></p>
    <form method="post" action="/api/pages">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <textarea class="edit" name="content" rows="20" cols="100">${escapeHtml(content)}</textarea>
      <div class="editBar">
        <button type="submit">Try saving again</button>
        <a href="${pagePath(id)}?do=edit">Back to editor</a>
      </div>
    </form>`,
    { pageId: id }
  );
}

async function handleSaveDraft(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const id = cleanPageId(String(form.get("id") ?? ""));

  if (!id) {
    return jsonResponse({ error: "Missing page id." }, { status: 400 });
  }

  await savePageDraft(
    env.DB,
    id,
    String(form.get("content") ?? ""),
    String(form.get("baseRevisionId") || "") || null
  );

  if (acceptsJson(request)) {
    return jsonResponse({ ok: true, id });
  }

  return redirectResponse(`${pagePath(id)}?do=edit`);
}

function acceptsJson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  const requestedWith = request.headers.get("x-requested-with") ?? "";
  return accept.includes("application/json") || requestedWith.toLowerCase() === "xmlhttprequest";
}

async function handleDeleteDraft(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const id = cleanPageId(String(form.get("id") ?? ""));

  if (!id) {
    return jsonResponse({ error: "Missing page id." }, { status: 400 });
  }

  await deletePageDraft(env.DB, id);

  return redirectResponse(`${pagePath(id)}?do=edit`);
}

function renderEditPage(
  id: string,
  page: Awaited<ReturnType<typeof getCurrentPage>>,
  draft: PageDraft | null,
  env: Env
): string {
  const title = page?.title ?? id;
  const content = draft?.content ?? page?.content ?? "";
  const baseRevisionId = draft?.baseRevisionId ?? page?.revisionId ?? "";
  const draftNotice = draft
    ? `<p><strong>Draft recovered:</strong> ${escapeHtml(draft.updatedAt)}</p>`
    : "";

  return htmlShell(
    env,
    `Edit ${title}`,
    `<h1>Edit ${escapeHtml(title)}</h1>
    ${draftNotice}
    <div class="editBox">
    <form id="dw__editform" class="edit" method="post" action="/api/pages">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <input type="hidden" name="baseRevisionId" value="${escapeHtml(baseRevisionId)}">
      <div class="toolbar group">
        <div id="tool__bar" role="toolbar" aria-label="Editor toolbar">
          <button class="toolbutton" type="button" data-wrap-before="**" data-wrap-after="**" data-placeholder="strong text" title="Bold"><strong>B</strong></button>
          <button class="toolbutton" type="button" data-wrap-before="//" data-wrap-after="//" data-placeholder="emphasized text" title="Italic"><em>I</em></button>
          <button class="toolbutton" type="button" data-line-before="====== " data-line-after=" ======" data-placeholder="Headline" title="Level 1 headline">H1</button>
          <button class="toolbutton" type="button" data-line-before="===== " data-line-after=" =====" data-placeholder="Headline" title="Level 2 headline">H2</button>
          <button class="toolbutton" type="button" data-wrap-before="[[" data-wrap-after="]]" data-placeholder="page:id|Link text" title="Internal link">Link</button>
          <button class="toolbutton" type="button" data-prefix="  * " data-placeholder="List item" title="Unordered list">UL</button>
          <button class="toolbutton" type="button" data-prefix="  - " data-placeholder="List item" title="Ordered list">OL</button>
          <button class="toolbutton" type="button" data-wrap-before="<code>" data-wrap-after="</code>" data-placeholder="code" title="Code">Code</button>
        </div>
        <div id="draft__status" aria-live="polite">Draft autosave ready.</div>
      </div>
      <textarea id="content" class="edit" name="content" rows="24" cols="100" data-preview-url="/api/pages/preview" data-draft-url="/api/pages/draft" data-autosave-delay="15000">${escapeHtml(content)}</textarea>
      <div class="editBar">
        <div class="editButtons">
          <button type="submit">Save</button>
          <button id="edbtn__preview" type="button">Preview</button>
          <button type="submit" formaction="/api/pages/draft">Save draft</button>
          <button type="submit" formaction="/api/pages/draft/delete">Delete draft</button>
        </div>
        <div class="summary">
          <label for="summary"><span>Summary</span></label>
          <input id="summary" name="summary" type="text" value="">
          <label class="minor"><input name="minor" type="checkbox" value="1"> Minor edit</label>
        </div>
      </div>
      <div id="wiki__preview" class="preview group" hidden aria-live="polite"></div>
    </form>
    </div>
  `,
    { pageId: id, updatedAt: page?.updatedAt }
  );
}

function renderConflictPage(
  env: Env,
  id: string,
  submittedContent: string,
  current: CurrentPage | null
): string {
  const currentDetails = current
    ? `<p><strong>${escapeHtml(current.title ?? id)}</strong> · ${escapeHtml(current.updatedAt)}</p>`
    : "<p>The current page could not be loaded.</p>";

  return htmlShell(
    env,
    `Edit conflict for ${id}`,
    `<h1>Edit conflict</h1>
    <p>The page changed before your edit could be saved. Copy any changes you still need, then reopen the editor from the current page.</p>
    <p><a href="${pagePath(id)}">View current page</a> · <a href="${pagePath(id)}?do=edit">Reopen editor</a></p>
    <h2>Your submitted text</h2>
    <pre><code>${escapeHtml(submittedContent)}</code></pre>
    <h2>Current revision</h2>
    ${currentDetails}`,
    { pageId: id, updatedAt: current?.updatedAt }
  );
}

function renderDraftPage(id: string, draft: PageDraft, env: Env): string {
  return htmlShell(
    env,
    `Draft for ${id}`,
    `<h1>Draft for ${escapeHtml(id)}</h1>
    <p>${escapeHtml(draft.updatedAt)}</p>
    <pre><code>${escapeHtml(draft.content)}</code></pre>
    <p><a href="${pagePath(id)}?do=edit">Recover draft</a></p>`
  );
}

async function purgePageCache(
  env: Env,
  id: string,
  revisionId: string,
  origin?: string
): Promise<void> {
  const keys = [`page:${id}`, `page:${id}:${revisionId}`];

  if (origin) {
    keys.push(...DISCOVERY_CACHE_KINDS.map((kind) => discoveryCacheKey(kind, origin)));
  }

  await Promise.all(keys.map((key) => env.RENDER_CACHE.delete(key)));
}

async function cachedXmlResponse(
  env: Env,
  kind: DiscoveryCacheKind,
  url: URL,
  contentType: string,
  render: () => Promise<string>
): Promise<Response> {
  const cacheKey = discoveryCacheKey(kind, url.origin);
  const cached = await readTextCache(env, cacheKey);
  const cacheHeaders = { "cache-control": `public, max-age=${DISCOVERY_CACHE_TTL_SECONDS}` };

  if (cached) {
    return xmlResponse(cached, contentType, cacheHeaders);
  }

  const body = await render();
  await writeTextCache(env, cacheKey, body, DISCOVERY_CACHE_TTL_SECONDS);
  return xmlResponse(body, contentType, cacheHeaders);
}

function discoveryCacheKey(kind: DiscoveryCacheKind, origin: string): string {
  return `discovery:${kind}:${origin}`;
}

async function readTextCache(env: Env, cacheKey: string): Promise<string | null> {
  try {
    return await env.RENDER_CACHE.get(cacheKey);
  } catch {
    return null;
  }
}

async function writeTextCache(
  env: Env,
  cacheKey: string,
  value: string,
  expirationTtl: number
): Promise<void> {
  try {
    await env.RENDER_CACHE.put(cacheKey, value, { expirationTtl });
  } catch {
    // Discovery documents should remain available when KV is degraded.
  }
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
      cached.rendererVersion === RENDER_CACHE_VERSION &&
      typeof cached.title === "string" &&
      typeof cached.html === "string" &&
      Array.isArray(cached.toc)
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

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function escapeHeaderValue(value: string): string {
  return value.replace(/["\r\n\\]/g, "_");
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}
