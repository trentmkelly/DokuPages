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
      "&#97;&#108;&#105;&#99;&#101;&#64;&#101;&#120;&#97;&#109;&#112;&#108;&#101;&#46;&#116;&#101;&#115;&#116;"
    );
    expect(renderUserDisplay(user, "email_link")).toBe(
      '<a href="mailto:&#97;&#108;&#105;&#99;&#101;&#64;&#101;&#120;&#97;&#109;&#112;&#108;&#101;&#46;&#116;&#101;&#115;&#116;" class="mail" title="&#97;&#108;&#105;&#99;&#101;&#64;&#101;&#120;&#97;&#109;&#112;&#108;&#101;&#46;&#116;&#101;&#115;&#116;">&#97;&#108;&#105;&#99;&#101;&#64;&#101;&#120;&#97;&#109;&#112;&#108;&#101;&#46;&#116;&#101;&#115;&#116;</a>'
    );
    expect(renderUserDisplay(user, "email", "visible")).toBe("alice [at] example [dot] test");
    expect(renderUserDisplay(user, "email_link", "none")).toBe(
      '<a href="mailto:alice@example.test" class="mail" title="alice@example.test">alice@example.test</a>'
    );
  });
});
