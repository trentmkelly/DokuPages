import {
  anonymousPrincipal,
  principalAuthor,
  publicPrincipal,
  type AuthPrincipal,
  type PrincipalAuthor
} from "./auth/principal";
import { resolveRequestPrincipal } from "./auth/request";
import {
  authenticateUser,
  clearSessionCookieHeader,
  createLoginSession,
  deleteLoginSession,
  readCookie,
  sessionCookieHeader
} from "./auth/session";
import { hashPassword } from "./auth/password";
import { getTurnstileConfig, verifyTurnstileForm } from "./auth/turnstile";
import { emitAuthEvent, type AuthEventName } from "./auth/events";
import {
  digestEmail,
  emailConfig,
  pageChangeEmail,
  passwordResetEmail,
  registrationNotificationEmail,
  sendWikiEmail
} from "./email";
import {
  createConfigExport,
  getRuntimeConfig,
  getRuntimeConfigEntries,
  getSecretConfigStatus,
  validateRuntimeConfig,
  type ConfigValidation,
  type RuntimeConfigEntry,
  type SecretConfigStatus
} from "./config";
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
import { D1AclStore, D1AuditLogStore } from "./storage/d1";
import {
  getPageLockStatus,
  refreshPageLock,
  releasePageLock,
  type PageLockInfo,
  type PageLockRequest
} from "./storage/page-lock-client";
import {
  cleanMediaId,
  deleteMedia,
  getCurrentMedia,
  getMediaRevision,
  listMediaRevisions,
  listNamespaceMedia,
  mediaDetailPath,
  mediaName,
  mediaNamespace,
  mediaPath,
  revertMedia,
  saveMediaUpload,
  searchMedia,
  type CurrentMedia,
  type MediaRevision
} from "./wiki/media-service";
import { validateMediaUpload } from "./wiki/media-validation";
import { cleanPageId } from "./wiki/page-id";
import {
  ACL_CREATE,
  ACL_DELETE,
  ACL_EDIT,
  ACL_NONE,
  ACL_READ,
  ACL_UPLOAD,
  hasAclPermission,
  resolveAclPermission
} from "./wiki/acl";
import {
  getCurrentPage,
  getPageDraft,
  getPageRevision,
  listAllPages,
  listBacklinks,
  listExistingPageIds,
  listNamespacePages,
  listOrphanPages,
  listPageRevisions,
  listRecentChanges,
  listWantedPages,
  pagePath,
  rebuildSearchIndex,
  savePage,
  savePageDraft,
  searchPages,
  deletePageDraft,
  type CurrentPage,
  type PageDraft,
  type PageRevision
} from "./wiki/page-service";
import { extractInternalPageLinks } from "./wiki/page-links";
import {
  extractCodeBlock,
  getWikiRenderDirectives,
  renderWikiText,
  type CacheDependency,
  type TocItem
} from "./wiki/render";
import { findWordblockMatch, WORD_BLOCK_MESSAGE, type WordblockMatch } from "./wiki/wordblock";
import { hasRequestedMediaSize, mediaDerivativeHeaders } from "./wiki/media-derivatives";
import type { AclRuleRecord, AuditLogRecord, UserRecord } from "./storage/interfaces";

type AssetFallback = () => Promise<Response>;
type ExportMode = "raw" | "xhtml" | "xhtmlbody" | "code";
type RenderCacheMode = "shared" | "private";
const RENDER_CACHE_TTL_SECONDS = 60 * 60;
const MAX_RENDER_CACHE_ENTRY_BYTES = 512 * 1024;
const DISCOVERY_CACHE_TTL_SECONDS = 5 * 60;
const RENDER_CACHE_VERSION = 27;
const MEDIA_CLEANUP_PREFIX = "media/";
const MEDIA_CLEANUP_SAMPLE_LIMIT = 25;
const PAGE_LOCK_TTL_SECONDS = 15 * 60;
const PAGE_LOCK_TOKEN_BYTES = 24;
const CSRF_COOKIE_NAME = "DW_CSRF_TOKEN";
const CSRF_TOKEN_BYTES = 32;
const CSRF_TTL_SECONDS = 60 * 60 * 24;
const LOGIN_RATE_LIMIT_ATTEMPTS = 5;
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TTL_SECONDS = 60 * 60;
const EDIT_RATE_LIMIT_ATTEMPTS = 30;
const EDIT_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const UPLOAD_RATE_LIMIT_ATTEMPTS = 20;
const UPLOAD_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const DISCOVERY_CACHE_KINDS = ["sitemap", "rss", "atom"] as const;
const EDIT_DERIVED_ACTIONS = new Set([
  "save",
  "preview",
  "draft",
  "draftdel",
  "cancel",
  "recover",
  "conflict"
]);
type DiscoveryCacheKind = (typeof DISCOVERY_CACHE_KINDS)[number];

interface RenderCacheEntry {
  rendererVersion: number;
  revisionId: string;
  title: string;
  html: string;
  toc: TocItem[];
  dependencies?: CacheDependency[];
}

export async function handleRequest(
  request: Request,
  env: Env,
  assetFallback?: AssetFallback
): Promise<Response> {
  const url = new URL(request.url);
  const principal = await resolveRequestPrincipal(request, env);

  if (url.pathname === "/") {
    return redirectResponse(pagePath(startPageId(env)), 302);
  }

  if (url.pathname === "/index.php") {
    return redirectResponse(pagePath(startPageId(env)), 301);
  }

  if (url.pathname === "/index.html") {
    return redirectResponse(pagePath(startPageId(env)), 301);
  }

  if (url.pathname === "/install.php") {
    return legacyEndpointNotAvailableResponse(request, env, "DokuWiki installer", 410);
  }

  if (url.pathname === "/doku.php") {
    if (request.method === "POST") {
      const id = cleanPageId(url.searchParams.get("id") ?? startPageId(env));
      const response = await handleWikiPostAction(request, env, url, principal, id);
      if (response) return response;
    }

    return redirectLegacyDokuPhp(request, url, env);
  }

  if (url.pathname === "/lib/exe/css.php") {
    return redirectResponse(versionedAssetPath("/dokuwiki.css", env), 301);
  }

  if (url.pathname === "/lib/exe/js.php" || url.pathname === "/lib/exe/jquery.php") {
    return redirectResponse(versionedAssetPath("/dokuwiki.js", env), 301);
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

  if (url.pathname === "/lib/exe/xmlrpc.php") {
    return remoteApiNotImplementedResponse("XML-RPC");
  }

  if (url.pathname === "/lib/exe/jsonrpc.php") {
    return remoteApiNotImplementedResponse("JSON-RPC");
  }

  if (url.pathname === "/lib/exe/openapi.php") {
    return remoteApiNotImplementedResponse("OpenAPI");
  }

  if (url.pathname === "/lib/exe/indexer.php") {
    return legacyEndpointNotAvailableResponse(request, env, "DokuWiki HTTP indexer", 501);
  }

  if (url.pathname === "/lib/exe/taskrunner.php") {
    return new Response(null, {
      status: 204,
      headers: securityHeaders({ "cache-control": "no-store" })
    });
  }

  if (url.pathname === "/lib/exe/ajax.php") {
    return handleAjax(request, env, url, principal);
  }

  if (url.pathname === "/wiki" || url.pathname === "/wiki/") {
    return redirectResponse(pagePath(startPageId(env)), 301);
  }

  if (url.pathname.startsWith("/media/")) {
    return handleMediaFetch(request, env, url, principal);
  }

  if (url.pathname.startsWith("/media-detail/")) {
    const csrf = csrfContext(request);
    const detail = await renderMediaDetailPage(request, env, url, principal, csrf.token);
    return detail instanceof Response ? detail : htmlResponseWithCsrf(request, detail, csrf);
  }

  if (url.pathname === "/media-manager") {
    const csrf = csrfContext(request);
    const manager = await renderMediaManagerPage(request, env, url, principal, csrf.token);
    return manager instanceof Response ? manager : htmlResponseWithCsrf(request, manager, csrf);
  }

  if (url.pathname === "/api/health") {
    return healthResponse(env);
  }

  if (url.pathname === "/api/diagnostics") {
    return jsonResponse(await collectDiagnostics(env));
  }

  if (url.pathname === "/api/auth/session") {
    return jsonResponse({ principal: publicPrincipal(principal) });
  }

  if (url.pathname === "/login" && request.method === "GET") {
    const csrf = csrfContext(request);
    return htmlResponseWithCsrf(
      request,
      renderLoginPage(env, url, undefined, undefined, csrf.token),
      csrf
    );
  }

  if (url.pathname === "/register" && request.method === "GET") {
    const csrf = csrfContext(request);
    return htmlResponseWithCsrf(request, renderRegisterPage(env, url, csrf.token), csrf);
  }

  if (url.pathname === "/logout" && request.method === "GET") {
    const csrf = csrfContext(request);
    return htmlResponseWithCsrf(request, renderLogoutPage(env, url, undefined, csrf.token), csrf);
  }

  if (
    (url.pathname === "/resendpwd" ||
      url.pathname === "/password-reset" ||
      url.pathname === "/password") &&
    request.method === "GET"
  ) {
    const csrf = csrfContext(request);
    const page = url.searchParams.get("token")
      ? renderPasswordResetConfirmPage(env, url, csrf.token)
      : renderPasswordResetRequestPage(env, url, csrf.token);
    return htmlResponseWithCsrf(request, page, csrf);
  }

  if (url.pathname === "/profile" && request.method === "GET") {
    const csrf = csrfContext(request);
    const page = renderProfilePage(request, env, url, principal, csrf.token);
    return page instanceof Response ? page : htmlResponseWithCsrf(request, page, csrf);
  }

  const unsupportedAccountPath = unsupportedAccountFeatureForPath(url.pathname);
  if (unsupportedAccountPath) {
    return authFeatureNotSupportedResponse(request, env, unsupportedAccountPath);
  }

  const maintenanceResponse = maintenanceWriteResponse(request, env, url);
  if (maintenanceResponse) return maintenanceResponse;

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    return handleLogin(request, env);
  }

  if (url.pathname === "/api/auth/register" && request.method === "POST") {
    return handleRegister(request, env);
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    return handleLogout(request, env, principal);
  }

  if (
    (url.pathname === "/api/auth/password-reset" ||
      url.pathname === "/api/auth/password-reset/request") &&
    request.method === "POST"
  ) {
    return handlePasswordResetRequest(request, env);
  }

  if (url.pathname === "/api/auth/password-reset/confirm" && request.method === "POST") {
    return handlePasswordResetConfirm(request, env);
  }

  if (url.pathname === "/api/auth/profile" && request.method === "POST") {
    return handleProfileUpdate(request, env, principal);
  }

  if (url.pathname === "/api/subscriptions" && request.method === "POST") {
    return handleSubscriptionUpdate(request, env, principal);
  }

  if (url.pathname === "/api/tasks/email-digests" && request.method === "POST") {
    return handleEmailDigestTask(request, env);
  }

  if ((url.pathname === "/admin" || url.pathname === "/admin/") && request.method === "GET") {
    const csrf = csrfContext(request);
    const page = renderAdminDashboardPage(request, env, principal, csrf.token);
    return page instanceof Response ? page : htmlResponseWithCsrf(request, page, csrf);
  }

  if (url.pathname === "/admin/diagnostics" || url.pathname === "/diagnostics") {
    return htmlResponse(await renderDiagnosticsPage(env));
  }

  if (url.pathname === "/admin/audit" && request.method === "GET") {
    const page = await renderAuditLogPage(request, env, principal, url);
    return page instanceof Response ? page : htmlResponse(page);
  }

  if (url.pathname === "/admin/config" && request.method === "GET") {
    const page = renderConfigAdminPage(request, env, principal);
    return page instanceof Response ? page : htmlResponse(page);
  }

  if (url.pathname === "/api/admin/config/export" && request.method === "GET") {
    return handleConfigExport(request, env, principal);
  }

  if (url.pathname === "/admin/acl" && request.method === "GET") {
    const csrf = csrfContext(request);
    const page = await renderAclAdminPage(request, env, principal, csrf.token);
    return page instanceof Response ? page : htmlResponseWithCsrf(request, page, csrf);
  }

  if (url.pathname === "/admin/users" && request.method === "GET") {
    const csrf = csrfContext(request);
    const page = await renderUserAdminPage(request, env, principal, url, csrf.token);
    return page instanceof Response ? page : htmlResponseWithCsrf(request, page, csrf);
  }

  if (url.pathname === "/admin/media-cleanup" && request.method === "GET") {
    const csrf = csrfContext(request);
    const page = await renderMediaCleanupPage(request, env, principal, url, csrf.token);
    return page instanceof Response ? page : htmlResponseWithCsrf(request, page, csrf);
  }

  if (url.pathname === "/api/admin/acl" && request.method === "POST") {
    return handleAclRuleUpsert(request, env, principal);
  }

  if (url.pathname === "/api/admin/acl/delete" && request.method === "POST") {
    return handleAclRuleDelete(request, env, principal);
  }

  if (url.pathname === "/api/admin/users" && request.method === "POST") {
    return handleUserAdminUpdate(request, env, principal);
  }

  if (url.pathname === "/api/admin/media/cleanup" && request.method === "POST") {
    return handleMediaCleanup(request, env, principal);
  }

  if (url.pathname === "/api/admin/cache/purge" && request.method === "POST") {
    return handleGlobalCachePurge(request, env, principal);
  }

  if (url.pathname === "/api/admin/search/rebuild" && request.method === "POST") {
    return handleSearchIndexRebuild(request, env, principal);
  }

  if (url.pathname === "/recent") {
    return htmlResponse(await renderRecentPage(env, url, principal));
  }

  if (url.pathname === "/search") {
    return htmlResponse(await renderSearchPage(env, url, principal));
  }

  if (url.pathname === "/index") {
    return htmlResponse(
      await renderNamespaceIndexPage(
        env,
        cleanPageId(url.searchParams.get("ns") ?? ""),
        url,
        principal
      )
    );
  }

  if (url.pathname === "/wanted") {
    return htmlResponse(await renderWantedPage(env, principal));
  }

  if (url.pathname === "/orphans") {
    return htmlResponse(await renderOrphanPage(env, principal));
  }

  if (url.pathname === "/sitemap.xml" || url.pathname === "/sitemap") {
    return cachedXmlResponse(env, "sitemap", url, "application/xml; charset=utf-8", () =>
      renderSitemap(env, url, anonymousPrincipal())
    );
  }

  if (url.pathname === "/feed.php" || url.pathname === "/feed" || url.pathname === "/feed.xml") {
    return cachedXmlResponse(env, "rss", url, "application/rss+xml; charset=utf-8", () =>
      renderRssFeed(env, url, anonymousPrincipal())
    );
  }

  if (url.pathname === "/atom.xml") {
    return cachedXmlResponse(env, "atom", url, "application/atom+xml; charset=utf-8", () =>
      renderAtomFeed(env, url, anonymousPrincipal())
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

  if (url.pathname === "/api/v1" || url.pathname.startsWith("/api/v1/")) {
    const response = await handleNativeApi(request, env, url, principal);
    return withNativeApiCors(request, env, response);
  }

  if (url.pathname === "/api/pages" && request.method === "POST") {
    return handleSave(request, env, principal);
  }

  if (url.pathname === "/api/pages/revert" && request.method === "POST") {
    return handleRevert(request, env, principal);
  }

  if (url.pathname === "/api/pages/draft" && request.method === "POST") {
    return handleSaveDraft(request, env, principal);
  }

  if (url.pathname === "/api/pages/draft/delete" && request.method === "POST") {
    return handleDeleteDraft(request, env, principal);
  }

  if (url.pathname === "/api/pages/lock" && request.method === "POST") {
    return handleRefreshPageLock(request, env, principal);
  }

  if (url.pathname === "/api/pages/lock/release" && request.method === "POST") {
    return handleReleasePageLock(request, env, principal);
  }

  if (url.pathname === "/api/media/upload" && request.method === "POST") {
    return handleMediaUpload(request, env, principal);
  }

  if (url.pathname === "/api/media/delete" && request.method === "POST") {
    return handleMediaDelete(request, env, principal);
  }

  if (url.pathname === "/api/media/revert" && request.method === "POST") {
    return handleMediaRevert(request, env, principal);
  }

  if (url.pathname === "/api/pages/preview" && request.method === "POST") {
    return handlePagePreview(request, env);
  }

  if (url.pathname.startsWith("/wiki/")) {
    const rawId = decodeURIComponent(url.pathname.slice("/wiki/".length));
    const id = cleanPageId(rawId);

    if (!id) {
      return notFoundResponse("Missing wiki page id.");
    }

    if (request.method === "POST") {
      const response = await handleWikiPostAction(request, env, url, principal, id);
      if (response) return response;
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, { status: 405 });
    }

    const canonicalPath = pagePath(id);
    if (url.pathname !== canonicalPath) {
      return redirectResponse(`${canonicalPath}${url.search}`, 301);
    }

    const action = url.searchParams.get("do")?.toLowerCase() ?? "";
    if (isActionDisabled(env, action)) {
      return disabledActionResponse(env, id, action);
    }

    if (url.searchParams.get("do") === "check") {
      const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
      if (denied) return denied;
      return htmlResponse(await renderDiagnosticsPage(env));
    }

    if (url.searchParams.get("do") === "denied") {
      return aclDeniedResponse(request, env, id, ACL_NONE, ACL_READ);
    }

    if (url.searchParams.get("do") === "locked") {
      const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
      if (denied) return denied;
      const lock = env.PAGE_LOCKS ? await getPageLockStatus(env.PAGE_LOCKS, "page", id) : null;
      return htmlResponse(renderLockedPage(env, id, lock), { status: lock ? 423 : 200 });
    }

    if (url.searchParams.get("do") === "conflict") {
      const page = await getCurrentPage(env.DB, id);
      const denied = await requireAclPermission(
        request,
        env,
        principal,
        id,
        page ? ACL_EDIT : ACL_CREATE
      );
      if (denied) return denied;
      return htmlResponse(renderConflictPage(env, id, "", page), { status: 409 });
    }

    if (url.searchParams.get("do") === "cancel") {
      return redirectResponse(pagePath(id));
    }

    if (url.searchParams.get("do") === "recover") {
      return redirectResponse(`${pagePath(id)}?do=edit`);
    }

    if (url.searchParams.get("do") === "draftdel") {
      return redirectResponse(`${pagePath(id)}?do=edit`);
    }

    if (url.searchParams.get("do") === "authtoken") {
      return authFeatureNotSupportedResponse(request, env, "auth_token");
    }

    if (url.searchParams.get("do") === "plugin") {
      return legacyActionNotAvailableResponse(env, "DokuWiki action plugin dispatch", id);
    }

    if (url.searchParams.get("do") === "media") {
      return redirectResponse(`/media-manager?ns=${encodeURIComponent(namespaceForIndex(id))}`);
    }

    if (url.searchParams.get("do") === "redirect") {
      return redirectResponse(redirectTargetForAction(id, url.searchParams.get("hid")));
    }

    if (url.searchParams.get("do") === "revisions") {
      const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
      if (denied) return denied;
      return htmlResponse(await renderRevisionsPage(env, id, url));
    }

    if (url.searchParams.get("do") === "diff") {
      const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
      if (denied) return denied;
      return htmlResponse(await renderDiffPage(env, id, url));
    }

    if (url.searchParams.get("do") === "recent") {
      return htmlResponse(await renderRecentPage(env, url, principal));
    }

    if (url.searchParams.get("do") === "search") {
      return htmlResponse(await renderSearchPage(env, url, principal));
    }

    if (url.searchParams.get("do") === "index") {
      return htmlResponse(
        await renderNamespaceIndexPage(env, namespaceForIndex(id), url, principal)
      );
    }

    if (url.searchParams.get("do") === "login") {
      const csrf = csrfContext(request);
      return htmlResponseWithCsrf(
        request,
        renderLoginPage(env, url, null, pagePath(id), csrf.token),
        csrf
      );
    }

    if (url.searchParams.get("do") === "register") {
      const csrf = csrfContext(request);
      return htmlResponseWithCsrf(request, renderRegisterPage(env, url, csrf.token), csrf);
    }

    if (url.searchParams.get("do") === "logout") {
      const csrf = csrfContext(request);
      return htmlResponseWithCsrf(
        request,
        renderLogoutPage(env, url, pagePath(id), csrf.token),
        csrf
      );
    }

    if (
      url.searchParams.get("do") === "resendpwd" ||
      url.searchParams.get("do") === "password" ||
      url.searchParams.get("do") === "password_reset"
    ) {
      const csrf = csrfContext(request);
      return htmlResponseWithCsrf(
        request,
        renderPasswordResetRequestPage(env, url, csrf.token),
        csrf
      );
    }

    if (url.searchParams.get("do") === "profile") {
      return redirectResponse("/profile", 302);
    }

    if (url.searchParams.get("do") === "subscribe") {
      const csrf = csrfContext(request);
      const page = await renderSubscriptionPage(request, env, principal, id, csrf.token);
      return page instanceof Response ? page : htmlResponseWithCsrf(request, page, csrf);
    }

    const unsupportedAccountAction = unsupportedAccountFeatureForAction(url.searchParams.get("do"));
    if (unsupportedAccountAction) {
      return authFeatureNotSupportedResponse(request, env, unsupportedAccountAction);
    }

    if (url.searchParams.get("do") === "backlink" || url.searchParams.get("do") === "backlinks") {
      const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
      if (denied) return denied;
      return htmlResponse(await renderBacklinksPage(env, id, principal));
    }

    if (url.searchParams.get("do") === "wanted") {
      return htmlResponse(await renderWantedPage(env, principal));
    }

    if (url.searchParams.get("do") === "orphan" || url.searchParams.get("do") === "orphans") {
      return htmlResponse(await renderOrphanPage(env, principal));
    }

    if (url.searchParams.get("do") === "revert") {
      const denied = await requireAclPermission(request, env, principal, id, ACL_EDIT);
      if (denied) return denied;
      const csrf = csrfContext(request);
      return htmlResponseWithCsrf(request, await renderRevertPage(env, id, url, csrf.token), csrf);
    }

    if (url.searchParams.get("do") === "purge") {
      const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
      if (denied) return denied;
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
      const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
      if (denied) return denied;
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

      return await renderPageExport(env, url, id, exportPage, exportMode);
    }

    if (revisionId) {
      const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
      if (denied) return denied;
      const revision = await getPageRevision(env.DB, revisionId);
      if (!revision || revision.pageId !== id) {
        return notFoundResponse(`Revision '${revisionId}' was not found.`);
      }
      const cacheMode = await renderCacheModeForPage(env, id);
      return htmlResponse(
        await renderPageHtml(
          env,
          revision.pageId,
          revision.content,
          revision.id,
          revision.createdAt,
          undefined,
          { cacheMode, principal }
        )
      );
    }

    const page = await getCurrentPage(env.DB, id);

    if (url.searchParams.get("do") === "edit") {
      return handleEditPage(request, env, principal, id, page);
    }

    if (url.searchParams.get("do") === "draft") {
      const denied = await requireAclPermission(
        request,
        env,
        principal,
        id,
        page ? ACL_EDIT : ACL_CREATE
      );
      if (denied) return denied;
      const draft = await getPageDraft(env.DB, id);
      if (!draft) {
        return notFoundResponse(`Draft for '${id}' was not found.`);
      }
      return htmlResponse(renderDraftPage(id, draft, env));
    }

    if (url.searchParams.get("do") === "source") {
      const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
      if (denied) return denied;
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
      const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
      if (denied) return denied;
      return htmlResponse(renderMissingPage(env, id, principal), {
        status: getRuntimeConfig(env).send404 ? 404 : 200
      });
    }

    const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
    if (denied) return denied;

    const cacheMode = await renderCacheModeForPage(env, id);
    return htmlResponse(
      await renderPageHtml(env, id, page.content, page.revisionId, undefined, page, {
        cacheMode,
        principal
      })
    );
  }

  if (assetFallback && isStaticAssetPath(url.pathname)) {
    return assetFallback();
  }

  return htmlResponse(renderRouteNotFoundPage(env, url, principal), { status: 404 });
}

function redirectLegacyDokuPhp(request: Request, url: URL, env: Env): Response {
  if (url.searchParams.get("do") === "admin") {
    return redirectLegacyAdminPage(request, env, url.searchParams.get("page"));
  }

  if (url.searchParams.get("do") === "profile") {
    return redirectResponse("/profile", 301);
  }

  if (url.searchParams.get("do") === "register") {
    return redirectResponse("/register", 301);
  }

  if (
    url.searchParams.get("do") === "resendpwd" ||
    url.searchParams.get("do") === "password" ||
    url.searchParams.get("do") === "password_reset"
  ) {
    return redirectResponse("/resendpwd", 301);
  }

  const unsupportedAccountAction = unsupportedAccountFeatureForAction(url.searchParams.get("do"));
  if (unsupportedAccountAction) {
    return authFeatureNotSupportedResponse(request, env, unsupportedAccountAction);
  }

  const id = cleanPageId(url.searchParams.get("id") ?? startPageId(env));
  const target = new URL(pagePath(id || startPageId(env)), url);
  const action = normalizeLegacyAction(url.searchParams.get("do"));
  const revisionId = url.searchParams.get("rev");
  const secondRevisionId = url.searchParams.get("rev2");
  const codeBlock = url.searchParams.get("codeblock");

  if (action) {
    target.searchParams.set("do", action);
  }

  if (revisionId) {
    target.searchParams.set("rev", revisionId);
  }

  if (secondRevisionId) {
    target.searchParams.set("rev2", secondRevisionId);
  }

  if (codeBlock && action === "export_code") {
    target.searchParams.set("codeblock", codeBlock);
  }

  return redirectResponse(`${target.pathname}${target.search}`, 301);
}

function redirectLegacyAdminPage(request: Request, env: Env, page: string | null): Response {
  switch (page) {
    case null:
    case "":
      return redirectResponse("/admin", 301);
    case "acl":
      return redirectResponse("/admin/acl", 301);
    case "config":
      return redirectResponse("/admin/config", 301);
    case "info":
      return redirectResponse("/diagnostics", 301);
    case "logviewer":
      return redirectResponse("/admin/audit", 301);
    case "usermanager":
      return redirectResponse("/admin/users", 301);
    case "extension":
      return legacyEndpointNotAvailableResponse(request, env, "DokuWiki extension manager", 501);
    case "popularity":
      return legacyEndpointNotAvailableResponse(request, env, "DokuWiki popularity plugin", 501);
    case "safefnrecode":
      return legacyEndpointNotAvailableResponse(request, env, "DokuWiki safefnrecode plugin", 501);
    case "styling":
      return legacyEndpointNotAvailableResponse(
        request,
        env,
        "DokuWiki styling plugin runtime editor",
        501
      );
    default:
      return redirectResponse("/admin", 301);
  }
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

function remoteApiNotImplementedResponse(apiName: string): Response {
  return jsonResponse(
    {
      error: `${apiName} compatibility is not supported by this Pages port yet.`,
      status: "not_implemented"
    },
    { status: 501 }
  );
}

function legacyActionNotAvailableResponse(env: Env, actionName: string, pageId: string): Response {
  return htmlResponse(
    htmlShell(
      env,
      actionName,
      `<h1>${escapeHtml(actionName)}</h1>
      <p>${escapeHtml(actionName)} is not available in this Pages port.</p>
      <p><a href="${pagePath(pageId)}">Back to ${escapeHtml(pageId)}</a></p>`,
      { pageId }
    ),
    { status: 501 }
  );
}

function isActionDisabled(env: Env, action: string): boolean {
  if (!action || action === "show") return false;
  const disabled = new Set(getRuntimeConfig(env).disabledActions);
  const normalized = action.toLowerCase();
  return disabled.has(normalized) || (disabled.has("edit") && EDIT_DERIVED_ACTIONS.has(normalized));
}

function disabledActionResponse(env: Env, pageId: string, action: string): Response {
  return htmlResponse(
    htmlShell(
      env,
      "Action disabled",
      `<h1>Action disabled</h1>
      <p>The action <code>${escapeHtml(action)}</code> has been disabled for this wiki.</p>
      <p><a href="${pagePath(pageId)}">Back to ${escapeHtml(pageId)}</a></p>`,
      { pageId }
    ),
    { status: 403 }
  );
}

async function handleWikiPostAction(
  request: Request,
  env: Env,
  url: URL,
  principal: AuthPrincipal,
  id: string
): Promise<Response | null> {
  const action = url.searchParams.get("do")?.toLowerCase() ?? "";
  if (isActionDisabled(env, action)) {
    return disabledActionResponse(env, id, action);
  }

  switch (action) {
    case "save":
      return handleSave(request, env, principal, id);
    case "preview":
      return handlePagePreview(request, env, id);
    case "draft":
      return handleSaveDraft(request, env, principal, id);
    case "draftdel":
      return handleDeleteDraft(request, env, principal, id, `${pagePath(id)}?do=edit`);
    case "cancel":
      return handleDeleteDraft(request, env, principal, id, pagePath(id));
    case "redirect":
      return handleRedirectAction(request, id);
    default:
      return null;
  }
}

async function handleRedirectAction(request: Request, id: string): Promise<Response> {
  const form = await request.formData();
  const explicitFragment = String(form.get("hid") ?? "");
  const content = String(form.get("content") ?? form.get("wikitext") ?? form.get("TEXT") ?? "");
  const fragment = explicitFragment || firstHeadingFragment(content);
  return redirectResponse(redirectTargetForAction(id, fragment));
}

function redirectTargetForAction(id: string, fragment: string | null = null): string {
  const cleaned = cleanFragment(fragment);
  return cleaned ? `${pagePath(id)}#${encodeURIComponent(cleaned)}` : pagePath(id);
}

function firstHeadingFragment(content: string): string | null {
  const match = content.match(/^\s*={2,6}\s*([^=\n]+?)\s*=*\s*$/m);
  if (!match) return null;
  return cleanPageId(match[1]).replaceAll(":", "-").replaceAll("_", "-") || null;
}

function cleanFragment(value: string | null): string | null {
  const fragment = value?.replace(/^#/, "").trim();
  if (!fragment) return null;
  return fragment.replace(/\s+/g, "-");
}

async function handlePagePreview(
  request: Request,
  env: Env,
  overrideId?: string
): Promise<Response> {
  const form = await request.formData();
  const content = String(form.get("content") ?? "");
  const pageId = cleanPageId(String(form.get("id") || overrideId || ""));
  const config = getRuntimeConfig(env);
  const entityReplacements = await entityReplacementsForRender(env);
  const smileys = await smileysForRender(env);
  const acronyms = await acronymsForRender(env);
  const interwikiTemplates = await interwikiTemplatesForRender(env);
  const linkSchemes = await linkSchemesForRender(env);
  const relNofollow = await relNofollowForRender(env, config.relNofollow);
  const linkTargets = await linkTargetsForRender(env, config.linkTargets);
  const existingPageIds = await existingPageIdsForContent(
    env,
    content,
    pageId || undefined,
    config.camelCaseLinks
  );
  const rendered = renderWikiText(content, {
    pageId: pageId || undefined,
    existingPageIds,
    entityReplacements,
    smileys,
    acronyms,
    interwikiTemplates,
    linkSchemes,
    relNofollow,
    linkTargets,
    camelCaseLinks: config.camelCaseLinks,
    typographyMode: config.typographyMode
  });

  if (acceptsJson(request) || new URL(request.url).pathname.startsWith("/api/")) {
    return jsonResponse(rendered);
  }

  return htmlResponse(
    htmlShell(
      env,
      pageId ? `Preview ${pageId}` : "Preview",
      `<h1>Preview</h1>
      <div class="preview group">${rendered.html}</div>
      ${pageId ? `<p><a href="${pagePath(pageId)}?do=edit">Back to editor</a></p>` : ""}`,
      pageId ? { pageId } : undefined
    )
  );
}

async function handleNativeApi(
  request: Request,
  env: Env,
  url: URL,
  principal: AuthPrincipal
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return nativeApiPreflightResponse(request, env);
  }

  const auth = resolveNativeApiPrincipal(request, env, principal, request.method !== "GET");
  if (auth instanceof Response) return auth;

  if (url.pathname === "/api/v1" && request.method === "GET") {
    return jsonResponse({
      ok: true,
      endpoints: [
        "/api/v1/pages",
        "/api/v1/pages/revisions",
        "/api/v1/revisions",
        "/api/v1/media",
        "/api/v1/media/revisions",
        "/api/v1/search",
        "/api/v1/users/me"
      ]
    });
  }

  if (url.pathname === "/api/v1/pages") {
    if (request.method === "GET") return handleNativeApiPageRead(request, env, url, auth);
    if (request.method === "POST") return handleNativeApiPageWrite(request, env, auth);
    return nativeApiMethodNotAllowed("GET, POST");
  }

  if (url.pathname === "/api/v1/pages/revisions") {
    if (request.method === "GET") return handleNativeApiPageRevisions(request, env, url, auth);
    return nativeApiMethodNotAllowed("GET");
  }

  if (url.pathname === "/api/v1/pages/revert") {
    if (request.method === "POST") return handleNativeApiPageRevert(request, env, auth);
    return nativeApiMethodNotAllowed("POST");
  }

  if (url.pathname === "/api/v1/revisions") {
    if (request.method === "GET") return handleNativeApiRevisionRead(request, env, url, auth);
    return nativeApiMethodNotAllowed("GET");
  }

  if (url.pathname === "/api/v1/media") {
    if (request.method === "GET") return handleNativeApiMediaRead(request, env, url, auth);
    if (request.method === "POST") return handleNativeApiMediaUpload(request, env, auth);
    if (request.method === "DELETE") return handleNativeApiMediaDelete(request, env, url, auth);
    return nativeApiMethodNotAllowed("GET, POST, DELETE");
  }

  if (url.pathname === "/api/v1/media/revisions") {
    if (request.method === "GET") return handleNativeApiMediaRevisions(request, env, url, auth);
    return nativeApiMethodNotAllowed("GET");
  }

  if (url.pathname === "/api/v1/media/revert") {
    if (request.method === "POST") return handleNativeApiMediaRevert(request, env, auth);
    return nativeApiMethodNotAllowed("POST");
  }

  if (url.pathname === "/api/v1/search") {
    if (request.method === "GET") return handleNativeApiSearch(env, url, auth);
    return nativeApiMethodNotAllowed("GET");
  }

  if (url.pathname === "/api/v1/users/me") {
    if (request.method === "GET") {
      return jsonResponse({ ok: true, principal: publicPrincipal(auth) });
    }
    return nativeApiMethodNotAllowed("GET");
  }

  return jsonResponse({ error: "API endpoint not found." }, { status: 404 });
}

async function handleNativeApiPageRead(
  request: Request,
  env: Env,
  url: URL,
  principal: AuthPrincipal
): Promise<Response> {
  const id = cleanPageId(url.searchParams.get("id") ?? "");

  if (!id) {
    return jsonResponse({ error: "Missing page id." }, { status: 400 });
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
  if (denied) return denied;

  const page = await getCurrentPage(env.DB, id);
  if (!page) {
    return jsonResponse({ error: `Page '${id}' was not found.` }, { status: 404 });
  }

  return jsonResponse({ ok: true, page: nativePagePayload(page) });
}

async function handleNativeApiPageRevisions(
  request: Request,
  env: Env,
  url: URL,
  principal: AuthPrincipal
): Promise<Response> {
  const id = cleanPageId(url.searchParams.get("id") ?? "");

  if (!id) {
    return jsonResponse({ error: "Missing page id." }, { status: 400 });
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
  if (denied) return denied;

  const revisions = await listPageRevisions(
    env.DB,
    id,
    numericSearchParam(url, "limit", 50),
    numericSearchParam(url, "offset", 0)
  );

  return jsonResponse({ ok: true, revisions: revisions.map(nativePageRevisionPayload) });
}

async function handleNativeApiRevisionRead(
  request: Request,
  env: Env,
  url: URL,
  principal: AuthPrincipal
): Promise<Response> {
  const revisionId = url.searchParams.get("id") ?? "";
  const revision = revisionId ? await getPageRevision(env.DB, revisionId) : null;

  if (!revision) {
    return jsonResponse({ error: "Revision was not found." }, { status: 404 });
  }

  const denied = await requireAclPermission(request, env, principal, revision.pageId, ACL_READ);
  if (denied) return denied;

  return jsonResponse({ ok: true, revision: nativePageRevisionPayload(revision) });
}

async function handleNativeApiPageWrite(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const id = cleanPageId(String(body.value.id ?? ""));
  const content = String(body.value.content ?? "");
  const summary = String(body.value.summary ?? "");

  if (!id) {
    return jsonResponse({ error: "Missing page id." }, { status: 400 });
  }

  const currentPage = await getCurrentPage(env.DB, id);
  const denied = await requireAclPermission(
    request,
    env,
    principal,
    id,
    currentPage ? ACL_EDIT : ACL_CREATE
  );
  if (denied) return denied;

  const rateLimited = await editRateLimitResponse(request, env, principal);
  if (rateLimited) return rateLimited;

  await recordEditAttempt(request, env, principal);

  const blocked = findWordblockMatch(`${content}\n${summary}`);
  if (blocked) {
    return jsonResponse(
      { error: WORD_BLOCK_MESSAGE, blockedPattern: blocked.pattern },
      { status: 400 }
    );
  }

  const author = principalAuthor(principal);
  const result = await savePage(env.DB, {
    id,
    content,
    summary,
    baseRevisionId: stringOrNull(body.value.baseRevisionId),
    changeType: body.value.minor ? "minor" : undefined,
    authorId: author.authorId,
    authorName: author.authorName,
    ip: getClientIp(request)
  });

  if (!result.ok) {
    return jsonResponse(
      { error: "Page conflict.", currentRevisionId: result.currentRevisionId },
      { status: 409 }
    );
  }

  await purgePageCache(env, id, result.page.revisionId, new URL(request.url).origin);
  await deletePageDraft(env.DB, id);

  return jsonResponse(
    { ok: true, changeType: result.changeType, page: nativePagePayload(result.page) },
    { status: result.changeType === "create" ? 201 : 200 }
  );
}

async function handleNativeApiPageRevert(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const id = cleanPageId(String(body.value.id ?? ""));
  const revisionId = String(body.value.revisionId ?? "");

  if (!id || !revisionId) {
    return jsonResponse({ error: "Missing page id or revision id." }, { status: 400 });
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_EDIT);
  if (denied) return denied;

  const revision = await getPageRevision(env.DB, revisionId);
  if (!revision || revision.pageId !== id) {
    return jsonResponse({ error: `Revision '${revisionId}' was not found.` }, { status: 404 });
  }

  const author = principalAuthor(principal);
  const result = await savePage(env.DB, {
    id,
    content: revision.content,
    summary: String(body.value.summary || "") || `Reverted to ${revision.createdAt}`,
    baseRevisionId: stringOrNull(body.value.baseRevisionId),
    changeType: "revert",
    authorId: author.authorId,
    authorName: author.authorName,
    ip: getClientIp(request)
  });

  if (!result.ok) {
    return jsonResponse(
      { error: "Page conflict.", currentRevisionId: result.currentRevisionId },
      { status: 409 }
    );
  }

  await purgePageCache(env, id, result.page.revisionId, new URL(request.url).origin);

  return jsonResponse({ ok: true, changeType: "revert", page: nativePagePayload(result.page) });
}

async function handleNativeApiMediaRead(
  request: Request,
  env: Env,
  url: URL,
  principal: AuthPrincipal
): Promise<Response> {
  const id = cleanMediaId(url.searchParams.get("id") ?? "");

  if (!id) {
    return jsonResponse({ error: "Missing media id." }, { status: 400 });
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
  if (denied) return denied;

  const media = await getCurrentMedia(env.DB, id);
  if (!media) {
    return jsonResponse({ error: `Media '${id}' was not found.` }, { status: 404 });
  }

  return jsonResponse({ ok: true, media: nativeMediaPayload(media) });
}

async function handleNativeApiMediaRevisions(
  request: Request,
  env: Env,
  url: URL,
  principal: AuthPrincipal
): Promise<Response> {
  const id = cleanMediaId(url.searchParams.get("id") ?? "");

  if (!id) {
    return jsonResponse({ error: "Missing media id." }, { status: 400 });
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
  if (denied) return denied;

  const revisions = await listMediaRevisions(
    env.DB,
    id,
    numericSearchParam(url, "limit", 50),
    url.searchParams.get("cursor") ?? undefined
  );

  return jsonResponse({ ok: true, revisions: revisions.map(nativeMediaRevisionPayload) });
}

async function handleNativeApiMediaUpload(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const startedAt = Date.now();
  if (!env.MEDIA_BUCKET) {
    return jsonResponse({ error: "Media bucket is not configured." }, { status: 503 });
  }

  const form = await request.formData();
  const file = form.get("file");

  if (!isUploadFile(file)) {
    return jsonResponse({ error: "Missing upload file." }, { status: 400 });
  }

  const namespace = cleanMediaId(String(form.get("ns") ?? ""));
  const requestedId = cleanMediaId(String(form.get("id") ?? ""));
  const id = requestedId || cleanMediaId([namespace, file.name].filter(Boolean).join(":"));

  if (!id) {
    return jsonResponse({ error: "Missing media id." }, { status: 400 });
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_UPLOAD);
  if (denied) return denied;

  const rateLimited = await uploadRateLimitResponse(request, env, principal);
  if (rateLimited) return rateLimited;

  await recordUploadAttempt(request, env, principal);

  const mediaBody = await file.arrayBuffer();
  const validation = validateMediaUpload({
    id,
    body: mediaBody,
    mimeType: file.type || null
  });

  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, { status: 400 });
  }

  const author = principalAuthor(principal);
  const result = await saveMediaUpload(env.DB, env.MEDIA_BUCKET, {
    id,
    body: mediaBody,
    mimeType: file.type || null,
    summary: String(form.get("summary") ?? ""),
    overwrite: Boolean(form.get("overwrite")),
    authorId: author.authorId,
    authorName: author.authorName,
    ip: getClientIp(request)
  });

  if (!result.ok) {
    return jsonResponse({ error: `Media '${id}' already exists.` }, { status: 409 });
  }

  await purgeDependentRenderCache(env, "media", id);

  logMetric("media_metric", {
    operation: "upload",
    namespace: mediaNamespace(id) || null,
    changeType: result.changeType,
    byteLength: result.media.byteLength,
    durationMs: elapsedSince(startedAt)
  });

  return jsonResponse(
    {
      ok: true,
      changeType: result.changeType,
      media: nativeMediaPayload(result.media),
      revision: nativeMediaRevisionPayload(result.revision)
    },
    { status: result.changeType === "create" ? 201 : 200 }
  );
}

async function handleNativeApiMediaDelete(
  request: Request,
  env: Env,
  url: URL,
  principal: AuthPrincipal
): Promise<Response> {
  const body = await readOptionalJsonObject(request);
  if (!body.ok) return body.response;

  const id = cleanMediaId(String(body.value.id ?? url.searchParams.get("id") ?? ""));

  if (!id) {
    return jsonResponse({ error: "Missing media id." }, { status: 400 });
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_DELETE);
  if (denied) return denied;

  const author = principalAuthor(principal);
  const result = await deleteMedia(env.DB, {
    id,
    summary: String(body.value.summary ?? ""),
    authorId: author.authorId,
    authorName: author.authorName,
    ip: getClientIp(request)
  });

  if (!result.ok) {
    return jsonResponse({ error: `Media '${id}' was not found.` }, { status: 404 });
  }

  await purgeDependentRenderCache(env, "media", id);

  return jsonResponse({ ok: true, id, revision: nativeMediaRevisionPayload(result.revision) });
}

async function handleNativeApiMediaRevert(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const id = cleanMediaId(String(body.value.id ?? ""));
  const revisionId = String(body.value.revisionId ?? "");

  if (!id || !revisionId) {
    return jsonResponse({ error: "Missing media id or revision id." }, { status: 400 });
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_UPLOAD);
  if (denied) return denied;

  const author = principalAuthor(principal);
  const result = await revertMedia(env.DB, {
    id,
    revisionId,
    summary: String(body.value.summary ?? ""),
    authorId: author.authorId,
    authorName: author.authorName,
    ip: getClientIp(request)
  });

  if (!result.ok) {
    return jsonResponse(
      {
        error:
          result.reason === "delete_revision"
            ? `Media revision '${revisionId}' is a delete revision and cannot be restored.`
            : `Media revision '${revisionId}' was not found.`
      },
      { status: result.reason === "delete_revision" ? 400 : 404 }
    );
  }

  await purgeDependentRenderCache(env, "media", id);

  return jsonResponse({
    ok: true,
    media: nativeMediaPayload(result.media),
    revision: nativeMediaRevisionPayload(result.revision)
  });
}

async function handleNativeApiSearch(
  env: Env,
  url: URL,
  principal: AuthPrincipal
): Promise<Response> {
  const query = url.searchParams.get("q")?.trim() ?? "";
  const namespace = cleanPageId(url.searchParams.get("ns") ?? "");
  const limit = numericSearchParam(url, "limit", 25);
  const results = query
    ? await filterReadablePageItems(
        env,
        principal,
        await searchPages(env.DB, query, namespace, limit)
      )
    : [];

  return jsonResponse({ ok: true, query, results });
}

function resolveNativeApiPrincipal(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  requireBearer: boolean
): AuthPrincipal | Response {
  const authorization = request.headers.get("authorization");

  if (authorization) {
    const token = bearerToken(authorization);
    const expected = env.API_BEARER_TOKEN?.trim();

    if (!token || !expected || !constantTimeEqual(token, expected)) {
      return nativeApiUnauthorized("Invalid bearer token.");
    }

    return apiTokenPrincipal();
  }

  if (requireBearer) {
    return nativeApiUnauthorized("Bearer token is required for write API requests.");
  }

  if (principal.isAuthenticated) {
    return principal;
  }

  return nativeApiUnauthorized("API authentication is required.");
}

function apiTokenPrincipal(): AuthPrincipal {
  return {
    type: "user",
    isAuthenticated: true,
    id: "api-token",
    username: "api-token",
    displayName: "API token",
    email: null,
    groups: ["admin", "user"]
  };
}

function bearerToken(authorization: string): string | null {
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function nativeApiUnauthorized(message: string): Response {
  return jsonResponse(
    { error: message },
    {
      status: 401,
      headers: {
        "www-authenticate": 'Bearer realm="DokuWiki Pages API"'
      }
    }
  );
}

function nativeApiMethodNotAllowed(allow: string): Response {
  return jsonResponse(
    { error: "Method not allowed." },
    {
      status: 405,
      headers: {
        allow
      }
    }
  );
}

function nativeApiPreflightResponse(request: Request, env: Env): Response {
  const origin = request.headers.get("origin");

  if (origin && !allowedNativeApiCorsOrigin(env, origin)) {
    return jsonResponse({ error: "CORS origin is not allowed." }, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: securityHeaders({
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "86400"
    })
  });
}

function withNativeApiCors(request: Request, env: Env, response: Response): Response {
  const origin = request.headers.get("origin");
  response.headers.append("vary", "Origin");

  if (!origin) return response;

  const allowedOrigin = allowedNativeApiCorsOrigin(env, origin);
  if (!allowedOrigin) return response;

  response.headers.set("access-control-allow-origin", allowedOrigin);
  if (allowedOrigin !== "*") {
    response.headers.set("access-control-allow-credentials", "true");
  }

  return response;
}

function allowedNativeApiCorsOrigin(env: Env, origin: string): string | null {
  const origins = (env.API_CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (origins.includes("*")) return "*";
  return origins.includes(origin) ? origin : null;
}

async function readJsonObject(
  request: Request
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        ok: false,
        response: jsonResponse({ error: "Expected a JSON object." }, { status: 400 })
      };
    }
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: "Invalid JSON body." }, { status: 400 })
    };
  }
}

