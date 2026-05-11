export interface ClientIpPolicy {
  realIp?: boolean;
  trustedProxies?: readonly string[];
}

export function getClientIp(request: Request, policy: ClientIpPolicy = {}): string | null {
  return getClientIps(request, policy)[0] ?? null;
}

export function getClientIps(request: Request, policy: ClientIpPolicy = {}): string[] {
  const cloudflareIp = normalizeClientIp(request.headers.get("cf-connecting-ip"));
  if (cloudflareIp) return [cloudflareIp];

  const ips: string[] = [];
  if (policy.realIp) {
    const realIp = normalizeClientIp(request.headers.get("x-real-ip"));
    if (realIp) ips.push(realIp);
  }

  ips.push(...forwardedForClientIps(request.headers.get("x-forwarded-for"), policy.trustedProxies));

  return [...new Set(ips)];
}

export function isValidIpOrCidr(value: string): boolean {
  const parsed = parseCidr(value);
  if (!parsed) return false;
  return parsed.prefix >= 0 && parsed.prefix <= addressBits(parsed.kind);
}

function forwardedForClientIps(
  value: string | null,
  trustedProxies: readonly string[] | undefined
): string[] {
  if (!value || !trustedProxies?.length) return [];

  const forwarded = value
    .split(",")
    .map((part) => normalizeClientIp(part))
    .filter((part): part is string => Boolean(part));

  if (forwarded.length < 2) return [];

  const client = forwarded[0];
  const proxies = forwarded.slice(1);
  if (!proxies.every((proxy) => proxyIsTrusted(proxy, trustedProxies))) return [];

  return client ? [client, ...proxies] : [];
}

function proxyIsTrusted(ip: string, trustedProxies: readonly string[]): boolean {
  return trustedProxies.some((trusted) => ipMatches(ip, trusted));
}

function ipMatches(ip: string, trusted: string): boolean {
  const address = parseIp(ip);
  const range = parseCidr(trusted);
  if (!address || !range || address.kind !== range.kind) return false;

  const shift = BigInt(addressBits(address.kind) - range.prefix);
  return shift === 0n
    ? address.value === range.value
    : address.value >> shift === range.value >> shift;
}

function normalizeClientIp(value: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(",") || trimmed.length > 45) return null;

  if (isIpv4(trimmed) || isIpv6(trimmed)) {
    return trimmed;
  }

  return null;
}

function parseCidr(value: string): { kind: "ipv4" | "ipv6"; value: bigint; prefix: number } | null {
  const parts = value.trim().split("/");
  if (parts.length > 2) return null;

  const [addressPart, prefixPart] = parts;
  const address = parseIp(addressPart);
  if (!address) return null;

  const bits = addressBits(address.kind);
  const prefix =
    prefixPart === undefined
      ? bits
      : /^\d{1,3}$/.test(prefixPart)
        ? Number(prefixPart)
        : Number.NaN;

  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) return null;
  return { ...address, prefix };
}

function parseIp(value: string): { kind: "ipv4" | "ipv6"; value: bigint } | null {
  if (isIpv4(value)) return { kind: "ipv4", value: BigInt(ipv4ToNumber(value)) };
  const ipv6 = ipv6ToBigInt(value);
  return ipv6 === null ? null : { kind: "ipv6", value: ipv6 };
}

function addressBits(kind: "ipv4" | "ipv6"): number {
  return kind === "ipv4" ? 32 : 128;
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");

  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) return false;
      const number = Number(part);
      return number >= 0 && number <= 255;
    })
  );
}

function ipv4ToNumber(value: string): number {
  return value
    .split(".")
    .map(Number)
    .reduce((result, part) => result * 256 + part, 0);
}

function isIpv6(value: string): boolean {
  return ipv6ToBigInt(value) !== null;
}

function ipv6ToBigInt(value: string): bigint | null {
  if (!value.includes(":")) return null;

  const normalized = value.toLowerCase();
  if (normalized.includes("%")) return null;
  const doubleColonParts = normalized.split("::");
  if (doubleColonParts.length > 2) return null;

  const left = parseIpv6Hextets(doubleColonParts[0]);
  const right = parseIpv6Hextets(doubleColonParts[1] ?? "");
  if (!left || !right) return null;

  const missing = 8 - left.length - right.length;
  if (doubleColonParts.length === 1 && missing !== 0) return null;
  if (doubleColonParts.length === 2 && missing < 1) return null;

  const hextets = [...left, ...Array<number>(missing).fill(0), ...right];
  if (hextets.length !== 8) return null;

  return hextets.reduce((result, part) => (result << 16n) + BigInt(part), 0n);
}

function parseIpv6Hextets(value: string): number[] | null {
  if (!value) return [];

  const parts = value.split(":");
  const hextets: number[] = [];
  for (const [index, part] of parts.entries()) {
    if (!part) return null;
    if (part.includes(".")) {
      if (index !== parts.length - 1 || !isIpv4(part)) return null;
      const ipv4 = ipv4ToNumber(part);
      hextets.push((ipv4 >> 16) & 0xffff, ipv4 & 0xffff);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    hextets.push(Number.parseInt(part, 16));
  }

  return hextets;
}
