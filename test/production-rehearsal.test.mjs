import { describe, expect, it } from "vitest";
import {
  buildProductionRehearsalPlan,
  parseProductionRehearsalArgs,
  validateDiagnosticsForRehearsal
} from "../scripts/production-rehearsal.mjs";

describe("production rehearsal", () => {
  it("builds a final import, remote resource, and rollback verification plan", () => {
    const args = parseProductionRehearsalArgs([
      "--source",
      "../dokuwiki-final",
      "--database",
      "prod_doku",
      "--bucket",
      "prod-media",
      "--base-url",
      "https://wiki.example.com",
      "--work-dir",
      ".wrangler/rehearsal-prod"
    ]);
    const plan = buildProductionRehearsalPlan(args);

    expect(plan.steps.map((step) => step.id)).toEqual([
      "final-source-import-artifacts",
      "remote-d1-migrations",
      "remote-pre-import-backup",
      "verify-pre-import-backup",
      "remote-d1-final-import",
      "remote-r2-final-import",
      "remote-import-hash-verification",
      "post-import-content-review",
      "remote-diagnostics",
      "remote-smoke-tests",
      "remote-alert-checks",
      "local-rollback-restore"
    ]);
    expect(plan.steps.find((step) => step.id === "remote-d1-final-import")).toMatchObject({
      mutatesRemote: true,
      resources: ["D1"]
    });
    expect(plan.steps.find((step) => step.id === "remote-r2-final-import")).toMatchObject({
      mutatesRemote: true,
      resources: ["R2"]
    });
    expect(plan.steps.find((step) => step.id === "remote-diagnostics")).toMatchObject({
      resources: ["D1", "R2", "KV", "Durable Object"]
    });
    expect(plan.steps.find((step) => step.id === "local-rollback-restore")).toMatchObject({
      mutatesLocal: true,
      validates: ["rollback"]
    });
    expect(plan.steps.find((step) => step.id === "post-import-content-review")).toMatchObject({
      command: "node",
      validates: ["production-content-review"]
    });
    expect(plan.artifacts.contentReview).toBe(
      ".wrangler/rehearsal-prod/post-import-content-review.md"
    );
  });

  it("supports dry-run parsing without requiring --yes", () => {
    expect(parseProductionRehearsalArgs(["--dry-run"])).toMatchObject({
      dryRun: true,
      source: "../dokuwiki",
      database: "dokuwiki_pages_dev",
      bucket: "dokuwiki-pages-dev-media"
    });
  });

  it("requires diagnostics coverage for D1, R2, KV, and Durable Objects", () => {
    const diagnostics = {
      ok: true,
      bindings: {
        d1: true,
        r2: true,
        kv: true,
        durableObjects: true
      },
      storage: {
        d1: { ok: true, status: "ok" },
        r2: { ok: true, status: "ok" },
        kv: { ok: true, status: "ok" },
        durableObjects: { ok: true, status: "ok" }
      }
    };

    expect(validateDiagnosticsForRehearsal(diagnostics)).toEqual({ ok: true, issues: [] });
    expect(
      validateDiagnosticsForRehearsal({
        ...diagnostics,
        bindings: { ...diagnostics.bindings, kv: false },
        storage: {
          ...diagnostics.storage,
          r2: { ok: false, status: "error" }
        }
      })
    ).toEqual({
      ok: false,
      issues: ["KV binding is not configured.", "r2 storage check was error."]
    });
  });
});
