export interface Pagination {
  limit: number;
  offset: number;
}

export function paginationFromUrl(
  url: URL,
  options: { defaultLimit: number; maxLimit: number }
): Pagination {
  return {
    limit: clampPositiveInteger(
      url.searchParams.get("limit"),
      options.defaultLimit,
      options.maxLimit
    ),
    offset: clampNonNegativeInteger(url.searchParams.get("offset"))
  };
}

function clampPositiveInteger(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function clampNonNegativeInteger(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}
