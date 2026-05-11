import { describe, expect, it } from "vitest";
import {
  parseDokuWikiMemberList,
  promotionSql,
  resolveSuperuserPromotion,
  sqlString,
  userGroupsSql,
  userLookupSql
} from "../scripts/promote-superuser.mjs";

describe("promote-superuser operator script", () => {
  it("parses DokuWiki member lists like SUPERUSER", () => {
    expect(parseDokuWikiMemberList("@admin, root, @admin, !!not set!!")).toEqual([
      "@admin",
      "root"
    ]);
  });

  it("chooses a configured superuser group before requiring config edits", () => {
    expect(resolveSuperuserPromotion("root,@ops", "testuser")).toEqual({
      kind: "group",
      group: "ops"
    });
    expect(resolveSuperuserPromotion("testuser", "testuser")).toEqual({
      kind: "already_user",
      username: "testuser"
    });
    expect(resolveSuperuserPromotion("root", "testuser")).toMatchObject({
      kind: "unsupported"
    });
    expect(resolveSuperuserPromotion("root", "testuser", "Admin")).toEqual({
      kind: "group",
      group: "admin"
    });
  });

  it("generates escaped D1 SQL for group promotion and verification", () => {
    expect(sqlString("o'hara")).toBe("'o''hara'");
    expect(userLookupSql("TestUser")).toContain("lower('TestUser')");
    expect(userGroupsSql("TestUser")).toContain("group_concat");

    const sql = promotionSql("o'hara", "Admin");
    expect(sql).toContain("'o''hara'");
    expect(sql).toContain("'group:admin'");
    expect(sql).toContain("insert or ignore into user_groups");
  });
});
