export function getClientIp(request: Request): string | null {
  return normalizeClientIp(request.headers.get("cf-connecting-ip"));
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

function isIpv6(value: string): boolean {
  if (!value.includes(":")) return false;

  try {
    new URL(`http://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}