async function readOptionalJsonObject(
  request: Request
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  if (!request.body) return { ok: true, value: {} };
  return readJsonObject(request);
}

function nativePagePayload(page: CurrentPage): Record<string, unknown> {
  return {
    id: page.id,
    title: page.title,
    revisionId: page.revisionId,
    content: page.content,
    updatedAt: page.updatedAt,
    url: pagePath(page.id)
  };
}

function nativePageRevisionPayload(revision: PageRevision): Record<string, unknown> {
  return {
    id: revision.id,
    pageId: revision.pageId,
    content: revision.content,
    summary: revision.summary,
    changeType: revision.changeType,
    sizeChange: revision.sizeChange,
    createdAt: revision.createdAt
  };
}

function nativeMediaPayload(media: CurrentMedia): Record<string, unknown> {
  return {
    id: media.id,
    namespace: media.namespace,
    mimeType: media.mimeType,
    byteLength: media.byteLength,
    contentHash: media.contentHash,
    currentRevisionId: media.currentRevisionId,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
    url: mediaPath(media.id),
    detailUrl: mediaDetailPath(media.id)
  };
}

function nativeMediaRevisionPayload(revision: MediaRevision): Record<string, unknown> {
  return {
    id: revision.id,
    mediaId: revision.mediaId,
    mimeType: revision.mimeType,
    byteLength: revision.byteLength,
    contentHash: revision.contentHash,
    changeType: revision.changeType,
    summary: revision.summary,
    createdAt: revision.createdAt,
    url: `${mediaPath(revision.mediaId)}?rev=${encodeURIComponent(revision.id)}`
  };
}

function numericSearchParam(url: URL, name: string, fallback: number): number {
  const value = Number(url.searchParams.get(name));
  return Number.isFinite(value) ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  const normalized = String(value ?? "");
  return normalized || null;
}

function legacyEndpointNotAvailableResponse(
  request: Request,
  env: Env,
  endpointName: string,
  status: 410 | 501
): Response {
  const body = {
    error: `${endpointName} is not available in this Pages port.`,
    status: "not_available"
  };

  if (acceptsJson(request)) {
    return jsonResponse(body, { status });
  }

  return htmlResponse(
    htmlShell(
      env,
      endpointName,
      `<h1>${escapeHtml(endpointName)}</h1>
      <p>${escapeHtml(body.error)}</p>
      <p><a href="${pagePath(startPageId(env))}">Go to the start page</a></p>`
    ),
    { status }
  );
}

async function handleAjax(
  request: Request,
  env: Env,
  url: URL,
  principal: AuthPrincipal
): Promise<Response> {
  const params = await readAjaxParams(request, url);
  const call = params.get("call")?.toLowerCase() ?? "";
  const startedAt = Date.now();

  if (call === "qsearch") {
    const query = params.get("q")?.trim() ?? "";
    if (!query) return ajaxHtmlResponse("");

    const results = await filterReadablePageItems(
      env,
      principal,
      await searchPages(env.DB, query, "", 50)
    );
    const items = results
      .map(
        (page) =>
          `<li><a href="${pagePath(page.id)}" class="wikilink1">${escapeHtml(pageLabel(page))}</a></li>`
      )
      .join("");

    logMetric("search_metric", {
      surface: "ajax_qsearch",
      queryLength: query.length,
      resultCount: results.length,
      durationMs: elapsedSince(startedAt)
    });

    return ajaxHtmlResponse(items ? `<strong>Quick hits</strong><ul>${items}</ul>` : "");
  }

  if (call === "suggestions") {
    const query = cleanPageId(params.get("q") ?? "");
    if (!query) {
      return new Response(JSON.stringify([query, [], [], []]), {
        headers: securityHeaders({ "content-type": "application/x-suggestions+json" })
      });
    }

    const results = await filterReadablePageItems(
      env,
      principal,
      await searchPages(env.DB, query, "", 15)
    );
    const names = [...new Set(results.map((page) => pageName(page.id)))].sort((a, b) =>
      a.localeCompare(b)
    );

    logMetric("search_metric", {
      surface: "ajax_suggestions",
      queryLength: query.length,
      resultCount: names.length,
      durationMs: elapsedSince(startedAt)
    });

    return new Response(JSON.stringify([query, names, [], []]), {
      headers: securityHeaders({ "content-type": "application/x-suggestions+json" })
    });
  }

  if (call === "linkwiz") {
    const query = cleanPageId(params.get("q") ?? "");
    const namespace = query.includes(":") ? query.slice(0, query.lastIndexOf(":")) : "";

    if (query) {
      const results = await filterReadablePageItems(
        env,
        principal,
        await searchPages(env.DB, query, namespace, 50)
      );
      logMetric("search_metric", {
        surface: "ajax_linkwiz",
        namespace: namespace || null,
        queryLength: query.length,
        resultCount: results.length,
        durationMs: elapsedSince(startedAt)
      });
      return ajaxHtmlResponse(renderAjaxPageList(results));
    }

    const pages = await filterReadablePageItems(
      env,
      principal,
      await listNamespacePages(env.DB, namespace, 50)
    );
    logMetric("search_metric", {
      surface: "ajax_linkwiz",
      namespace: namespace || null,
      queryLength: 0,
      resultCount: pages.length,
      durationMs: elapsedSince(startedAt)
    });
    return ajaxHtmlResponse(renderAjaxPageList(pages));
  }

  if (call === "index") {
    const namespace = cleanPageId(params.get("idx") ?? params.get("ns") ?? "");
    const pages = await filterReadablePageItems(
      env,
      principal,
      await listNamespacePages(env.DB, namespace, 200)
    );
    return ajaxHtmlResponse(
      `<ul class="idx">${pages.map((page) => `<li>${ajaxPageLink(page)}</li>`).join("")}</ul>`
    );
  }

  return new Response(`AJAX call '${escapeHtml(call)}' unknown.\n`, {
    status: 400,
    headers: securityHeaders({ "content-type": "text/plain; charset=utf-8" })
  });
}

