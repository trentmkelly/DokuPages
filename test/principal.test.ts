import { describe, expect, it } from "vitest";
import {
  anonymousPrincipal,
  principalAclSubjects,
  principalAuthor,
  principalFromUser,
  publicPrincipal
} from "../src/auth/principal";

describe("auth principals", () => {
  it("represents anonymous visitors without a user or group identity", () => {
    const principal = anonymousPrincipal();

    expect(principal).toMatchObject({
      type: "anonymous",
      isAuthenticated: false,
      username: null,
      groups: []
    });
    expect(principalAclSubjects(principal)).toEqual(["@ALL"]);
    expect(principalAuthor(principal)).toEqual({ authorId: null, authorName: null });
    expect(publicPrincipal(principal)).toMatchObject({
      type: "anonymous",
      isAuthenticated: false,
      username: null,
      displayName: "Anonymous",
      groups: [],
      aclSubjects: ["@ALL"]
    });
  });

  it("adds DokuWiki-compatible ACL subjects for authenticated users", () => {
    const principal = principalFromUser(
      {
        id: "user-1",
        username: "alice",
        displayName: "Alice Example",
        email: "alice@example.test",
        passwordHash: "hash",
        isDisabled: false,
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T00:00:00.000Z"
      },
      ["user", "@admin", "user", ""]
    );

    expect(principal.groups).toEqual(["user", "admin"]);
    expect(principalAclSubjects(principal)).toEqual(["@ALL", "@user", "@admin", "alice"]);
    expect(principalAuthor(principal)).toEqual({
      authorId: "user-1",
      authorName: "Alice Example"
    });
  });
});
