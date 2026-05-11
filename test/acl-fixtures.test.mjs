import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { principalFromUser, anonymousPrincipal } from "../src/auth/principal.ts";
import {
  ACL_DELETE,
  ACL_EDIT,
  ACL_NONE,
  ACL_READ,
  ACL_UPLOAD,
  resolveAclPermission
} from "../src/wiki/acl.ts";
import { discoverAclRules } from "../scripts/import-dokuwiki.mjs";

const fixtureDir = fileURLToPath(new URL("./fixtures/dokuwiki-conf", import.meta.url));
const createdAt = "2026-05-07T00:00:00.000Z";

describe("DokuWiki ACL fixture parity", () => {
  it("imports the upstream acl.auth.php.dist default grant", async () => {
    const rules = await discoverAclRules(path.join(fixtureDir, "acl.auth.php.dist"));

    expect(rules).toEqual([
      expect.objectContaining({
        scope: "*",
        principalType: "all",
        principal: "@ALL",
        permission: ACL_UPLOAD
      })
    ]);
    expect(resolveAclPermission(rules, "wiki:start", anonymousPrincipal())).toBe(ACL_UPLOAD);
  });

  it("resolves encoded users, encoded groups, placeholders, and permission clamps", async () => {
    const rules = await discoverAclRules(path.join(fixtureDir, "acl-realworld.auth.php"));

    expect(rules).toHaveLength(10);
    expect(resolveAclPermission(rules, "wiki:start", anonymousPrincipal())).toBe(ACL_READ);
    expect(
      resolveAclPermission(rules, "wiki:team:start", userPrincipal("alice", ["editors"]))
    ).toBe(ACL_EDIT);
    expect(resolveAclPermission(rules, "wiki:team:launch", userPrincipal("bob-smith", []))).toBe(
      ACL_DELETE
    );
    expect(
      resolveAclPermission(rules, "wiki:team:launch", userPrincipal("casey", ["qa team"]))
    ).toBe(ACL_UPLOAD);
    expect(
      resolveAclPermission(rules, "wiki:locked:start", userPrincipal("casey", ["editors"]))
    ).toBe(ACL_NONE);
    expect(
      resolveAclPermission(rules, "wiki:locked:exception", userPrincipal("casey", ["reviewers"]))
    ).toBe(ACL_EDIT);
    expect(resolveAclPermission(rules, "users:alice:start", userPrincipal("alice", []))).toBe(
      ACL_DELETE
    );
    expect(resolveAclPermission(rules, "users:alice:start", userPrincipal("bob", []))).toBe(
      ACL_NONE
    );
    expect(resolveAclPermission(rules, "teams:ops:start", userPrincipal("alice", ["ops"]))).toBe(
      ACL_UPLOAD
    );
    expect(resolveAclPermission(rules, "wiki:admin:start", userPrincipal("alice", ["ops"]))).toBe(
      ACL_DELETE
    );
  });
});

function userPrincipal(username, groups) {
  return principalFromUser(
    {
      id: `user:${username}`,
      username,
      displayName: username,
      email: null,
      passwordHash: "hash",
      isDisabled: false,
      createdAt,
      updatedAt: createdAt
    },
    groups
  );
}
