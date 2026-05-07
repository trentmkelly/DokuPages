export type StorageService = "d1" | "kv" | "r2" | "durable_object" | "storage";

export interface MappedStorageError {
  code: string;
  message: string;
  service: StorageService;
  status: number;
  retryable: boolean;
}

export function mapStorageError(error: unknown): MappedStorageError | null {
  const exception = error instanceof Error ? error : new Error(String(error));
  const service = detectStorageService(exception);
  if (!service) return null;

  const message = exception.message.toLowerCase();

  if (message.includes("rate limit") || message.includes("too many requests")) {
    return {
      code: "storage_rate_limited",
      message: "Storage is rate limited. Try again later.",
      service,
      status: 429,
      retryable: true
    };
  }

  if (message.includes("timeout") || message.includes("timed out")) {
    return {
      code: "storage_timeout",
      message: "Storage timed out. Try again later.",
      service,
      status: 504,
      retryable: true
    };
  }

  if (message.includes("not configured") || message.includes("missing binding")) {
    return {
      code: "storage_not_configured",
      message: "Storage is not configured.",
      service,
      status: 503,
      retryable: false
    };
  }

  if (
    message.includes("busy") ||
    message.includes("locked") ||
    message.includes("unavailable") ||
    message.includes("network") ||
    message.includes("fetch failed")
  ) {
    return {
      code: "storage_unavailable",
      message: "Storage is temporarily unavailable. Try again later.",
      service,
      status: 503,
      retryable: true
    };
  }

  return {
    code: "storage_error",
    message: "Storage request failed.",
    service,
    status: 500,
    retryable: false
  };
}

function detectStorageService(error: Error): StorageService | null {
  const haystack = `${error.name} ${error.message}`.toLowerCase();

  if (
    haystack.includes("d1") ||
    haystack.includes("sqlite") ||
    haystack.includes("sql error") ||
    haystack.includes("no such table")
  ) {
    return "d1";
  }

  if (haystack.includes("r2") || haystack.includes("bucket")) {
    return "r2";
  }

  if (haystack.includes("kvnamespace") || haystack.includes(" kv ") || haystack.includes("kv.")) {
    return "kv";
  }

  if (haystack.includes("durable object") || haystack.includes("durableobject")) {
    return "durable_object";
  }

  if (haystack.includes("storage")) {
    return "storage";
  }

  return null;
}