async function readAjaxParams(request: Request, url: URL): Promise<URLSearchParams> {
  const params = new URLSearchParams(url.search);

  if (request.method === "POST") {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") params.set(key, value);
    }
  }

  return params;
}

function renderAjaxPageList<T extends { id: string; title?: string | null }>(pages: T[]): string {
  if (pages.length === 0) return "Nothing found.";

  return pages
    .map(
      (page, index) =>
        `<div class="${index % 2 === 0 ? "even" : "odd"} type_f">${ajaxPageLink(page)}${
          page.title ? `<span>${escapeHtml(page.title)}</span>` : ""
        }</div>`
    )
    .join("");
}

function ajaxPageLink(page: { id: string; title?: string | null }): string {
  return `<a href="${pagePath(page.id)}" title="${escapeAttribute(page.id)}" class="wikilink1">${escapeHtml(
    pageLabel(page)
  )}</a>`;
}

function pageLabel(page: { id: string; title?: string | null }): string {
  return page.title || pageName(page.id);
}

function pageName(id: string): string {
  return id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
}

function ajaxHtmlResponse(body: string): Response {
  return new Response(body, {
    headers: securityHeaders({ "content-type": "text/html; charset=utf-8" })
  });
}

async function handleMediaFetch(
  request: Request,
  env: Env,
  url: URL,
  principal: AuthPrincipal
): Promise<Response> {
  const startedAt = Date.now();
  const id = mediaIdFromPath(url, "/media/");

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  if (!id) {
    return notFoundResponse("Missing media id.");
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
  if (denied) return denied;

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

  const headers = mediaFetchHeaders(url, media, Boolean(revisionId));

  if (url.searchParams.get("download") === "1") {
    headers.set(
      "content-disposition",
      `attachment; filename="${escapeHeaderValue(mediaName(id))}"`
    );
  }

  if (isMediaNotModified(request, media)) {
    headers.delete("content-length");
    logMediaFetchMetric(startedAt, id, media, Boolean(revisionId), {
      delivery: "not_modified",
      r2Operations: 0
    });
    return new Response(null, { status: 304, headers });
  }

  if (request.method === "HEAD") {
    const object = await env.MEDIA_BUCKET.head(media.objectKey);

    if (!object) {
      return notFoundResponse(`Media object '${media.objectKey}' was not found.`);
    }

    logMediaFetchMetric(startedAt, id, media, Boolean(revisionId), {
      delivery: "headers",
      r2Operations: 1
    });
    return new Response(null, { headers });
  }

  const object = await env.MEDIA_BUCKET.get(media.objectKey);

  if (!object) {
    return notFoundResponse(`Media object '${media.objectKey}' was not found.`);
  }

  logMediaFetchMetric(startedAt, id, media, Boolean(revisionId), {
    delivery: "body",
    r2Operations: 1
  });

  return new Response(object.body, { headers });
}

function mediaFetchHeaders(
  url: URL,
  media: CurrentMedia | MediaRevision,
  revision: boolean
): Headers {
  const headers = securityHeaders();
  headers.set("content-type", media.mimeType);
  headers.set("content-length", String(media.byteLength));
  headers.set("etag", mediaEtag(media));
  headers.set("last-modified", new Date(getMediaTimestamp(media)).toUTCString());
  headers.set("x-content-type-options", "nosniff");
  headers.set(
    "cache-control",
    revision ? "public, max-age=31536000, immutable" : "public, max-age=3600"
  );

  for (const [name, value] of Object.entries(
    mediaDerivativeHeaders(media, hasRequestedMediaSize(url))
  )) {
    headers.set(name, value);
  }

  return headers;
}

function isMediaNotModified(request: Request, media: CurrentMedia | MediaRevision): boolean {
  const ifNoneMatch = request.headers.get("if-none-match");

  if (ifNoneMatch) {
    return matchesMediaEtag(ifNoneMatch, mediaEtag(media));
  }

  const ifModifiedSince = request.headers.get("if-modified-since");
  if (!ifModifiedSince) return false;

  const since = Date.parse(ifModifiedSince);
  if (Number.isNaN(since)) return false;

  const modified = new Date(getMediaTimestamp(media)).getTime();
  return Math.floor(modified / 1000) <= Math.floor(since / 1000);
}

function matchesMediaEtag(header: string, etag: string): boolean {
  return header
    .split(",")
    .map((value) => value.trim())
    .some((value) => {
      if (value === "*") return true;
      return stripWeakEtagPrefix(value) === stripWeakEtagPrefix(etag);
    });
}

function stripWeakEtagPrefix(value: string): string {
  return value.startsWith("W/") ? value.slice(2) : value;
}

function mediaEtag(media: CurrentMedia | MediaRevision): string {
  return `"${media.contentHash}"`;
}

function logMediaFetchMetric(
  startedAt: number,
  id: string,
  media: CurrentMedia | MediaRevision,
  revision: boolean,
  details: { delivery: "body" | "headers" | "not_modified"; r2Operations: number }
): void {
  logMetric("media_metric", {
    operation: "fetch",
    namespace: mediaNamespace(id) || null,
    revision,
    mimeType: media.mimeType,
    byteLength: media.byteLength,
    ...details,
    durationMs: elapsedSince(startedAt)
  });
}

async function renderMediaDetailPage(
  request: Request,
  env: Env,
  url: URL,
  principal: AuthPrincipal,
  csrfToken: string
): Promise<string | Response> {
  const id = mediaIdFromPath(url, "/media-detail/");
  const media = id ? await getCurrentMedia(env.DB, id) : null;

  if (!id || !media) {
    return htmlShell(env, "Media not found", "<p>Media not found.</p>", { principal });
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_READ);
  if (denied) return denied;

  const preview = media.mimeType.startsWith("image/")
    ? `<p><a href="${mediaPath(id)}"><img class="media" src="${mediaPath(id)}" alt="${escapeAttribute(mediaName(id))}" loading="lazy" decoding="async"></a></p>`
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
          <dt>Current revision</dt><dd><code>${escapeHtml(media.currentRevisionId ?? "")}</code></dd>
          <dt>Hash</dt><dd><code>${escapeHtml(media.contentHash)}</code></dd>
        </dl>
      </div>
      <form class="media__revert" method="post" action="/api/media/revert">
        ${csrfInput(csrfToken)}
        <input type="hidden" name="id" value="${escapeAttribute(id)}">
        <label for="media__revert_revision">Revision ID</label>
        <input id="media__revert_revision" name="revisionId" type="text" required>
        <label for="media__revert_summary">Revert summary</label>
        <input id="media__revert_summary" name="summary" type="text">
        <button type="submit">Revert media</button>
      </form>
      <form class="media__delete" method="post" action="/api/media/delete">
        ${csrfInput(csrfToken)}
        <input type="hidden" name="id" value="${escapeAttribute(id)}">
        <label for="media__delete_summary">Delete summary</label>
        <input id="media__delete_summary" name="summary" type="text">
        <button type="submit">Delete media</button>
      </form>
    </div>`,
    { principal }
  );
}

async function renderMediaManagerPage(
  request: Request,
  env: Env,
  url: URL,
  principal: AuthPrincipal,
  csrfToken: string
): Promise<string | Response> {
  const startedAt = Date.now();
  const namespace = cleanMediaId(url.searchParams.get("ns") ?? "");
  const denied = await requireAclPermission(
    request,
    env,
    principal,
    namespace ? `${namespace}:*` : "*",
    ACL_READ
  );
  if (denied) return denied;

  const query = (url.searchParams.get("q") ?? "").trim();
  const pagination = paginationFromUrl(url, { defaultLimit: 200, maxLimit: 500 });
  const media = query
    ? await searchMedia(env.DB, namespace, query, pagination.limit, pagination.offset)
    : await listNamespaceMedia(env.DB, namespace, pagination.limit, pagination.offset);
  const aclRules = await listAclRules(env);
  const namespaces = (await listMediaNamespaces(env.DB)).filter((item) =>
    canListNamespace(env, aclRules, principal, item)
  );
  const canUpload = hasAclPermission(
    resolveAclPermission(aclRules, namespace ? `${namespace}:*` : "*", principal),
    ACL_UPLOAD
  );
  logMetric("media_metric", {
    operation: query ? "manager_search" : "manager_list",
    namespace: namespace || null,
    queryLength: query.length,
    resultCount: media.length,
    durationMs: elapsedSince(startedAt)
  });
  const namespaceTitle = namespace ? namespace : "root";
  const mediaItems =
    media.length === 0
      ? `<p class="media-manager__empty">No media found.</p>`
      : `<ul class="idx media__manager media-grid">${media.map(renderMediaManagerItem).join("")}</ul>`;
  const uploadPanel = canUpload
    ? `<form id="media__upload" class="media-manager__upload" method="post" action="/api/media/upload" enctype="multipart/form-data">
        ${csrfInput(csrfToken)}
        <input type="hidden" name="ns" value="${escapeAttribute(namespace)}">
        <div class="media-manager__form-grid">
          <label for="media__file">File</label>
          <input id="media__file" name="file" type="file" required>
          <label for="media__id">Media ID</label>
          <input id="media__id" name="id" type="text" placeholder="${escapeAttribute(namespace ? `${namespace}:example.png` : "example.png")}">
          <label for="media__summary">Summary</label>
          <input id="media__summary" name="summary" type="text">
        </div>
        <div class="media-manager__form-actions">
          <label class="media-manager__check" for="media__overwrite">
            <input id="media__overwrite" name="overwrite" type="checkbox" value="1">
            Overwrite existing media
          </label>
          <button type="submit">Upload</button>
        </div>
      </form>`
    : `<section id="media__upload" class="media-manager__upload media-manager__upload--disabled">
        <p>Upload access is not available for this namespace.</p>
      </section>`;

  return htmlShell(
    env,
    `Media manager ${namespace}`,
    `<div id="media__manager" class="media-manager">
      <h1>Media manager</h1>
      <div class="media-manager__layout">
        <aside id="mediamgr__aside" class="media-manager__aside">
          <div class="media-manager__side-tab">Namespaces</div>
          <div class="media-manager__side-head">Choose namespace</div>
          ${renderMediaNamespaceTree(namespaces, namespace)}
        </aside>
        <section id="mediamgr__content" class="media-manager__content">
          <nav class="media-manager__tabs" aria-label="Media manager sections">
            <a class="media-manager__tab media-manager__tab--active" href="#media__files">Media Files</a>
            <a class="media-manager__tab" href="#media__upload">Upload</a>
            <a class="media-manager__tab" href="#media__search">Search</a>
          </nav>
          <section id="media__files" class="media-manager__files">
            <div class="media-manager__toolbar">
              <div class="media-manager__crumb">Files in <strong>${escapeHtml(namespaceTitle)}</strong></div>
              <div class="media-manager__view" aria-label="Media view">
                <span class="media-manager__view-active">Thumbnails</span>
                <span>Rows</span>
                <span>Name</span>
                <span>Date</span>
              </div>
            </div>
            ${query ? `<p class="media-manager__query">Search results for <strong>${escapeHtml(query)}</strong></p>` : ""}
            ${mediaItems}
            ${renderPaginationControls(url, pagination, media.length)}
          </section>
          <section id="media__search" class="media-manager__search-panel">
            <form class="media-manager__search" method="get" action="/media-manager">
              <label for="media__ns">Namespace</label>
              <input id="media__ns" name="ns" type="search" value="${escapeAttribute(namespace)}">
              <label for="media__q">Search</label>
              <input id="media__q" name="q" type="search" value="${escapeAttribute(query)}">
              <button type="submit">Search</button>
            </form>
          </section>
          ${uploadPanel}
        </section>
      </div>
    </div>`,
    { principal }
  );
}

async function listMediaNamespaces(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare(
      `select distinct namespace
       from media
       where is_deleted = 0
       order by namespace asc`
    )
    .all<{ namespace: string }>();
  const namespaces = result.results.map((row) => cleanMediaId(row.namespace ?? ""));
  return [...new Set(["", ...namespaces])];
}

function renderMediaNamespaceTree(namespaces: string[], activeNamespace: string): string {
  const entries = collectMediaNamespaceEntries(namespaces, activeNamespace);
  const items = entries
    .map((namespace) => {
      const label = namespace ? namespace.slice(namespace.lastIndexOf(":") + 1) : "[root]";
      const depth = Math.min(namespace ? namespace.split(":").length - 1 : 0, 6);
      const activeClass = namespace === activeNamespace ? " media-tree__item--active" : "";
      const indent = '<span class="media-tree__indent" aria-hidden="true"></span>'.repeat(depth);
      return `<li class="media-tree__item media-tree__item--depth-${depth}${activeClass}">
        ${indent}<span class="media-tree__toggle" aria-hidden="true">${namespace ? "+" : ""}</span>
        <a href="${escapeAttribute(mediaManagerNamespacePath(namespace))}">${escapeHtml(label)}</a>
      </li>`;
    })
    .join("");

  return `<ul class="media-tree">${items}</ul>`;
}

function collectMediaNamespaceEntries(namespaces: string[], activeNamespace: string): string[] {
  const entries = new Set<string>(["", activeNamespace]);

  for (const namespace of namespaces) {
    const parts = namespace.split(":").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}:${part}` : part;
      entries.add(current);
    }
  }

  return [...entries].sort((a, b) => {
    if (a === b) return 0;
    if (a === "") return -1;
    if (b === "") return 1;
    return a.localeCompare(b);
  });
}

function mediaManagerNamespacePath(namespace: string): string {
  return namespace ? `/media-manager?ns=${encodeURIComponent(namespace)}` : "/media-manager";
}

function renderMediaManagerItem(item: CurrentMedia): string {
  const name = mediaName(item.id);
  const detailPath = mediaDetailPath(item.id);
  const preview = isPreviewableImage(item)
    ? `<a class="media-tile__thumb" href="${escapeAttribute(detailPath)}"><img src="${escapeAttribute(mediaPath(item.id))}" alt="${escapeAttribute(name)}" loading="lazy" decoding="async"></a>`
    : `<a class="media-tile__thumb media-tile__thumb--file" href="${escapeAttribute(detailPath)}"><span>${escapeHtml(mediaFileExtension(name))}</span></a>`;

  return `<li class="media-tile">
    ${preview}
    <a class="media-tile__name" href="${escapeAttribute(detailPath)}" title="${escapeAttribute(item.id)}">${escapeHtml(name)}</a>
    <span class="media-tile__meta">${escapeHtml(item.mimeType)}</span>
    <span class="media-tile__meta">${escapeHtml(formatMediaDate(item.updatedAt))}</span>
    <span class="media-tile__meta">${escapeHtml(formatMediaByteLength(item.byteLength))}</span>
  </li>`;
}

function isPreviewableImage(item: CurrentMedia): boolean {
  return item.mimeType.startsWith("image/");
}

function mediaFileExtension(name: string): string {
  const index = name.lastIndexOf(".");
  if (index <= 0 || index === name.length - 1) return "FILE";
  return name.slice(index + 1, index + 7).toUpperCase();
}

function formatMediaDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function formatMediaByteLength(byteLength: number): string {
  if (byteLength < 1024) {
    return `${byteLength.toLocaleString("en-US")} bytes`;
  }

  const units = ["KB", "MB", "GB"];
  let value = byteLength / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
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
    case "check":
    case "denied":
    case "locked":
    case "conflict":
    case "cancel":
    case "recover":
    case "draftdel":
    case "authtoken":
    case "plugin":
    case "media":
    case "save":
    case "preview":
    case "redirect":
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
    case "login":
    case "logout":
    case "subscribe":
    case "export_raw":
    case "export_code":
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
    case "export_code":
      return "code";
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

function displayPageTitle(
  config: ReturnType<typeof getRuntimeConfig>,
  headingTitle: string | null,
  storedTitle: string | null | undefined,
  fallback: string
): string {
  if (config.useHeading) {
    return headingTitle ?? storedTitle ?? fallback;
  }

  return storedTitle ?? headingTitle ?? fallback;
}

function usesDefaultRenderControls(config: ReturnType<typeof getRuntimeConfig>): boolean {
  return (
    !config.useHeading &&
    config.topTocLevel === 1 &&
    config.tocMinHeads === 3 &&
    config.maxTocLevel === 3 &&
    config.maxSectionEditLevel === 3 &&
    !config.camelCaseLinks &&
    config.typographyMode === 1
  );
}

async function renderPageHtml(
  env: Env,
  id: string,
  content: string,
  revisionId: string,
  revisionDate?: string,
  page?: CurrentPage,
  options: { cacheMode?: RenderCacheMode; principal?: AuthPrincipal } = {}
): Promise<string> {
  const startedAt = Date.now();
  const cacheKey = revisionDate ? `page:${id}:${revisionId}` : `page:${id}`;
  const privateCache = options.cacheMode === "private";
  const directives = getWikiRenderDirectives(content);
  const config = getRuntimeConfig(env);
  const sectionEdit = !isActionDisabled(env, "edit");
  const cacheableRenderControls = sectionEdit && usesDefaultRenderControls(config);
  const revisionNotice = revisionDate
    ? `<p><strong>Old revision:</strong> ${escapeHtml(revisionDate)}</p>`
    : "";
  const cached =
    directives.noCache || privateCache || !cacheableRenderControls
      ? null
      : await readRenderCache(env, cacheKey, revisionId);

  if (directives.noCache) {
    logMetric("cache_metric", {
      cache: "rendered_page",
      action: "bypass",
      reason: "directive",
      cacheKey,
      durationMs: elapsedSince(startedAt)
    });
  }

  if (privateCache) {
    logMetric("cache_metric", {
      cache: "rendered_page",
      action: "bypass",
      reason: "private_acl",
      cacheKey,
      durationMs: elapsedSince(startedAt)
    });
  }

  if (cached) {
    logMetric("cache_metric", {
      cache: "rendered_page",
      action: "hit",
      cacheKey,
      durationMs: elapsedSince(startedAt)
    });
    return htmlShell(
      env,
      cached.title,
      `${renderBreadcrumbs(id)}${renderToc(cached.toc, config.tocMinHeads)}${revisionNotice}${cached.html}`,
      { pageId: id, principal: options.principal, updatedAt: revisionDate ?? page?.updatedAt }
    );
  }

  if (!directives.noCache && !privateCache) {
    logMetric("cache_metric", {
      cache: "rendered_page",
      action: "miss",
      cacheKey,
      durationMs: elapsedSince(startedAt)
    });
  }

  const existingPageIds = await existingPageIdsForContent(env, content, id, config.camelCaseLinks);
  const entityReplacements = await entityReplacementsForRender(env);
  const smileys = await smileysForRender(env);
  const acronyms = await acronymsForRender(env);
  const interwikiTemplates = await interwikiTemplatesForRender(env);
  const linkSchemes = await linkSchemesForRender(env);
  const relNofollow = await relNofollowForRender(env, config.relNofollow);
  const linkTargets = await linkTargetsForRender(env, config.linkTargets);
  const rendered = renderWikiText(content, {
    pageId: id,
    directives,
    existingPageIds,
    entityReplacements,
    smileys,
    acronyms,
    interwikiTemplates,
    linkSchemes,
    relNofollow,
    linkTargets,
    sectionEdit,
    topTocLevel: config.topTocLevel,
    maxTocLevel: config.maxTocLevel,
    maxSectionEditLevel: config.maxSectionEditLevel,
    camelCaseLinks: config.camelCaseLinks,
    typographyMode: config.typographyMode
  });
  const title = displayPageTitle(config, rendered.title, page?.title, id);

  if (!rendered.noCache && !privateCache && cacheableRenderControls) {
    await writeRenderCache(env, cacheKey, {
      rendererVersion: RENDER_CACHE_VERSION,
      revisionId,
      title,
      html: rendered.html,
      toc: rendered.toc,
      dependencies: rendered.dependencies
    });
    logMetric("cache_metric", {
      cache: "rendered_page",
      action: "write",
      cacheKey,
      durationMs: elapsedSince(startedAt)
    });
  }

  return htmlShell(
    env,
    title,
    `${renderBreadcrumbs(id)}${renderToc(rendered.toc, config.tocMinHeads)}${revisionNotice}${rendered.html}`,
    { pageId: id, principal: options.principal, updatedAt: revisionDate ?? page?.updatedAt }
  );
}

async function renderPageExport(
  env: Env,
  url: URL,
  id: string,
  page: CurrentPage | PageRevision,
  mode: ExportMode
): Promise<Response> {
  const content = page.content;
  const revisionId = "revisionId" in page ? page.revisionId : page.id;
  const config = getRuntimeConfig(env);
  const headers = securityHeaders({ "x-robots-tag": "noindex" });

  if (mode === "raw") {
    headers.set("content-type", "text/plain; charset=utf-8");
    headers.set("content-disposition", `attachment; filename=${exportFileName(id)}.txt`);
    return new Response(content, { headers });
  }

  if (mode === "code") {
    return renderCodeBlockExport(url, content, headers);
  }

  const existingPageIds = await existingPageIdsForContent(env, content, id, config.camelCaseLinks);
  const entityReplacements = await entityReplacementsForRender(env);
  const smileys = await smileysForRender(env);
  const acronyms = await acronymsForRender(env);
  const interwikiTemplates = await interwikiTemplatesForRender(env);
  const linkSchemes = await linkSchemesForRender(env);
  const relNofollow = await relNofollowForRender(env, config.relNofollow);
  const linkTargets = await linkTargetsForRender(env, config.linkTargets);
  const rendered = renderWikiText(content, {
    pageId: id,
    existingPageIds,
    entityReplacements,
    smileys,
    acronyms,
    interwikiTemplates,
    linkSchemes,
    relNofollow,
    linkTargets,
    topTocLevel: config.topTocLevel,
    maxTocLevel: config.maxTocLevel,
    maxSectionEditLevel: config.maxSectionEditLevel,
    camelCaseLinks: config.camelCaseLinks,
    typographyMode: config.typographyMode
  });
  const title = displayPageTitle(config, rendered.title, "title" in page ? page.title : null, id);
  const language = config.language;

  headers.set("content-type", "text/html; charset=utf-8");

  if (mode === "xhtmlbody") {
    return new Response(rendered.html, { headers });
  }

  const revisionComment = revisionId ? `<!-- revision: ${escapeHtml(revisionId)} -->\n` : "";
  const stylesheetUrl = new URL(versionedAssetPath("/dokuwiki.css", env), url);
  const stylesheetPath = `${stylesheetUrl.pathname}${stylesheetUrl.search}`;

  return new Response(
    `<!DOCTYPE html>
<html lang="${escapeAttribute(language)}">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${escapeAttribute(stylesheetPath)}">
</head>
<body>
<div class="dokuwiki export">
${revisionComment}${renderToc(rendered.toc, config.tocMinHeads)}
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

function renderCodeBlockExport(url: URL, content: string, headers: Headers): Response {
  const requestedIndex = url.searchParams.get("codeblock") ?? "0";
  const block = extractCodeBlock(content, Number(requestedIndex));

  if (!block) {
    return notFoundResponse(`Code block '${requestedIndex}' was not found.`);
  }

  const filename = sanitizedCodeBlockFilename(block.filename, block.language);

  headers.set("content-type", "text/plain; charset=utf-8");
  headers.set("content-disposition", `attachment; filename=${filename}`);

  return new Response(block.text.replace(/^[\r\n]+|[\r\n]+$/g, ""), { headers });
}

function sanitizedCodeBlockFilename(filename: string | null, language: string | null): string {
  const fallback = `snippet.${language || "txt"}`;
  const baseName = (filename || fallback).split(/[\\/]/).filter(Boolean).at(-1) || fallback;
  return baseName.replace(/[^A-Za-z0-9._-]+/g, "_") || fallback;
}

async function entityReplacementsForRender(
  env: Env
): Promise<Array<readonly [string, string]> | undefined> {
  const result = await env.DB.prepare(
    `select value_json
     from metadata
     where subject_type = ?
       and subject_id = ?`
  )
    .bind("config", "entities")
    .all<{ value_json: string }>();
  const entries = result.results
    .map((row) => parseEntityMetadata(row.value_json))
    .filter((entry): entry is { token: string; replacement: string; order: number } =>
      Boolean(entry)
    )
    .sort((a, b) => a.order - b.order || b.token.length - a.token.length);

  return entries.length > 0
    ? entries.map((entry) => [entry.token, entry.replacement] as const)
    : undefined;
}

async function smileysForRender(env: Env): Promise<Record<string, string> | undefined> {
  const result = await env.DB.prepare(
    `select value_json
     from metadata
     where subject_type = ?
       and subject_id = ?`
  )
    .bind("config", "smileys")
    .all<{ value_json: string }>();
  const entries = result.results
    .map((row) => parseSmileyMetadata(row.value_json))
    .filter((entry): entry is { token: string; filename: string } => Boolean(entry));

  return entries.length > 0
    ? Object.fromEntries(entries.map((entry) => [entry.token, entry.filename]))
    : undefined;
}

async function acronymsForRender(env: Env): Promise<Record<string, string> | undefined> {
  const result = await env.DB.prepare(
    `select value_json
     from metadata
     where subject_type = ?
       and subject_id = ?`
  )
    .bind("config", "acronyms")
    .all<{ value_json: string }>();
  const entries = result.results
    .map((row) => parseAcronymMetadata(row.value_json))
    .filter((entry): entry is { acronym: string; title: string } => Boolean(entry));

  return entries.length > 0
    ? Object.fromEntries(entries.map((entry) => [entry.acronym, entry.title]))
    : undefined;
}

async function interwikiTemplatesForRender(env: Env): Promise<Record<string, string> | undefined> {
  const result = await env.DB.prepare(
    `select value_json
     from metadata
     where subject_type = ?
       and subject_id = ?`
  )
    .bind("config", "interwiki")
    .all<{ value_json: string }>();
  const entries = result.results
    .map((row) => parseInterwikiMetadata(row.value_json))
    .filter((entry): entry is { shortcut: string; template: string } => Boolean(entry));

  return entries.length > 0
    ? Object.fromEntries(entries.map((entry) => [entry.shortcut, entry.template]))
    : undefined;
}

async function linkSchemesForRender(env: Env): Promise<string[] | undefined> {
  const result = await env.DB.prepare(
    `select value_json
     from metadata
     where subject_type = ?
       and subject_id = ?`
  )
    .bind("config", "scheme")
    .all<{ value_json: string }>();
  const entries = result.results
    .map((row) => parseSchemeMetadata(row.value_json))
    .filter((entry): entry is { protocol: string } => Boolean(entry))
    .map((entry) => entry.protocol);

  return entries.length > 0 ? entries : undefined;
}

async function relNofollowForRender(env: Env, fallback: boolean): Promise<boolean> {
  const imported = await importedDokuWikiBooleanConfig(env, "relnofollow");
  return imported ?? fallback;
}

async function linkTargetsForRender(
  env: Env,
  fallback: ReturnType<typeof getRuntimeConfig>["linkTargets"]
): Promise<ReturnType<typeof getRuntimeConfig>["linkTargets"]> {
  const wiki = await importedDokuWikiStringConfig(env, "target.wiki");
  const interwiki = await importedDokuWikiStringConfig(env, "target.interwiki");
  const extern = await importedDokuWikiStringConfig(env, "target.extern");
  const media = await importedDokuWikiStringConfig(env, "target.media");
  const windows = await importedDokuWikiStringConfig(env, "target.windows");

  return {
    wiki: wiki !== undefined ? wiki : fallback.wiki,
    interwiki: interwiki !== undefined ? interwiki : fallback.interwiki,
    extern: extern !== undefined ? extern : fallback.extern,
    media: media !== undefined ? media : fallback.media,
    windows: windows !== undefined ? windows : fallback.windows
  };
}

async function importedDokuWikiBooleanConfig(env: Env, key: string): Promise<boolean | null> {
  const result = await env.DB.prepare(
    `select key, value_json
     from metadata
     where subject_type = ?
       and subject_id = ?`
  )
    .bind("config", "dokuwiki")
    .all<{ key: string; value_json: string }>();
  const row = result.results.find((entry) => entry.key === `conf:${key}`);
  if (!row) return null;

  return parseDokuWikiBooleanConfigMetadata(row.value_json);
}

async function importedDokuWikiStringConfig(
  env: Env,
  key: string
): Promise<string | null | undefined> {
  const result = await env.DB.prepare(
    `select key, value_json
     from metadata
     where subject_type = ?
       and subject_id = ?`
  )
    .bind("config", "dokuwiki")
    .all<{ key: string; value_json: string }>();
  const row = result.results.find((entry) => entry.key === `conf:${key}`);
  if (!row) return undefined;

  return parseDokuWikiStringConfigMetadata(row.value_json);
}

function parseEntityMetadata(
  value: string
): { token: string; replacement: string; order: number } | null {
  try {
    const parsed = JSON.parse(value) as {
      token?: unknown;
      replacement?: unknown;
      order?: unknown;
    };

    if (typeof parsed.token !== "string" || typeof parsed.replacement !== "string") return null;

    return {
      token: parsed.token,
      replacement: parsed.replacement,
      order: typeof parsed.order === "number" ? parsed.order : Number.MAX_SAFE_INTEGER
    };
  } catch {
    return null;
  }
}

function parseSmileyMetadata(value: string): { token: string; filename: string } | null {
  try {
    const parsed = JSON.parse(value) as { token?: unknown; filename?: unknown };
    if (typeof parsed.token !== "string" || typeof parsed.filename !== "string") return null;
    return { token: parsed.token, filename: parsed.filename };
  } catch {
    return null;
  }
}

function parseAcronymMetadata(value: string): { acronym: string; title: string } | null {
  try {
    const parsed = JSON.parse(value) as { acronym?: unknown; title?: unknown };
    if (typeof parsed.acronym !== "string" || typeof parsed.title !== "string") return null;
    return { acronym: parsed.acronym, title: parsed.title };
  } catch {
    return null;
  }
}

function parseInterwikiMetadata(value: string): { shortcut: string; template: string } | null {
  try {
    const parsed = JSON.parse(value) as { shortcut?: unknown; template?: unknown };
    if (typeof parsed.shortcut !== "string" || typeof parsed.template !== "string") return null;
    return { shortcut: parsed.shortcut.toLowerCase(), template: parsed.template };
  } catch {
    return null;
  }
}

function parseSchemeMetadata(value: string): { protocol: string } | null {
  try {
    const parsed = JSON.parse(value) as { protocol?: unknown };
    if (typeof parsed.protocol !== "string") return null;
    return { protocol: parsed.protocol.toLowerCase() };
  } catch {
    return null;
  }
}

function parseDokuWikiBooleanConfigMetadata(value: string): boolean | null {
  try {
    const parsed = JSON.parse(value) as { value?: unknown };
    if (typeof parsed.value === "boolean") return parsed.value;
    if (typeof parsed.value === "number") return parsed.value !== 0;
    if (typeof parsed.value === "string") {
      const normalized = parsed.value.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(normalized)) return true;
      if (["0", "false", "no", "off", ""].includes(normalized)) return false;
    }
    return null;
  } catch {
    return null;
  }
}

function parseDokuWikiStringConfigMetadata(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as { value?: unknown };
    if (typeof parsed.value !== "string") return null;
    return parsed.value.trim() || null;
  } catch {
    return null;
  }
}

async function existingPageIdsForContent(
  env: Env,
  content: string,
  sourcePageId?: string,
  camelCaseLinks = false
): Promise<Set<string>> {
  const sourceId = sourcePageId ? cleanPageId(sourcePageId) : "";
  const linkedPageIds = extractInternalPageLinks(content, sourceId || undefined, {
    camelCaseLinks
  });
  const existingPageIds = await listExistingPageIds(
    env.DB,
    sourceId ? [...linkedPageIds, sourceId] : linkedPageIds
  );

  if (sourceId) {
    existingPageIds.add(sourceId);
  }

  return existingPageIds;
}

function versionedAssetPath(assetPath: string, env: Env): string {
  return `${assetPath}?v=${encodeURIComponent(staticAssetVersion(env))}`;
}

function staticAssetVersion(env: Env): string {
  const appVersion = getRuntimeConfig(env).appVersion;
  const commitSha = env.CF_PAGES_COMMIT_SHA?.trim();

  return commitSha ? `${appVersion}-${commitSha.slice(0, 12)}` : appVersion;
}

function renderMissingPage(env: Env, id: string, principal?: AuthPrincipal): string {
  return htmlShell(
    env,
    id,
    `${renderBreadcrumbs(id)}
    <h1 id="${escapeAttribute(slugForPageHeading(id))}">${escapeHtml(id)}</h1>
    <p>This topic does not exist yet.</p>
    <p>
      <a class="action create" href="${pagePath(id)}?do=edit" rel="nofollow" title="Create this page">Create this page</a>
      <span class="sep"> · </span>
      <a href="/search?q=${encodeURIComponent(id)}">Search for this page title</a>
    </p>`,
    { pageId: id, principal }
  );
}

function renderRouteNotFoundPage(env: Env, url: URL, principal: AuthPrincipal): string {
  const startId = startPageId(env);
  const startPath = pagePath(startId);
  const requestedPath = `${url.pathname}${url.search}`;

  return htmlShell(
    env,
    "Not found",
    `<h1 id="not-found">Not found</h1>
    <p>The requested path <code>${escapeHtml(requestedPath)}</code> was not found.</p>
    <p>
      <a href="${startPath}">Go to the start page</a>
      <span class="sep"> · </span>
      <a href="/search?q=${encodeURIComponent(requestedPath)}">Search the wiki</a>
    </p>`,
    { principal }
  );
}

function isStaticAssetPath(pathname: string): boolean {
  return (
    pathname === "/dokuwiki.css" ||
    pathname === "/dokuwiki.js" ||
    pathname === "/dokuwiki-logo.png" ||
    pathname.startsWith("/images/")
  );
}

function slugForPageHeading(id: string): string {
  return id.replaceAll(":", "-").replaceAll("_", "-") || "page";
}

async function resolvePageTemplate(db: D1Database, id: string): Promise<string | null> {
  for (const templateId of pageTemplateCandidates(id)) {
    const template = await getCurrentPage(db, templateId);
    if (template) {
      return applyPageTemplate(template.content, id);
    }
  }

  return null;
}

function pageTemplateCandidates(id: string): string[] {
  const segments = cleanPageId(id).split(":").filter(Boolean);
  const namespaceSegments = segments.slice(0, -1);
  const candidates: string[] = [];

  if (namespaceSegments.length > 0) {
    candidates.push([...namespaceSegments, "_template"].join(":"));
  }

  for (let length = namespaceSegments.length; length >= 0; length -= 1) {
    const namespace = namespaceSegments.slice(0, length);
    candidates.push([...namespace, "__template"].filter(Boolean).join(":"));
  }

  return [...new Set(candidates)];
}

function applyPageTemplate(template: string, id: string): string {
  const pageId = cleanPageId(id);
  const segments = pageId.split(":").filter(Boolean);
  const page = segments.at(-1) ?? pageId;
  const namespace = segments.slice(0, -1).join(":");
  const pageLabel = page.replace(/[_-]+/g, " ");
  const title = titleCase(pageLabel);

  return template
    .replaceAll("@ID@", pageId)
    .replaceAll("@NS@", namespace)
    .replaceAll("@PAGE@", page)
    .replaceAll("@!PAGE@", capitalize(pageLabel))
    .replaceAll("@!!PAGE@", pageLabel.toUpperCase())
    .replaceAll("@!PAGE!@", title);
}

function titleCase(value: string): string {
  return value.split(/\s+/).filter(Boolean).map(capitalize).join(" ");
}

function capitalize(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
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

function renderToc(toc: TocItem[], minimumHeadings = 2): string {
  if (toc.length < minimumHeadings) return "";

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

async function renderRevertPage(
  env: Env,
  id: string,
  url: URL,
  csrfToken: string
): Promise<string> {
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
      ${csrfInput(csrfToken)}
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

async function renderRecentPage(env: Env, url: URL, principal: AuthPrincipal): Promise<string> {
  const pagination = paginationFromUrl(url, { defaultLimit: 50, maxLimit: 100 });
  const changes = await filterReadableChanges(
    env,
    principal,
    await listRecentChanges(env.DB, pagination.limit, pagination.offset)
  );
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
    `<h1>Recent changes</h1><ul>${items}</ul>${renderPaginationControls(url, pagination, changes.length)}`,
    { principal }
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

function renderAdminDashboardPage(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  csrfToken: string
): string | Response {
  if (!isManagerPrincipal(principal)) {
    return managerDeniedResponse(request, env);
  }

  const aclTool = isAdminPrincipal(principal)
    ? `<li><a href="/admin/acl">Access control list manager</a></li>`
    : "";
  const userTool = isAdminPrincipal(principal)
    ? `<li><a href="/admin/users">User manager</a></li>`
    : "";
  const configTool = isAdminPrincipal(principal)
    ? `<li><a href="/admin/config">Configuration manager</a></li>`
    : "";
  const mediaCleanupTool = isAdminPrincipal(principal)
    ? `<li><a href="/admin/media-cleanup">Media cleanup</a></li>`
    : "";
  const adminActions = isAdminPrincipal(principal)
    ? `<form method="post" action="/api/admin/search/rebuild">
        ${csrfInput(csrfToken)}
        <button type="submit">Rebuild search index</button>
      </form>
      <form method="post" action="/api/admin/cache/purge">
        ${csrfInput(csrfToken)}
        <button type="submit">Purge render cache</button>
      </form>`
    : "";

  return htmlShell(
    env,
    "Administration",
    `<h1>Administration</h1>
      <ul class="admin__tools">
        <li><a href="/admin/diagnostics">Diagnostics</a></li>
        ${isAdminPrincipal(principal) ? '<li><a href="/admin/audit">Audit log</a></li>' : ""}
        ${aclTool}
        ${userTool}
        ${configTool}
        ${mediaCleanupTool}
        <li><a href="/media-manager">Media manager</a></li>
      </ul>
      ${adminActions}`,
    { principal }
  );
}

function renderConfigAdminPage(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): string | Response {
  if (!isAdminPrincipal(principal)) {
    return adminDeniedResponse(request, env);
  }

  const validation = validateRuntimeConfig(env);
  const variables = getRuntimeConfigEntries(env);
  const secrets = getSecretConfigStatus(env);

  return htmlShell(
    env,
    "Configuration Manager",
    `<h1>Configuration manager</h1>
    <p class="info">Runtime configuration is read-only inside Pages Functions. Edit variables and secrets through Cloudflare Pages or Wrangler, then redeploy.</p>
    <p><a href="/api/admin/config/export">Download configuration backup</a></p>
    <h2>Validation</h2>
    ${renderConfigValidation(validation)}
    <h2>Runtime variables</h2>
    ${renderConfigEntryTable(variables)}
    <h2>Secrets</h2>
    ${renderSecretConfigTable(secrets)}`,
    { principal }
  );
}

function handleConfigExport(request: Request, env: Env, principal: AuthPrincipal): Response {
  if (!isAdminPrincipal(principal)) {
    return adminDeniedResponse(request, env);
  }

  const exported = createConfigExport(env);
  const date = exported.exportedAt.slice(0, 10);
  return jsonResponse(exported, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="dokuwiki-pages-config-${date}.json"`
    }
  });
}

function renderConfigEntryTable(entries: RuntimeConfigEntry[]): string {
  const rows = entries
    .map(
      (entry) => `<tr>
        <td><code>${escapeHtml(entry.key)}</code></td>
        <td>${entry.effectiveValue === null ? "-" : `<code>${escapeHtml(entry.effectiveValue)}</code>`}</td>
        <td>${entry.value === null ? "-" : `<code>${escapeHtml(entry.value)}</code>`}</td>
        <td>${escapeHtml(entry.source)}</td>
      </tr>`
    )
    .join("");

  return `<table class="diagnostics config__entries">
    <thead><tr><th>Key</th><th>Effective value</th><th>Configured value</th><th>Source</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderSecretConfigTable(secrets: SecretConfigStatus[]): string {
  const rows = secrets
    .map(
      (secret) => `<tr>
        <td><code>${escapeHtml(secret.key)}</code></td>
        <td>${secret.configured ? "configured" : "not configured"}</td>
        <td>${secret.redactedValue ? `<code>${escapeHtml(secret.redactedValue)}</code>` : "-"}</td>
        <td>${escapeHtml(secret.purpose)}</td>
      </tr>`
    )
    .join("");

  return `<table class="diagnostics config__secrets">
    <thead><tr><th>Key</th><th>Status</th><th>Value</th><th>Purpose</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function renderAuditLogPage(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  url: URL
): Promise<string | Response> {
  if (!isAdminPrincipal(principal)) {
    return adminDeniedResponse(request, env);
  }

  const pagination = paginationFromUrl(url, { defaultLimit: 100, maxLimit: 200 });
  const entries = await new D1AuditLogStore(env.DB).listEntries(
    pagination.limit,
    pagination.offset
  );
  const rows = entries.map(renderAuditLogRow).join("");

  return htmlShell(
    env,
    "Audit Log",
    `<h1>Audit log</h1>
    <table class="inline audit__log">
      <thead>
        <tr><th>Created</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5">No audit entries recorded.</td></tr>'}</tbody>
    </table>
    ${renderPaginationControls(url, pagination, entries.length)}`,
    { principal }
  );
}

function renderAuditLogRow(entry: AuditLogRecord): string {
  const actor = entry.details.actorUsername
    ? `${String(entry.details.actorUsername)} (${entry.actorId ?? "unknown"})`
    : (entry.actorId ?? "unknown");
  const target = entry.targetId ? `${entry.targetType}: ${entry.targetId}` : entry.targetType;

  return `<tr>
    <td>${escapeHtml(entry.createdAt)}</td>
    <td>${escapeHtml(actor)}</td>
    <td><code>${escapeHtml(entry.action)}</code></td>
    <td>${escapeHtml(target)}</td>
    <td><code>${escapeHtml(JSON.stringify(entry.details))}</code></td>
  </tr>`;
}

async function renderAclAdminPage(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  csrfToken: string
): Promise<string | Response> {
  if (!isAdminPrincipal(principal)) {
    return adminDeniedResponse(request, env);
  }

  const rules = await listAclRules(env);
  const rows = rules.map((rule) => renderAclRuleRow(rule, csrfToken)).join("");

  return htmlShell(
    env,
    "ACL Manager",
    `<h1>Access control list manager</h1>
    <table class="inline acl__rules">
      <thead>
        <tr><th>Scope</th><th>Principal</th><th>Permission</th><th>Action</th></tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="4">No ACL rules configured.</td></tr>'}</tbody>
    </table>
    <form class="acl__editor" method="post" action="/api/admin/acl">
      ${csrfInput(csrfToken)}
      <fieldset>
        <legend>Add or update ACL rule</legend>
        <label for="acl__scope">Scope</label>
        <input id="acl__scope" name="scope" type="text" value="*" required>
        <label for="acl__principal_type">Principal type</label>
        <select id="acl__principal_type" name="principalType">
          <option value="all">All users</option>
          <option value="group">Group</option>
          <option value="user">User</option>
        </select>
        <label for="acl__principal">Principal</label>
        <input id="acl__principal" name="principal" type="text" value="@ALL" required>
        <label for="acl__permission">Permission</label>
        <select id="acl__permission" name="permission">
          ${renderAclPermissionOptions(ACL_READ)}
        </select>
        <button type="submit">Save ACL rule</button>
      </fieldset>
    </form>`,
    { principal }
  );
}

function renderAclRuleRow(rule: AclRuleRecord, csrfToken: string): string {
  return `<tr>
    <td><code>${escapeHtml(rule.scope)}</code></td>
    <td>${escapeHtml(rule.principalType)} <code>${escapeHtml(rule.principal)}</code></td>
    <td>${rule.permission}</td>
    <td>
      <form method="post" action="/api/admin/acl/delete">
        ${csrfInput(csrfToken)}
        <input type="hidden" name="id" value="${escapeAttribute(rule.id)}">
        <button type="submit">Delete</button>
      </form>
    </td>
  </tr>`;
}

interface ManagedUser extends UserRecord {
  groups: string[];
}

interface ManagedUserUpdate {
  id: string;
  displayName: string;
  email: string | null;
  isDisabled: boolean;
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  is_disabled: number;
  created_at: string;
  updated_at: string;
}

interface UserGroupRow {
  user_id: string;
  group_name: string | null;
}

async function renderUserAdminPage(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  url: URL,
  csrfToken: string
): Promise<string | Response> {
  if (!isAdminPrincipal(principal)) {
    return adminDeniedResponse(request, env);
  }

  const pagination = paginationFromUrl(url, { defaultLimit: 50, maxLimit: 200 });
  const users = await listManagedUsers(env.DB, pagination.limit, pagination.offset);
  const rows = users.map((user) => renderManagedUserRow(user, csrfToken, principal)).join("");

  return htmlShell(
    env,
    "User Manager",
    `<h1>User manager</h1>
    <table class="inline user__manager">
      <thead>
        <tr>
          <th>Username</th>
          <th>Display name</th>
          <th>Email</th>
          <th>Groups</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="6">No users configured.</td></tr>'}</tbody>
    </table>
    ${renderPaginationControls(url, pagination, users.length)}`,
    { principal }
  );
}

interface MediaCleanupObject {
  key: string;
  size: number;
}

interface MediaCleanupResult {
  prefix: string;
  referencedObjectCount: number;
  scannedObjectCount: number;
  unreferencedObjectCount: number;
  deletedObjectCount: number;
  unreferencedObjects: MediaCleanupObject[];
  sampleLimit: number;
  truncated: boolean;
  dryRun: boolean;
}

async function renderMediaCleanupPage(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  url: URL,
  csrfToken: string
): Promise<string | Response> {
  if (!isAdminPrincipal(principal)) {
    return adminDeniedResponse(request, env);
  }

  if (!env.MEDIA_BUCKET) {
    return mediaCleanupUnavailableResponse(request, env);
  }

  const scanned = url.searchParams.get("scan") === "1";
  const deletedCount = Number(url.searchParams.get("deleted") ?? 0);
  const deletedNotice =
    Number.isFinite(deletedCount) && deletedCount > 0
      ? `<p class="info">Deleted ${deletedCount.toLocaleString("en-US")} unreferenced media object${deletedCount === 1 ? "" : "s"}.</p>`
      : "";
  const scanResult = scanned ? await scanMediaCleanup(env) : null;
  const status = scanResult ? renderMediaCleanupResult(scanResult) : "";
  const deleteForm =
    scanResult && scanResult.unreferencedObjectCount > 0
      ? `<form method="post" action="/api/admin/media/cleanup">
        ${csrfInput(csrfToken)}
        <input type="hidden" name="confirm" value="delete">
        <button type="submit">Delete unreferenced media objects</button>
      </form>`
      : "";

  return htmlShell(
    env,
    "Media Cleanup",
    `<h1>Media cleanup</h1>
    <p>Media cleanup scans R2 objects under <code>${escapeHtml(MEDIA_CLEANUP_PREFIX)}</code> and compares them with D1 media metadata. Current media and immutable media revisions are kept; only unreferenced R2 objects are eligible for deletion.</p>
    <form method="get" action="/admin/media-cleanup">
      <input type="hidden" name="scan" value="1">
      <button type="submit">Scan media objects</button>
    </form>
    ${deletedNotice}
    ${status}
    ${deleteForm}`,
    { principal }
  );
}

function renderMediaCleanupResult(result: MediaCleanupResult): string {
  const rows = result.unreferencedObjects
    .map(
      (object) => `<tr>
        <td><code>${escapeHtml(object.key)}</code></td>
        <td>${object.size.toLocaleString("en-US")}</td>
      </tr>`
    )
    .join("");
  const table = rows
    ? `<table class="inline media__cleanup">
      <thead><tr><th>Unreferenced object</th><th>Bytes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    : "<p>No unreferenced media objects were found.</p>";
  const truncated = result.truncated
    ? `<p>Showing the first ${result.sampleLimit.toLocaleString("en-US")} unreferenced object${result.sampleLimit === 1 ? "" : "s"}.</p>`
    : "";

  return `<h2>Scan result</h2>
    <ul>
      <li>Referenced D1 media objects: ${result.referencedObjectCount.toLocaleString("en-US")}</li>
      <li>Scanned R2 media objects: ${result.scannedObjectCount.toLocaleString("en-US")}</li>
      <li>Unreferenced R2 media objects: ${result.unreferencedObjectCount.toLocaleString("en-US")}</li>
      <li>Deleted R2 media objects: ${result.deletedObjectCount.toLocaleString("en-US")}</li>
    </ul>
    ${table}
    ${truncated}`;
}

function renderManagedUserRow(
  user: ManagedUser,
  csrfToken: string,
  principal: AuthPrincipal
): string {
  const elementId = escapeAttribute(user.id.replace(/[^a-zA-Z0-9_-]/g, "_"));
  const formId = `user__form_${elementId}`;
  const disabledChecked = user.isDisabled ? " checked" : "";
  const disableDisabled = principal.id === user.id ? " disabled" : "";
  const selfDisableGuard =
    principal.id === user.id ? "<small>Current account cannot disable itself.</small>" : "";

  return `<tr>
    <td><code>${escapeHtml(user.username)}</code></td>
    <td>
      <label class="a11y" for="user__display_${elementId}">Display name</label>
      <input form="${formId}" id="user__display_${elementId}" name="displayName" type="text" value="${escapeAttribute(user.displayName)}" required>
    </td>
    <td>
      <label class="a11y" for="user__email_${elementId}">Email</label>
      <input form="${formId}" id="user__email_${elementId}" name="email" type="email" value="${escapeAttribute(user.email ?? "")}">
    </td>
    <td>
      <label class="a11y" for="user__groups_${elementId}">Groups</label>
      <input form="${formId}" id="user__groups_${elementId}" name="groups" type="text" value="${escapeAttribute(user.groups.join(", "))}">
    </td>
    <td>
      <label>
        <input form="${formId}" name="isDisabled" type="checkbox" value="1"${disabledChecked}${disableDisabled}>
        Disabled
      </label>
      ${selfDisableGuard}
    </td>
    <td>
      <form id="${formId}" method="post" action="/api/admin/users">
        ${csrfInput(csrfToken)}
        <input type="hidden" name="id" value="${escapeAttribute(user.id)}">
        <button type="submit">Save</button>
      </form>
    </td>
  </tr>`;
}

function renderAclPermissionOptions(selected: number): string {
  return [
    [ACL_NONE, "None"],
    [ACL_READ, "Read"],
    [ACL_EDIT, "Edit"],
    [ACL_CREATE, "Create"],
    [ACL_UPLOAD, "Upload"],
    [ACL_DELETE, "Delete"]
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${value === selected ? " selected" : ""}>${label} (${value})</option>`
    )
    .join("");
}

