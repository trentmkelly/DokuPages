#!/usr/bin/env node
/* global fetch */

import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "https://dokutest.pages.dev";
const DEFAULT_STORAGE_LATENCY_MS = 1000;

export function evaluateDiagnosticsAlerts(diagnostics, options = {}) {
  const storageLatencyMs = options.storageLatencyMs ?? DEFAULT_STORAGE_LATENCY_MS;
  const alerts = [];

  if (!diagnostics.ok) {
    alerts.push({
      id: "runtime_health_error",
      severity: "critical",
      message: "Diagnostics reported an unhealthy runtime.",
      details: { generatedAt: diagnostics.generatedAt ?? null }
    });
  }

  for (const [service, check] of Object.entries(diagnostics.storage ?? {})) {
    if (check?.status === "error") {
      alerts.push({
        id: "storage_failure",
        severity: "critical",
        message: `${service} storage check failed.`,
        details: { service, message: check.message ?? null }
      });
    }

    if (typeof check?.latencyMs === "number" && check.latencyMs > storageLatencyMs) {
      alerts.push({
        id: "quota_or_limit_pressure",
        severity: "warning",
        message: `${service} storage latency exceeded ${storageLatencyMs} ms.`,
        details: { service, latencyMs: check.latencyMs, thresholdMs: storageLatencyMs }
      });
    }

    if (/(?:rate|quota|limit)/i.test(check?.message ?? "")) {
      alerts.push({
        id: "quota_or_limit_pressure",
        severity: "critical",
        message: `${service} storage message indicates quota or rate-limit pressure.`,
        details: { service, message: check.message }
      });
    }
  }

  for (const [resource, check] of Object.entries(diagnostics.quotas ?? {})) {
    if (check?.status === "warning") {
      alerts.push({
        id: "quota_or_limit_pressure",
        severity: "warning",
        message: `${resource} quota usage reached its warning threshold.`,
        details: {
          resource,
          usageBytes: check.usageBytes ?? null,
          thresholdBytes: check.thresholdBytes ?? null,
          usageRatio: check.usageRatio ?? null
        }
      });
    }

    if (check?.status === "unavailable") {
      alerts.push({
        id: "quota_check_unavailable",
        severity: "warning",
        message: `${resource} quota usage check is unavailable.`,
        details: {
          resource,
          message: check.message ?? null
        }
      });
    }
  }

  if (diagnostics.migration?.status === "error") {
    alerts.push({
      id: "migration_failure",
      severity: "critical",
      message: "Migration diagnostics failed.",
      details: { message: diagnostics.migration.message ?? null }
    });
  }

  for (const job of diagnostics.migration?.recentImportJobs ?? []) {
    if (
      ["failed", "error"].includes(String(job.status).toLowerCase()) ||
      Number(job.errorCount) > 0
    ) {
      alerts.push({
        id: "migration_failure",
        severity: "critical",
        message: `Recent import job ${job.id} reported failure.`,
        details: {
          jobId: job.id,
          status: job.status,
          errorCount: job.errorCount,
          startedAt: job.startedAt
        }
      });
    }
  }

  return dedupeAlerts(alerts);
}

function dedupeAlerts(alerts) {
  const seen = new Set();
  return alerts.filter((alert) => {
    const key = `${alert.id}:${alert.severity}:${JSON.stringify(alert.details)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    diagnosticsUrl: "",
    storageLatencyMs: DEFAULT_STORAGE_LATENCY_MS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      args.baseUrl = argv[++index];
    } else if (arg === "--diagnostics-url") {
      args.diagnosticsUrl = argv[++index];
    } else if (arg === "--storage-latency-ms") {
      args.storageLatencyMs = Number(argv[++index]);
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const diagnosticsUrl =
    args.diagnosticsUrl || new URL("/api/diagnostics", normalizedBaseUrl(args.baseUrl)).toString();
  const response = await fetch(diagnosticsUrl, {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Diagnostics request failed with HTTP ${response.status}.`);
  }

  const diagnostics = await response.json();
  const alerts = evaluateDiagnosticsAlerts(diagnostics, {
    storageLatencyMs: args.storageLatencyMs
  });
  const result = {
    ok: alerts.length === 0,
    checkedAt: new Date().toISOString(),
    diagnosticsUrl,
    alerts
  };

  console.log(JSON.stringify(result, null, 2));
  if (alerts.length > 0) process.exitCode = 2;
}

function normalizedBaseUrl(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
