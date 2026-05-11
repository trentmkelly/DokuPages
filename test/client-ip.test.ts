import { describe, expect, it } from "vitest";
import { getClientIp, getClientIps, isValidIpOrCidr } from "../src/http/client-ip";

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

  it("uses X-Real-IP only when the realip policy is enabled", () => {
    const request = new Request("https://example.com/wiki/wiki/welcome", {
      headers: { "x-real-ip": "198.51.100.2" }
    });

    expect(getClientIp(request)).toBeNull();
    expect(getClientIp(request, { realIp: true })).toBe("198.51.100.2");
  });

  it("uses X-Forwarded-For only when every listed proxy is trusted", () => {
    const request = new Request("https://example.com/wiki/wiki/welcome", {
      headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.10, 192.168.1.4" }
    });

    expect(
      getClientIps(request, {
        trustedProxies: ["10.0.0.0/8", "192.168.0.0/16"]
      })
    ).toEqual(["198.51.100.1", "10.0.0.10", "192.168.1.4"]);
    expect(getClientIp(request, { trustedProxies: ["10.0.0.0/8"] })).toBeNull();
  });

  it("keeps Cloudflare's connecting IP ahead of DokuWiki proxy fallbacks", () => {
    const request = new Request("https://example.com/wiki/wiki/welcome", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "x-real-ip": "198.51.100.2",
        "x-forwarded-for": "198.51.100.1, 10.0.0.10"
      }
    });

    expect(
      getClientIp(request, {
        realIp: true,
        trustedProxies: ["10.0.0.0/8"]
      })
    ).toBe("203.0.113.10");
  });

  it("validates trusted proxy IP and CIDR values", () => {
    expect(isValidIpOrCidr("10.0.0.0/8")).toBe(true);
    expect(isValidIpOrCidr("2001:db8::/32")).toBe(true);
    expect(isValidIpOrCidr("203.0.113.10")).toBe(true);
    expect(isValidIpOrCidr("10.0.0.0/33")).toBe(false);
    expect(isValidIpOrCidr("not an ip")).toBe(false);
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
