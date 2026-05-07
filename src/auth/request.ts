import type { Env } from "../env";
import { getRuntimeConfig } from "../config";
import { anonymousPrincipal, type AuthPrincipal } from "./principal";
import { principalFromSessionCookie, readCookie } from "./session";

export async function resolveRequestPrincipal(request: Request, env: Env): Promise<AuthPrincipal> {
  const cookieName = getRuntimeConfig(env).sessionCookieName;
  const cookie = readCookie(request, cookieName);
  if (!cookie) return anonymousPrincipal();

  return principalFromSessionCookie(env.DB, cookie);
}
