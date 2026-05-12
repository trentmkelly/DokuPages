import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  buildImportPlan,
  writeHashManifest,
  writeMediaManifest,
  writePageImportSql
} from "../scripts/import-dokuwiki.mjs";

const gzipAsync = promisify(gzip);
const WELCOME_PAGE_META = [
  "a:2:{",
  's:7:"current";a:4:{',
  's:5:"title";s:7:"Welcome";',
  's:11:"description";a:2:{',
  's:8:"abstract";s:16:"Welcome abstract";',
  's:15:"tableofcontents";a:1:{',
  "i:0;a:4:{",
  's:3:"hid";s:7:"welcome";',
  's:5:"title";s:7:"Welcome";',
  's:4:"type";s:2:"ul";',
  's:5:"level";i:1;',
  "}",
  "}",
  "}",
  's:8:"relation";a:1:{',
  's:10:"references";a:2:{',
  's:10:"wiki:guide";b:1;',
  's:12:"wiki:missing";b:0;',
  "}",
  "}",
  's:4:"date";a:1:{s:8:"modified";i:1767225601;}',
  "}",
  's:10:"persistent";a:2:{',
  's:4:"date";a:1:{s:7:"created";i:1767225600;}',
  's:11:"contributor";a:1:{s:10:"user:alice";s:13:"Alice Example";}',
  "}",
  "}"
].join("");
const DOKU_MEDIA_JPEG_META = [
  "a:2:{",
  's:4:"Exif";a:3:{',
  's:5:"Title";s:12:"Legacy title";',
  's:15:"PixelXDimension";s:4:"1024";',
  's:15:"PixelYDimension";s:3:"768";',
  "}",
  's:4:"Iptc";a:2:{',
  's:7:"Caption";s:14:"Legacy caption";',
  's:8:"Keywords";a:2:{i:0;s:3:"one";i:1;s:3:"two";}',
  "}",
  "}"
].join("");

