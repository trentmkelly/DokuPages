import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildImportPlan, writePageImportSql } from "../scripts/import-dokuwiki.mjs";

describe("DokuWiki import planner", () => {
  it("discovers pages, media, ACLs, and users from a flat-file DokuWiki tree", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dokuwiki-import-"));

    await mkdir(path.join(root, "data/pages/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/media/wiki"), { recursive: true });
    await mkdir(path.join(root, "conf"), { recursive: true });

    await writeFile(path.join(root, "data/pages/wiki/welcome.txt"), "====== Welcome ======\n");
    await writeFile(path.join(root, "data/media/wiki/logo.svg"), "<svg />\n");
    await writeFile(path.join(root, "conf/acl.auth.php"), "* @ALL 1\nwiki:* @user 8\n");
    await writeFile(
      path.join(root, "conf/users.auth.php"),
      "alice:$2y$hash:Alice Example:alice@example.test:user,admin\n"
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
    await writeFile(path.join(root, "conf/wordblock.conf"), "# spam terms\nzoosex\n wow gold \n");

    const plan = await buildImportPlan(root);

    expect(plan.counts).toMatchObject({
      pages: 1,
      media: 1,
      aclRules: 2,
      users: 1,
      pluginSettings: 3,
      interwikiTemplates: 2,
      mimeTypes: 2,
      wordblockPatterns: 2
    });
    expect(plan.pages[0]).toMatchObject({ id: "wiki:welcome" });
    expect(plan.media[0]).toMatchObject({ id: "wiki:logo.svg" });
    expect(plan.aclRules[1]).toMatchObject({ scope: "wiki:*", principal: "@user", permission: 8 });
    expect(plan.users[0]).toMatchObject({ username: "alice", groups: ["user", "admin"] });
    expect(plan.pluginSettings).toContainEqual({
      plugin: "acl",
      enabled: true,
      locked: true
    });
    expect(plan.pluginSettings).toContainEqual({
      plugin: "testing",
      enabled: true,
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
    expect(plan.wordblockPatterns).toEqual([
      { id: "wordblock:1", pattern: "zoosex" },
      { id: "wordblock:2", pattern: "wow gold" }
    ]);
  });

  it("generates idempotent SQL for D1 page imports", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dokuwiki-import-sql-"));
    await mkdir(path.join(root, "data/pages/wiki"), { recursive: true });
    await writeFile(
      path.join(root, "data/pages/wiki/welcome.txt"),
      "====== Welcome ======\n\nText\n"
    );

    const plan = await buildImportPlan(root);
    const output = path.join(root, "import.sql");

    await writePageImportSql(plan, output);

    const sql = await readFile(output, "utf8");
    expect(sql).toContain("insert into pages");
    expect(sql).toContain("on conflict(id) do update");
    expect(sql).toContain("insert or replace into page_revisions");
    expect(sql).toContain("insert into search_terms");
    expect(sql).toContain("insert into search_postings");
    expect(sql).toContain("'wiki:welcome'");
  });
});