async function renderSearchPage(env: Env, url: URL, principal: AuthPrincipal): Promise<string> {
  const startedAt = Date.now();
  const query = url.searchParams.get("q")?.trim() ?? "";
  const namespace = cleanPageId(url.searchParams.get("ns") ?? "");
  const results = query
    ? await filterReadablePageItems(env, principal, await searchPages(env.DB, query, namespace))
    : [];
  logMetric("search_metric", {
    surface: "search_page",
    namespace: namespace || null,
    queryLength: query.length,
    resultCount: results.length,
    durationMs: elapsedSince(startedAt)
  });
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
    <ol>${resultItems}</ol>`,
    { principal }
  );
}

async function renderNamespaceIndexPage(
  env: Env,
  namespace: string,
  url: URL,
  principal: AuthPrincipal
): Promise<string> {
  const pagination = paginationFromUrl(url, { defaultLimit: 200, maxLimit: 500 });
  const rules = await listAclRules(env);
  const pages = canListNamespace(env, rules, principal, namespace)
    ? filterReadablePageItemsWithRules(
        env,
        rules,
        principal,
        await listNamespacePages(env.DB, namespace, pagination.limit, pagination.offset)
      )
    : [];
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
    `<h1>${escapeHtml(title)}</h1>${emptyState}<ul>${items}</ul>${renderPaginationControls(url, pagination, pages.length)}`,
    { principal }
  );
}

async function renderBacklinksPage(
  env: Env,
  id: string,
  principal: AuthPrincipal
): Promise<string> {
  const backlinks = await filterReadablePageItems(env, principal, await listBacklinks(env.DB, id));
  const items = renderPageReferenceList(backlinks);
  const emptyState = backlinks.length === 0 ? "<p>No backlinks found.</p>" : "";

  return htmlShell(
    env,
    `Backlinks for ${id}`,
    `<h1>Backlinks for ${escapeHtml(id)}</h1>${emptyState}<ul>${items}</ul>`,
    { principal }
  );
}

async function renderOrphanPage(env: Env, principal: AuthPrincipal): Promise<string> {
  const orphans = await filterReadablePageItems(env, principal, await listOrphanPages(env.DB));
  const items = renderPageReferenceList(orphans);
  const emptyState = orphans.length === 0 ? "<p>No orphan pages found.</p>" : "";

  return htmlShell(env, "Orphan pages", `<h1>Orphan pages</h1>${emptyState}<ul>${items}</ul>`, {
    principal
  });
}

async function renderWantedPage(env: Env, principal: AuthPrincipal): Promise<string> {
  const rules = await listAclRules(env);
  const wanted = (await listWantedPages(env.DB))
    .filter((page) => !isHiddenPageId(env, page.id))
    .map((page) => ({
      ...page,
      referrers: filterReadablePageItemsWithRules(env, rules, principal, page.referrers)
    }))
    .filter((page) => page.referrers.length > 0);
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

  return htmlShell(env, "Wanted pages", `<h1>Wanted pages</h1>${emptyState}<ul>${items}</ul>`, {
    principal
  });
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

async function renderSitemap(env: Env, url: URL, principal: AuthPrincipal): Promise<string> {
  const pages = await filterReadablePageItems(env, principal, await listAllPages(env.DB));
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

async function renderRssFeed(env: Env, url: URL, principal: AuthPrincipal): Promise<string> {
  const changes = await filterReadableChanges(env, principal, await listRecentChanges(env.DB));
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

async function renderAtomFeed(env: Env, url: URL, principal: AuthPrincipal): Promise<string> {
  const changes = await filterReadableChanges(env, principal, await listRecentChanges(env.DB));
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

async function handleAclRuleUpsert(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  if (!isAdminPrincipal(principal)) {
    return adminDeniedResponse(request, env);
  }

  const parsed = parseAclRuleForm(form);
  if (!parsed.ok) {
    return aclAdminErrorResponse(request, env, parsed.error);
  }

  const store = new D1AclStore(env.DB);
  await store.deleteMatchingRules(
    parsed.rule.scope,
    parsed.rule.principalType,
    parsed.rule.principal
  );
  await store.putRule(parsed.rule);
  await appendAdminAuditLog(request, env, principal, {
    action: "acl_rule_upsert",
    targetType: "acl_rule",
    targetId: parsed.rule.id,
    details: {
      scope: parsed.rule.scope,
      principalType: parsed.rule.principalType,
      principal: parsed.rule.principal,
      permission: parsed.rule.permission
    }
  });

  return redirectResponse("/admin/acl");
}

async function handleAclRuleDelete(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  if (!isAdminPrincipal(principal)) {
    return adminDeniedResponse(request, env);
  }

  const id = String(form.get("id") ?? "").trim();
  if (!id) {
    return aclAdminErrorResponse(request, env, "Missing ACL rule id.");
  }

  await new D1AclStore(env.DB).deleteRule(id);
  await appendAdminAuditLog(request, env, principal, {
    action: "acl_rule_delete",
    targetType: "acl_rule",
    targetId: id,
    details: {}
  });
  return redirectResponse("/admin/acl");
}

async function handleUserAdminUpdate(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  if (!isAdminPrincipal(principal)) {
    return adminDeniedResponse(request, env);
  }

  const parsed = parseUserAdminForm(form, principal);
  if (!parsed.ok) {
    return userAdminErrorResponse(request, env, parsed.error);
  }

  const existing = await getManagedUser(env.DB, parsed.user.id);
  if (!existing) {
    return userAdminErrorResponse(request, env, `User '${parsed.user.id}' was not found.`, 404);
  }

  await updateManagedUser(env.DB, parsed.user, parsed.groups);
  await appendAdminAuditLog(request, env, principal, {
    action: "user_update",
    targetType: "user",
    targetId: parsed.user.id,
    details: {
      username: existing.username,
      displayName: parsed.user.displayName,
      email: parsed.user.email,
      isDisabled: parsed.user.isDisabled,
      groups: parsed.groups
    }
  });

  if (acceptsJson(request)) {
    return jsonResponse({ ok: true, id: parsed.user.id });
  }

  return redirectResponse("/admin/users");
}

async function handleMediaCleanup(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const form = await readFormDataOrEmpty(request);
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  if (!isAdminPrincipal(principal)) {
    return adminDeniedResponse(request, env);
  }

  if (!env.MEDIA_BUCKET) {
    return mediaCleanupUnavailableResponse(request, env);
  }

  const confirmed = String(form.get("confirm") ?? "") === "delete";
  if (!confirmed) {
    return mediaCleanupErrorResponse(request, env, "Media cleanup requires delete confirmation.");
  }

  const result = await scanMediaCleanup(env, { deleteUnreferenced: true });
  await appendAdminAuditLog(request, env, principal, {
    action: "media_cleanup",
    targetType: "media",
    targetId: null,
    details: {
      scannedObjectCount: result.scannedObjectCount,
      referencedObjectCount: result.referencedObjectCount,
      unreferencedObjectCount: result.unreferencedObjectCount,
      deletedObjectCount: result.deletedObjectCount,
      sampleKeys: result.unreferencedObjects.map((object) => object.key)
    }
  });

  if (acceptsJson(request)) {
    return jsonResponse({ ok: true, ...result });
  }

  return redirectResponse(`/admin/media-cleanup?deleted=${result.deletedObjectCount}&scan=1`);
}

async function handleGlobalCachePurge(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const form = await readFormDataOrEmpty(request);
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  if (!isAdminPrincipal(principal)) {
    return adminDeniedResponse(request, env);
  }

  const result = await purgeGlobalCache(env);
  await appendAdminAuditLog(request, env, principal, {
    action: "cache_purge",
    targetType: "cache",
    targetId: "global",
    details: { ...result }
  });

  if (acceptsJson(request)) {
    return jsonResponse({ ok: true, ...result });
  }

  return redirectResponse("/admin");
}

async function scanMediaCleanup(
  env: Env,
  options: { deleteUnreferenced?: boolean } = {}
): Promise<MediaCleanupResult> {
  if (!env.MEDIA_BUCKET) {
    throw new Error("MEDIA_BUCKET binding is required for media cleanup.");
  }

  const referencedObjects = await readReferencedMediaObjectKeys(env.DB);
  const unreferencedObjects: MediaCleanupObject[] = [];
  let scannedObjectCount = 0;
  let unreferencedObjectCount = 0;
  let deletedObjectCount = 0;
  let cursor: string | undefined;

  do {
    const listed = await env.MEDIA_BUCKET.list({
      prefix: MEDIA_CLEANUP_PREFIX,
      cursor,
      limit: 1000
    });

    for (const object of listed.objects) {
      scannedObjectCount += 1;

      if (referencedObjects.has(object.key)) {
        continue;
      }

      unreferencedObjectCount += 1;
      if (unreferencedObjects.length < MEDIA_CLEANUP_SAMPLE_LIMIT) {
        unreferencedObjects.push({
          key: object.key,
          size: object.size
        });
      }

      if (options.deleteUnreferenced) {
        await env.MEDIA_BUCKET.delete(object.key);
        deletedObjectCount += 1;
      }
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return {
    prefix: MEDIA_CLEANUP_PREFIX,
    referencedObjectCount: referencedObjects.size,
    scannedObjectCount,
    unreferencedObjectCount,
    deletedObjectCount,
    unreferencedObjects,
    sampleLimit: MEDIA_CLEANUP_SAMPLE_LIMIT,
    truncated: unreferencedObjectCount > unreferencedObjects.length,
    dryRun: !options.deleteUnreferenced
  };
}

async function readReferencedMediaObjectKeys(db: D1Database): Promise<Set<string>> {
  const rows = await db
    .prepare(
      `select object_key as objectKey
       from media
       where object_key is not null and object_key <> ''
       union
       select object_key as objectKey
       from media_revisions
       where object_key is not null and object_key <> ''`
    )
    .all<{ objectKey: string }>();

  return new Set((rows.results ?? []).map((row) => row.objectKey).filter(Boolean));
}

function mediaCleanupErrorResponse(request: Request, env: Env, message: string): Response {
  if (acceptsJson(request)) {
    return jsonResponse({ error: message }, { status: 400 });
  }

  return htmlResponse(htmlShell(env, "Media cleanup rejected", `<p>${escapeHtml(message)}</p>`), {
    status: 400
  });
}

function mediaCleanupUnavailableResponse(request: Request, env: Env): Response {
  const message = "MEDIA_BUCKET binding is required for media cleanup.";

  if (acceptsJson(request)) {
    return jsonResponse({ error: message }, { status: 503 });
  }

  return htmlResponse(
    htmlShell(env, "Media cleanup unavailable", `<p>${escapeHtml(message)}</p>`),
    {
      status: 503
    }
  );
}

async function readFormDataOrEmpty(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    return new FormData();
  }
}

async function handleSearchIndexRebuild(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  if (!isAdminPrincipal(principal)) {
    return adminDeniedResponse(request, env);
  }

  const result = await rebuildSearchIndex(env.DB);
  await appendAdminAuditLog(request, env, principal, {
    action: "search_index_rebuild",
    targetType: "search_index",
    targetId: null,
    details: {
      pageCount: result.pageCount,
      termCount: result.termCount,
      postingCount: result.postingCount
    }
  });

  if (acceptsJson(request)) {
    return jsonResponse(result);
  }

  return redirectResponse("/admin?searchRebuild=ok");
}

async function appendAdminAuditLog(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  entry: {
    action: string;
    targetType: string;
    targetId: string | null;
    details: Record<string, unknown>;
  }
): Promise<void> {
  const createdAt = new Date().toISOString();
  const details = {
    ...entry.details,
    actorUsername: principal.username,
    actorDisplayName: principal.displayName,
    ip: getClientIp(request)
  };

  await new D1AuditLogStore(env.DB).appendEntry({
    id: `audit:${createdAt}:${crypto.randomUUID()}`,
    actorId: principal.id,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    details,
    createdAt
  });
}

async function listManagedUsers(
  db: D1Database,
  limit: number,
  offset: number
): Promise<ManagedUser[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const safeOffset = Math.max(0, offset);
  const usersResult = await db
    .prepare(
      `select id, username, display_name, email, password_hash, is_disabled, created_at, updated_at
       from users
       order by username asc
       limit ? offset ?`
    )
    .bind(safeLimit, safeOffset)
    .all<UserRow>();
  const users = usersResult.results.map(mapManagedUser);

  if (users.length === 0) return [];

  const groupRows = await readManagedUserGroups(
    db,
    users.map((user) => user.id)
  );
  return users.map((user) => ({ ...user, groups: groupRows.get(user.id) ?? [] }));
}

async function getManagedUser(db: D1Database, id: string): Promise<ManagedUser | null> {
  const row = await db
    .prepare(
      `select id, username, display_name, email, password_hash, is_disabled, created_at, updated_at
       from users
       where id = ?`
    )
    .bind(id)
    .first<UserRow>();

  if (!row) return null;

  const groups = await readManagedUserGroups(db, [row.id]);
  return { ...mapManagedUser(row), groups: groups.get(row.id) ?? [] };
}

async function readManagedUserGroups(
  db: D1Database,
  userIds: string[]
): Promise<Map<string, string[]>> {
  if (userIds.length === 0) return new Map();

  const rows = await db
    .prepare(
      `select ug.user_id, g.name as group_name
       from user_groups ug
       join groups g on g.id = ug.group_id
       where ug.user_id in (${userIds.map(() => "?").join(", ")})
       order by g.name asc`
    )
    .bind(...userIds)
    .all<UserGroupRow>();
  const groups = new Map<string, string[]>();

  for (const row of rows.results) {
    if (!row.group_name) continue;
    groups.set(row.user_id, [...(groups.get(row.user_id) ?? []), row.group_name]);
  }

  return groups;
}

async function updateManagedUser(
  db: D1Database,
  user: ManagedUserUpdate,
  groups: string[]
): Promise<void> {
  const now = new Date().toISOString();
  const statements = [
    db
      .prepare(
        `update users
         set display_name = ?, email = ?, is_disabled = ?, updated_at = ?
         where id = ?`
      )
      .bind(user.displayName, user.email, user.isDisabled ? 1 : 0, now, user.id),
    db.prepare("delete from user_groups where user_id = ?").bind(user.id)
  ];

  for (const group of groups) {
    const id = groupId(group);
    statements.push(
      db
        .prepare(
          "insert into groups (id, name, created_at) values (?, ?, ?) on conflict(name) do nothing"
        )
        .bind(id, group, now),
      db
        .prepare("insert into user_groups (user_id, group_id, created_at) values (?, ?, ?)")
        .bind(user.id, id, now)
    );
  }

  await db.batch(statements);
}

function parseUserAdminForm(
  form: FormData,
  principal: AuthPrincipal
): { ok: true; user: ManagedUserUpdate; groups: string[] } | { ok: false; error: string } {
  const id = String(form.get("id") ?? "").trim();
  if (!id) {
    return { ok: false, error: "Missing user id." };
  }

  const displayName = String(form.get("displayName") ?? "").trim();
  if (!displayName) {
    return { ok: false, error: "Display name is required." };
  }

  const email = String(form.get("email") ?? "").trim() || null;
  const groups = normalizeUserManagerGroups(String(form.get("groups") ?? ""));
  const isSelf = principal.id === id;
  const isDisabled = !isSelf && Boolean(form.get("isDisabled"));

  return {
    ok: true,
    user: {
      id,
      displayName,
      email,
      isDisabled
    },
    groups
  };
}

function normalizeUserManagerGroups(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\s]+/)
        .map((group) => group.trim().replace(/^@+/, ""))
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));
}

function mapManagedUser(row: UserRow): ManagedUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    passwordHash: row.password_hash,
    isDisabled: row.is_disabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    groups: []
  };
}

function groupId(group: string): string {
  return `group:${group}`;
}

function parseAclRuleForm(
  form: FormData
): { ok: true; rule: AclRuleRecord } | { ok: false; error: string } {
  const scope = normalizeAclAdminScope(String(form.get("scope") ?? ""));
  if (!scope) {
    return { ok: false, error: "Missing ACL scope." };
  }

  const principalType = parseAclPrincipalType(String(form.get("principalType") ?? ""));
  if (!principalType) {
    return { ok: false, error: "Invalid ACL principal type." };
  }

  const principal = normalizeAclAdminPrincipal(principalType, String(form.get("principal") ?? ""));
  if (!principal) {
    return { ok: false, error: "Missing ACL principal." };
  }

  const permission = Number.parseInt(String(form.get("permission") ?? ""), 10);
  if (![ACL_NONE, ACL_READ, ACL_EDIT, ACL_CREATE, ACL_UPLOAD, ACL_DELETE].includes(permission)) {
    return { ok: false, error: "Invalid ACL permission." };
  }

  return {
    ok: true,
    rule: {
      id: stableAclRuleId(scope, principalType, principal),
      scope,
      principalType,
      principal,
      permission,
      createdAt: new Date().toISOString()
    }
  };
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const username = String(form.get("username") ?? form.get("u") ?? "").trim();
  const password = String(form.get("password") ?? form.get("p") ?? "");
  const returnTo = safeReturnPath(String(form.get("returnTo") ?? ""), env);
  const url = new URL(request.url);
  const csrf = csrfContext(request);
  const turnstile = await verifyTurnstileForm(request, env, form);

  if (!turnstile.ok) {
    return htmlResponseWithCsrf(
      request,
      renderLoginPage(env, url, turnstile.message, returnTo, csrf.token),
      csrf,
      { status: 400 }
    );
  }

  if (!username || !password) {
    return htmlResponseWithCsrf(
      request,
      renderLoginPage(env, url, "Missing username or password.", returnTo, csrf.token),
      csrf,
      { status: 400 }
    );
  }

  const rateLimited = await loginRateLimitResponse(request, env, username, returnTo, csrf);
  if (rateLimited) {
    logAuthEvent(request, "login_rate_limited", { username });
    return rateLimited;
  }

  const user = await authenticateUser(env.DB, username, password);
  if (!user) {
    await recordLoginFailure(request, env, username);
    logAuthEvent(request, "login_failure", { username });
    return htmlResponseWithCsrf(
      request,
      renderLoginPage(env, url, "Invalid username or password.", returnTo, csrf.token),
      csrf,
      { status: 401 }
    );
  }

  await clearLoginFailures(request, env, username);
  const session = await createLoginSession(env.DB, user.id);
  logAuthEvent(request, "login_success", {
    userId: user.id,
    username: user.username
  });
  return new Response(null, {
    status: 303,
    headers: securityHeaders({
      location: returnTo,
      "set-cookie": sessionCookieHeader(getRuntimeConfig(env).sessionCookieName, session, request)
    })
  });
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const url = new URL(request.url);
  const csrf = csrfContext(request);
  const submittedValues = registrationValuesFromForm(form);
  const turnstile = await verifyTurnstileForm(request, env, form);

  if (!turnstile.ok) {
    return htmlResponseWithCsrf(
      request,
      renderRegisterPage(env, url, csrf.token, turnstile.message, submittedValues),
      csrf,
      { status: 400 }
    );
  }

  const parsed = parseRegistrationForm(form);

  if (!parsed.ok) {
    return htmlResponseWithCsrf(
      request,
      renderRegisterPage(env, url, csrf.token, parsed.error, parsed.values),
      csrf,
      { status: 400 }
    );
  }

  if (await usernameExists(env.DB, parsed.values.username)) {
    return htmlResponseWithCsrf(
      request,
      renderRegisterPage(env, url, csrf.token, "Username is already registered.", parsed.values),
      csrf,
      { status: 409 }
    );
  }

  const user = await createRegisteredUser(env.DB, parsed.values);
  await sendRegistrationNotifications(request, env, user);

  const session = await createLoginSession(env.DB, user.id);
  const response = acceptsJson(request)
    ? jsonResponse({ ok: true, user: publicRegisteredUser(user) }, { status: 201 })
    : redirectResponse(safeReturnPath(String(form.get("returnTo") ?? ""), env));
  response.headers.append(
    "set-cookie",
    sessionCookieHeader(getRuntimeConfig(env).sessionCookieName, session, request)
  );
  return response;
}

async function handlePasswordResetRequest(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const url = new URL(request.url);
  const csrf = csrfContext(request);
  const identifier = String(form.get("identifier") ?? form.get("login") ?? "").trim();
  const message =
    "If a matching active account has an email address, a password reset email has been sent.";

  if (identifier) {
    const user = await findPasswordResetUser(env.DB, identifier);
    if (user?.email) {
      const token = await createPasswordResetToken(env.DB, user.id);
      const resetUrl = absoluteEmailUrl(env, request, `/password-reset?token=${token.token}`);
      const template = passwordResetEmail({
        siteName: getRuntimeConfig(env).siteName,
        resetUrl,
        displayName: user.displayName || user.username
      });
      await sendWikiEmail(env, {
        kind: "password_reset",
        to: [user.email],
        ...template,
        idempotencyKey: `password-reset:${token.id}`
      });
    }
  }

  if (acceptsJson(request)) {
    return jsonResponse({ ok: true, message });
  }

  return htmlResponseWithCsrf(
    request,
    renderPasswordResetRequestPage(env, url, csrf.token, null, identifier, message),
    csrf
  );
}

async function handlePasswordResetConfirm(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const url = new URL(request.url);
  const csrf = csrfContext(request);
  const token = String(form.get("token") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const passwordConfirm = String(form.get("passwordConfirm") ?? "");

  if (!token) {
    return htmlResponseWithCsrf(
      request,
      renderPasswordResetConfirmPage(env, url, csrf.token, "Missing password reset token."),
      csrf,
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return htmlResponseWithCsrf(
      request,
      renderPasswordResetConfirmPage(
        env,
        url,
        csrf.token,
        "Password must be at least 8 characters."
      ),
      csrf,
      { status: 400 }
    );
  }

  if (password !== passwordConfirm) {
    return htmlResponseWithCsrf(
      request,
      renderPasswordResetConfirmPage(env, url, csrf.token, "Password confirmation does not match."),
      csrf,
      { status: 400 }
    );
  }

  const reset = await findPasswordResetToken(env.DB, token);
  if (!reset) {
    return htmlResponseWithCsrf(
      request,
      renderPasswordResetConfirmPage(
        env,
        url,
        csrf.token,
        "Password reset link is invalid or expired."
      ),
      csrf,
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("update users set password_hash = ?, updated_at = ? where id = ?").bind(
      passwordHash,
      now,
      reset.userId
    ),
    env.DB.prepare("update password_reset_tokens set used_at = ? where id = ?").bind(now, reset.id),
    env.DB.prepare("delete from sessions where user_id = ?").bind(reset.userId)
  ]);

  if (acceptsJson(request)) {
    return jsonResponse({ ok: true });
  }

  return htmlResponseWithCsrf(request, renderPasswordResetCompletePage(env, csrf.token), csrf);
}

async function loginRateLimitResponse(
  request: Request,
  env: Env,
  username: string,
  returnTo: string,
  csrf: CsrfContext
): Promise<Response | null> {
  const attempts = await readLoginFailureCount(request, env, username);
  if (attempts < LOGIN_RATE_LIMIT_ATTEMPTS) return null;

  if (acceptsJson(request)) {
    return jsonResponse(
      { error: "Too many failed login attempts. Try again later." },
      {
        status: 429,
        headers: { "retry-after": String(LOGIN_RATE_LIMIT_WINDOW_SECONDS) }
      }
    );
  }

  return htmlResponseWithCsrf(
    request,
    renderLoginPage(
      env,
      new URL(request.url),
      "Too many failed login attempts. Try again later.",
      returnTo,
      csrf.token
    ),
    csrf,
    {
      status: 429,
      headers: { "retry-after": String(LOGIN_RATE_LIMIT_WINDOW_SECONDS) }
    }
  );
}

async function handleSubscriptionUpdate(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  if (principal.type !== "user") {
    return accountLoginRequiredResponse(request, env, "/");
  }

  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const subjectType = String(form.get("subjectType") ?? "");
  const subjectId = cleanPageId(String(form.get("subjectId") ?? ""));
  const digestInterval = normalizeDigestInterval(String(form.get("digestInterval") ?? ""));
  const action = String(form.get("subscriptionAction") ?? "subscribe");
  const returnTo = safeReturnPath(String(form.get("returnTo") ?? ""), env);

  if ((subjectType !== "page" && subjectType !== "namespace") || !subjectId) {
    return jsonResponse({ error: "Invalid subscription subject." }, { status: 400 });
  }

  if (!digestInterval) {
    return jsonResponse({ error: "Invalid digest interval." }, { status: 400 });
  }

  if (action === "unsubscribe") {
    await deleteSubscription(env.DB, principal.id, subjectType, subjectId);
  } else {
    await upsertSubscription(env.DB, {
      id: stableSubscriptionId(principal.id, subjectType, subjectId),
      subjectType,
      subjectId,
      userId: principal.id,
      digestInterval
    });
  }

  if (acceptsJson(request)) {
    return jsonResponse({ ok: true });
  }

  return redirectResponse(returnTo);
}

async function handleEmailDigestTask(request: Request, env: Env): Promise<Response> {
  const expectedToken = env.EMAIL_TASK_TOKEN?.trim();
  if (!expectedToken) {
    return jsonResponse({ error: "Email digest task token is not configured." }, { status: 503 });
  }

  const actualToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!constantTimeEqual(actualToken, expectedToken)) {
    return jsonResponse({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const interval = normalizeDigestTaskInterval(url.searchParams.get("interval") ?? "daily");
  if (!interval) {
    return jsonResponse({ error: "Invalid digest interval." }, { status: 400 });
  }

  const result = await sendDueEmailDigests(request, env, interval);
  return jsonResponse({ ok: true, interval, ...result });
}

async function readLoginFailureCount(
  request: Request,
  env: Env,
  username: string
): Promise<number> {
  const raw = await env.RENDER_CACHE.get(loginRateLimitKey(request, username));
  if (!raw) return 0;

  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function recordLoginFailure(request: Request, env: Env, username: string): Promise<void> {
  const key = loginRateLimitKey(request, username);
  const attempts = (await readLoginFailureCount(request, env, username)) + 1;
  await env.RENDER_CACHE.put(key, String(attempts), {
    expirationTtl: LOGIN_RATE_LIMIT_WINDOW_SECONDS
  });
}

async function clearLoginFailures(request: Request, env: Env, username: string): Promise<void> {
  await env.RENDER_CACHE.delete(loginRateLimitKey(request, username));
}

function loginRateLimitKey(request: Request, username: string): string {
  const client = getClientIp(request) ?? "unknown";
  return `auth:login:${client}:${encodeURIComponent(username.toLowerCase()).slice(0, 128)}`;
}

async function editRateLimitResponse(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response | null> {
  const attempts = await readEditAttemptCount(request, env, principal);
  if (attempts < EDIT_RATE_LIMIT_ATTEMPTS) return null;

  const message = "Too many page edit attempts. Try again later.";

  if (acceptsJson(request)) {
    return jsonResponse(
      { error: message },
      {
        status: 429,
        headers: { "retry-after": String(EDIT_RATE_LIMIT_WINDOW_SECONDS) }
      }
    );
  }

  return htmlResponse(htmlShell(env, "Page edit limited", `<p>${escapeHtml(message)}</p>`), {
    status: 429,
    headers: { "retry-after": String(EDIT_RATE_LIMIT_WINDOW_SECONDS) }
  });
}

async function readEditAttemptCount(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<number> {
  const raw = await env.RENDER_CACHE.get(editRateLimitKey(request, principal));
  if (!raw) return 0;

  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function recordEditAttempt(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<void> {
  const key = editRateLimitKey(request, principal);
  const attempts = (await readEditAttemptCount(request, env, principal)) + 1;
  await env.RENDER_CACHE.put(key, String(attempts), {
    expirationTtl: EDIT_RATE_LIMIT_WINDOW_SECONDS
  });
}

function editRateLimitKey(request: Request, principal: AuthPrincipal): string {
  const client = getClientIp(request) ?? "unknown";
  const actor = principal.type === "user" ? `user:${principal.id}` : "anonymous";
  return `page:edit:${client}:${encodeURIComponent(actor).slice(0, 160)}`;
}

async function uploadRateLimitResponse(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response | null> {
  const attempts = await readUploadAttemptCount(request, env, principal);
  if (attempts < UPLOAD_RATE_LIMIT_ATTEMPTS) return null;

  const message = "Too many media upload attempts. Try again later.";

  if (acceptsJson(request)) {
    return jsonResponse(
      { error: message },
      {
        status: 429,
        headers: { "retry-after": String(UPLOAD_RATE_LIMIT_WINDOW_SECONDS) }
      }
    );
  }

  return htmlResponse(htmlShell(env, "Media upload limited", `<p>${escapeHtml(message)}</p>`), {
    status: 429,
    headers: { "retry-after": String(UPLOAD_RATE_LIMIT_WINDOW_SECONDS) }
  });
}

async function readUploadAttemptCount(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<number> {
  const raw = await env.RENDER_CACHE.get(uploadRateLimitKey(request, principal));
  if (!raw) return 0;

  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function recordUploadAttempt(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<void> {
  const key = uploadRateLimitKey(request, principal);
  const attempts = (await readUploadAttemptCount(request, env, principal)) + 1;
  await env.RENDER_CACHE.put(key, String(attempts), {
    expirationTtl: UPLOAD_RATE_LIMIT_WINDOW_SECONDS
  });
}

function uploadRateLimitKey(request: Request, principal: AuthPrincipal): string {
  const client = getClientIp(request) ?? "unknown";
  const actor = principal.type === "user" ? `user:${principal.id}` : "anonymous";
  return `media:upload:${client}:${encodeURIComponent(actor).slice(0, 160)}`;
}

async function handleLogout(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const returnTo = safeReturnPath(String(form.get("returnTo") ?? ""), env);
  const cookieName = getRuntimeConfig(env).sessionCookieName;

  await deleteLoginSession(env.DB, readCookie(request, cookieName));
  logAuthEvent(request, "logout", {
    userId: principal.id,
    username: principal.username
  });

  return new Response(null, {
    status: 303,
    headers: securityHeaders({
      location: returnTo,
      "set-cookie": clearSessionCookieHeader(cookieName, request)
    })
  });
}

interface ProfileFormValues {
  displayName: string;
  email: string;
}

async function handleProfileUpdate(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  if (principal.type !== "user") {
    return accountLoginRequiredResponse(request, env, "/profile");
  }

  const values = profileValuesFromForm(form, principal);
  const parsed = parseProfileForm(form);
  const csrf = csrfContext(request);

  if (!parsed.ok) {
    return profileUpdateErrorResponse(request, env, principal, values, parsed.error, csrf);
  }

  let passwordHash: string | null = null;
  if (parsed.newPassword) {
    const authenticated = await authenticateUser(
      env.DB,
      principal.username,
      parsed.currentPassword
    );

    if (!authenticated || authenticated.id !== principal.id) {
      return profileUpdateErrorResponse(
        request,
        env,
        principal,
        values,
        "Current password is incorrect.",
        csrf
      );
    }

    passwordHash = await hashPassword(parsed.newPassword);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    passwordHash
      ? `update users
         set display_name = ?, email = ?, password_hash = ?, updated_at = ?
         where id = ?`
      : `update users
         set display_name = ?, email = ?, updated_at = ?
         where id = ?`
  )
    .bind(
      ...(passwordHash
        ? [parsed.displayName, parsed.email, passwordHash, now, principal.id]
        : [parsed.displayName, parsed.email, now, principal.id])
    )
    .run();

  if (passwordHash) {
    await deleteOtherLoginSessions(request, env, principal.id);
  }

  logAuthEvent(request, "profile_update", {
    userId: principal.id,
    username: principal.username,
    passwordChanged: Boolean(passwordHash)
  });

  if (acceptsJson(request)) {
    return jsonResponse({
      ok: true,
      principal: {
        ...publicPrincipal(principal),
        displayName: parsed.displayName
      }
    });
  }

  return redirectResponse("/profile?updated=1");
}

function renderProfilePage(
  request: Request,
  env: Env,
  url: URL,
  principal: AuthPrincipal,
  csrfToken: string,
  message: { type: "success" | "error"; text: string } | null = null,
  values: ProfileFormValues | null = null
): string | Response {
  if (principal.type !== "user") {
    return accountLoginRequiredResponse(request, env, "/profile");
  }

  const formValues = values ?? profileValuesFromPrincipal(principal);
  const notice = message ?? profileNoticeFromUrl(url);
  const noticeHtml = notice ? `<p class="${notice.type}">${escapeHtml(notice.text)}</p>` : "";

  return htmlShell(
    env,
    "Update Profile",
    `<h1>Update Profile</h1>
    ${noticeHtml}
    <form id="dw__profile" method="post" action="/api/auth/profile">
      ${csrfInput(csrfToken)}
      <fieldset>
        <legend>User profile</legend>
        <label for="profile__user">Username</label>
        <input id="profile__user" class="edit" type="text" value="${escapeAttribute(principal.username)}" readonly>
        <label for="profile__display">Full name</label>
        <input id="profile__display" name="displayName" class="edit" type="text" value="${escapeAttribute(formValues.displayName)}" autocomplete="name" required>
        <label for="profile__email">Email</label>
        <input id="profile__email" name="email" class="edit" type="email" value="${escapeAttribute(formValues.email)}" autocomplete="email">
      </fieldset>
      <fieldset>
        <legend>Change password</legend>
        <label for="profile__current_password">Current password</label>
        <input id="profile__current_password" name="currentPassword" class="edit" type="password" autocomplete="current-password">
        <label for="profile__new_password">New password</label>
        <input id="profile__new_password" name="newPassword" class="edit" type="password" autocomplete="new-password">
        <label for="profile__new_password_confirm">Confirm password</label>
        <input id="profile__new_password_confirm" name="newPasswordConfirm" class="edit" type="password" autocomplete="new-password">
      </fieldset>
      <button type="submit">Update Profile</button>
    </form>`,
    { principal }
  );
}

function parseProfileForm(form: FormData):
  | {
      ok: true;
      displayName: string;
      email: string | null;
      currentPassword: string;
      newPassword: string | null;
    }
  | { ok: false; error: string } {
  const displayName = String(form.get("displayName") ?? "").trim();
  if (!displayName) {
    return { ok: false, error: "Full name is required." };
  }

  const email = String(form.get("email") ?? "").trim() || null;
  const currentPassword = String(form.get("currentPassword") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  const newPasswordConfirm = String(form.get("newPasswordConfirm") ?? "");

  if (newPassword || newPasswordConfirm) {
    if (!currentPassword) {
      return { ok: false, error: "Current password is required to change password." };
    }

    if (newPassword !== newPasswordConfirm) {
      return { ok: false, error: "New passwords do not match." };
    }

    if (newPassword.length < 8) {
      return { ok: false, error: "New password must be at least 8 characters." };
    }
  }

  return {
    ok: true,
    displayName,
    email,
    currentPassword,
    newPassword: newPassword || null
  };
}

function profileValuesFromPrincipal(principal: AuthPrincipal): ProfileFormValues {
  return {
    displayName: principal.displayName,
    email: principal.email ?? ""
  };
}

function profileValuesFromForm(form: FormData, principal: AuthPrincipal): ProfileFormValues {
  return {
    displayName: String(form.get("displayName") ?? principal.displayName).trim(),
    email: String(form.get("email") ?? principal.email ?? "").trim()
  };
}

function profileNoticeFromUrl(url: URL): { type: "success" | "error"; text: string } | null {
  return url.searchParams.get("updated") === "1"
    ? { type: "success", text: "Profile updated." }
    : null;
}

function profileUpdateErrorResponse(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  values: ProfileFormValues,
  error: string,
  csrf: CsrfContext
): Response {
  if (acceptsJson(request)) {
    return jsonResponse({ error }, { status: 400 });
  }

  return htmlResponseWithCsrf(
    request,
    renderProfilePage(
      request,
      env,
      new URL(request.url),
      principal,
      csrf.token,
      { type: "error", text: error },
      values
    ) as string,
    csrf,
    { status: 400 }
  );
}

async function deleteOtherLoginSessions(request: Request, env: Env, userId: string): Promise<void> {
  const sessionId = sessionIdFromCookie(
    readCookie(request, getRuntimeConfig(env).sessionCookieName)
  );

  if (!sessionId) return;

  await env.DB.prepare("delete from sessions where user_id = ? and id <> ?")
    .bind(userId, sessionId)
    .run();
}

function sessionIdFromCookie(value: string | null): string | null {
  return value?.split(".")[0] || null;
}

function logAuthEvent(
  request: Request,
  authEvent: AuthEventName,
  details: Record<string, unknown>
): void {
  const url = new URL(request.url);

  emitAuthEvent({
    level: "info",
    event: "auth_event",
    authEvent,
    requestId: request.headers.get("cf-ray") ?? request.headers.get("x-request-id") ?? null,
    method: request.method,
    path: url.pathname,
    ip: getClientIp(request),
    ...details
  });
}

function logMetric(
  event: "cache_metric" | "search_metric" | "media_metric",
  details: Record<string, unknown>
): void {
  console.log(
    JSON.stringify({
      level: "info",
      event,
      ...details
    })
  );
}

function elapsedSince(startedAt: number): number {
  return Date.now() - startedAt;
}

function unsupportedAccountFeatureForPath(pathname: string): string | null {
  switch (pathname) {
    default:
      return null;
  }
}

function unsupportedAccountFeatureForAction(action: string | null): string | null {
  switch (action) {
    default:
      return null;
  }
}

function authFeatureNotSupportedResponse(request: Request, env: Env, feature: string): Response {
  const message = `${accountFeatureLabel(feature)} is not supported by this Pages port yet.`;
  const pathname = new URL(request.url).pathname;

  if (acceptsJson(request) || pathname.startsWith("/api/")) {
    return jsonResponse(
      {
        error: message,
        feature,
        status: "not_supported"
      },
      { status: 501 }
    );
  }

  return htmlResponse(
    htmlShell(
      env,
      accountFeatureLabel(feature),
      `<h1>${escapeHtml(accountFeatureLabel(feature))}</h1>
      <p>${escapeHtml(message)}</p>
      <p><a href="/login">Login</a></p>`
    ),
    { status: 501 }
  );
}

function accountFeatureLabel(feature: string): string {
  switch (feature) {
    case "registration":
      return "Registration";
    case "profile_update":
      return "Profile";
    case "password_reset":
      return "Password reset";
    case "auth_token":
      return "Authentication token";
    default:
      return "Account feature";
  }
}

interface RegistrationValues {
  username: string;
  displayName: string;
  email: string | null;
  password: string;
}

interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
}

type DigestInterval = "immediate" | "daily" | "weekly";
type DigestTaskInterval = "daily" | "weekly" | "all";

interface SubscriptionRecord {
  id: string;
  subjectType: "page" | "namespace";
  subjectId: string;
  userId: string;
  digestInterval: DigestInterval;
  createdAt?: string;
}

interface SubscriptionRecipient {
  id: string;
  subjectType: "page" | "namespace";
  subjectId: string;
  userId: string;
  digestInterval: DigestInterval;
  email: string;
  username: string;
  displayName: string;
  createdAt: string;
}

interface EmailNotificationEventRecord {
  id: string;
  pageId: string;
  revisionId: string;
  changeType: string;
  summary: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

function parseRegistrationForm(
  form: FormData
):
  | { ok: true; values: RegistrationValues }
  | { ok: false; error: string; values: RegistrationValues } {
  const values = registrationValuesFromForm(form);
  const passwordConfirm = String(form.get("passwordConfirm") ?? form.get("passchk") ?? "");

  if (!/^[a-z0-9._-]{2,64}$/.test(values.username)) {
    return {
      ok: false,
      error:
        "Username must be 2 to 64 characters using letters, numbers, dots, dashes, or underscores.",
      values
    };
  }

  if (!values.displayName) {
    return { ok: false, error: "Display name is required.", values };
  }

  if (values.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(values.email)) {
    return { ok: false, error: "Email address is invalid.", values };
  }

  if (values.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters.", values };
  }

  if (values.password !== passwordConfirm) {
    return { ok: false, error: "Password confirmation does not match.", values };
  }

  return { ok: true, values };
}

function registrationValuesFromForm(form: FormData): RegistrationValues {
  return {
    username: String(form.get("username") ?? form.get("login") ?? "")
      .trim()
      .toLowerCase(),
    displayName: String(form.get("displayName") ?? form.get("fullname") ?? "").trim(),
    email: String(form.get("email") ?? "").trim() || null,
    password: String(form.get("password") ?? form.get("pass") ?? "")
  };
}

async function usernameExists(db: D1Database, username: string): Promise<boolean> {
  const row = await db
    .prepare("select id from users where lower(username) = lower(?)")
    .bind(username)
    .first<{ id: string }>();
  return Boolean(row);
}

async function createRegisteredUser(
  db: D1Database,
  values: RegistrationValues
): Promise<UserRecord> {
  const now = new Date().toISOString();
  const user: UserRecord = {
    id: crypto.randomUUID(),
    username: values.username,
    displayName: values.displayName,
    email: values.email,
    passwordHash: await hashPassword(values.password),
    isDisabled: false,
    createdAt: now,
    updatedAt: now
  };

  await db.batch([
    db
      .prepare(
        `insert into users (
           id, username, display_name, email, password_hash, is_disabled, created_at, updated_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        user.id,
        user.username,
        user.displayName,
        user.email,
        user.passwordHash,
        user.isDisabled ? 1 : 0,
        user.createdAt,
        user.updatedAt
      ),
    db
      .prepare("insert or ignore into groups (id, name, created_at) values (?, ?, ?)")
      .bind("group:user", "user", now),
    db
      .prepare("insert or ignore into user_groups (user_id, group_id, created_at) values (?, ?, ?)")
      .bind(user.id, "group:user", now)
  ]);

  return user;
}