describe("DokuWiki import planner", () => {
  it("discovers pages, media, ACLs, and users from a flat-file DokuWiki tree", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dokuwiki-import-"));

    await mkdir(path.join(root, "data/pages/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/attic/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/media/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/media_attic/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/meta/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/media_meta/wiki"), { recursive: true });
    await mkdir(path.join(root, "conf"), { recursive: true });
    await mkdir(path.join(root, "conf/lang/en"), { recursive: true });
    await mkdir(path.join(root, "lib/tpl/custom"), { recursive: true });
    await mkdir(path.join(root, "conf/lang/en"), { recursive: true });
    await mkdir(path.join(root, "lib/tpl/custom/images"), { recursive: true });

    await writeFile(path.join(root, "data/pages/wiki/welcome.txt"), "====== Welcome ======\n");
    await writeFile(
      path.join(root, "data/attic/wiki/welcome.1767225600.txt.gz"),
      await gzipAsync("====== Old Welcome ======\n")
    );
    await writeFile(path.join(root, "data/media/wiki/logo.svg"), "<svg />\n");
    await writeFile(
      path.join(root, "data/media_attic/wiki/logo.1767225600.svg"),
      "<svg>old</svg>\n"
    );
    await writeFile(
      path.join(root, "data/meta/_dokuwiki.changes"),
      [
        "1767225600\t203.0.113.7\tC\twiki:welcome\talice\tCreated page\t\t24",
        "1767225602\t203.0.113.9\tD\twiki:old\talice\tDeleted old page\t\t-24"
      ].join("\n")
    );
    await writeFile(
      path.join(root, "data/meta/_media.changes"),
      "1767225601\t203.0.113.8\tE\twiki:logo.svg\tbob\tUpdated logo\t\t3\n"
    );
    await writeFile(path.join(root, "data/meta/wiki/welcome.meta"), WELCOME_PAGE_META);
    await writeFile(
      path.join(root, "data/media_meta/wiki/logo.svg.meta"),
      'a:1:{s:4:"Exif";a:1:{s:5:"Title";s:4:"Logo";}}'
    );
    await writeFile(
      path.join(root, "data/meta/wiki/welcome.mlist"),
      "alice every 1767225603\nbob digest 1767225604\n"
    );
    await writeFile(path.join(root, "data/meta/wiki/.mlist"), "carol list 1767225605\n");
    await writeFile(
      path.join(root, "conf/acl.auth.php"),
      "* @ALL 1\nwiki:* @user 8\nusers:%USER%:* %USER% 16\nteams:%GROUP%:* %GROUP% 8 # group home\n"
    );
    await writeFile(
      path.join(root, "conf/users.auth.php"),
      [
        "alice:$2y$hash:Alice Example:alice@example.test:user,admin",
        "bob:hash\\:with\\:colon:Bob%20Example:bob@example.test:",
        "carol:hash\\#fragment:Carol\\# Example:carol@example.test:@ops,user # trailing comment"
      ].join("\n")
    );
    await writeFile(
      path.join(root, "conf/dokuwiki.php"),
      "$conf['title'] = 'Default Wiki';\n$conf['lang'] = 'en';\n$conf['plugin']['testing']['mode'] = 'default';\n"
    );
    await writeFile(
      path.join(root, "conf/local.php"),
      "$conf['title'] = 'Imported Wiki';\n$conf['lang'] = 'pt-br';\n$conf['plugin']['testing']['mode'] = 'local';\n"
    );
    await writeFile(
      path.join(root, "conf/local.protected.php"),
      "$conf['license'] = 'cc-by-sa';\n$conf['plugin']['testing']['locked'] = true;\n"
    );
    await writeFile(path.join(root, "conf/plugins.php"), "$plugins['testing'] = 0;\n");
    await writeFile(path.join(root, "conf/plugins.local.php"), "$plugins['testing'] = 1;\n");
    await writeFile(
      path.join(root, "conf/plugins.required.php"),
      "$plugins['acl'] = 1;\n$plugins['template:dokuwiki'] = true;\n"
    );
    await writeFile(
      path.join(root, "conf/interwiki.conf"),
      "wp https://en.wikipedia.org/wiki/{NAME}\ngo https://www.google.com/search?q={URL}&amp;btnI=lucky\n"
    );
    await writeFile(
      path.join(root, "conf/interwiki.local.conf"),
      "wp https://wiki.example/{URL}\n"
    );
    await writeFile(path.join(root, "conf/mime.conf"), "jpg image/jpeg\nzip !application/zip\n");
    await writeFile(path.join(root, "conf/mime.local.conf"), "zip application/x-custom-zip\n");
    await writeFile(path.join(root, "conf/scheme.conf"), "http\nhttps\nftp\n");
    await writeFile(path.join(root, "conf/scheme.local.conf"), "!ftp\nirc\n");
    await writeFile(path.join(root, "conf/entities.conf"), "-> →\n(c) ©\n");
    await writeFile(path.join(root, "conf/entities.local.conf"), "(c) COPY\n?? ‽\n");
    await writeFile(path.join(root, "conf/smileys.conf"), ":-) smile.svg\nLOL lol.svg\n");
    await writeFile(path.join(root, "conf/smileys.local.conf"), ":-) custom.svg\n");
    await writeFile(
      path.join(root, "conf/acronyms.conf"),
      "API Application Programming Interface\nHTML HyperText Markup Language\n"
    );
    await writeFile(path.join(root, "conf/acronyms.local.conf"), "API Custom API\n");
    await writeFile(path.join(root, "conf/wordblock.conf"), "# spam terms\nzoosex\n wow gold \n");
    await writeFile(path.join(root, "conf/wordblock.local.conf"), "!zoosex\ncustom phrase\n");
    await writeFile(
      path.join(root, "conf/lang/en/lang.php"),
      "<?php\n$lang['btn_save'] = 'Save it';\n"
    );
    await writeFile(path.join(root, "conf/lang/en/sidebar.txt"), "Custom sidebar language\n");
    await writeFile(
      path.join(root, "lib/tpl/custom/style.ini"),
      "[stylesheets]\nscreen.css = screen\n"
    );
    await writeFile(path.join(root, "lib/tpl/custom/images/logo.bin"), Buffer.from([0, 1, 2, 3]));

    const plan = await buildImportPlan(root);

    expect(plan.counts).toMatchObject({
      pages: 1,
      pageRevisions: 1,
      pageChangelogEntries: 2,
      pageMetadata: 1,
      media: 1,
      mediaRevisions: 1,
      mediaChangelogEntries: 1,
      mediaMetadata: 1,
      subscriptions: 3,
      aclRules: 4,
      users: 3,
      configSettings: 3,
      pluginConfigSettings: 2,
      pluginSettings: 3,
      interwikiTemplates: 2,
      mimeTypes: 2,
      schemeProtocols: 3,
      entityReplacements: 3,
      smileyMappings: 2,
      acronymMappings: 2,
      wordblockPatterns: 2,
      customLanguageFiles: 2,
      customTemplateFiles: 2
    });
    expect(plan.language).toBe("pt-br");
    expect(plan.pages[0]).toMatchObject({ id: "wiki:welcome" });
    expect(plan.pageRevisions[0]).toMatchObject({
      pageId: "wiki:welcome",
      revision: "1767225600",
      compression: "gz",
      byteLength: "====== Old Welcome ======\n".length
    });
    expect(plan.pageChangelogEntries[0]).toMatchObject({
      subjectType: "page",
      subjectId: "wiki:welcome",
      userName: "alice",
      ip: "203.0.113.7",
      changeType: "create",
      sizeChange: 24,
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    expect(plan.pageChangelogEntries[1]).toMatchObject({
      subjectId: "wiki:old",
      changeType: "delete",
      summary: "Deleted old page",
      sizeChange: -24,
      createdAt: "2026-01-01T00:00:02.000Z"
    });
    expect(plan.pageMetadata[0]).toMatchObject({
      subjectType: "page",
      subjectId: "wiki:welcome",
      value: {
        current: {
          title: "Welcome",
          description: {
            abstract: "Welcome abstract",
            tableofcontents: [{ hid: "welcome", title: "Welcome", type: "ul", level: 1 }]
          },
          relation: { references: { "wiki:guide": true, "wiki:missing": false } },
          date: { modified: 1767225601 }
        },
        persistent: {
          date: { created: 1767225600 },
          contributor: { "user:alice": "Alice Example" }
        }
      }
    });
    expect(plan.media[0]).toMatchObject({
      id: "wiki:logo.svg",
      objectKey: "media/current/wiki/logo.svg"
    });
    expect(plan.mediaRevisions[0]).toMatchObject({
      mediaId: "wiki:logo.svg",
      revision: "1767225600",
      objectKey: "media/revisions/wiki/logo.svg/1767225600"
    });
    expect(plan.mediaChangelogEntries[0]).toMatchObject({
      subjectType: "media",
      subjectId: "wiki:logo.svg",
      userName: "bob",
      changeType: "edit",
      sizeChange: 3,
      createdAt: "2026-01-01T00:00:01.000Z"
    });
    expect(plan.mediaMetadata[0]).toMatchObject({
      subjectType: "media",
      subjectId: "wiki:logo.svg",
      value: { Exif: { Title: "Logo" } }
    });
    expect(plan.subscriptions).toContainEqual(
      expect.objectContaining({
        subjectType: "page",
        subjectId: "wiki:welcome",
        username: "alice",
        userId: "user:alice",
        digestInterval: "immediate",
        createdAt: "2026-01-01T00:00:03.000Z"
      })
    );
    expect(plan.subscriptions).toContainEqual(
      expect.objectContaining({
        subjectType: "namespace",
        subjectId: "wiki",
        username: "carol",
        digestInterval: "daily",
        createdAt: "2026-01-01T00:00:05.000Z"
      })
    );
    expect(plan.aclRules[0]).toMatchObject({
      scope: "*",
      principalType: "all",
      principal: "@ALL",
      permission: 1
    });
    expect(plan.aclRules[1]).toMatchObject({
      scope: "wiki:*",
      principalType: "group",
      principal: "@user",
      permission: 8
    });
    expect(plan.aclRules[2]).toMatchObject({
      scope: "users:%USER%:*",
      principalType: "user",
      principal: "%USER%",
      permission: 16
    });
    expect(plan.aclRules[3]).toMatchObject({
      scope: "teams:%GROUP%:*",
      principalType: "group",
      principal: "%GROUP%",
      permission: 8
    });
    expect(plan.users[0]).toMatchObject({
      id: "user:alice",
      username: "alice",
      passwordHash: "$2y$hash",
      displayName: "Alice Example",
      email: "alice@example.test",
      groups: ["user", "admin"],
      isDisabled: false
    });
    expect(plan.users[1]).toMatchObject({
      id: "user:bob",
      username: "bob",
      passwordHash: "hash:with:colon",
      displayName: "Bob Example",
      email: "bob@example.test",
      groups: ["user"]
    });
    expect(plan.users[2]).toMatchObject({
      id: "user:carol",
      username: "carol",
      passwordHash: "hash#fragment",
      displayName: "Carol# Example",
      groups: ["ops", "user"]
    });
    expect(plan.configSettings).toContainEqual({
      key: "title",
      path: ["title"],
      value: "Imported Wiki",
      rawValue: "'Imported Wiki'",
      source: "local.php",
      layer: "local",
      locked: false
    });
    expect(plan.configSettings).toContainEqual({
      key: "lang",
      path: ["lang"],
      value: "pt-br",
      rawValue: "'pt-br'",
      source: "local.php",
      layer: "local",
      locked: false
    });
    expect(plan.configSettings).toContainEqual({
      key: "license",
      path: ["license"],
      value: "cc-by-sa",
      rawValue: "'cc-by-sa'",
      source: "local.protected.php",
      layer: "protected",
      locked: true
    });
    expect(plan.pluginConfigSettings).toContainEqual({
      plugin: "testing",
      key: "mode",
      path: ["mode"],
      value: "local",
      rawValue: "'local'",
      source: "local.php",
      layer: "local",
      locked: false
    });
    expect(plan.pluginConfigSettings).toContainEqual({
      plugin: "testing",
      key: "locked",
      path: ["locked"],
      value: true,
      rawValue: "true",
      source: "local.protected.php",
      layer: "protected",
      locked: true
    });
    expect(plan.pluginSettings).toContainEqual({
      plugin: "acl",
      enabled: true,
      source: "plugins.required.php",
      layer: "required",
      locked: true
    });
    expect(plan.pluginSettings).toContainEqual({
      plugin: "testing",
      enabled: true,
      source: "plugins.local.php",
      layer: "local",
      locked: false
    });
    expect(plan.interwikiTemplates).toContainEqual({
      shortcut: "go",
      template: "https://www.google.com/search?q={URL}&btnI=lucky"
    });
    expect(plan.interwikiTemplates).toContainEqual({
      shortcut: "wp",
      template: "https://wiki.example/{URL}"
    });
    expect(plan.mimeTypes).toContainEqual({
      extension: "jpg",
      mimeType: "image/jpeg",
      forceDownload: false
    });
    expect(plan.mimeTypes).toContainEqual({
      extension: "zip",
      mimeType: "application/x-custom-zip",
      forceDownload: false
    });
    expect(plan.schemeProtocols).toEqual([
      { protocol: "http", source: "scheme.conf" },
      { protocol: "https", source: "scheme.conf" },
      { protocol: "irc", source: "scheme.local.conf" }
    ]);
    expect(plan.entityReplacements).toEqual([
      { token: "->", replacement: "→", order: 0, source: "entities.conf" },
      { token: "(c)", replacement: "COPY", order: 1, source: "entities.local.conf" },
      { token: "??", replacement: "‽", order: 2, source: "entities.local.conf" }
    ]);
    expect(plan.smileyMappings).toEqual([
      { token: ":-)", filename: "custom.svg", source: "smileys.local.conf" },
      { token: "LOL", filename: "lol.svg", source: "smileys.conf" }
    ]);
    expect(plan.acronymMappings).toEqual([
      { acronym: "API", title: "Custom API", source: "acronyms.local.conf" },
      { acronym: "HTML", title: "HyperText Markup Language", source: "acronyms.conf" }
    ]);
    expect(plan.wordblockPatterns).toEqual([
      { id: "wordblock:1", pattern: "wow gold" },
      { id: "wordblock:2", pattern: "custom phrase" }
    ]);
    expect(plan.customLanguageFiles).toEqual([
      expect.objectContaining({
        kind: "language",
        language: "en",
        path: "lang.php",
        relativePath: "en/lang.php",
        encoding: "utf8",
        content: "<?php\n$lang['btn_save'] = 'Save it';\n"
      }),
      expect.objectContaining({
        kind: "language",
        language: "en",
        path: "sidebar.txt",
        relativePath: "en/sidebar.txt",
        encoding: "utf8",
        content: "Custom sidebar language\n"
      })
    ]);
    expect(plan.customTemplateFiles).toEqual([
      expect.objectContaining({
        kind: "template",
        template: "custom",
        path: "images/logo.bin",
        relativePath: "custom/images/logo.bin",
        encoding: "base64",
        content: "AAECAw=="
      }),
      expect.objectContaining({
        kind: "template",
        template: "custom",
        path: "style.ini",
        relativePath: "custom/style.ini",
        encoding: "utf8",
        content: "[stylesheets]\nscreen.css = screen\n"
      })
    ]);

    const manifestOutput = path.join(root, "media-manifest.json");
    await writeMediaManifest(plan, manifestOutput);
    const manifest = JSON.parse(await readFile(manifestOutput, "utf8"));
    expect(manifest.objects).toContainEqual(
      expect.objectContaining({
        role: "current",
        mediaId: "wiki:logo.svg",
        objectKey: "media/current/wiki/logo.svg",
        mimeType: "image/svg+xml"
      })
    );
    expect(manifest.objects).toContainEqual(
      expect.objectContaining({
        role: "revision",
        mediaId: "wiki:logo.svg",
        revisionId: "wiki:logo.svg@2026-01-01T00:00:00.000Z",
        objectKey: "media/revisions/wiki/logo.svg/1767225600"
      })
    );

    const hashManifestOutput = path.join(root, "hash-manifest.json");
    await writeHashManifest(plan, hashManifestOutput);
    const hashManifest = JSON.parse(await readFile(hashManifestOutput, "utf8"));
    expect(hashManifest.pages).toContainEqual(
      expect.objectContaining({
        id: "wiki:welcome",
        contentHash: plan.pages[0].contentHash
      })
    );
    expect(hashManifest.pageRevisions).toContainEqual(
      expect.objectContaining({
        revisionId: "wiki:welcome@2026-01-01T00:00:00.000Z",
        contentHash: plan.pageRevisions[0].contentHash
      })
    );
    expect(hashManifest.mediaObjects).toContainEqual(
      expect.objectContaining({
        objectKey: "media/current/wiki/logo.svg",
        contentHash: plan.media[0].contentHash
      })
    );
    expect(hashManifest.mediaMetadata).toContainEqual(
      expect.objectContaining({
        subjectId: "wiki:logo.svg",
        contentHash: plan.mediaMetadata[0].contentHash
      })
    );
    expect(hashManifest.customLanguageFiles).toContainEqual(
      expect.objectContaining({
        relativePath: "en/lang.php",
        contentHash: plan.customLanguageFiles[0].contentHash
      })
    );
    expect(hashManifest.customTemplateFiles).toContainEqual(
      expect.objectContaining({
        relativePath: "custom/style.ini",
        contentHash: plan.customTemplateFiles.find(
          (entry) => entry.relativePath === "custom/style.ini"
        ).contentHash
      })
    );
  });

  it("decodes DokuWiki URL and SafeFN filename modes during import", async () => {
    const urlRoot = await mkdtemp(path.join(tmpdir(), "dokuwiki-import-url-fn-"));
    await mkdir(path.join(urlRoot, "data/pages/wiki"), { recursive: true });
    await mkdir(path.join(urlRoot, "conf"), { recursive: true });
    await writeFile(path.join(urlRoot, "data/pages/wiki/caf%C3%A9.txt"), "====== URL ======\n");

    const urlPlan = await buildImportPlan(urlRoot);
    expect(urlPlan.pages).toContainEqual(
      expect.objectContaining({
        id: "wiki:café"
      })
    );

    const safeRoot = await mkdtemp(path.join(tmpdir(), "dokuwiki-import-safe-fn-"));
    await mkdir(path.join(safeRoot, "data/pages/wiki"), { recursive: true });
    await mkdir(path.join(safeRoot, "data/attic/wiki"), { recursive: true });
    await mkdir(path.join(safeRoot, "data/media/wiki"), { recursive: true });
    await mkdir(path.join(safeRoot, "data/media_attic/wiki"), { recursive: true });
    await mkdir(path.join(safeRoot, "data/meta/wiki"), { recursive: true });
    await mkdir(path.join(safeRoot, "data/media_meta/wiki"), { recursive: true });
    await mkdir(path.join(safeRoot, "conf"), { recursive: true });
    await writeFile(path.join(safeRoot, "conf/local.php"), "$conf['fnencode'] = 'safe';\n");
    await writeFile(path.join(safeRoot, "data/pages/wiki/caf%5l].txt"), "====== Safe ======\n");
    await writeFile(
      path.join(safeRoot, "data/attic/wiki/caf%5l].1767225600.txt"),
      "====== Old Safe ======\n"
    );
    await writeFile(path.join(safeRoot, "data/media/wiki/caf%5l].png"), "png");
    await writeFile(path.join(safeRoot, "data/media_attic/wiki/caf%5l].1767225600.png"), "old");
    await writeFile(
      path.join(safeRoot, "data/meta/wiki/caf%5l].meta"),
      'a:1:{s:7:"current";a:1:{s:5:"title";s:5:"Café";}}'
    );
    await writeFile(
      path.join(safeRoot, "data/media_meta/wiki/caf%5l].png.meta"),
      'a:1:{s:4:"Exif";a:1:{s:5:"Title";s:4:"Cafe";}}'
    );

    const safePlan = await buildImportPlan(safeRoot);

    expect(safePlan.pages).toContainEqual(expect.objectContaining({ id: "wiki:café" }));
    expect(safePlan.pageRevisions).toContainEqual(expect.objectContaining({ pageId: "wiki:café" }));
    expect(safePlan.media).toContainEqual(expect.objectContaining({ id: "wiki:café.png" }));
    expect(safePlan.mediaRevisions).toContainEqual(
      expect.objectContaining({ mediaId: "wiki:café.png" })
    );
    expect(safePlan.pageMetadata).toContainEqual(
      expect.objectContaining({ subjectId: "wiki:café" })
    );
    expect(safePlan.mediaMetadata).toContainEqual(
      expect.objectContaining({ subjectId: "wiki:café.png" })
    );
  });

  it("generates idempotent SQL for D1 page imports", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dokuwiki-import-sql-"));
    await mkdir(path.join(root, "data/pages/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/attic/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/media/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/media_attic/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/meta/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/media_meta/wiki"), { recursive: true });
    await mkdir(path.join(root, "conf"), { recursive: true });
    await mkdir(path.join(root, "conf/lang/en"), { recursive: true });
    await mkdir(path.join(root, "lib/tpl/custom"), { recursive: true });
    await writeFile(
      path.join(root, "data/pages/wiki/welcome.txt"),
      "====== Welcome ======\n\naber Text\n"
    );
    await writeFile(
      path.join(root, "data/attic/wiki/welcome.1767225600.txt.gz"),
      await gzipAsync("====== Old Welcome ======\n")
    );
    await writeFile(path.join(root, "data/media/wiki/logo.svg"), "<svg />\n");
    await writeFile(path.join(root, "data/media/wiki/photo.jpg"), "jpeg data\n");
    await writeFile(
      path.join(root, "data/media_attic/wiki/logo.1767225600.svg"),
      "<svg>old</svg>\n"
    );
    await writeFile(
      path.join(root, "data/meta/_dokuwiki.changes"),
      [
        "1767225600\t203.0.113.7\tE\twiki:welcome\talice\tEdited old page\t\t5",
        "1767225602\t203.0.113.9\tD\twiki:welcome\talice\tDeleted page\t\t-24",
        "1767225604\t203.0.113.10\tD\twiki:old\talice\tDeleted old page\t\t-12"
      ].join("\n")
    );
    await writeFile(
      path.join(root, "data/meta/_media.changes"),
      [
        "1767225600\t203.0.113.8\tE\twiki:logo.svg\tbob\tEdited old logo\t\t3",
        "1767225605\t203.0.113.11\tD\twiki:gone.png\tbob\tDeleted old image\t\t-9"
      ].join("\n")
    );
    await writeFile(path.join(root, "data/meta/wiki/welcome.meta"), WELCOME_PAGE_META);
    await writeFile(
      path.join(root, "data/media_meta/wiki/logo.svg.meta"),
      'a:1:{s:4:"Exif";a:1:{s:5:"Title";s:4:"Logo";}}'
    );
    await writeFile(path.join(root, "data/media_meta/wiki/photo.jpg.meta"), DOKU_MEDIA_JPEG_META);
    await writeFile(
      path.join(root, "data/meta/wiki/welcome.mlist"),
      "alice every 1767225606\nbob digest 1767225607\n"
    );
    await writeFile(path.join(root, "conf/acl.auth.php"), "* @ALL 8\n");
    await writeFile(
      path.join(root, "conf/users.auth.php"),
      "alice:$2y$hash:Alice Example:alice@example.test:user,admin\n"
    );
    await writeFile(
      path.join(root, "conf/local.php"),
      "$conf['title'] = 'SQL Wiki';\n$conf['lang'] = 'de';\n"
    );
    await writeFile(path.join(root, "conf/plugins.local.php"), "$plugins['acl'] = 1;\n");
    await writeFile(
      path.join(root, "conf/interwiki.local.conf"),
      "docs https://docs.example/{URL}\n"
    );
    await writeFile(path.join(root, "conf/mime.local.conf"), "foo text/x-foo\n");
    await writeFile(path.join(root, "conf/scheme.local.conf"), "irc\n");
    await writeFile(path.join(root, "conf/entities.local.conf"), "?? ‽\n");
    await writeFile(path.join(root, "conf/smileys.local.conf"), ":-) custom.svg\n");
    await writeFile(path.join(root, "conf/acronyms.local.conf"), "API Custom API\n");
    await writeFile(path.join(root, "conf/wordblock.conf"), "spam phrase\n");
    await writeFile(path.join(root, "conf/lang/en/lang.php"), "<?php\n$lang['btn_save']='Save';\n");
    await writeFile(path.join(root, "lib/tpl/custom/main.php"), "<?php echo tpl_content();\n");

    const plan = await buildImportPlan(root);
    const output = path.join(root, "import.sql");

    await writePageImportSql(plan, output);

    const sql = await readFile(output, "utf8");
    expect(plan.language).toBe("de");
    expect(sql).toContain("insert into pages");
    expect(sql).toContain("on conflict(id) do update");
    expect(sql).toContain("insert or replace into page_revisions");
    expect(sql).toContain("'wiki:welcome@2026-01-01T00:00:00.000Z'");
    expect(sql).toContain("Imported from DokuWiki flat files");
    expect(sql).toContain("'user:alice', 'alice',\n  'Edited old page', 'edit', 5");
    expect(sql).toContain("'wiki:old', 'wiki', 'old', 'wiki:old@2026-01-01T00:00:04.000Z', 1");
    expect(sql).toContain("'wiki:old@2026-01-01T00:00:04.000Z', 'wiki:old', '',");
    expect(sql).toContain("'Deleted old page', 'delete', -12");
    expect(sql).toContain("insert into search_terms");
    expect(sql).toContain("term_length");
    expect(sql).not.toContain("values ('aber'");
    expect(sql).toContain("insert into search_postings");
    expect(sql).toContain("insert into media (");
    expect(sql).toContain("insert or replace into media_revisions");
    expect(sql).toContain("'media/current/wiki/logo.svg'");
    expect(sql).toContain("'media/current/wiki/photo.jpg'");
    expect(sql).toContain("'wiki:logo.svg@2026-01-01T00:00:00.000Z'");
    expect(sql).toContain("'user:bob', 'Edited old logo', 'edit'");
    expect(sql).toContain("'wiki:gone.png', 'wiki', 'media/deleted/wiki/gone.png/");
    expect(sql).toContain("'wiki:gone.png@2026-01-01T00:00:05.000Z', 1");
    expect(sql).toContain("'Deleted old image', 'delete'");
    expect(sql).toContain("insert or replace into metadata");
    expect(sql).toContain("dokuwiki_language_file");
    expect(sql).toContain("dokuwiki_template_file");
    expect(sql).toContain("conf:title");
    expect(sql).toContain("insert into plugin_settings");
    expect(sql).toContain("'acl'");
    expect(sql).toContain("'interwiki'");
    expect(sql).toContain("'docs'");
    expect(sql).toContain("'mime'");
    expect(sql).toContain("'foo'");
    expect(sql).toContain("'scheme'");
    expect(sql).toContain('"protocol":"irc"');
    expect(sql).toContain("'entities'");
    expect(sql).toContain("'??'");
    expect(sql).toContain("'smileys'");
    expect(sql).toContain('"filename":"custom.svg"');
    expect(sql).toContain("'acronyms'");
    expect(sql).toContain('"title":"Custom API"');
    expect(sql).toContain("'wordblock'");
    expect(sql).toContain("'wordblock:1'");
    expect(sql).toContain("insert or replace into changelog");
    expect(sql).toContain('\'description\', \'{"abstract":"Welcome abstract"');
    expect(sql).toContain(
      '\'relation\', \'{"references":{"wiki:guide":true,"wiki:missing":false}}\''
    );
    expect(sql).toContain("'date', '{\"created\":1767225600,\"modified\":1767225601}'");
    expect(sql).toContain("'contributor', '{\"user:alice\":\"Alice Example\"}'");
    expect(sql).toContain("values ('page', 'wiki:guide', 'backlinks', '[\"wiki:welcome\"]'");
    expect(sql).toContain("values ('page', 'wiki:missing', 'backlinks', '[\"wiki:welcome\"]'");
    expect(sql).toContain("values ('media', 'wiki:photo.jpg', 'jpeg', '{\"format\":\"JPEG\"");
    expect(sql).toContain('"Iptc.Headline":"Legacy title"');
    expect(sql).toContain('"Iptc.Caption":"Legacy caption"');
    expect(sql).toContain('"File.Width":"1024"');
    expect(sql).toContain('"File.Height":"768"');
    expect(sql).toContain("'delete'");
    expect(sql).toContain("'Deleted page'");
    expect(sql).toContain("insert into acl_rules");
    expect(sql).toContain("insert into users");
    expect(sql).toContain("insert into groups");
    expect(sql).toContain("insert into user_groups");
    expect(sql).toContain("insert into subscriptions");
    expect(sql).toContain("'subscription:user%3Aalice:page:wiki%3Awelcome'");
    expect(sql).toContain("'immediate', '2026-01-01T00:00:06.000Z'");
    expect(sql).not.toContain("subscription:user%3Abob");
    expect(sql).toContain("'user:alice'");
    expect(sql).toContain("'group:admin'");
    expect(sql).toContain("'all'");
    expect(sql).toContain("'wiki:welcome'");
  });
});
