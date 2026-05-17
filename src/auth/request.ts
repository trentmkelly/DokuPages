import type { Env } from "../env";
import { getRuntimeConfig } from "../config";
import { anonymousPrincipal, type AuthPrincipal } from "./principal";
import { principalFromSessionCookie, readCookie } from "./session";
import { principalFromAuthToken } from "./authtoken";

export async function resolveRequestPrincipal(request: Request, env: Env): Promise<AuthPrincipal> {
  const config = getRuntimeConfig(env);
  const externalPrincipal = await principalFromExternalAuthHeaders(config);
  if (externalPrincipal) return externalPrincipal;

  const tokenPrincipal = await principalFromAuthToken(request, env);
  if (tokenPrincipal) return tokenPrincipal;

  const cookieName = config.sessionCookieName;
  const cookie = readCookie(request, cookieName);
  if (!cookie) return anonymousPrincipal();

  return principalFromSessionCookie(env.DB, cookie);
}

async function principalFromExternalAuthHeaders(
  config: ReturnType<typeof getRuntimeConfig>
): Promise<AuthPrincipal | null> {
  if (config.externalAuthMode !== "cloudflare_access") return null;

  // Security hardening: do not trust identity headers without verified
  // Cloudflare Access JWT assertions and trusted proxy enforcement.
  // Until that verification path exists, keep this bridge fail-closed.
  return null;
}
