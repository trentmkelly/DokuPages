import type { Env } from "../env";
import { getRuntimeConfig, validateRuntimeConfig, type ConfigValidation } from "../config";
import {
  dokuWikiCompatibilityInfoRows,
  infoRowsToRecord,
  pagesEnvironmentInfoRows,
  phpCompatibilityInfoRows
} from "../wiki/info-equivalents";
import {
  readImportedPluginEnablement,
  type ImportedPluginEnablementSnapshot
} from "../wiki/plugin-settings";

export type StorageCheckStatus = "ok" | "error" | "not_configured";
export type QuotaCheckStatus = "ok" | "warning" | "unconfigured" | "unavailable";

export interface StorageCheck {
  ok: boolean;
  status: StorageCheckStatus;
  message: string;
  latencyMs?: number;
}

export interface QuotaCheck {
  ok: boolean;
  status: QuotaCheckStatus;
  message: string;
  usageBytes: number | null;
  thresholdBytes: number | null;
  usageRatio: number | null;
  details?: Record<string, number>;
}

export interface DiagnosticsSnapshot {
  ok: boolean;
  service: string;
  version: string;
  generatedAt: string;
  site: {
    siteName: string;
    startPage: string;
    language: string;
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
  quotas: {
    d1Logical: QuotaCheck;
    r2Referenced: QuotaCheck;
    renderedCache: QuotaCheck;
  };
  migration: MigrationStatus;
  config: ConfigValidation;
  plugins: ImportedPluginEnablementSnapshot;
  info: {
    environment: Record<string, string>;
    php: Record<string, string>;
    dokuwiki: Record<string, string>;
  };
}

export interface MigrationStatus {
  ok: boolean;
  status: "ok" | "error" | "unavailable";
  message: string;
  latestSchemaVersion: number | null;
  schemaVersions: SchemaVersionStatus[];
  recentImportJobs: ImportJobStatus[];
}

export interface SchemaVersionStatus {
  version: number;
  appliedAt: string;
}

export interface ImportJobStatus {
  id: string;
  sourcePath: string;
  status: string;
  counts: unknown;
  errorCount: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export async function collectDiagnostics(env: Env): Promise<DiagnosticsSnapshot> {
  const runtimeConfig = getRuntimeConfig(env);
  const config = validateRuntimeConfig(env);
  const storage = {
    d1: await checkD1(env),
    kv: await checkKv(env),
    r2: await checkR2(env),
    durableObjects: checkDurableObjects(env)
  };
  const quotas = await readQuotaStatus(env, storage.d1.ok);
  const migration = await readMigrationStatus(env, storage.d1.ok);
  const plugins = storage.d1.ok
    ? await readImportedPluginEnablement(env.DB)
    : {
        sourceFiles: ["conf/plugins.php", "conf/plugins.local.php", "conf/plugins.required.php"],
        plugins: [],
        summary: { total: 0, enabled: 0, disabled: 0, locked: 0 },
        configs: [],
        configSummary: { total: 0, plugins: 0, locked: 0 }
      };
  const ok =
    storage.d1.ok &&
    storage.kv.ok &&
    storage.r2.status !== "error" &&
    migration.status !== "error" &&
    config.ok;

  return {
    ok,
    service: "dokuwiki-pages-dev-port",
    version: runtimeConfig.appVersion,
    generatedAt: new Date().toISOString(),
    site: {
      siteName: runtimeConfig.siteName,
      startPage: runtimeConfig.startPage,
      language: runtimeConfig.language
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
    storage,
    quotas,
    migration,
    config,
    plugins,
    info: {
      environment: infoRowsToRecord(pagesEnvironmentInfoRows()),
      php: infoRowsToRecord(phpCompatibilityInfoRows()),
      dokuwiki: infoRowsToRecord(dokuWikiCompatibilityInfoRows())
    }
  };
}

async function readQuotaStatus(
  env: Env,
  canQueryD1: boolean
): Promise<DiagnosticsSnapshot["quotas"]> {
  const thresholds = {
    d1Logical: integerEnv(env.QUOTA_D1_LOGICAL_WARN_BYTES),
    r2Referenced: integerEnv(env.QUOTA_R2_REFERENCED_WARN_BYTES),
    renderedCache: integerEnv(env.QUOTA_RENDER_CACHE_WARN_BYTES)
  };

  if (!canQueryD1) {
    return {
      d1Logical: quotaUnavailable(thresholds.d1Logical),
      r2Referenced: quotaUnavailable(thresholds.r2Referenced),
      renderedCache: quotaUnavailable(thresholds.renderedCache)
    };
  }

  try {
    const row = await env.DB.prepare(
      `select
         (select coalesce(sum(length(content)), 0) from page_revisions) as pageRevisionBytes,
         (select coalesce(sum(length(value_json)), 0) from metadata) as metadataBytes,
         (select coalesce(sum(length(details_json)), 0) from audit_log) as auditLogBytes,
         (select coalesce(sum(length(rendered_html)), 0) from rendered_cache) as renderedCacheBytes,
         (select count(*) from pages) as pageCount,
         (select count(*) from page_revisions) as pageRevisionCount,
         (select count(*) from metadata) as metadataCount,
         (select count(*) from rendered_cache) as renderedCacheEntryCount,
         (select count(*) from search_postings) as searchPostingCount,
         (select coalesce(sum(byte_length), 0)
          from (
            select object_key, max(byte_length) as byte_length
            from (
              select object_key, byte_length
              from media
              where object_key is not null and object_key <> '' and is_deleted = 0
              union all
              select object_key, byte_length
              from media_revisions
              where object_key is not null and object_key <> ''
            )
            group by object_key
          )) as r2ReferencedBytes,
         (select count(*)
          from (
            select object_key
            from (
              select object_key
              from media
              where object_key is not null and object_key <> '' and is_deleted = 0
              union all
              select object_key
              from media_revisions
              where object_key is not null and object_key <> ''
            )
            group by object_key
          )) as r2ReferencedObjectCount`
    )
      .bind()
      .first<QuotaUsageRow>();

    const usage = normalizeQuotaUsage(row);
    const d1LogicalBytes =
      usage.pageRevisionBytes +
      usage.metadataBytes +
      usage.auditLogBytes +
      usage.renderedCacheBytes;

    return {
      d1Logical: quotaCheck("D1 logical payload", d1LogicalBytes, thresholds.d1Logical, {
        pageCount: usage.pageCount,
        pageRevisionCount: usage.pageRevisionCount,
        metadataCount: usage.metadataCount,
        searchPostingCount: usage.searchPostingCount
      }),
      r2Referenced: quotaCheck(
        "R2 referenced media",
        usage.r2ReferencedBytes,
        thresholds.r2Referenced,
        {
          objectCount: usage.r2ReferencedObjectCount
        }
      ),
      renderedCache: quotaCheck(
        "Rendered cache payload",
        usage.renderedCacheBytes,
        thresholds.renderedCache,
        {
          entryCount: usage.renderedCacheEntryCount
        }
      )
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to calculate quota usage.";
    return {
      d1Logical: quotaUnavailable(thresholds.d1Logical, message),
      r2Referenced: quotaUnavailable(thresholds.r2Referenced, message),
      renderedCache: quotaUnavailable(thresholds.renderedCache, message)
    };
  }
}

interface QuotaUsageRow {
  pageRevisionBytes: number | null;
  metadataBytes: number | null;
  auditLogBytes: number | null;
  renderedCacheBytes: number | null;
  pageCount: number | null;
  pageRevisionCount: number | null;
  metadataCount: number | null;
  renderedCacheEntryCount: number | null;
  searchPostingCount: number | null;
  r2ReferencedBytes: number | null;
  r2ReferencedObjectCount: number | null;
}

interface NormalizedQuotaUsage {
  pageRevisionBytes: number;
  metadataBytes: number;
  auditLogBytes: number;
  renderedCacheBytes: number;
  pageCount: number;
  pageRevisionCount: number;
  metadataCount: number;
  renderedCacheEntryCount: number;
  searchPostingCount: number;
  r2ReferencedBytes: number;
  r2ReferencedObjectCount: number;
}

function normalizeQuotaUsage(row: QuotaUsageRow | null): NormalizedQuotaUsage {
  return {
    pageRevisionBytes: numberValue(row?.pageRevisionBytes),
    metadataBytes: numberValue(row?.metadataBytes),
    auditLogBytes: numberValue(row?.auditLogBytes),
    renderedCacheBytes: numberValue(row?.renderedCacheBytes),
    pageCount: numberValue(row?.pageCount),
    pageRevisionCount: numberValue(row?.pageRevisionCount),
    metadataCount: numberValue(row?.metadataCount),
    renderedCacheEntryCount: numberValue(row?.renderedCacheEntryCount),
    searchPostingCount: numberValue(row?.searchPostingCount),
    r2ReferencedBytes: numberValue(row?.r2ReferencedBytes),
    r2ReferencedObjectCount: numberValue(row?.r2ReferencedObjectCount)
  };
}

function quotaCheck(
  label: string,
  usageBytes: number,
  thresholdBytes: number | null,
  details: Record<string, number>
): QuotaCheck {
  if (thresholdBytes === null) {
    return {
      ok: true,
      status: "unconfigured",
      message: `${label} usage is ${usageBytes} bytes; no warning threshold is configured.`,
      usageBytes,
      thresholdBytes: null,
      usageRatio: null,
      details
    };
  }

  const usageRatio = thresholdBytes === 0 ? 1 : usageBytes / thresholdBytes;
  if (usageBytes >= thresholdBytes) {
    return {
      ok: false,
      status: "warning",
      message: `${label} usage is ${usageBytes} bytes, at or above the configured ${thresholdBytes} byte warning threshold.`,
      usageBytes,
      thresholdBytes,
      usageRatio,
      details
    };
  }

  return {
    ok: true,
    status: "ok",
    message: `${label} usage is ${usageBytes} bytes, below the configured ${thresholdBytes} byte warning threshold.`,
    usageBytes,
    thresholdBytes,
    usageRatio,
    details
  };
}

function quotaUnavailable(thresholdBytes: number | null, message?: string): QuotaCheck {
  return {
    ok: false,
    status: "unavailable",
    message: message ?? "Quota usage is unavailable because D1 is not healthy.",
    usageBytes: null,
    thresholdBytes,
    usageRatio: null
  };
}

function integerEnv(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

async function readMigrationStatus(env: Env, canQueryD1: boolean): Promise<MigrationStatus> {
  if (!canQueryD1) {
    return {
      ok: false,
      status: "unavailable",
      message: "Migration status is unavailable because D1 is not healthy.",
      latestSchemaVersion: null,
      schemaVersions: [],
      recentImportJobs: []
    };
  }

  try {
    const versions = await env.DB.prepare(
      `select version, applied_at
       from schema_versions
       order by version desc
       limit 5`
    )
      .bind()
      .all<SchemaVersionRow>();
    const jobs = await env.DB.prepare(
      `select id, source_path, status, counts_json, errors_json, started_at, finished_at
       from import_jobs
       order by started_at desc
       limit 5`
    )
      .bind()
      .all<ImportJobRow>();
    const schemaVersions = versions.results.map((row) => ({
      version: row.version,
      appliedAt: row.applied_at
    }));

    return {
      ok: true,
      status: "ok",
      message:
        schemaVersions.length === 0
          ? "No schema version rows have been recorded."
          : "Migration tables are readable.",
      latestSchemaVersion: schemaVersions[0]?.version ?? null,
      schemaVersions,
      recentImportJobs: jobs.results.map(mapImportJob)
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      message: error instanceof Error ? error.message : "Unable to read migration status.",
      latestSchemaVersion: null,
      schemaVersions: [],
      recentImportJobs: []
    };
  }
}

interface SchemaVersionRow {
  version: number;
  applied_at: string;
}

interface ImportJobRow {
  id: string;
  source_path: string;
  status: string;
  counts_json: string;
  errors_json: string;
  started_at: string;
  finished_at: string | null;
}

function mapImportJob(row: ImportJobRow): ImportJobStatus {
  const errors = parseJson(row.errors_json);

  return {
    id: row.id,
    sourcePath: row.source_path,
    status: row.status,
    counts: parseJson(row.counts_json),
    errorCount: Array.isArray(errors) ? errors.length : null,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
