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
      superuser: "@admin",
      manager: "@manager",
      hidePages: null,
      sneakyIndex: false,
      maintenanceMode: false,
      disabledActions: [],
      send404: true,
      canonicalUrls: false,
      baseUrl: null,
      baseDir: "",
      topTocLevel: 1,
      tocMinHeads: 3,
      maxTocLevel: 3,
      maxSectionEditLevel: 3,
      breadcrumbs: 10,
      youAreHere: false,
      fullPath: false,
      dateFormat: "%Y/%m/%d %H:%M",
      cacheTime: 86400,
      lockTime: 900,
      useDraft: true,
      useHeading: false,
      camelCaseLinks: false,
      typographyMode: 1,
      autoPluralLinks: false,
      relNofollow: true,
      refcheck: true,
      mediaRevisions: true,
      ieXssProtect: true,
      fetchSize: 0,
      rssMedia: "both",
      searchNsLimit: 0,
      searchFragment: "exact",
      pageIdCleanOptions: {
        deaccent: 1,
        fnencode: "url",
        sepchar: "_",
        useslash: false
      },
      linkTargets: {
        wiki: null,
        interwiki: null,
        extern: null,
        media: null,
        windows: null
      },
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
      SUPERUSER: "root,@ops",
      MANAGER: "@staff,mona",
      HIDE_PAGES: ":hidden:",
      SNEAKY_INDEX: "1",
      MAINTENANCE_MODE: "true",
      DISABLE_ACTIONS: "edit, Revisions,edit",
      SEND404: "0",
      CANONICAL_URLS: "true",
      BASE_URL: "https://wiki.example.test/",
      BASE_DIR: "/docs/",
      TOP_TOC_LEVEL: "2",
      TOC_MIN_HEADS: "4",
      MAX_TOC_LEVEL: "4",
      MAX_SECTION_EDIT_LEVEL: "2",
      BREADCRUMBS: "3",
      YOUAREHERE: "1",
      FULLPATH: "1",
      DFORMAT: "%F %R",
      CACHETIME: "7200",
      LOCKTIME: "120",
      USEDRAFT: "0",
      USE_HEADING: "1",
      CAMELCASE: "true",
      TYPOGRAPHY: "2",
      AUTOPLURAL: "1",
      REL_NOFOLLOW: "0",
      REFCHECK: "0",
      MEDIAREVISIONS: "0",
      IEXSSPROTECT: "0",
      FETCHSIZE: "65536",
      RSS_MEDIA: "media",
      SEARCH_NSLIMIT: "2",
      SEARCH_FRAGMENT: "contains",
      DEACCENT: "2",
      FNENCODE: "safe",
      SEPCHAR: "-",
      USESLASH: "1",
      TARGET_WIKI: "_self",
      TARGET_INTERWIKI: "_blank",
      TARGET_EXTERN: "_blank",
      TARGET_MEDIA: "_media",
      TARGET_WINDOWS: "_windows"
    } as Env;

    expect(getRuntimeConfig(env).startPage).toBe("wiki:welcome");
    expect(getRuntimeConfig(env).language).toBe("pt-br");
    expect(getRuntimeConfig(env).superuser).toBe("root,@ops");
    expect(getRuntimeConfig(env).manager).toBe("@staff,mona");
    expect(getRuntimeConfig(env).hidePages).toBe(":hidden:");
    expect(getRuntimeConfig(env).sneakyIndex).toBe(true);
    expect(getRuntimeConfig(env).maintenanceMode).toBe(true);
    expect(getRuntimeConfig(env).disabledActions).toEqual(["edit", "revisions"]);
    expect(getRuntimeConfig(env).send404).toBe(false);
    expect(getRuntimeConfig(env).canonicalUrls).toBe(true);
    expect(getRuntimeConfig(env).baseUrl).toBe("https://wiki.example.test");
    expect(getRuntimeConfig(env).baseDir).toBe("/docs");
    expect(getRuntimeConfig(env).topTocLevel).toBe(2);
    expect(getRuntimeConfig(env).tocMinHeads).toBe(4);
    expect(getRuntimeConfig(env).maxTocLevel).toBe(4);
    expect(getRuntimeConfig(env).maxSectionEditLevel).toBe(2);
    expect(getRuntimeConfig(env).breadcrumbs).toBe(3);
    expect(getRuntimeConfig(env).youAreHere).toBe(true);
    expect(getRuntimeConfig(env).fullPath).toBe(true);
    expect(getRuntimeConfig(env).dateFormat).toBe("%F %R");
    expect(getRuntimeConfig(env).cacheTime).toBe(7200);
    expect(getRuntimeConfig(env).lockTime).toBe(120);
    expect(getRuntimeConfig(env).useDraft).toBe(false);
    expect(getRuntimeConfig(env).useHeading).toBe(true);
    expect(getRuntimeConfig(env).camelCaseLinks).toBe(true);
    expect(getRuntimeConfig(env).typographyMode).toBe(2);
    expect(getRuntimeConfig(env).autoPluralLinks).toBe(true);
    expect(getRuntimeConfig(env).relNofollow).toBe(false);
    expect(getRuntimeConfig(env).refcheck).toBe(false);
    expect(getRuntimeConfig(env).mediaRevisions).toBe(false);
    expect(getRuntimeConfig(env).ieXssProtect).toBe(false);
    expect(getRuntimeConfig(env).fetchSize).toBe(65536);
    expect(getRuntimeConfig(env).rssMedia).toBe("media");
    expect(getRuntimeConfig(env).searchNsLimit).toBe(2);
    expect(getRuntimeConfig(env).searchFragment).toBe("contains");
    expect(getRuntimeConfig(env).pageIdCleanOptions).toEqual({
      deaccent: 2,
      fnencode: "safe",
      sepchar: "-",
      useslash: true
    });
    expect(getRuntimeConfig(env).linkTargets).toEqual({
      wiki: "_self",
      interwiki: "_blank",
      extern: "_blank",
      media: "_media",
      windows: "_windows"
    });
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
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      DOKUWIKI_COOKIE_SALT: "dokuwiki-cookie-salt"
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
          key: "DISABLE_ACTIONS",
          effectiveValue: ""
        }),
        expect.objectContaining({
          key: "SEND404",
          effectiveValue: "true"
        }),
        expect.objectContaining({
          key: "SUPERUSER",
          effectiveValue: "@admin"
        }),
        expect.objectContaining({
          key: "MANAGER",
          effectiveValue: "@manager"
        }),
        expect.objectContaining({
          key: "CANONICAL_URLS",
          effectiveValue: "false"
        }),
        expect.objectContaining({
          key: "TOC_MIN_HEADS",
          effectiveValue: "3"
        }),
        expect.objectContaining({
          key: "USE_HEADING",
          effectiveValue: "false"
        }),
        expect.objectContaining({
          key: "BREADCRUMBS",
          effectiveValue: "10"
        }),
        expect.objectContaining({
          key: "YOUAREHERE",
          effectiveValue: "false"
        }),
        expect.objectContaining({
          key: "FULLPATH",
          effectiveValue: "false"
        }),
        expect.objectContaining({
          key: "DFORMAT",
          effectiveValue: "%Y/%m/%d %H:%M"
        }),
        expect.objectContaining({
          key: "CACHETIME",
          effectiveValue: "86400"
        }),
        expect.objectContaining({
          key: "LOCKTIME",
          effectiveValue: "900"
        }),
        expect.objectContaining({
          key: "USEDRAFT",
          effectiveValue: "true"
        }),
        expect.objectContaining({
          key: "CAMELCASE",
          effectiveValue: "false"
        }),
        expect.objectContaining({
          key: "TYPOGRAPHY",
          effectiveValue: "1"
        }),
        expect.objectContaining({
          key: "AUTOPLURAL",
          effectiveValue: "false"
        }),
        expect.objectContaining({
          key: "REL_NOFOLLOW",
          effectiveValue: "true"
        }),
        expect.objectContaining({
          key: "REFCHECK",
          effectiveValue: "true"
        }),
        expect.objectContaining({
          key: "MEDIAREVISIONS",
          effectiveValue: "true"
        }),
        expect.objectContaining({
          key: "IEXSSPROTECT",
          effectiveValue: "true"
        }),
        expect.objectContaining({
          key: "FETCHSIZE",
          effectiveValue: "0"
        }),
        expect.objectContaining({
          key: "RSS_MEDIA",
          effectiveValue: "both"
        }),
        expect.objectContaining({
          key: "DEACCENT",
          effectiveValue: "1"
        }),
        expect.objectContaining({
          key: "FNENCODE",
          effectiveValue: "url"
        }),
        expect.objectContaining({
          key: "SEPCHAR",
          effectiveValue: "_"
        }),
        expect.objectContaining({
          key: "USESLASH",
          effectiveValue: "false"
        }),
        expect.objectContaining({
          key: "TARGET_EXTERN",
          effectiveValue: null
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
        }),
        expect.objectContaining({
          key: "DOKUWIKI_COOKIE_SALT",
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
    expect(JSON.stringify(exported)).not.toContain("dokuwiki-cookie-salt");
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
      SUPERUSER: "@,bad user",
      MANAGER: "@",
      HIDE_PAGES: "[",
      DISABLE_ACTIONS: "edit,bad action,$",
      BASE_URL: "ftp://example.test",
      BASE_DIR: "../wiki",
      TOP_TOC_LEVEL: "0",
      TOC_MIN_HEADS: "many",
      MAX_TOC_LEVEL: "9",
      MAX_SECTION_EDIT_LEVEL: "-1",
      BREADCRUMBS: "-1",
      CACHETIME: "-1",
      LOCKTIME: "-1",
      TYPOGRAPHY: "3",
      RSS_MEDIA: "files",
      SEARCH_NSLIMIT: "-1",
      SEARCH_FRAGMENT: "middle",
      DEACCENT: "3",
      FNENCODE: "base64",
      SEPCHAR: "/",
      API_BEARER_TOKEN: " "
    } as Env);

    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "START_PAGE", severity: "error" }),
        expect.objectContaining({ key: "WIKI_LANG", severity: "error" }),
        expect.objectContaining({ key: "SESSION_COOKIE_NAME", severity: "error" }),
        expect.objectContaining({ key: "SUPERUSER", severity: "error" }),
        expect.objectContaining({ key: "MANAGER", severity: "error" }),
        expect.objectContaining({ key: "HIDE_PAGES", severity: "error" }),
        expect.objectContaining({ key: "DISABLE_ACTIONS", severity: "error" }),
        expect.objectContaining({ key: "BASE_URL", severity: "error" }),
        expect.objectContaining({ key: "BASE_DIR", severity: "error" }),
        expect.objectContaining({ key: "TOP_TOC_LEVEL", severity: "error" }),
        expect.objectContaining({ key: "TOC_MIN_HEADS", severity: "error" }),
        expect.objectContaining({ key: "MAX_TOC_LEVEL", severity: "error" }),
        expect.objectContaining({ key: "MAX_SECTION_EDIT_LEVEL", severity: "error" }),
        expect.objectContaining({ key: "BREADCRUMBS", severity: "error" }),
        expect.objectContaining({ key: "CACHETIME", severity: "error" }),
        expect.objectContaining({ key: "LOCKTIME", severity: "error" }),
        expect.objectContaining({ key: "TYPOGRAPHY", severity: "error" }),
        expect.objectContaining({ key: "RSS_MEDIA", severity: "error" }),
        expect.objectContaining({ key: "SEARCH_NSLIMIT", severity: "error" }),
        expect.objectContaining({ key: "SEARCH_FRAGMENT", severity: "error" }),
        expect.objectContaining({ key: "DEACCENT", severity: "error" }),
        expect.objectContaining({ key: "FNENCODE", severity: "error" }),
        expect.objectContaining({ key: "SEPCHAR", severity: "error" }),
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
