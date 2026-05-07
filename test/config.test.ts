import { describe, expect, it } from "vitest";
import { getRuntimeConfig, validateRuntimeConfig } from "../src/config";
import type { Env } from "../src/env";

describe("runtime config", () => {
  it("provides defaults for optional Pages environment variables", () => {
    expect(getRuntimeConfig({} as Env)).toMatchObject({
      siteName: "DokuWiki Pages",
      startPage: "wiki:welcome",
      language: "en",
      sessionCookieName: "DW_PAGES_SESSION",
      appVersion: "0.1.0"
    });
    expect(validateRuntimeConfig({} as Env)).toEqual({
      ok: true,
      issues: []
    });
  });

  it("normalizes configured page ids and reports warnings", () => {
    const env = { START_PAGE: "Wiki/Welcome", WIKI_LANG: "pt_BR" } as Env;

    expect(getRuntimeConfig(env).startPage).toBe("wiki:welcome");
    expect(getRuntimeConfig(env).language).toBe("pt-br");
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

  it("rejects unsafe cookie names, empty start pages, and unknown languages", () => {
    const validation = validateRuntimeConfig({
      START_PAGE: "::",
      WIKI_LANG: "zz",
      SESSION_COOKIE_NAME: "bad cookie"
    } as Env);

    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "START_PAGE", severity: "error" }),
        expect.objectContaining({ key: "WIKI_LANG", severity: "error" }),
        expect.objectContaining({ key: "SESSION_COOKIE_NAME", severity: "error" })
      ])
    );
  });
});
