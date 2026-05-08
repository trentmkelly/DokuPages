import { describe, expect, it } from "vitest";
import {
  mediaSizeQuery,
  mediaToken,
  requestedMediaSize,
  validMediaToken
} from "../src/wiki/media-token";

describe("DokuWiki media tokens", () => {
  it("matches upstream HMAC-MD5 media token inputs", () => {
    expect(mediaToken("wiki:logo.svg", requestedMediaSize("80", null), "secret")).toBe("124688");
    expect(mediaToken("wiki:logo.svg", requestedMediaSize("80", "40"), "secret")).toBe("495552");
    expect(mediaToken("wiki:logo.svg", requestedMediaSize(null, "40"), "secret")).toBe("f8795d");
  });

  it("validates resized media tokens in constant shape", () => {
    const size = requestedMediaSize("80", null);
    const remote = "https://cdn.example/logo.png";
    const remoteToken = mediaToken(remote, requestedMediaSize(null, null), "secret");

    expect(validMediaToken("wiki:logo.svg", size, "124688", "secret")).toBe(true);
    expect(validMediaToken("wiki:logo.svg", size, "bad", "secret")).toBe(false);
    expect(validMediaToken("wiki:logo.svg", size, null, "secret")).toBe(false);
    expect(validMediaToken("wiki:logo.svg", size, "124688", null)).toBe(false);
    expect(validMediaToken("wiki:logo.svg", requestedMediaSize(null, null), null, null)).toBe(true);
    expect(remoteToken).toMatch(/^[0-9a-f]{6}$/);
    expect(validMediaToken(remote, requestedMediaSize(null, null), remoteToken, "secret")).toBe(
      true
    );
    expect(validMediaToken(remote, requestedMediaSize(null, null), null, "secret")).toBe(false);
  });

  it("builds DokuWiki-style resize query strings only when signing is configured", () => {
    expect(mediaSizeQuery("wiki:logo.svg", requestedMediaSize("80", "40"), "secret")).toBe(
      "w=80&h=40&tok=495552"
    );
    expect(mediaSizeQuery("wiki:logo.svg", requestedMediaSize("80", "40"), null)).toBe("");
    expect(mediaSizeQuery("wiki:logo.svg", requestedMediaSize(null, null), "secret")).toBe("");
    expect(
      mediaSizeQuery("https://cdn.example/logo.png", requestedMediaSize(null, null), "secret")
    ).toMatch(/^tok=[0-9a-f]{6}$/);
  });
});
