import { describe, expect, it } from "vitest";
import { evaluateDiagnosticsAlerts } from "../scripts/check-alerts.mjs";

describe("diagnostics alert evaluation", () => {
  it("returns no alerts for a healthy diagnostics snapshot", () => {
    expect(evaluateDiagnosticsAlerts(healthyDiagnostics())).toEqual([]);
  });

  it("alerts on unhealthy runtime and storage failures", () => {
    const diagnostics = healthyDiagnostics({
      ok: false,
      storage: {
        d1: {
          ok: false,
          status: "error",
          message: "D1 query failed.",
          latencyMs: 21
        }
      }
    });

    expect(evaluateDiagnosticsAlerts(diagnostics)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "runtime_health_error", severity: "critical" }),
        expect.objectContaining({
          id: "storage_failure",
          severity: "critical",
          details: expect.objectContaining({ service: "d1" })
        })
      ])
    );
  });

  it("alerts on migration failures and failed import jobs", () => {
    const diagnostics = healthyDiagnostics({
      migration: {
        status: "error",
        message: "Unable to read migration status.",
        recentImportJobs: [
          {
            id: "import-1",
            status: "failed",
            errorCount: 2,
            startedAt: "2026-05-08T00:00:00.000Z"
          }
        ]
      }
    });

    const alerts = evaluateDiagnosticsAlerts(diagnostics);

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "migration_failure", severity: "critical" }),
        expect.objectContaining({
          id: "migration_failure",
          details: expect.objectContaining({ jobId: "import-1", errorCount: 2 })
        })
      ])
    );
  });

  it("alerts on storage latency and quota or rate-limit messages", () => {
    const diagnostics = healthyDiagnostics({
      storage: {
        kv: {
          ok: true,
          status: "ok",
          message: "KV read succeeded.",
          latencyMs: 1200
        },
        r2: {
          ok: false,
          status: "error",
          message: "Storage is rate limited. Try again later.",
          latencyMs: 50
        }
      }
    });

    const alerts = evaluateDiagnosticsAlerts(diagnostics, { storageLatencyMs: 1000 });

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "quota_or_limit_pressure",
          severity: "warning",
          details: expect.objectContaining({ service: "kv", latencyMs: 1200 })
        }),
        expect.objectContaining({
          id: "quota_or_limit_pressure",
          severity: "critical",
          details: expect.objectContaining({ service: "r2" })
        })
      ])
    );
  });

  it("alerts on configured Cloudflare quota thresholds", () => {
    const diagnostics = healthyDiagnostics({
      quotas: {
        d1Logical: {
          ok: false,
          status: "warning",
          message: "D1 logical payload reached its warning threshold.",
          usageBytes: 1200,
          thresholdBytes: 1000,
          usageRatio: 1.2
        },
        r2Referenced: {
          ok: false,
          status: "unavailable",
          message: "Unable to calculate quota usage.",
          usageBytes: null,
          thresholdBytes: 1000,
          usageRatio: null
        }
      }
    });

    expect(evaluateDiagnosticsAlerts(diagnostics)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "quota_or_limit_pressure",
          severity: "warning",
          details: expect.objectContaining({
            resource: "d1Logical",
            usageBytes: 1200,
            thresholdBytes: 1000
          })
        }),
        expect.objectContaining({
          id: "quota_check_unavailable",
          severity: "warning",
          details: expect.objectContaining({
            resource: "r2Referenced"
          })
        })
      ])
    );
  });
});

function healthyDiagnostics(overrides = {}) {
  const storage = {
    d1: { ok: true, status: "ok", message: "D1 query succeeded.", latencyMs: 5 },
    kv: { ok: true, status: "ok", message: "KV read succeeded.", latencyMs: 5 },
    r2: { ok: true, status: "ok", message: "R2 metadata read succeeded.", latencyMs: 5 },
    durableObjects: { ok: true, status: "ok", message: "Durable Object binding configured." }
  };
  const migration = {
    status: "ok",
    message: "Migration tables are readable.",
    recentImportJobs: []
  };

  return {
    ok: true,
    generatedAt: "2026-05-08T00:00:00.000Z",
    ...overrides,
    storage: {
      ...storage,
      ...(overrides.storage ?? {})
    },
    quotas: {
      ...(overrides.quotas ?? {})
    },
    migration: {
      ...migration,
      ...(overrides.migration ?? {})
    }
  };
}
