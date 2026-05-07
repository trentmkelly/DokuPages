import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildImportPlan } from "../scripts/import-dokuwiki.mjs";

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

    const plan = await buildImportPlan(root);

    expect(plan.counts).toMatchObject({
      pages: 1,
      media: 1,
      aclRules: 2,
      users: 1
    });
    expect(plan.pages[0]).toMatchObject({ id: "wiki:welcome" });
    expect(plan.media[0]).toMatchObject({ id: "wiki:logo.svg" });
    expect(plan.aclRules[1]).toMatchObject({ scope: "wiki:*", principal: "@user", permission: 8 });
    expect(plan.users[0]).toMatchObject({ username: "alice", groups: ["user", "admin"] });
  });
});
