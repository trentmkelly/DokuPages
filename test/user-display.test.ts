import { describe, expect, it } from "vitest";
import { renderUserDisplay } from "../src/wiki/user-display";

const user = {
  userId: "user-1",
  username: "alice",
  displayName: "Alice Example",
  email: "alice@example.test",
  fallbackName: "Alice Example",
  knownUser: true
};

describe("DokuWiki user display modes", () => {
  it("matches showuseras output modes", () => {
    expect(renderUserDisplay(user, "loginname")).toBe("alice");
    expect(renderUserDisplay(user, "username")).toBe("Alice Example");
    expect(renderUserDisplay(user, "username_link")).toBe(
      '<a href="/wiki/user/alice" class="interwiki iw_user">Alice Example</a>'
    );
    expect(renderUserDisplay(user, "email")).toBe(
      "&#x61;&#x6c;&#x69;&#x63;&#x65;&#x40;&#x65;&#x78;&#x61;&#x6d;&#x70;&#x6c;&#x65;&#x2e;&#x74;&#x65;&#x73;&#x74;"
    );
    expect(renderUserDisplay(user, "email_link")).toBe(
      '<a href="mailto:&#x61;&#x6c;&#x69;&#x63;&#x65;&#x40;&#x65;&#x78;&#x61;&#x6d;&#x70;&#x6c;&#x65;&#x2e;&#x74;&#x65;&#x73;&#x74;" class="mail" title="&#x61;&#x6c;&#x69;&#x63;&#x65;&#x40;&#x65;&#x78;&#x61;&#x6d;&#x70;&#x6c;&#x65;&#x2e;&#x74;&#x65;&#x73;&#x74;">&#x61;&#x6c;&#x69;&#x63;&#x65;&#x40;&#x65;&#x78;&#x61;&#x6d;&#x70;&#x6c;&#x65;&#x2e;&#x74;&#x65;&#x73;&#x74;</a>'
    );
  });
});
