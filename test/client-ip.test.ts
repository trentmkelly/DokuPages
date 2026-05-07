import { describe, expect, it } from "vitest";
import { getClientIp } from "../src/http/client-ip";

describe("getClientIp", () => {
  it("uses Cloudflare's connecting IP header", () => {
    const request = new Request("https://example.com/wiki/wiki/welcome", {
      headers: { "cf-connecting-ip": "203.0.113.10" }
    });

    expect(getClientIp(request)).toBe("203.0.113.10");
  });

  it("accepts IPv6 client addresses from Cloudflare", () => {
    const request = new Request("https://example.com/wiki/wiki/welcome", {
      headers: { "cf-connecting-ip": "2001:db8::1" }
    });

    expect(getClientIp(request)).toBe("2001:db8::1");
  });

  it("ignores spoofable non-Cloudflare proxy headers", () => {
    const request = new Request("https://example.com/wiki/wiki/welcome", {
      headers: {
        "x-forwarded-for": "198.51.100.1",
        "x-real-ip": "198.51.100.2"
      }
    });

    expect(getClientIp(request)).toBeNull();
  });

  it("rejects invalid or chained Cloudflare header values", () => {
    expect(
      getClientIp(
        new Request("https://example.com/wiki/wiki/welcome", {
          headers: { "cf-connecting-ip": "203.0.113.10, 198.51.100.1" }
        })
      )
    ).toBeNull();
    expect(
      getClientIp(
        new Request("https://example.com/wiki/wiki/welcome", {
          headers: { "cf-connecting-ip": "not an ip" }
        })
      )
    ).toBeNull();
  });
});
