import { describe, expect, it } from "vitest";
import { anonymousPrincipal, type AuthPrincipal } from "../src/auth/principal";
import {
  isDokuWikiManager,
  isDokuWikiSuperuser,
  principalMatchesDokuWikiMemberList
} from "../src/auth/roles";

describe("DokuWiki role member lists", () => {
  const alice: AuthPrincipal = {
    type: "user",
    isAuthenticated: true,
    id: "user-1",
    username: "Alice",
    displayName: "Alice Example",
    email: "alice@example.test",
    groups: ["User", "Ops"]
  };

  it("matches usernames, groups, @ALL, and unset placeholders like upstream auth_isMember", () => {
    expect(principalMatchesDokuWikiMemberList(alice, "bob, Alice")).toBe(true);
    expect(principalMatchesDokuWikiMemberList(alice, "@ops")).toBe(true);
    expect(principalMatchesDokuWikiMemberList(alice, "@ALL")).toBe(true);
    expect(principalMatchesDokuWikiMemberList(alice, "!!not set!!,@staff")).toBe(false);
    expect(principalMatchesDokuWikiMemberList(anonymousPrincipal(), "@ALL")).toBe(false);
  });

  it("treats superusers as managers and keeps managers below superusers", () => {
    expect(isDokuWikiSuperuser(alice, "@ops")).toBe(true);
    expect(isDokuWikiManager(alice, "root", "@ops")).toBe(true);
    expect(isDokuWikiSuperuser(alice, "@staff")).toBe(false);
    expect(isDokuWikiManager(alice, "@staff", "bob")).toBe(false);
  });
});
