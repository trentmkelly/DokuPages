import { describe, expect, it } from "vitest";
import {
  createConfigExport,
  getRuntimeConfig,
  getRuntimeConfigEntries,
  getSecretConfigStatus,
  validateRuntimeConfig
} from "../src/config";
import type { Env } from "../src/env";

describe("runtime config", () => {
  it("provides defaults for optional Pages environment variables", () => {
    expect(getRuntimeConfig({} as Env)).toMatchObject({
      siteName: "DokuWiki Pages",
      startPage: "wiki:welcome",
      language: "en",
      sessionCookieName: "DW_PAGES_SESSION",
      hidePages: null,
      sneakyIndex: false,
      maintenanceMode: false,
      appVersion: "0.1.0"
    });
    expect(validateRuntimeConfig({} as Env)).toEqual({
      ok: true,
      issues: []
    });
  });

  it("normalizes configured page ids and reports warnings", () => {
    const env = {
      START_PAGE: "Wiki/Welcome",
      WIKI_LANG: "pt_BR",
      HIDE_PAGES: ":hidden:",
      SNEAKY_INDEX: "1",
      MAINTENANCE_MODE: "true"
    } as Env;

    expect(getRuntimeConfig(env).startPage).toBe("wiki:welcome");
    expect(getRuntimeConfig(env).language).toBe("pt-br");
    expect(getRuntimeConfig(env).hidePages).toBe(":hidden:");
    expect(getRuntimeConfig(env).sneakyIndex).toBe(true);
    expect(getRuntimeConfig(env).maintenanceMode).toBe(true);
    expect(validateRuntimeConfig(env)).toMatchObject({
      ok: true,
      issues: [
        {
          key: "START_PAGE",
          severity: "warning"
        },
        {
          key: "WIKI_LANG",
          severity: "warning"
        }
      ]
    });
  });

  it("separates exportable runtime variables from redacted secrets", () => {
    const env = {
      SITE_NAME: "Private Wiki",
      API_CORS_ORIGINS: "https://client.example",
      API_BEARER_TOKEN: "super-secret-token",
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Wiki <wiki@example.test>",
      EMAIL_REGISTRATION_NOTIFY: "admin@example.test",
      RESEND_API_KEY: "resend-secret-token",
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA"
    } as Env;
    const exported = createConfigExport(env, new Date("2026-05-07T00:00:00.000Z"));

    expect(getRuntimeConfigEntries(env)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "SITE_NAME",
          value: "Private Wiki",
          effectiveValue: "Private Wiki",
          source: "environment"
        }),
        expect.objectContaining({
          key: "API_CORS_ORIGINS",
          value: "https://client.example",
          effectiveValue: "https://client.example"
        }),
        expect.objectContaining({
          key: "MAINTENANCE_MODE",
          effectiveValue: "false"
        }),
        expect.objectContaining({
          key: "EMAIL_PROVIDER",
          value: "resend",
          effectiveValue: "resend"
        }),
        expect.objectContaining({
          key: "EMAIL_FROM",
          value: "Wiki <wiki@example.test>",
          effectiveValue: "Wiki <wiki@example.test>"
        }),
        expect.objectContaining({
          key: "TURNSTILE_SITE_KEY",
          value: "1x00000000000000000000AA",
          effectiveValue: "1x00000000000000000000AA"
        })
      ])
    );
    expect(getSecretConfigStatus(env)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "API_BEARER_TOKEN",
          configured: true,
          redactedValue: "[redacted]"
        }),
        expect.objectContaining({
          key: "RESEND_API_KEY",
          configured: true,
          redactedValue: "[redacted]"
        }),
        expect.objectContaining({
          key: "TURNSTILE_SECRET_KEY",
          configured: true,
          redactedValue: "[redacted]"
        })
      ])
    );
    expect(getSecretConfigStatus({} as Env)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "RESEND_API_KEY",
          configured: false,
          redactedValue: null
        })
      ])
    );
    expect(getSecretConfigStatus(env)).not.toEqual([
      expect.objectContaining({
        redactedValue: "resend-secret-token"
      })
    ]);
    expect(JSON.stringify(exported)).not.toContain("super-secret-token");
    expect(JSON.stringify(exported)).not.toContain("resend-secret-token");
    expect(JSON.stringify(exported)).not.toContain("1x0000000000000000000000000000000AA");
    expect(exported).toMatchObject({
      exportedAt: "2026-05-07T00:00:00.000Z",
      runtime: {
        siteName: "Private Wiki"
      },
      validation: {
        ok: true
      }
    });
  });

  it("rejects unsafe cookie names, empty start pages, and unknown languages", () => {
    const validation = validateRuntimeConfig({
      START_PAGE: "::",
      WIKI_LANG: "zz",
      SESSION_COOKIE_NAME: "bad cookie",
      HIDE_PAGES: "[",
      API_BEARER_TOKEN: " "
    } as Env);

    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "START_PAGE", severity: "error" }),
        expect.objectContaining({ key: "WIKI_LANG", severity: "error" }),
        expect.objectContaining({ key: "SESSION_COOKIE_NAME", severity: "error" }),
        expect.objectContaining({ key: "HIDE_PAGES", severity: "error" }),
        expect.objectContaining({ key: "API_BEARER_TOKEN", severity: "warning" })
      ])
    );
  });

  it("validates email provider configuration", () => {
    const validation = validateRuntimeConfig({
      EMAIL_PROVIDER: "smtp",
      EMAIL_FROM: "bad sender",
      EMAIL_REPLY_TO: "Team <team@example.test>",
      EMAIL_RETURN_PATH: "bounces@example.test",
      EMAIL_REGISTRATION_NOTIFY: "admin@example.test, broken"
    } as Env);

    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "EMAIL_PROVIDER", severity: "error" }),
        expect.objectContaining({ key: "EMAIL_FROM", severity: "error" }),
        expect.objectContaining({ key: "EMAIL_REGISTRATION_NOTIFY", severity: "error" })
      ])
    );
    expect(validation.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "EMAIL_REPLY_TO", severity: "error" }),
        expect.objectContaining({ key: "EMAIL_RETURN_PATH", severity: "error" })
      ])
    );
  });

  it("requires matching Turnstile site and secret keys", () => {
    expect(
      validateRuntimeConfig({
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA"
      } as Env)
    ).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ key: "TURNSTILE_SECRET_KEY", severity: "error" })]
    });

    expect(
      validateRuntimeConfig({
        TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA"
      } as Env)
    ).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ key: "TURNSTILE_SITE_KEY", severity: "error" })]
    });
  });
});
