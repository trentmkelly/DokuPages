import type { Env } from "../env";
import { getRuntimeConfig } from "../config";
import { getClientIp } from "../http/client-ip";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileConfig {
  siteKey: string | null;
  secretKey: string | null;
  enabled: boolean;
}

export interface TurnstileVerificationResult {
  ok: boolean;
  skipped: boolean;
  message: string | null;
  errorCodes: string[];
}

interface SiteverifyResponse {
  success?: boolean;
  "error-codes"?: string[];
}

export function getTurnstileConfig(env: Env): TurnstileConfig {
  const siteKey = nonEmpty(env.TURNSTILE_SITE_KEY) ?? null;
  const secretKey = nonEmpty(env.TURNSTILE_SECRET_KEY) ?? null;

  return {
    siteKey,
    secretKey,
    enabled: Boolean(siteKey && secretKey)
  };
}

export async function verifyTurnstileForm(
  request: Request,
  env: Env,
  form: FormData,
  fetcher: typeof fetch = fetch
): Promise<TurnstileVerificationResult> {
  const config = getTurnstileConfig(env);
  if (!config.enabled || !config.secretKey) {
    return {
      ok: true,
      skipped: true,
      message: null,
      errorCodes: []
    };
  }

  const token = String(form.get("cf-turnstile-response") ?? "").trim();
  if (!token) {
    return failedVerification(["missing-input-response"]);
  }

  const runtimeConfig = getRuntimeConfig(env);
  try {
    const response = await fetcher(SITEVERIFY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        secret: config.secretKey,
        response: token,
        remoteip:
          getClientIp(request, {
            realIp: runtimeConfig.realIp,
            trustedProxies: runtimeConfig.trustedProxies
          }) ?? undefined,
        idempotency_key: crypto.randomUUID()
      })
    });
    const payload = await readSiteverifyResponse(response);

    if (response.ok && payload.success) {
      return {
        ok: true,
        skipped: false,
        message: null,
        errorCodes: []
      };
    }

    return failedVerification(payload["error-codes"] ?? [`http-${response.status}`]);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "turnstile_verification_error",
        error: error instanceof Error ? error.message : String(error)
      })
    );
    return failedVerification(["internal-error"]);
  }
}

async function readSiteverifyResponse(response: Response): Promise<SiteverifyResponse> {
  try {
    const payload = await response.json();
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as SiteverifyResponse;
    }
  } catch {
    // Treat non-JSON provider responses as failed verification below.
  }

  return {};
}

function failedVerification(errorCodes: string[]): TurnstileVerificationResult {
  return {
    ok: false,
    skipped: false,
    message: "Human verification failed. Please try again.",
    errorCodes
  };
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
