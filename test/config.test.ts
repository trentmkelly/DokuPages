import { describe, expect, it } from "vitest";
import {
  createConfigExport,
  getRuntimeConfig,
  getRuntimeConfigEntries,
  getSecretConfigStatus,
  validateRuntimeConfig
} from "../src/config";
import {
  DOKUWIKI_CONFIG_METADATA,
  configMetadataForDokuWikiKey,
  validateDokuWikiConfigMetadataValue
} from "../src/config-metadata";
import type { Env } from "../src/env";

describe("runtime config", () => {
  it("provides defaults for optional Pages environment variables", () => {
    expect(getRuntimeConfig({} as Env)).toMatchObject({
      siteName: "DokuWiki",
      tagline: "",
      sidebarPage: "sidebar",
      licenseId: "cc-by-nc-sa",
      startPage: "wiki:welcome",
      language: "en",
      sessionCookieName: "DW_PAGES_SESSION",
      useAcl: true,
      superuser: "@admin",
      manager: "@manager",
      autoPassword: false,
      profileConfirm: true,
      hidePages: null,
      sneakyIndex: false,
      maintenanceMode: false,
      disabledActions: [],
      send404: true,
      canonicalUrls: false,
      baseUrl: null,
      baseDir: "",
      recentEntries: 20,
      recentDays: 7,
      topTocLevel: 1,
      tocMinHeads: 3,
      maxTocLevel: 3,
      maxSectionEditLevel: 3,
      breadcrumbs: 10,
      youAreHere: false,
      fullPath: false,
      dateFormat: "%Y/%m/%d %H:%M",
      signature: " --- //[[@MAIL@|@NAME@]] @DATE@//",
      showUserAs: "loginname",
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
      externalAuthMode: "off",
      externalAuthEmailHeader: "cf-access-authenticated-user-email",
      externalAuthUsernameHeader: null,
      appVersion: "0.1.0"
    });
    expect(validateRuntimeConfig({} as Env)).toEqual({
      ok: true,
      issues: []
    });
  });

  it("normalizes configured page ids and reports warnings", () => {
    const env = {
      TITLE: "Configured Wiki",
      TAGLINE: "A local DokuWiki",
      SIDEBAR: "Wiki/Sidebar",
      LICENSE: "cc-by",
      START_PAGE: "Wiki/Welcome",
      WIKI_LANG: "pt_BR",
      USEACL: "0",
      SUPERUSER: "root,@ops",
      MANAGER: "@staff,mona",
      AUTOPASSWD: "1",
      PROFILECONFIRM: "0",
      HIDE_PAGES: ":hidden:",
      SNEAKY_INDEX: "1",
      MAINTENANCE_MODE: "true",
      DISABLE_ACTIONS: "edit, Revisions,edit",
      SEND404: "0",
      CANONICAL_URLS: "true",
      BASE_URL: "https://wiki.example.test/",
      BASE_DIR: "/docs/",
      RECENT: "25",
      RECENT_DAYS: "30",
      TOP_TOC_LEVEL: "2",
      TOC_MIN_HEADS: "4",
      MAX_TOC_LEVEL: "4",
      MAX_SECTION_EDIT_LEVEL: "2",
      BREADCRUMBS: "3",
      YOUAREHERE: "1",
      FULLPATH: "1",
      DFORMAT: "%F %R",
      SIGNATURE: "-- @NAME@ @DATE@",
      SHOWUSERAS: "email_link",
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
      TARGET_WINDOWS: "_windows",
      EXTERNAL_AUTH_MODE: "cloudflare_access",
      EXTERNAL_AUTH_EMAIL_HEADER: "X-Auth-Email",
      EXTERNAL_AUTH_USERNAME_HEADER: "X-Auth-User"
    } as Env;

    expect(getRuntimeConfig(env).siteName).toBe("Configured Wiki");
    expect(getRuntimeConfig(env).tagline).toBe("A local DokuWiki");
    expect(getRuntimeConfig(env).sidebarPage).toBe("wiki:sidebar");
    expect(getRuntimeConfig(env).licenseId).toBe("cc-by");
    expect(getRuntimeConfig(env).startPage).toBe("wiki:welcome");
    expect(getRuntimeConfig(env).language).toBe("pt-br");
    expect(getRuntimeConfig(env).useAcl).toBe(false);
    expect(getRuntimeConfig(env).superuser).toBe("root,@ops");
    expect(getRuntimeConfig(env).manager).toBe("@staff,mona");
    expect(getRuntimeConfig(env).autoPassword).toBe(true);
    expect(getRuntimeConfig(env).profileConfirm).toBe(false);
    expect(getRuntimeConfig(env).hidePages).toBe(":hidden:");
    expect(getRuntimeConfig(env).sneakyIndex).toBe(true);
    expect(getRuntimeConfig(env).maintenanceMode).toBe(true);
    expect(getRuntimeConfig(env).disabledActions).toEqual(["edit", "revisions"]);
    expect(getRuntimeConfig(env).send404).toBe(false);
    expect(getRuntimeConfig(env).canonicalUrls).toBe(true);
    expect(getRuntimeConfig(env).baseUrl).toBe("https://wiki.example.test");
    expect(getRuntimeConfig(env).baseDir).toBe("/docs");
    expect(getRuntimeConfig(env).recentEntries).toBe(25);
    expect(getRuntimeConfig(env).recentDays).toBe(30);
    expect(getRuntimeConfig(env).topTocLevel).toBe(2);
    expect(getRuntimeConfig(env).tocMinHeads).toBe(4);
    expect(getRuntimeConfig(env).maxTocLevel).toBe(4);
    expect(getRuntimeConfig(env).maxSectionEditLevel).toBe(2);
    expect(getRuntimeConfig(env).breadcrumbs).toBe(3);
    expect(getRuntimeConfig(env).youAreHere).toBe(true);
    expect(getRuntimeConfig(env).fullPath).toBe(true);
    expect(getRuntimeConfig(env).dateFormat).toBe("%F %R");
    expect(getRuntimeConfig(env).signature).toBe("-- @NAME@ @DATE@");
    expect(getRuntimeConfig(env).showUserAs).toBe("email_link");
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
    expect(getRuntimeConfig(env).externalAuthMode).toBe("cloudflare_access");
    expect(getRuntimeConfig(env).externalAuthEmailHeader).toBe("x-auth-email");
    expect(getRuntimeConfig(env).externalAuthUsernameHeader).toBe("x-auth-user");
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
      NOTIFY: "ops@example.test",
      MAILFROM: "DokuWiki <@MAIL@>",
      MAILRETURNPATH: "bounces@example.test",
      MAILPREFIX: "Ops",
      HTMLMAIL: "0",
      RESEND_API_KEY: "resend-secret-token",
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      DOKUWIKI_COOKIE_SALT: "dokuwiki-cookie-salt"
    } as Env;
    const exported = createConfigExport(env, new Date("2026-05-07T00:00:00.000Z"));

    expect(getRuntimeConfigEntries(env)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "TITLE",
          value: "Private Wiki",
          effectiveValue: "Private Wiki",
          dokuwikiKey: "title",
          source: "environment"
        }),
        expect.objectContaining({
          key: "SITE_NAME",
          value: "Private Wiki",
          effectiveValue: "Private Wiki",
          dokuwikiKey: "title",
          metadata: expect.objectContaining({
            handler: "string",
            source: "lib/plugins/config/settings/config.metadata.php"
          }),
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
          key: "TAGLINE",
          effectiveValue: ""
        }),
        expect.objectContaining({
          key: "SIDEBAR",
          effectiveValue: "sidebar"
        }),
        expect.objectContaining({
          key: "LICENSE",
          effectiveValue: "cc-by-nc-sa"
        }),
        expect.objectContaining({
          key: "RECENT",
          effectiveValue: "20"
        }),
        expect.objectContaining({
          key: "RECENT_DAYS",
          effectiveValue: "7"
        }),
        expect.objectContaining({
          key: "SIGNATURE",
          effectiveValue: " --- //[[@MAIL@|@NAME@]] @DATE@//"
        }),
        expect.objectContaining({
          key: "SEND404",
          effectiveValue: "true"
        }),
        expect.objectContaining({
          key: "USEACL",
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
          key: "AUTOPASSWD",
          effectiveValue: "false"
        }),
        expect.objectContaining({
          key: "PROFILECONFIRM",
          effectiveValue: "true"
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
          key: "SHOWUSERAS",
          effectiveValue: "loginname"
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
          effectiveValue: "both",
          dokuwikiKey: "rss_media",
          metadata: expect.objectContaining({
            handler: "multichoice",
            choices: ["both", "pages", "media"]
          })
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
          key: "NOTIFY",
          value: "ops@example.test",
          effectiveValue: "ops@example.test",
          dokuwikiKey: "notify"
        }),
        expect.objectContaining({
          key: "MAILFROM",
          value: "DokuWiki <@MAIL@>",
          effectiveValue: "DokuWiki <@MAIL@>",
          dokuwikiKey: "mailfrom"
        }),
        expect.objectContaining({
          key: "MAILPREFIX",
          value: "Ops",
          effectiveValue: "Ops",
          dokuwikiKey: "mailprefix"
        }),
        expect.objectContaining({
          key: "HTMLMAIL",
          value: "0",
          effectiveValue: "0",
          dokuwikiKey: "htmlmail"
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
        siteName: "Private Wiki",
        tagline: "",
        sidebarPage: "sidebar",
        licenseId: "cc-by-nc-sa",
        recentEntries: 20,
        recentDays: 7,
        signature: " --- //[[@MAIL@|@NAME@]] @DATE@//"
      },
      variables: expect.arrayContaining([
        expect.objectContaining({
          key: "TITLE",
          dokuwikiKey: "title",
          metadata: expect.objectContaining({ handler: "string" })
        })
      ]),
      validation: {
        ok: true
      }
    });
  });

  it("rejects unsafe cookie names, empty start pages, and unknown languages", () => {
    const validation = validateRuntimeConfig({
      START_PAGE: "::",
      USEACL: "maybe",
      WIKI_LANG: "zz",
      SESSION_COOKIE_NAME: "bad cookie",
      SUPERUSER: "@,bad user",
      MANAGER: "@",
      HIDE_PAGES: "[",
      DISABLE_ACTIONS: "edit,bad action,$",
      BASE_URL: "ftp://example.test",
      BASE_DIR: "../wiki",
      RECENT: "0",
      RECENT_DAYS: "-1",
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
      SHOWUSERAS: "avatar",
      CANONICAL_URLS: "sometimes",
      REL_NOFOLLOW: "never",
      EXTERNAL_AUTH_MODE: "ldap",
      EXTERNAL_AUTH_EMAIL_HEADER: "bad header",
      EXTERNAL_AUTH_USERNAME_HEADER: "bad:header",
      API_BEARER_TOKEN: " "
    } as Env);

    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "START_PAGE", severity: "error" }),
        expect.objectContaining({ key: "USEACL", severity: "error" }),
        expect.objectContaining({ key: "WIKI_LANG", severity: "error" }),
        expect.objectContaining({ key: "SESSION_COOKIE_NAME", severity: "error" }),
        expect.objectContaining({ key: "SUPERUSER", severity: "error" }),
        expect.objectContaining({ key: "MANAGER", severity: "error" }),
        expect.objectContaining({ key: "HIDE_PAGES", severity: "error" }),
        expect.objectContaining({ key: "DISABLE_ACTIONS", severity: "error" }),
        expect.objectContaining({ key: "BASE_URL", severity: "error" }),
        expect.objectContaining({ key: "BASE_DIR", severity: "error" }),
        expect.objectContaining({ key: "RECENT", severity: "error" }),
        expect.objectContaining({ key: "RECENT_DAYS", severity: "error" }),
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
        expect.objectContaining({ key: "SHOWUSERAS", severity: "error" }),
        expect.objectContaining({ key: "CANONICAL_URLS", severity: "error" }),
        expect.objectContaining({ key: "REL_NOFOLLOW", severity: "error" }),
        expect.objectContaining({ key: "EXTERNAL_AUTH_MODE", severity: "error" }),
        expect.objectContaining({ key: "EXTERNAL_AUTH_EMAIL_HEADER", severity: "error" }),
        expect.objectContaining({ key: "EXTERNAL_AUTH_USERNAME_HEADER", severity: "error" }),
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
      EMAIL_REGISTRATION_NOTIFY: "admin@example.test, broken",
      NOTIFY: "ops@example.test, broken",
      REGISTERNOTIFY: "registrar@example.test, broken",
      MAILFROM: "DokuWiki <@MAIL@>",
      MAILRETURNPATH: "broken return path",
      HTMLMAIL: "maybe"
    } as Env);

    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "EMAIL_PROVIDER", severity: "error" }),
        expect.objectContaining({ key: "EMAIL_FROM", severity: "error" }),
        expect.objectContaining({ key: "EMAIL_REGISTRATION_NOTIFY", severity: "error" }),
        expect.objectContaining({ key: "NOTIFY", severity: "error" }),
        expect.objectContaining({ key: "REGISTERNOTIFY", severity: "error" }),
        expect.objectContaining({ key: "MAILRETURNPATH", severity: "error" }),
        expect.objectContaining({ key: "HTMLMAIL", severity: "error" })
      ])
    );
    expect(validation.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "EMAIL_REPLY_TO", severity: "error" }),
        expect.objectContaining({ key: "EMAIL_RETURN_PATH", severity: "error" }),
        expect.objectContaining({ key: "MAILFROM", severity: "error" })
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

  it("exposes upstream config plugin metadata and validates metadata-backed values", () => {
    expect(DOKUWIKI_CONFIG_METADATA).toHaveLength(127);
    expect(configMetadataForDokuWikiKey("rss_media")).toMatchObject({
      key: "rss_media",
      handler: "multichoice",
      group: "syndication",
      choices: ["both", "pages", "media"],
      source: "lib/plugins/config/settings/config.metadata.php"
    });
    expect(configMetadataForDokuWikiKey("superuser")).toMatchObject({
      handler: "string",
      caution: "danger"
    });
    expect(validateDokuWikiConfigMetadataValue("rss_media", "media")).toEqual({ ok: true });
    expect(validateDokuWikiConfigMetadataValue("rss_media", "files")).toMatchObject({
      ok: false
    });
    expect(validateDokuWikiConfigMetadataValue("useacl", "true")).toEqual({ ok: true });
    expect(validateDokuWikiConfigMetadataValue("useacl", "maybe")).toMatchObject({
      ok: false
    });
    expect(validateDokuWikiConfigMetadataValue("proxy____host", "proxy.example")).toEqual({
      ok: true
    });
    expect(validateDokuWikiConfigMetadataValue("proxy____host", "bad host!")).toMatchObject({
      ok: false
    });
  });
});
