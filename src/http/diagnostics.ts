import type { Env } from "../env";
import { APP_VERSION } from "../version";

export type StorageCheckStatus = "ok" | "error" | "not_configured";

export interface StorageCheck {
  ok: boolean;
  status: StorageCheckStatus;
  message: string;
  latencyMs?: number;
}

export interface DiagnosticsSnapshot {
  ok: boolean;
  service: string;
  version: string;
  generatedAt: string;
  site: {
    siteName: string;
    startPage: string;
  };
  deployment: {
    branch: string | null;
    commitSha: string | null;
    pagesUrl: string | null;
  };
  bindings: {
    d1: boolean;
    r2: boolean;
    kv: boolean;
    durableObjects: boolean;
  };
  storage: {
    d1: StorageCheck;
    kv: StorageCheck;
    r2: StorageCheck;
    durableObjects: StorageCheck;
  };
}

export async function collectDiagnostics(env: Env): Promise<DiagnosticsSnapshot> {
  const storage = {
    d1: await checkD1(env),
    kv: await checkKv(env),
    r2: await checkR2(env),
    durableObjects: checkDurableObjects(env)
  };
  const ok = storage.d1.ok && storage.kv.ok && storage.r2.status !== "error";

  return {
    ok,
    service: "dokuwiki-pages-dev-port",
    version: env.APP_VERSION ?? APP_VERSION,
    generatedAt: new Date().toISOString(),
    site: {
      siteName: env.SITE_NAME ?? "DokuWiki Pages.dev Port",
      startPage: env.START_PAGE ?? "wiki:welcome"
    },
    deployment: {
      branch: env.CF_PAGES_BRANCH ?? null,
      commitSha: env.CF_PAGES_COMMIT_SHA ?? null,
      pagesUrl: env.CF_PAGES_URL ?? null
    },
    bindings: {
      d1: Boolean(env.DB),
      r2: Boolean(env.MEDIA_BUCKET),
      kv: Boolean(env.RENDER_CACHE),
      durableObjects: Boolean(env.PAGE_LOCKS)
    },
    storage
  };
}

async function checkD1(env: Env): Promise<StorageCheck> {
  if (!env.DB) {
    return notConfigured("D1 database binding is missing.");
  }

  return timedCheck(async () => {
    const row = await env.DB.prepare("select 1 as ok").bind().first<{ ok: number }>();
    return row?.ok === 1
      ? { ok: true, status: "ok", message: "D1 query succeeded." }
      : { ok: false, status: "error", message: "D1 query returned an unexpected result." };
  });
}

async function checkKv(env: Env): Promise<StorageCheck> {
  if (!env.RENDER_CACHE) {
    return notConfigured("Render cache KV binding is missing.");
  }

  return timedCheck(async () => {
    await env.RENDER_CACHE.get("__diagnostics_probe__");
    return { ok: true, status: "ok", message: "KV read succeeded." };
  });
}

async function checkR2(env: Env): Promise<StorageCheck> {
  const bucket = env.MEDIA_BUCKET;

  if (!bucket) {
    return notConfigured("Media R2 bucket is not configured.");
  }

  return timedCheck(async () => {
    await bucket.head("__diagnostics_probe__");
    return { ok: true, status: "ok", message: "R2 metadata read succeeded." };
  });
}

function checkDurableObjects(env: Env): StorageCheck {
  if (!env.PAGE_LOCKS) {
    return notConfigured("Page lock Durable Object binding is not configured.");
  }

  return {
    ok: true,
    status: "ok",
    message: "Durable Object binding is configured."
  };
}

function notConfigured(message: string): StorageCheck {
  return {
    ok: false,
    status: "not_configured",
    message
  };
}

async function timedCheck(check: () => Promise<StorageCheck>): Promise<StorageCheck> {
  const start = Date.now();

  try {
    const result = await check();
    return { ...result, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown storage error.",
      latencyMs: Date.now() - start
    };
  }
}