function publicRegisteredUser(user: UserRecord): Record<string, unknown> {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email
  };
}

async function sendRegistrationNotifications(
  request: Request,
  env: Env,
  user: UserRecord
): Promise<void> {
  const config = emailConfig(env);
  if (config.registrationNotify.length === 0) return;

  const template = registrationNotificationEmail({
    siteName: getRuntimeConfig(env).siteName,
    baseUrl: absoluteEmailUrl(env, request, "/"),
    username: user.username,
    displayName: user.displayName,
    email: user.email
  });

  await sendWikiEmail(env, {
    kind: "registration_notification",
    to: config.registrationNotify,
    ...template,
    idempotencyKey: `registration:${user.id}`
  });
}

async function findPasswordResetUser(
  db: D1Database,
  identifier: string
): Promise<UserRecord | null> {
  const row = await db
    .prepare(
      `select id, username, display_name, email, password_hash, is_disabled, created_at, updated_at
       from users
       where is_disabled = 0
         and (lower(username) = lower(?) or lower(email) = lower(?))
       limit 1`
    )
    .bind(identifier, identifier)
    .first<{
      id: string;
      username: string;
      display_name: string;
      email: string | null;
      password_hash: string | null;
      is_disabled: number;
      created_at: string;
      updated_at: string;
    }>();

  return row
    ? {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        email: row.email,
        passwordHash: row.password_hash,
        isDisabled: row.is_disabled === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    : null;
}

async function createPasswordResetToken(
  db: D1Database,
  userId: string,
  now = new Date()
): Promise<{ id: string; token: string }> {
  const id = crypto.randomUUID();
  const token = randomBase64Url(PASSWORD_RESET_TOKEN_BYTES);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_SECONDS * 1000).toISOString();

  await db
    .prepare(
      `insert into password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
       values (?, ?, ?, ?, ?)`
    )
    .bind(id, userId, await sha256Hex(token), expiresAt, createdAt)
    .run();

  return { id, token };
}

async function findPasswordResetToken(
  db: D1Database,
  token: string,
  now = new Date()
): Promise<{ id: string; userId: string } | null> {
  const row = await db
    .prepare(
      `select id, user_id, expires_at, used_at
       from password_reset_tokens
       where token_hash = ?
       limit 1`
    )
    .bind(await sha256Hex(token))
    .first<PasswordResetTokenRow>();

  if (!row || row.used_at || row.expires_at <= now.toISOString()) return null;
  return { id: row.id, userId: row.user_id };
}

function absoluteEmailUrl(env: Env, request: Request, path: string): string {
  const base = emailConfig(env).baseUrl ?? new URL(request.url).origin;
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

function normalizeDigestInterval(value: string): DigestInterval | null {
  switch (value) {
    case "immediate":
    case "daily":
    case "weekly":
      return value;
    default:
      return null;
  }
}

function normalizeDigestTaskInterval(value: string): DigestTaskInterval | null {
  switch (value) {
    case "daily":
    case "weekly":
    case "all":
      return value;
    default:
      return null;
  }
}

function stableSubscriptionId(
  userId: string,
  subjectType: "page" | "namespace",
  subjectId: string
): string {
  return `subscription:${encodeURIComponent(userId)}:${subjectType}:${encodeURIComponent(subjectId)}`;
}

async function upsertSubscription(db: D1Database, subscription: SubscriptionRecord): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `insert into subscriptions (
         id, subject_type, subject_id, user_id, digest_interval, created_at
       ) values (?, ?, ?, ?, ?, ?)
       on conflict(id) do update set
         digest_interval = excluded.digest_interval`
    )
    .bind(
      subscription.id,
      subscription.subjectType,
      subscription.subjectId,
      subscription.userId,
      subscription.digestInterval,
      subscription.createdAt ?? now
    )
    .run();
}

async function deleteSubscription(
  db: D1Database,
  userId: string,
  subjectType: "page" | "namespace",
  subjectId: string
): Promise<void> {
  const subscriptionId = stableSubscriptionId(userId, subjectType, subjectId);
  await db
    .prepare("delete from email_digest_deliveries where subscription_id = ?")
    .bind(subscriptionId)
    .run();
  await db
    .prepare("delete from subscriptions where id = ? and user_id = ?")
    .bind(subscriptionId, userId)
    .run();
}

async function listUserSubscriptions(
  db: D1Database,
  userId: string
): Promise<SubscriptionRecord[]> {
  const result = await db
    .prepare(
      `select id, subject_type, subject_id, user_id, digest_interval, created_at
       from subscriptions
       where user_id = ?
       order by subject_type asc, subject_id asc`
    )
    .bind(userId)
    .all<{
      id: string;
      subject_type: "page" | "namespace";
      subject_id: string;
      user_id: string;
      digest_interval: DigestInterval;
      created_at: string;
    }>();

  return result.results.map((row) => ({
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    userId: row.user_id,
    digestInterval: row.digest_interval,
    createdAt: row.created_at
  }));
}

async function recordAndSendPageChangeNotifications(
  request: Request,
  env: Env,
  page: CurrentPage,
  changeType: string,
  summary: string,
  actor: PrincipalAuthor
): Promise<void> {
  const event = await recordPageChangeEvent(env.DB, page, changeType, summary, actor);
  const recipients = await listPageChangeRecipients(env.DB, page.id, actor.authorId, "immediate");
  const siteName = getRuntimeConfig(env).siteName;

  for (const recipient of recipients) {
    const template = pageChangeEmail({
      siteName,
      pageId: page.id,
      pageUrl: absoluteEmailUrl(env, request, pagePath(page.id)),
      actorName: actor.authorName,
      changeType,
      summary
    });
    const result = await sendWikiEmail(env, {
      kind: "page_change",
      to: [recipient.email],
      ...template,
      idempotencyKey: `page-change:${event.id}:${recipient.id}`
    });

    if (result.ok) {
      await markDigestDelivered(env.DB, recipient.id, event.id);
    }
  }
}

