import { describe, expect, it } from "vitest";
import { anonymousPrincipal, principalFromUser, type AuthPrincipal } from "../src/auth/principal";
import type { AclRuleRecord } from "../src/storage/interfaces";
import {
  ACL_CREATE,
  ACL_DELETE,
  ACL_EDIT,
  ACL_NONE,
  ACL_READ,
  ACL_UPLOAD,
  hasAclPermission,
  requiredAclPermission,
  resolveAclAction,
  resolveAclPermission
} from "../src/wiki/acl";

const createdAt = "2026-05-07T00:00:00.000Z";

describe("DokuWiki ACL matching", () => {
  it("defaults to upload-level access when no ACL rules are loaded", () => {
    expect(resolveAclPermission([], "wiki:start", anonymousPrincipal())).toBe(ACL_UPLOAD);
    expect(
      resolveAclPermission([], "wiki:start", anonymousPrincipal(), { defaultPermission: ACL_NONE })
    ).toBe(ACL_NONE);
  });

  it("checks exact page rules before namespace rules", () => {
    const rules = [
      rule("*", "all", "@ALL", ACL_UPLOAD),
      rule("wiki:*", "all", "@ALL", ACL_UPLOAD),
      rule("wiki:private", "all", "@ALL", ACL_READ)
    ];

    expect(resolveAclPermission(rules, "wiki:private", anonymousPrincipal())).toBe(ACL_READ);
  });

  it("inherits namespace wildcard rules from nearest namespace outward", () => {
    const rules = [
      rule("*", "all", "@ALL", ACL_UPLOAD),
      rule("wiki:*", "all", "@ALL", ACL_READ),
      rule("wiki:private:*", "group", "user", ACL_EDIT)
    ];

    expect(
      resolveAclPermission(rules, "wiki:private:start", userPrincipal("alice", ["user"]))
    ).toBe(ACL_EDIT);
    expect(resolveAclPermission(rules, "wiki:public:start", anonymousPrincipal())).toBe(ACL_READ);
    expect(resolveAclPermission(rules, "playground", anonymousPrincipal())).toBe(ACL_UPLOAD);
  });

  it("uses the highest applicable permission within one matched scope", () => {
    const rules = [
      rule("wiki:start", "all", "@ALL", ACL_READ),
      rule("wiki:start", "user", "alice", ACL_EDIT),
      rule("wiki:start", "group", "admin", ACL_DELETE),
      rule("wiki:start", "user", "alice", ACL_NONE)
    ];

    expect(resolveAclPermission(rules, "wiki:start", userPrincipal("alice", ["admin"]))).toBe(
      ACL_DELETE
    );
  });

  it("matches user, group, and all principals with DokuWiki ACL subject syntax", () => {
    const rules = [
      rule("wiki:users:*", "user", "@alice", ACL_CREATE),
      rule("wiki:groups:*", "group", "@editor", ACL_UPLOAD),
      rule("wiki:anyone:*", "all", "@ALL", ACL_READ)
    ];
    const principal = userPrincipal("alice", ["editor"]);

    expect(resolveAclPermission(rules, "wiki:users:start", principal)).toBe(ACL_CREATE);
    expect(resolveAclPermission(rules, "wiki:groups:start", principal)).toBe(ACL_UPLOAD);
    expect(resolveAclPermission(rules, "wiki:anyone:start", anonymousPrincipal())).toBe(ACL_READ);
  });

  it("expands %USER% rules for the active user", () => {
    const rules = [
      rule("*", "all", "@ALL", ACL_NONE),
      rule("users:%USER%:*", "user", "%USER%", ACL_DELETE)
    ];

    expect(resolveAclPermission(rules, "users:alice:start", userPrincipal("alice", []))).toBe(
      ACL_DELETE
    );
    expect(resolveAclPermission(rules, "users:alice:start", userPrincipal("bob", []))).toBe(
      ACL_NONE
    );
    expect(resolveAclPermission(rules, "users:alice:start", anonymousPrincipal())).toBe(ACL_NONE);
  });

  it("expands %GROUP% rules once per active user group", () => {
    const rules = [
      rule("*", "all", "@ALL", ACL_NONE),
      rule("teams:%GROUP%:*", "group", "%GROUP%", ACL_UPLOAD)
    ];
    const principal = userPrincipal("alice", ["editor", "ops"]);

    expect(resolveAclPermission(rules, "teams:editor:start", principal)).toBe(ACL_UPLOAD);
    expect(resolveAclPermission(rules, "teams:ops:start", principal)).toBe(ACL_UPLOAD);
    expect(resolveAclPermission(rules, "teams:admin:start", principal)).toBe(ACL_NONE);
  });

  it("clamps imported permission levels to DokuWiki ACL bounds", () => {
    const rules = [rule("wiki:too-low", "all", "@ALL", -1), rule("wiki:admin", "all", "@ALL", 255)];

    expect(resolveAclPermission(rules, "wiki:too-low", anonymousPrincipal())).toBe(ACL_NONE);
    expect(resolveAclPermission(rules, "wiki:admin", anonymousPrincipal())).toBe(ACL_DELETE);
  });

  it("maps required permissions for wiki actions", () => {
    expect(requiredAclPermission("read")).toBe(ACL_READ);
    expect(requiredAclPermission("edit")).toBe(ACL_EDIT);
    expect(requiredAclPermission("create")).toBe(ACL_CREATE);
    expect(requiredAclPermission("upload")).toBe(ACL_UPLOAD);
    expect(requiredAclPermission("delete")).toBe(ACL_DELETE);

    expect(hasAclPermission(ACL_UPLOAD, ACL_CREATE)).toBe(true);
    expect(
      resolveAclAction(
        [rule("wiki:*", "all", "@ALL", ACL_EDIT)],
        "wiki:start",
        anonymousPrincipal(),
        "edit"
      )
    ).toBe(true);
    expect(
      resolveAclAction(
        [rule("wiki:*", "all", "@ALL", ACL_EDIT)],
        "wiki:start",
        anonymousPrincipal(),
        "delete"
      )
    ).toBe(false);
  });
});

function userPrincipal(username: string, groups: string[]): AuthPrincipal {
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

function rule(
  scope: string,
  principalType: AclRuleRecord["principalType"],
  principal: string,
  permission: number
): AclRuleRecord {
  return {
    id: `acl:${scope}:${principal}`,
    scope,
    principalType,
    principal,
    permission,
    createdAt
  };
}