async function recordPageChangeEvent(
  db: D1Database,
  page: CurrentPage,
  changeType: string,
  summary: string,
  actor: PrincipalAuthor
): Promise<EmailNotificationEventRecord> {
  const createdAt = page.updatedAt;
  const event: EmailNotificationEventRecord = {
    id: `email-event:${page.revisionId}`,
    pageId: page.id,
    revisionId: page.revisionId,
    changeType,
    summary,
    actorId: actor.authorId,
    actorName: actor.authorName,
    createdAt
  };

  await db
    .prepare(
      `insert or ignore into email_notification_events (
         id, subject_type, subject_id, revision_id, change_type, summary,
         actor_id, actor_name, created_at
       ) values (?, 'page', ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      event.id,
      event.pageId,
      event.revisionId,
      event.changeType,
      event.summary,
      event.actorId,
      event.actorName,
      event.createdAt
    )
    .run();

  return event;
}

async function listPageChangeRecipients(
  db: D1Database,
  pageId: string,
  actorId: string | null,
  interval: DigestInterval
): Promise<SubscriptionRecipient[]> {
  const namespace = pageId.includes(":") ? pageId.slice(0, pageId.lastIndexOf(":")) : "";
  const result = await db
    .prepare(
      `select s.id, s.subject_type, s.subject_id, s.user_id, s.digest_interval, s.created_at,
              u.username, u.display_name, u.email
       from subscriptions s
       join users u on u.id = s.user_id
       where s.digest_interval = ?
         and u.is_disabled = 0
         and u.email is not null
         and u.email <> ''
         and (? is null or s.user_id <> ?)
         and (
           (s.subject_type = 'page' and s.subject_id = ?)
           or
           (s.subject_type = 'namespace' and (
             s.subject_id = ? or ? like s.subject_id || ':%'
           ))
         )
       order by s.created_at asc`
    )
    .bind(interval, actorId, actorId, pageId, namespace, pageId)
    .all<{
      id: string;
      subject_type: "page" | "namespace";
      subject_id: string;
      user_id: string;
      digest_interval: DigestInterval;
      created_at: string;
      username: string;
      display_name: string;
      email: string;
    }>();

  return result.results.map(mapSubscriptionRecipient);
}

async function sendDueEmailDigests(
  request: Request,
  env: Env,
  interval: DigestTaskInterval
): Promise<{ subscriptionsChecked: number; digestsSent: number; eventsDelivered: number }> {
  const recipients = await listDigestRecipients(env.DB, interval);
  let digestsSent = 0;
  let eventsDelivered = 0;

  for (const recipient of recipients) {
    const events = await listUndeliveredDigestEvents(env.DB, recipient);
    if (events.length === 0) continue;

    const template = digestEmail({
      siteName: getRuntimeConfig(env).siteName,
      baseUrl: absoluteEmailUrl(env, request, "/"),
      displayName: recipient.displayName || recipient.username,
      events: events.map((event) => ({
        pageId: event.pageId,
        pageUrl: absoluteEmailUrl(env, request, pagePath(event.pageId)),
        actorName: event.actorName,
        changeType: event.changeType,
        summary: event.summary,
        createdAt: event.createdAt
      }))
    });
    const result = await sendWikiEmail(env, {
      kind: "digest",
      to: [recipient.email],
      ...template,
      idempotencyKey: `digest:${recipient.id}:${events.at(-1)?.id ?? "none"}`
    });

    if (result.ok) {
      digestsSent += 1;
      eventsDelivered += events.length;
      for (const event of events) {
        await markDigestDelivered(env.DB, recipient.id, event.id);
      }
    }
  }

  return {
    subscriptionsChecked: recipients.length,
    digestsSent,
    eventsDelivered
  };
}

async function listDigestRecipients(
  db: D1Database,
  interval: DigestTaskInterval
): Promise<SubscriptionRecipient[]> {
  const result = await db
    .prepare(
      `select s.id, s.subject_type, s.subject_id, s.user_id, s.digest_interval, s.created_at,
              u.username, u.display_name, u.email
       from subscriptions s
       join users u on u.id = s.user_id
       where s.digest_interval in ('daily', 'weekly')
         and (? = 'all' or s.digest_interval = ?)
         and u.is_disabled = 0
         and u.email is not null
         and u.email <> ''
       order by s.created_at asc`
    )
    .bind(interval, interval)
    .all<{
      id: string;
      subject_type: "page" | "namespace";
      subject_id: string;
      user_id: string;
      digest_interval: DigestInterval;
      created_at: string;
      username: string;
      display_name: string;
      email: string;
    }>();

  return result.results.map(mapSubscriptionRecipient);
}

async function listUndeliveredDigestEvents(
  db: D1Database,
  subscription: SubscriptionRecipient,
  limit = 50
): Promise<EmailNotificationEventRecord[]> {
  const result = await db
    .prepare(
      `select e.id, e.subject_id, e.revision_id, e.change_type, e.summary,
              e.actor_id, e.actor_name, e.created_at
       from email_notification_events e
       left join email_digest_deliveries d
         on d.event_id = e.id and d.subscription_id = ?
       where d.event_id is null
         and e.created_at >= ?
         and (
           (? = 'page' and e.subject_id = ?)
           or
           (? = 'namespace' and (
             e.subject_id = ? or e.subject_id like ? || ':%'
           ))
         )
       order by e.created_at asc
       limit ?`
    )
    .bind(
      subscription.id,
      subscription.createdAt,
      subscription.subjectType,
      subscription.subjectId,
      subscription.subjectType,
      subscription.subjectId,
      subscription.subjectId,
      limit
    )
    .all<{
      id: string;
      subject_id: string;
      revision_id: string;
      change_type: string;
      summary: string;
      actor_id: string | null;
      actor_name: string | null;
      created_at: string;
    }>();

  return result.results.map((row) => ({
    id: row.id,
    pageId: row.subject_id,
    revisionId: row.revision_id,
    changeType: row.change_type,
    summary: row.summary,
    actorId: row.actor_id,
    actorName: row.actor_name,
    createdAt: row.created_at
  }));
}

async function markDigestDelivered(
  db: D1Database,
  subscriptionId: string,
  eventId: string
): Promise<void> {
  await db
    .prepare(
      `insert or ignore into email_digest_deliveries (subscription_id, event_id, delivered_at)
       values (?, ?, ?)`
    )
    .bind(subscriptionId, eventId, new Date().toISOString())
    .run();
}

function mapSubscriptionRecipient(row: {
  id: string;
  subject_type: "page" | "namespace";
  subject_id: string;
  user_id: string;
  digest_interval: DigestInterval;
  created_at: string;
  username: string;
  display_name: string;
  email: string;
}): SubscriptionRecipient {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    userId: row.user_id,
    digestInterval: row.digest_interval,
    createdAt: row.created_at,
    username: row.username,
    displayName: row.display_name,
    email: row.email
  };
}

function renderRegisterPage(
  env: Env,
  url: URL,
  csrfToken: string,
  error: string | null = null,
  values: Partial<RegistrationValues> = {}
): string {
  const message = error ? `<p class="error">${escapeHtml(error)}</p>` : "";
  const returnTo = safeReturnPath(url.searchParams.get("returnTo") ?? "", env);

  return htmlShell(
    env,
    "Register",
    `<h1>Register</h1>
    ${message}
    <form id="dw__register" class="auth-form" method="post" action="/api/auth/register">
      ${csrfInput(csrfToken)}
      <input type="hidden" name="returnTo" value="${escapeAttribute(returnTo)}">
      <fieldset>
        <legend>Register</legend>
        <div class="auth-field">
          <label for="register__user">Username</label>
          <input id="register__user" name="username" class="edit" type="text" autocomplete="username" value="${escapeAttribute(values.username ?? "")}" required autofocus>
        </div>
        <div class="auth-field">
          <label for="register__name">Full name</label>
          <input id="register__name" name="displayName" class="edit" type="text" autocomplete="name" value="${escapeAttribute(values.displayName ?? "")}" required>
        </div>
        <div class="auth-field">
          <label for="register__mail">Email</label>
          <input id="register__mail" name="email" class="edit" type="email" autocomplete="email" value="${escapeAttribute(values.email ?? "")}">
        </div>
        <div class="auth-field">
          <label for="register__pass">Password</label>
          <input id="register__pass" name="password" class="edit" type="password" autocomplete="new-password" required>
        </div>
        <div class="auth-field">
          <label for="register__passchk">Confirm password</label>
          <input id="register__passchk" name="passwordConfirm" class="edit" type="password" autocomplete="new-password" required>
        </div>
        ${renderTurnstileWidget(env, "register")}
        <div class="auth-actions">
          <button type="submit">Register</button>
        </div>
      </fieldset>
    </form>`
  );
}

function renderPasswordResetRequestPage(
  env: Env,
  url: URL,
  csrfToken: string,
  error: string | null = null,
  identifier = "",
  notice: string | null = null
): string {
  const message = error ? `<p class="error">${escapeHtml(error)}</p>` : "";
  const success = notice ? `<p class="success">${escapeHtml(notice)}</p>` : "";

  return htmlShell(
    env,
    "Password reset",
    `<h1>Password reset</h1>
    ${message}
    ${success}
    <form id="dw__resendpwd" method="post" action="/api/auth/password-reset/request">
      ${csrfInput(csrfToken)}
      <fieldset>
        <legend>Password reset</legend>
        <label for="resendpwd__identifier">Username or email</label>
        <input id="resendpwd__identifier" name="identifier" class="edit" type="text" autocomplete="username" value="${escapeAttribute(identifier || url.searchParams.get("u") || "")}" required autofocus>
        <button type="submit">Reset password</button>
      </fieldset>
    </form>`
  );
}

function renderPasswordResetConfirmPage(
  env: Env,
  url: URL,
  csrfToken: string,
  error: string | null = null
): string {
  const token = url.searchParams.get("token") ?? "";
  const message = error ? `<p class="error">${escapeHtml(error)}</p>` : "";

  return htmlShell(
    env,
    "Password reset",
    `<h1>Password reset</h1>
    ${message}
    <form id="dw__password_reset" method="post" action="/api/auth/password-reset/confirm">
      ${csrfInput(csrfToken)}
      <input type="hidden" name="token" value="${escapeAttribute(token)}">
      <fieldset>
        <legend>Choose a new password</legend>
        <label for="password_reset__pass">New password</label>
        <input id="password_reset__pass" name="password" class="edit" type="password" autocomplete="new-password" required autofocus>
        <label for="password_reset__passchk">Confirm new password</label>
        <input id="password_reset__passchk" name="passwordConfirm" class="edit" type="password" autocomplete="new-password" required>
        <button type="submit">Save password</button>
      </fieldset>
    </form>`
  );
}

function renderPasswordResetCompletePage(env: Env, csrfToken: string): string {
  return htmlShell(
    env,
    "Password reset",
    `<h1>Password reset</h1>
    <p class="success">Your password has been updated.</p>
    <p><a href="/login">Login</a></p>
    <form class="a11y" method="get" action="/login">${csrfInput(csrfToken)}</form>`
  );
}

async function renderSubscriptionPage(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  pageId: string,
  csrfToken: string
): Promise<string | Response> {
  if (principal.type !== "user") {
    return accountLoginRequiredResponse(request, env, `${pagePath(pageId)}?do=subscribe`);
  }

  const subscriptions = await listUserSubscriptions(env.DB, principal.id);
  const namespace = pageId.includes(":") ? pageId.slice(0, pageId.lastIndexOf(":")) : pageId;
  const pageSubscription = subscriptions.find(
    (subscription) => subscription.subjectType === "page" && subscription.subjectId === pageId
  );
  const namespaceSubscription = subscriptions.find(
    (subscription) =>
      subscription.subjectType === "namespace" && subscription.subjectId === namespace
  );

  return htmlShell(
    env,
    "Subscriptions",
    `<h1>Subscriptions</h1>
    ${renderSubscriptionForm(pageId, "page", pageId, pageSubscription, csrfToken)}
    ${renderSubscriptionForm(pageId, "namespace", namespace, namespaceSubscription, csrfToken)}`,
    { pageId, principal }
  );
}

function renderSubscriptionForm(
  pageId: string,
  subjectType: "page" | "namespace",
  subjectId: string,
  subscription: SubscriptionRecord | undefined,
  csrfToken: string
): string {
  const label = subjectType === "page" ? `Page ${subjectId}` : `Namespace ${subjectId}`;
  const action = subscription ? "Update subscription" : "Subscribe";

  return `<section class="subscription">
    <h2>${escapeHtml(label)}</h2>
    <form method="post" action="/api/subscriptions">
      ${csrfInput(csrfToken)}
      <input type="hidden" name="returnTo" value="${escapeAttribute(`${pagePath(pageId)}?do=subscribe`)}">
      <input type="hidden" name="subjectType" value="${subjectType}">
      <input type="hidden" name="subjectId" value="${escapeAttribute(subjectId)}">
      <label for="subscription__${subjectType}">Delivery</label>
      <select id="subscription__${subjectType}" name="digestInterval">
        ${renderDigestOption("immediate", "Immediate email", subscription?.digestInterval)}
        ${renderDigestOption("daily", "Daily digest", subscription?.digestInterval)}
        ${renderDigestOption("weekly", "Weekly digest", subscription?.digestInterval)}
      </select>
      <button type="submit" name="subscriptionAction" value="subscribe">${action}</button>
      ${
        subscription
          ? '<button type="submit" name="subscriptionAction" value="unsubscribe">Unsubscribe</button>'
          : ""
      }
    </form>
  </section>`;
}

function renderDigestOption(
  value: DigestInterval,
  label: string,
  selected?: DigestInterval
): string {
  return `<option value="${value}"${selected === value ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function renderLoginPage(
  env: Env,
  url: URL,
  error: string | null = null,
  returnTo = safeReturnPath(url.searchParams.get("returnTo") ?? "", env),
  csrfToken = ""
): string {
  const message = error ? `<p class="error">${escapeHtml(error)}</p>` : "";

  return htmlShell(
    env,
    "Login",
    `<h1>Login</h1>
    ${message}
    <form id="dw__login" class="auth-form" method="post" action="/api/auth/login">
      ${csrfInput(csrfToken)}
      <input type="hidden" name="returnTo" value="${escapeAttribute(returnTo)}">
      <fieldset>
        <legend>Login</legend>
        <div class="auth-field">
          <label for="login__user">Username</label>
          <input id="login__user" name="username" class="edit" type="text" autocomplete="username" required autofocus>
        </div>
        <div class="auth-field">
          <label for="login__pass">Password</label>
          <input id="login__pass" name="password" class="edit" type="password" autocomplete="current-password" required>
        </div>
        ${renderTurnstileWidget(env, "login")}
        <div class="auth-actions">
          <button type="submit">Login</button>
        </div>
      </fieldset>
    </form>`
  );
}

function renderLogoutPage(
  env: Env,
  url: URL,
  returnTo = safeReturnPath(url.searchParams.get("returnTo") ?? "", env),
  csrfToken = ""
): string {
  return htmlShell(
    env,
    "Logout",
    `<h1>Logout</h1>
    <form method="post" action="/api/auth/logout">
      ${csrfInput(csrfToken)}
      <input type="hidden" name="returnTo" value="${escapeAttribute(returnTo)}">
      <button type="submit">Logout</button>
    </form>`
  );
}

function safeReturnPath(value: string, env: Env): string {
  if (!value) return pagePath(startPageId(env));

  try {
    const parsed = new URL(value, "https://example.invalid");
    if (parsed.origin !== "https://example.invalid") return pagePath(startPageId(env));

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return pagePath(startPageId(env));
  }
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
  principal?: AuthPrincipal;
  updatedAt?: string;
}

function canonicalPageHref(env: Env, pageId: string): string {
  const config = getRuntimeConfig(env);
  const path = `${config.baseDir}${pagePath(pageId)}` || pagePath(pageId);

  if (!config.canonicalUrls) {
    return path;
  }

  const origin = config.baseUrl ?? env.CF_PAGES_URL ?? "https://example.invalid";
  return new URL(path, origin).href;
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
    ? `<link rel="canonical" href="${escapeAttribute(canonicalPageHref(env, pageId))}">`
    : "";
  const docInfo = options.updatedAt
    ? `<div class="docInfo">Last modified: ${escapeHtml(options.updatedAt)}</div>`
    : "";
  const disabledActions = new Set(config.disabledActions);
  const pageTools = pageId ? renderPageTools(pageId, disabledActions) : "";
  const siteToolNamespace = pageId ? namespaceForIndex(pageId) : namespaceForIndex(startId);
  const mediaManagerPath = `/media-manager?ns=${encodeURIComponent(siteToolNamespace)}`;
  const siteIndexPath = `/index?ns=${encodeURIComponent(siteToolNamespace)}`;
  const stylesheetPath = versionedAssetPath("/dokuwiki.css", env);
  const scriptPath = versionedAssetPath("/dokuwiki.js", env);
  const faviconPath = versionedAssetPath("/images/favicon.ico", env);
  const appleTouchIconPath = versionedAssetPath("/images/apple-touch-icon.png", env);
  const logoPath = versionedAssetPath("/dokuwiki-logo.png", env);

  return `<!doctype html>
<html lang="${escapeAttribute(config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - ${escapeHtml(siteName)}</title>
  <link rel="icon" href="${faviconPath}">
  <link rel="apple-touch-icon" href="${appleTouchIconPath}">
  ${canonicalLink}
  <link rel="stylesheet" href="${stylesheetPath}">
  <script src="${scriptPath}" defer></script>
</head>
<body class="dokuwiki">
  <div id="dokuwiki__site">
    <div id="dokuwiki__top" class="site dokuwiki mode_show tpl_dokuwiki">
      <header id="dokuwiki__header">
        <div class="pad group">
        <div class="headings">
          <ul class="a11y skip">
            <li><a href="#dokuwiki__content">Skip to content</a></li>
          </ul>
          <h1 class="logo"><a href="${startPath}"><img src="${logoPath}" alt=""><span>${escapeHtml(siteName)}</span></a></h1>
          <p class="claim">Cloudflare Pages DokuWiki port</p>
        </div>
        <div class="tools">
          ${renderUserTools(options.principal, pageId, disabledActions)}
          <nav id="dokuwiki__sitetools" aria-label="Site tools">
            <h3 class="a11y">Site tools</h3>
            <form class="search" method="get" action="/search">
              <label class="a11y" for="qsearch__in">Search</label>
              <input id="qsearch__in" name="q" type="search" placeholder="Search">
              <button type="submit">Search</button>
            </form>
            ${renderMobileTools(pageId, options.principal, disabledActions)}
            <ul>
              ${disabledActions.has("recent") ? "" : '<li><a href="/recent">Recent changes</a></li>'}
              ${disabledActions.has("media") ? "" : `<li><a href="${mediaManagerPath}">Media Manager</a></li>`}
              ${disabledActions.has("index") ? "" : `<li><a href="${siteIndexPath}">Sitemap</a></li>`}
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

function renderUserTools(
  principal?: AuthPrincipal,
  pageId?: string,
  disabledActions = new Set<string>()
): string {
  const actionLinks = accountActionLinks(pageId);
  const accountItems =
    principal?.type === "user"
      ? `${isManagerPrincipal(principal) && !disabledActions.has("admin") ? '<li class="action admin"><a href="/admin" rel="nofollow">Admin</a></li>' : ""}
        ${disabledActions.has("profile") ? "" : `<li class="action profile"><a href="${escapeAttribute(actionLinks.profile)}" rel="nofollow">Update Profile</a></li>`}
        ${disabledActions.has("logout") ? "" : `<li class="action logout"><a href="${escapeAttribute(actionLinks.logout)}" rel="nofollow">Log Out</a></li>`}`
      : `${disabledActions.has("login") ? "" : `<li class="action login"><a href="${escapeAttribute(actionLinks.login)}" rel="nofollow">Log In</a></li>`}
        ${disabledActions.has("register") ? "" : `<li class="action register"><a href="${escapeAttribute(actionLinks.register)}" rel="nofollow">Register</a></li>`}`;

  return `<nav id="dokuwiki__usertools" aria-label="User tools">
            <h3 class="a11y">User tools</h3>
            <ul>${accountItems}</ul>
          </nav>`;
}

function renderMobileTools(
  pageId?: string,
  principal?: AuthPrincipal,
  disabledActions = new Set<string>()
): string {
  const actionLinks = accountActionLinks(pageId);
  const siteToolNamespace = pageId ? namespaceForIndex(pageId) : "wiki";
  const mediaManagerPath = `/media-manager?ns=${encodeURIComponent(siteToolNamespace)}`;
  const siteIndexPath = `/index?ns=${encodeURIComponent(siteToolNamespace)}`;
  const pageOptions = pageId
    ? `${disabledActions.has("edit") ? "" : `<option value="${pagePath(pageId)}?do=edit">Edit this page</option>`}
      ${disabledActions.has("source") ? "" : `<option value="${pagePath(pageId)}?do=source">Show source</option>`}
      ${disabledActions.has("revisions") ? "" : `<option value="${pagePath(pageId)}?do=revisions">Old revisions</option>`}
      ${disabledActions.has("backlink") ? "" : `<option value="${pagePath(pageId)}?do=backlink">Backlinks</option>`}
      ${disabledActions.has("subscribe") ? "" : `<option value="${pagePath(pageId)}?do=subscribe">Subscribe</option>`}`
    : "";
  const accountOptions =
    principal?.type === "user"
      ? `${isManagerPrincipal(principal) && !disabledActions.has("admin") ? '<option value="/admin">Admin</option>' : ""}
        ${disabledActions.has("profile") ? "" : `<option value="${escapeAttribute(actionLinks.profile)}">Update Profile</option>`}
        ${disabledActions.has("logout") ? "" : `<option value="${escapeAttribute(actionLinks.logout)}">Log Out</option>`}`
      : `${disabledActions.has("login") ? "" : `<option value="${escapeAttribute(actionLinks.login)}">Log In</option>`}
        ${disabledActions.has("register") ? "" : `<option value="${escapeAttribute(actionLinks.register)}">Register</option>`}`;

  return `<div class="mobileTools">
      <label class="a11y" for="mobile__tools">Tools</label>
      <select id="mobile__tools">
        <option value="">Tools</option>
        ${pageOptions}
        ${disabledActions.has("recent") ? "" : '<option value="/recent">Recent changes</option>'}
        ${disabledActions.has("media") ? "" : `<option value="${mediaManagerPath}">Media Manager</option>`}
        ${disabledActions.has("index") ? "" : `<option value="${siteIndexPath}">Sitemap</option>`}
        ${disabledActions.has("search") ? "" : '<option value="/search">Search</option>'}
        <option value="/diagnostics">Diagnostics</option>
        ${accountOptions}
      </select>
    </div>`;
}

function accountActionLinks(pageId?: string): {
  login: string;
  logout: string;
  profile: string;
  register: string;
} {
  if (!pageId) {
    return {
      login: "/login",
      logout: "/logout",
      profile: "/profile",
      register: "/register"
    };
  }

  const currentPagePath = pagePath(pageId);
  return {
    login: `${currentPagePath}?do=login`,
    logout: `${currentPagePath}?do=logout`,
    profile: `${currentPagePath}?do=profile`,
    register: `${currentPagePath}?do=register`
  };
}

function renderPageTools(pageId: string, disabledActions = new Set<string>()): string {
  return `<nav id="dokuwiki__pagetools" aria-labelledby="dokuwiki__pagetools__heading">
    <h3 class="a11y" id="dokuwiki__pagetools__heading">Page tools</h3>
    <div class="tools">
      <ul>
        ${disabledActions.has("edit") ? "" : `<li class="edit"><a href="${pagePath(pageId)}?do=edit" aria-label="Edit this page"><span class="label">Edit</span><span class="icon" aria-hidden="true"></span></a></li>`}
        ${disabledActions.has("source") ? "" : `<li class="source"><a href="${pagePath(pageId)}?do=source" aria-label="Show page source"><span class="label">Source</span><span class="icon" aria-hidden="true"></span></a></li>`}
        ${disabledActions.has("revisions") ? "" : `<li class="revisions"><a href="${pagePath(pageId)}?do=revisions" aria-label="Old revisions"><span class="label">Old revisions</span><span class="icon" aria-hidden="true"></span></a></li>`}
        ${disabledActions.has("backlink") ? "" : `<li class="backlink"><a href="${pagePath(pageId)}?do=backlink" aria-label="Backlinks"><span class="label">Backlinks</span><span class="icon" aria-hidden="true"></span></a></li>`}
        ${disabledActions.has("purge") ? "" : `<li class="purge"><a href="${pagePath(pageId)}?do=purge" aria-label="Purge cache"><span class="label">Purge cache</span><span class="icon" aria-hidden="true"></span></a></li>`}
        ${disabledActions.has("subscribe") ? "" : `<li class="subscribe"><a href="${pagePath(pageId)}?do=subscribe" aria-label="Manage subscriptions"><span class="label">Subscribe</span><span class="icon" aria-hidden="true"></span></a></li>`}
        <li class="top"><a href="#dokuwiki__top" aria-label="Back to top"><span class="label">Back to top</span><span class="icon" aria-hidden="true"></span></a></li>
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

interface CsrfContext {
  token: string;
}

function csrfContext(request: Request): CsrfContext {
  return {
    token: readCookie(request, CSRF_COOKIE_NAME) || randomCsrfToken()
  };
}

function htmlResponseWithCsrf(
  request: Request,
  body: string,
  csrf: CsrfContext,
  init: ResponseInit = {}
): Response {
  const response = htmlResponse(body, init);
  response.headers.append("set-cookie", csrfCookieHeader(csrf.token, request));
  return response;
}

function csrfInput(token: string): string {
  return `<input type="hidden" name="sectok" value="${escapeAttribute(token)}">`;
}

function renderTurnstileWidget(env: Env, action: "login" | "register"): string {
  const config = getTurnstileConfig(env);
  if (!config.enabled || !config.siteKey) return "";

  return `<div class="turnstile-field">
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <div class="cf-turnstile" data-sitekey="${escapeAttribute(config.siteKey)}" data-action="${action}"></div>
  </div>`;
}

function validateCsrf(request: Request, form: FormData): Response | null {
  const cookie = readCookie(request, CSRF_COOKIE_NAME);
  const token = String(
    request.headers.get("x-csrf-token") ?? form.get("sectok") ?? form.get("csrfToken") ?? ""
  );

  if (cookie && token && constantTimeEqual(cookie, token)) {
    return null;
  }

  if (acceptsJson(request)) {
    return jsonResponse({ error: "Invalid CSRF token." }, { status: 403 });
  }

  return htmlResponse("<h1>Invalid CSRF token</h1><p>Invalid CSRF token.</p>", {
    status: 403
  });
}

function csrfCookieHeader(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${CSRF_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CSRF_TTL_SECONDS}${secure}`;
}

function randomCsrfToken(): string {
  const bytes = new Uint8Array(CSRF_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function constantTimeEqual(left: string, right: string): boolean {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

async function handleEditPage(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  id: string,
  page: CurrentPage | null
): Promise<Response> {
  if (getRuntimeConfig(env).maintenanceMode) {
    return maintenanceModeResponse(request, env);
  }

  const denied = await requireAclPermission(
    request,
    env,
    principal,
    id,
    page ? ACL_EDIT : ACL_CREATE
  );
  if (denied) return denied;

  const draft = await getPageDraft(env.DB, id);
  const templateContent = !page && !draft ? await resolvePageTemplate(env.DB, id) : null;
  const cookieName = pageLockCookieName(id);
  const lockToken = readCookie(request, cookieName) || randomPageLockToken();
  const lock = await ensurePageEditLock(request, env, principal, id, lockToken);
  const csrf = csrfContext(request);

  if (!lock.ok) {
    return lockedResponse(request, env, id, lock.lock);
  }

  const response = htmlResponse(
    renderEditPage(id, page, draft, env, templateContent, lockToken, csrf.token)
  );
  response.headers.append("set-cookie", pageLockCookieHeader(cookieName, lockToken, request));
  response.headers.append("set-cookie", csrfCookieHeader(csrf.token, request));

  return response;
}

async function handleSave(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  overrideId?: string
): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const id = cleanPageId(String(form.get("id") || overrideId || ""));
  const content = String(form.get("content") ?? "");
  const summary = String(form.get("summary") ?? "");
  const submittedLockToken = String(form.get("lockToken") ?? "");
  const lockToken = submittedLockToken || randomPageLockToken();
  const author = principalAuthor(principal);

  if (!id) {
    return jsonResponse({ error: "Missing page id." }, { status: 400 });
  }

  const currentPage = await getCurrentPage(env.DB, id);
  const denied = await requireAclPermission(
    request,
    env,
    principal,
    id,
    currentPage ? ACL_EDIT : ACL_CREATE
  );
  if (denied) return denied;

  const rateLimited = await editRateLimitResponse(request, env, principal);
  if (rateLimited) return rateLimited;

  await recordEditAttempt(request, env, principal);

  const blocked = findWordblockMatch(`${content}\n${summary}`);
  if (blocked) {
    return wordblockResponse(request, env, id, content, blocked);
  }

  const lock = await ensurePageEditLock(request, env, principal, id, lockToken);

  if (!lock.ok) {
    return lockedResponse(request, env, id, lock.lock);
  }

  const result = await savePage(env.DB, {
    id,
    content,
    summary,
    baseRevisionId: String(form.get("baseRevisionId") || "") || null,
    changeType: form.get("minor") ? "minor" : undefined,
    authorId: author.authorId,
    authorName: author.authorName,
    ip: getClientIp(request)
  });

  if (!result.ok) {
    if (!submittedLockToken) {
      await releaseHeldPageLock(env, principal, id, lockToken);
    }

    const current = await getCurrentPage(env.DB, id);
    return htmlResponse(renderConflictPage(env, id, content, current), { status: 409 });
  }

  await purgePageCache(env, id, result.page.revisionId, new URL(request.url).origin);
  await deletePageDraft(env.DB, id);
  await releaseHeldPageLock(env, principal, id, lockToken);
  await recordAndSendPageChangeNotifications(
    request,
    env,
    result.page,
    result.changeType,
    summary,
    author
  );

  const response = redirectResponse(pagePath(id));
  response.headers.append("set-cookie", clearPageLockCookieHeader(pageLockCookieName(id), request));
  return response;
}

async function handleMediaUpload(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const startedAt = Date.now();
  if (!env.MEDIA_BUCKET) {
    return jsonResponse({ error: "Media bucket is not configured." }, { status: 503 });
  }

  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const file = form.get("file");

  if (!isUploadFile(file)) {
    return jsonResponse({ error: "Missing upload file." }, { status: 400 });
  }

  const namespace = cleanMediaId(String(form.get("ns") ?? ""));
  const requestedId = cleanMediaId(String(form.get("id") ?? ""));
  const id = requestedId || cleanMediaId([namespace, file.name].filter(Boolean).join(":"));

  if (!id) {
    return jsonResponse({ error: "Missing media id." }, { status: 400 });
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_UPLOAD);
  if (denied) return denied;

  const rateLimited = await uploadRateLimitResponse(request, env, principal);
  if (rateLimited) return rateLimited;

  await recordUploadAttempt(request, env, principal);

  const body = await file.arrayBuffer();
  const validation = validateMediaUpload({
    id,
    body,
    mimeType: file.type || null
  });

  if (!validation.ok) {
    if (acceptsJson(request)) {
      return jsonResponse({ error: validation.error }, { status: 400 });
    }

    return htmlResponse(
      htmlShell(env, "Media upload rejected", `<p>${escapeHtml(validation.error)}</p>`),
      { status: 400 }
    );
  }

  const author = principalAuthor(principal);
  const result = await saveMediaUpload(env.DB, env.MEDIA_BUCKET, {
    id,
    body,
    mimeType: file.type || null,
    summary: String(form.get("summary") ?? ""),
    overwrite: Boolean(form.get("overwrite")),
    authorId: author.authorId,
    authorName: author.authorName,
    ip: getClientIp(request)
  });

  if (!result.ok) {
    const message = `Media '${id}' already exists.`;
    if (acceptsJson(request)) {
      return jsonResponse({ error: message }, { status: 409 });
    }
    return htmlResponse(
      htmlShell(
        env,
        "Media upload conflict",
        `<h1>Media upload conflict</h1>
        <p>${escapeHtml(message)}</p>
        <p><a href="/media-manager?ns=${encodeURIComponent(namespace)}">Back to media manager</a></p>`
      ),
      { status: 409 }
    );
  }

  await purgeDependentRenderCache(env, "media", id);

  logMetric("media_metric", {
    operation: "upload",
    namespace: mediaNamespace(id) || null,
    changeType: result.changeType,
    byteLength: result.media.byteLength,
    durationMs: elapsedSince(startedAt)
  });

  if (acceptsJson(request)) {
    return jsonResponse({ ok: true, id, revisionId: result.revision.id });
  }

  return redirectResponse(mediaDetailPath(id));
}

async function handleMediaDelete(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const startedAt = Date.now();
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const id = cleanMediaId(String(form.get("id") ?? ""));

  if (!id) {
    return jsonResponse({ error: "Missing media id." }, { status: 400 });
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_DELETE);
  if (denied) return denied;

  const author = principalAuthor(principal);
  const result = await deleteMedia(env.DB, {
    id,
    summary: String(form.get("summary") ?? ""),
    authorId: author.authorId,
    authorName: author.authorName,
    ip: getClientIp(request)
  });

  if (!result.ok) {
    const message = `Media '${id}' was not found.`;
    if (acceptsJson(request)) {
      return jsonResponse({ error: message }, { status: 404 });
    }
    return htmlResponse(htmlShell(env, "Media not found", `<p>${escapeHtml(message)}</p>`), {
      status: 404
    });
  }

  await purgeDependentRenderCache(env, "media", id);

  logMetric("media_metric", {
    operation: "delete",
    namespace: mediaNamespace(id) || null,
    revisionId: result.revision.id,
    durationMs: elapsedSince(startedAt)
  });

  if (acceptsJson(request)) {
    return jsonResponse({ ok: true, id, revisionId: result.revision.id });
  }

  return redirectResponse(`/media-manager?ns=${encodeURIComponent(mediaNamespace(id))}`);
}

async function handleMediaRevert(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const startedAt = Date.now();
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const id = cleanMediaId(String(form.get("id") ?? ""));
  const revisionId = String(form.get("revisionId") ?? "");

  if (!id || !revisionId) {
    return jsonResponse({ error: "Missing media id or revision id." }, { status: 400 });
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_UPLOAD);
  if (denied) return denied;

  const author = principalAuthor(principal);
  const result = await revertMedia(env.DB, {
    id,
    revisionId,
    summary: String(form.get("summary") ?? ""),
    authorId: author.authorId,
    authorName: author.authorName,
    ip: getClientIp(request)
  });

  if (!result.ok) {
    const message =
      result.reason === "delete_revision"
        ? `Media revision '${revisionId}' is a delete revision and cannot be restored.`
        : `Media revision '${revisionId}' was not found.`;
    const status = result.reason === "delete_revision" ? 400 : 404;

    if (acceptsJson(request)) {
      return jsonResponse({ error: message }, { status });
    }

    return htmlResponse(htmlShell(env, "Media revert failed", `<p>${escapeHtml(message)}</p>`), {
      status
    });
  }

  await purgeDependentRenderCache(env, "media", id);

  logMetric("media_metric", {
    operation: "revert",
    namespace: mediaNamespace(id) || null,
    sourceRevisionId: revisionId,
    revisionId: result.revision.id,
    durationMs: elapsedSince(startedAt)
  });

  if (acceptsJson(request)) {
    return jsonResponse({ ok: true, id, revisionId: result.revision.id });
  }

  return redirectResponse(mediaDetailPath(id));
}

async function handleRevert(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const id = cleanPageId(String(form.get("id") ?? ""));
  const revisionId = String(form.get("revisionId") ?? "");
  const submittedLockToken = String(form.get("lockToken") ?? "");
  const lockToken = submittedLockToken || randomPageLockToken();
  const author = principalAuthor(principal);

  if (!id || !revisionId) {
    return jsonResponse({ error: "Missing page id or revision id." }, { status: 400 });
  }

  const denied = await requireAclPermission(request, env, principal, id, ACL_EDIT);
  if (denied) return denied;

  const rateLimited = await editRateLimitResponse(request, env, principal);
  if (rateLimited) return rateLimited;

  await recordEditAttempt(request, env, principal);

  const revision = await getPageRevision(env.DB, revisionId);
  if (!revision || revision.pageId !== id) {
    return notFoundResponse(`Revision '${revisionId}' was not found.`);
  }

  const blocked = findWordblockMatch(`${revision.content}\n${String(form.get("summary") ?? "")}`);
  if (blocked) {
    return wordblockResponse(request, env, id, revision.content, blocked);
  }

  const lock = await ensurePageEditLock(request, env, principal, id, lockToken);

  if (!lock.ok) {
    return lockedResponse(request, env, id, lock.lock);
  }

  const result = await savePage(env.DB, {
    id,
    content: revision.content,
    summary: String(form.get("summary") || "") || `Reverted to ${revision.createdAt}`,
    baseRevisionId: String(form.get("baseRevisionId") || "") || null,
    changeType: "revert",
    authorId: author.authorId,
    authorName: author.authorName,
    ip: getClientIp(request)
  });

  if (!result.ok) {
    if (!submittedLockToken) {
      await releaseHeldPageLock(env, principal, id, lockToken);
    }

    const current = await getCurrentPage(env.DB, id);
    return htmlResponse(renderConflictPage(env, id, revision.content, current), { status: 409 });
  }

  await purgePageCache(env, id, result.page.revisionId, new URL(request.url).origin);
  await releaseHeldPageLock(env, principal, id, lockToken);
  await recordAndSendPageChangeNotifications(
    request,
    env,
    result.page,
    result.changeType,
    String(form.get("summary") || "") || `Reverted to ${revision.createdAt}`,
    author
  );

  const response = redirectResponse(pagePath(id));
  response.headers.append("set-cookie", clearPageLockCookieHeader(pageLockCookieName(id), request));
  return response;
}

async function handleRefreshPageLock(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const id = cleanPageId(String(form.get("id") ?? ""));
  const lockToken = String(form.get("lockToken") ?? "");

  if (!id || !lockToken) {
    return jsonResponse({ error: "Missing page id or lock token." }, { status: 400 });
  }

  const page = await getCurrentPage(env.DB, id);
  const denied = await requireAclPermission(
    request,
    env,
    principal,
    id,
    page ? ACL_EDIT : ACL_CREATE
  );
  if (denied) return denied;

  const lock = await ensurePageEditLock(request, env, principal, id, lockToken);

  if (!lock.ok) {
    return jsonResponse({ error: "Page is locked.", lock: lock.lock }, { status: 423 });
  }

  const response = jsonResponse({ ok: true, lock: lock.lock });
  response.headers.append(
    "set-cookie",
    pageLockCookieHeader(pageLockCookieName(id), lockToken, request)
  );
  return response;
}

async function handleReleasePageLock(
  request: Request,
  env: Env,
  principal: AuthPrincipal
): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const id = cleanPageId(String(form.get("id") ?? ""));
  const lockToken = String(form.get("lockToken") ?? "");

  if (!id || !lockToken) {
    return jsonResponse({ error: "Missing page id or lock token." }, { status: 400 });
  }

  const page = await getCurrentPage(env.DB, id);
  const denied = await requireAclPermission(
    request,
    env,
    principal,
    id,
    page ? ACL_EDIT : ACL_CREATE
  );
  if (denied) return denied;

  await releaseHeldPageLock(env, principal, id, lockToken);
  const response = jsonResponse({ ok: true });
  response.headers.append("set-cookie", clearPageLockCookieHeader(pageLockCookieName(id), request));
  return response;
}

async function ensurePageEditLock(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  id: string,
  token: string
): Promise<{ ok: true; lock: PageLockInfo | null } | { ok: false; lock: PageLockInfo | null }> {
  if (!env.PAGE_LOCKS) {
    return { ok: true, lock: null };
  }

  const owner = pageLockOwner(principal, request);
  const lockRequest: PageLockRequest = {
    subjectType: "page",
    subjectId: id,
    ownerId: owner.ownerId,
    ownerName: owner.ownerName,
    token,
    ttlSeconds: PAGE_LOCK_TTL_SECONDS
  };

  return refreshPageLock(env.PAGE_LOCKS, lockRequest);
}

async function releaseHeldPageLock(
  env: Env,
  principal: AuthPrincipal,
  id: string,
  token: string
): Promise<void> {
  if (!env.PAGE_LOCKS || !token) return;

  const owner = pageLockOwner(principal);
  await releasePageLock(env.PAGE_LOCKS, {
    subjectType: "page",
    subjectId: id,
    ownerId: owner.ownerId,
    ownerName: owner.ownerName,
    token,
    ttlSeconds: PAGE_LOCK_TTL_SECONDS
  });
}

function lockedResponse(
  request: Request,
  env: Env,
  id: string,
  lock: PageLockInfo | null
): Response {
  if (acceptsJson(request)) {
    return jsonResponse({ error: "Page is locked.", lock }, { status: 423 });
  }

  return htmlResponse(renderLockedPage(env, id, lock), { status: 423 });
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

  const csrf = csrfContext(request);
  return htmlResponseWithCsrf(
    request,
    renderWordblockPage(env, id, content, blocked, csrf.token),
    csrf,
    { status: 400 }
  );
}

function renderWordblockPage(
  env: Env,
  id: string,
  content: string,
  blocked: WordblockMatch,
  csrfToken: string
): string {
  return htmlShell(
    env,
    `Blocked edit for ${id}`,
    `<h1>Blocked edit</h1>
    <p>${escapeHtml(WORD_BLOCK_MESSAGE)}</p>
    <p><strong>Blocked text:</strong> <code>${escapeHtml(blocked.match)}</code></p>
    <form method="post" action="/api/pages">
      ${csrfInput(csrfToken)}
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

async function handleSaveDraft(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  overrideId?: string
): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const id = cleanPageId(String(form.get("id") || overrideId || ""));
  const lockToken = String(form.get("lockToken") ?? "");
  const author = principalAuthor(principal);

  if (!id) {
    return jsonResponse({ error: "Missing page id." }, { status: 400 });
  }

  const page = await getCurrentPage(env.DB, id);
  const denied = await requireAclPermission(
    request,
    env,
    principal,
    id,
    page ? ACL_EDIT : ACL_CREATE
  );
  if (denied) return denied;

  if (lockToken) {
    const lock = await ensurePageEditLock(request, env, principal, id, lockToken);

    if (!lock.ok) {
      return lockedResponse(request, env, id, lock.lock);
    }
  }

  await savePageDraft(
    env.DB,
    id,
    String(form.get("content") ?? ""),
    String(form.get("baseRevisionId") || "") || null,
    author.authorId
  );

  if (acceptsJson(request)) {
    const response = jsonResponse({ ok: true, id });

    if (lockToken) {
      response.headers.append(
        "set-cookie",
        pageLockCookieHeader(pageLockCookieName(id), lockToken, request)
      );
    }

    return response;
  }

  const response = redirectResponse(`${pagePath(id)}?do=edit`);

  if (lockToken) {
    response.headers.append(
      "set-cookie",
      pageLockCookieHeader(pageLockCookieName(id), lockToken, request)
    );
  }

  return response;
}

function acceptsJson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  const requestedWith = request.headers.get("x-requested-with") ?? "";
  return accept.includes("application/json") || requestedWith.toLowerCase() === "xmlhttprequest";
}

function maintenanceWriteResponse(request: Request, env: Env, url: URL): Response | null {
  if (!getRuntimeConfig(env).maintenanceMode) return null;
  if (!isMaintenanceWriteRoute(url.pathname, request.method)) return null;

  return maintenanceModeResponse(request, env);
}

function isMaintenanceWriteRoute(pathname: string, method: string): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;
  if (pathname === "/api/pages/preview") return false;
  if (pathname.startsWith("/api/pages")) return true;
  if (pathname.startsWith("/api/media")) return true;
  if (pathname === "/api/v1/pages" && method === "POST") return true;
  if (pathname === "/api/v1/pages/revert" && method === "POST") return true;
  if (pathname === "/api/v1/media" && method !== "GET") return true;
  if (pathname === "/api/v1/media/revert" && method === "POST") return true;
  return false;
}

function maintenanceModeResponse(request: Request, env: Env): Response {
  const message = "Wiki is in maintenance mode; content writes are temporarily disabled.";
  const headers = { "retry-after": "300" };

  if (acceptsJson(request)) {
    return jsonResponse({ error: message }, { status: 503, headers });
  }

  return htmlResponse(
    htmlShell(env, "Maintenance mode", `<h1>Maintenance mode</h1><p>${escapeHtml(message)}</p>`),
    {
      status: 503,
      headers
    }
  );
}

async function requireAclPermission(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  subjectId: string,
  requiredPermission: number
): Promise<Response | null> {
  const permission = await resolveRequestAclPermission(env, subjectId, principal);

  if (hasAclPermission(permission, requiredPermission)) {
    return null;
  }

  return aclDeniedResponse(request, env, subjectId, permission, requiredPermission);
}

async function resolveRequestAclPermission(
  env: Env,
  subjectId: string,
  principal: AuthPrincipal
): Promise<number> {
  const rules = await listAclRules(env);
  return resolveAclPermission(rules, subjectId, principal);
}

async function renderCacheModeForPage(env: Env, subjectId: string): Promise<RenderCacheMode> {
  const rules = await listAclRules(env);
  const anonymousPermission = resolveAclPermission(rules, subjectId, anonymousPrincipal());
  return hasAclPermission(anonymousPermission, ACL_READ) ? "shared" : "private";
}

async function listAclRules(env: Env) {
  return new D1AclStore(env.DB).listAllRules();
}

function aclDeniedResponse(
  request: Request,
  env: Env,
  subjectId: string,
  permission: number,
  requiredPermission: number
): Response {
  const message = `Permission denied for '${subjectId}'.`;

  if (acceptsJson(request)) {
    return jsonResponse(
      {
        error: message,
        permission,
        requiredPermission
      },
      { status: 403 }
    );
  }

  return htmlResponse(
    htmlShell(
      env,
      "Permission denied",
      `<h1>Permission denied</h1>
      <p>${escapeHtml(message)}</p>
      <p>Required permission: ${requiredPermission}. Current permission: ${permission}.</p>`
    ),
    { status: 403 }
  );
}

function adminDeniedResponse(request: Request, env: Env): Response {
  if (acceptsJson(request)) {
    return jsonResponse({ error: "Admin privileges are required." }, { status: 403 });
  }

  return htmlResponse(
    htmlShell(
      env,
      "Admin access required",
      "<h1>Admin access required</h1><p>Admin privileges are required.</p>"
    ),
    { status: 403 }
  );
}

function accountLoginRequiredResponse(request: Request, env: Env, returnTo: string): Response {
  if (acceptsJson(request) || new URL(request.url).pathname.startsWith("/api/")) {
    return jsonResponse({ error: "Login is required." }, { status: 401 });
  }

  return redirectResponse(`/login?returnTo=${encodeURIComponent(safeReturnPath(returnTo, env))}`);
}

function managerDeniedResponse(request: Request, env: Env): Response {
  if (acceptsJson(request)) {
    return jsonResponse({ error: "Manager privileges are required." }, { status: 403 });
  }

  return htmlResponse(
    htmlShell(
      env,
      "Manager access required",
      "<h1>Manager access required</h1><p>Manager privileges are required.</p>"
    ),
    { status: 403 }
  );
}

function aclAdminErrorResponse(request: Request, env: Env, message: string): Response {
  if (acceptsJson(request)) {
    return jsonResponse({ error: message }, { status: 400 });
  }

  return htmlResponse(htmlShell(env, "ACL rule rejected", `<p>${escapeHtml(message)}</p>`), {
    status: 400
  });
}

function userAdminErrorResponse(
  request: Request,
  env: Env,
  message: string,
  status = 400
): Response {
  if (acceptsJson(request)) {
    return jsonResponse({ error: message }, { status });
  }

  return htmlResponse(htmlShell(env, "User update rejected", `<p>${escapeHtml(message)}</p>`), {
    status
  });
}

function isAdminPrincipal(principal: AuthPrincipal): boolean {
  return principal.type === "user" && principal.groups.includes("admin");
}

function isManagerPrincipal(principal: AuthPrincipal): boolean {
  return (
    principal.type === "user" &&
    (principal.groups.includes("admin") || principal.groups.includes("manager"))
  );
}

function normalizeAclAdminScope(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function parseAclPrincipalType(value: string): AclRuleRecord["principalType"] | null {
  return value === "all" || value === "group" || value === "user" ? value : null;
}

function normalizeAclAdminPrincipal(
  principalType: AclRuleRecord["principalType"],
  value: string
): string {
  const principal = value.trim();

  if (principalType === "all") return "@ALL";
  if (principalType === "group") {
    if (principal === "%GROUP%") return principal;
    return principal ? (principal.startsWith("@") ? principal : `@${principal}`) : "";
  }

  if (principal === "%USER%") return principal;
  return principal.replace(/^@+/, "");
}

function stableAclRuleId(
  scope: string,
  principalType: AclRuleRecord["principalType"],
  principal: string
): string {
  return `acl:${encodeURIComponent(scope)}:${principalType}:${encodeURIComponent(principal)}`;
}

async function filterReadablePageItems<T extends { id: string }>(
  env: Env,
  principal: AuthPrincipal,
  items: T[]
): Promise<T[]> {
  return filterReadablePageItemsWithRules(env, await listAclRules(env), principal, items);
}

async function filterReadableChanges<T extends { subjectId: string }>(
  env: Env,
  principal: AuthPrincipal,
  changes: T[]
): Promise<T[]> {
  const rules = await listAclRules(env);
  return changes.filter((change) => isReadablePageId(env, rules, principal, change.subjectId));
}

function filterReadablePageItemsWithRules<T extends { id: string }>(
  env: Env,
  rules: Awaited<ReturnType<typeof listAclRules>>,
  principal: AuthPrincipal,
  items: T[]
): T[] {
  return items.filter((item) => isReadablePageId(env, rules, principal, item.id));
}

function isReadablePageId(
  env: Env,
  rules: Awaited<ReturnType<typeof listAclRules>>,
  principal: AuthPrincipal,
  id: string
): boolean {
  return (
    !isHiddenPageId(env, id) &&
    hasAclPermission(resolveAclPermission(rules, id, principal), ACL_READ)
  );
}

function canListNamespace(
  env: Env,
  rules: Awaited<ReturnType<typeof listAclRules>>,
  principal: AuthPrincipal,
  namespace: string
): boolean {
  if (!getRuntimeConfig(env).sneakyIndex) return true;
  return hasAclPermission(
    resolveAclPermission(rules, namespace ? `${namespace}:*` : "*", principal),
    ACL_READ
  );
}

function isHiddenPageId(env: Env, id: string): boolean {
  const pattern = getRuntimeConfig(env).hidePages;
  if (!pattern) return false;

  try {
    return new RegExp(pattern, "iu").test(`:${id}`);
  } catch {
    return false;
  }
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

async function handleDeleteDraft(
  request: Request,
  env: Env,
  principal: AuthPrincipal,
  overrideId?: string,
  redirectTarget?: string
): Promise<Response> {
  const form = await request.formData();
  const csrfFailure = validateCsrf(request, form);
  if (csrfFailure) return csrfFailure;

  const id = cleanPageId(String(form.get("id") || overrideId || ""));
  const lockToken = String(form.get("lockToken") ?? "");

  if (!id) {
    return jsonResponse({ error: "Missing page id." }, { status: 400 });
  }

  const page = await getCurrentPage(env.DB, id);
  const denied = await requireAclPermission(
    request,
    env,
    principal,
    id,
    page ? ACL_EDIT : ACL_CREATE
  );
  if (denied) return denied;

  await deletePageDraft(env.DB, id);
  await releaseHeldPageLock(env, principal, id, lockToken);

  const response = redirectResponse(redirectTarget ?? `${pagePath(id)}?do=edit`);
  response.headers.append("set-cookie", clearPageLockCookieHeader(pageLockCookieName(id), request));
  return response;
}

function renderLockedPage(env: Env, id: string, lock: PageLockInfo | null): string {
  const lockDetails = lock
    ? `<p>${escapeHtml(id)} is currently being edited by ${escapeHtml(lock.ownerName || "another editor")}.</p>
      <p>The current lock expires at ${escapeHtml(lock.expiresAt)}.</p>`
    : `<p>${escapeHtml(id)} does not currently have an active edit lock.</p>`;

  return htmlShell(
    env,
    `Page locked for ${id}`,
    `<h1>Page locked</h1>
    ${lockDetails}
    <p><a href="${pagePath(id)}">View current page</a></p>`,
    { pageId: id }
  );
}

function pageLockOwner(
  principal: AuthPrincipal,
  request?: Request
): { ownerId: string; ownerName: string } {
  if (principal.type === "user") {
    return {
      ownerId: principal.id,
      ownerName: principal.displayName || principal.username
    };
  }

  const ip = request ? getClientIp(request) : null;

  return {
    ownerId: ip ? `anonymous:${ip}` : "anonymous",
    ownerName: "Anonymous"
  };
}

function pageLockCookieName(id: string): string {
  return `DW_LOCK_${fnv1a(id)}`;
}

function pageLockCookieHeader(name: string, token: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${PAGE_LOCK_TTL_SECONDS}${secure}`;
}

function clearPageLockCookieHeader(name: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function randomPageLockToken(): string {
  const bytes = new Uint8Array(PAGE_LOCK_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function randomBase64Url(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Hex(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

function renderEditPage(
  id: string,
  page: Awaited<ReturnType<typeof getCurrentPage>>,
  draft: PageDraft | null,
  env: Env,
  templateContent: string | null = null,
  lockToken = "",
  csrfToken = ""
): string {
  const title = page?.title ?? id;
  const content = draft?.content ?? page?.content ?? templateContent ?? "";
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
    <form id="dw__editform" class="edit" method="post" action="/api/pages" data-lock-url="/api/pages/lock" data-lock-release-url="/api/pages/lock/release">
      ${csrfInput(csrfToken)}
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <input type="hidden" name="baseRevisionId" value="${escapeHtml(baseRevisionId)}">
      <input type="hidden" name="lockToken" value="${escapeHtml(lockToken)}">
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
  const startedAt = Date.now();
  const keys = new Set([`page:${id}`, `page:${id}:${revisionId}`]);

  for (const key of await dependentRenderCacheKeys(env, "page", id)) {
    keys.add(key);
  }

  if (origin) {
    for (const kind of DISCOVERY_CACHE_KINDS) {
      keys.add(discoveryCacheKey(kind, origin));
    }
  }

  const cacheKeys = [...keys];
  await Promise.all(cacheKeys.map((key) => env.RENDER_CACHE.delete(key)));
  await deleteRenderCacheDependencyRows(env, cacheKeys);
  logMetric("cache_metric", {
    cache: "rendered_page",
    action: "purge",
    keyCount: cacheKeys.length,
    durationMs: elapsedSince(startedAt)
  });
}

async function purgeDependentRenderCache(
  env: Env,
  dependencyType: CacheDependency["subjectType"],
  dependencyId: string
): Promise<void> {
  const startedAt = Date.now();
  const keys = await dependentRenderCacheKeys(env, dependencyType, dependencyId);
  if (keys.length === 0) return;

  await Promise.all(keys.map((key) => env.RENDER_CACHE.delete(key)));
  await deleteRenderCacheDependencyRows(env, keys);
  logMetric("cache_metric", {
    cache: "rendered_page",
    action: "dependency_purge",
    dependencyType,
    dependencyId,
    keyCount: keys.length,
    durationMs: elapsedSince(startedAt)
  });
}

interface GlobalCachePurgeResult {
  kvKeysPurged: number;
  d1RowsPurged: boolean;
}

async function purgeGlobalCache(env: Env): Promise<GlobalCachePurgeResult> {
  const startedAt = Date.now();
  const kvKeysPurged = await purgeKvCachePrefixes(env, ["page:", "discovery:"]);

  await env.DB.prepare("delete from rendered_cache").run();
  await env.DB.prepare("delete from cache_dependencies")
    .run()
    .catch(() => undefined);

  logMetric("cache_metric", {
    cache: "global",
    action: "purge",
    kvKeysPurged,
    d1RowsPurged: true,
    durationMs: elapsedSince(startedAt)
  });

  return {
    kvKeysPurged,
    d1RowsPurged: true
  };
}

async function purgeKvCachePrefixes(env: Env, prefixes: string[]): Promise<number> {
  let purged = 0;

  for (const prefix of prefixes) {
    let cursor: string | undefined;

    do {
      const listed = await env.RENDER_CACHE.list({ prefix, cursor });
      await Promise.all(listed.keys.map((key) => env.RENDER_CACHE.delete(key.name)));
      purged += listed.keys.length;
      cursor = listed.list_complete ? undefined : listed.cursor;
    } while (cursor);
  }

  return purged;
}

async function cachedXmlResponse(
  env: Env,
  kind: DiscoveryCacheKind,
  url: URL,
  contentType: string,
  render: () => Promise<string>
): Promise<Response> {
  const startedAt = Date.now();
  const cacheKey = discoveryCacheKey(kind, url.origin);
  const cached = await readTextCache(env, cacheKey);
  const cacheHeaders = { "cache-control": `public, max-age=${DISCOVERY_CACHE_TTL_SECONDS}` };

  if (cached) {
    logMetric("cache_metric", {
      cache: "discovery",
      kind,
      action: "hit",
      cacheKey,
      durationMs: elapsedSince(startedAt)
    });
    return xmlResponse(cached, contentType, cacheHeaders);
  }

  logMetric("cache_metric", {
    cache: "discovery",
    kind,
    action: "miss",
    cacheKey,
    durationMs: elapsedSince(startedAt)
  });
  const body = await render();
  await writeTextCache(env, cacheKey, body, DISCOVERY_CACHE_TTL_SECONDS);
  logMetric("cache_metric", {
    cache: "discovery",
    kind,
    action: "write",
    cacheKey,
    durationMs: elapsedSince(startedAt)
  });
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
  const payload = JSON.stringify(entry);
  if (payload.length > MAX_RENDER_CACHE_ENTRY_BYTES) return;

  try {
    await env.RENDER_CACHE.put(cacheKey, payload, {
      expirationTtl: RENDER_CACHE_TTL_SECONDS
    });
    await replaceRenderCacheDependencies(env, cacheKey, entry.dependencies ?? []);
  } catch {
    // Rendering should remain available when KV is degraded.
  }
}

async function replaceRenderCacheDependencies(
  env: Env,
  cacheKey: string,
  dependencies: CacheDependency[]
): Promise<void> {
  const uniqueDependencies = uniqueCacheDependencies(dependencies).slice(0, 100);
  const statements = [
    env.DB.prepare("delete from cache_dependencies where cache_key = ?").bind(cacheKey),
    ...uniqueDependencies.map((dependency) =>
      env.DB.prepare(
        `insert into cache_dependencies (
             cache_key, dependency_type, dependency_id
           ) values (?, ?, ?)
           on conflict(cache_key, dependency_type, dependency_id) do nothing`
      ).bind(cacheKey, dependency.subjectType, dependency.subjectId)
    )
  ];

  try {
    await env.DB.batch(statements);
  } catch {
    // Dependency tracking is an invalidation aid; cache writes should still succeed.
  }
}

async function dependentRenderCacheKeys(
  env: Env,
  dependencyType: CacheDependency["subjectType"],
  dependencyId: string
): Promise<string[]> {
  try {
    const result = await env.DB.prepare(
      `select cache_key
       from cache_dependencies
       where dependency_type = ? and dependency_id = ?`
    )
      .bind(dependencyType, dependencyId)
      .all<{ cache_key: string }>();

    return result.results.map((row) => row.cache_key);
  } catch {
    return [];
  }
}

async function deleteRenderCacheDependencyRows(env: Env, cacheKeys: string[]): Promise<void> {
  const uniqueKeys = [...new Set(cacheKeys)].filter((key) => key.startsWith("page:"));
  if (uniqueKeys.length === 0) return;

  try {
    await env.DB.batch(
      uniqueKeys.map((key) =>
        env.DB.prepare("delete from cache_dependencies where cache_key = ?").bind(key)
      )
    );
  } catch {
    // KV purge already happened; stale dependency rows will be replaced on next write.
  }
}

function uniqueCacheDependencies(dependencies: CacheDependency[]): CacheDependency[] {
  const unique = new Map<string, CacheDependency>();

  for (const dependency of dependencies) {
    if (!dependency.subjectId) continue;
    unique.set(`${dependency.subjectType}:${dependency.subjectId}`, dependency);
  }

  return [...unique.values()].sort(
    (a, b) => a.subjectType.localeCompare(b.subjectType) || a.subjectId.localeCompare(b.subjectId)
  );
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
