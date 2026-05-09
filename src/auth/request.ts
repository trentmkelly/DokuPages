import type { Env } from "../env";
import { getRuntimeConfig } from "../config";
import { anonymousPrincipal, principalFromUser, type AuthPrincipal } from "./principal";
import { principalFromSessionCookie, readCookie } from "./session";
import type { UserRecord } from "../storage/interfaces";

interface ExternalAuthUserRow {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  is_disabled: number;
  created_at: string;
  updated_at: string;
}

interface ExternalAuthGroupRow {
  name: string;
}

export async function resolveRequestPrincipal(request: Request, env: Env): Promise<AuthPrincipal> {
  const config = getRuntimeConfig(env);
  const externalPrincipal = await principalFromExternalAuthHeaders(request, env, config);
  if (externalPrincipal) return externalPrincipal;

  const cookieName = config.sessionCookieName;
  const cookie = readCookie(request, cookieName);
  if (!cookie) return anonymousPrincipal();

  return principalFromSessionCookie(env.DB, cookie);
}

async function principalFromExternalAuthHeaders(
  request: Request,
  env: Env,
  config: ReturnType<typeof getRuntimeConfig>
): Promise<AuthPrincipal | null> {
  if (config.externalAuthMode !== "cloudflare_access") return null;

  const email = request.headers.get(config.externalAuthEmailHeader)?.trim().toLowerCase();
  if (!email) return null;

  const usernameHeader = config.externalAuthUsernameHeader
    ? request.headers.get(config.externalAuthUsernameHeader)?.trim()
    : null;
  const atSign = email.indexOf("@");
  const fallbackUsername = atSign > 0 ? email.slice(0, atSign) : email;
  const username = usernameHeader || fallbackUsername;
  if (!username) return null;

  const row = await env.DB.prepare(
    `select id, username, display_name, email, password_hash, is_disabled, created_at, updated_at
     from users
     where is_disabled = 0
       and (lower(email) = ? or lower(username) = ?)
     order by case when lower(email) = ? then 0 else 1 end
     limit 1`
  )
    .bind(email, username.toLowerCase(), email)
    .first<ExternalAuthUserRow>();

  if (!row) return null;

  return principalFromUser(mapExternalAuthUser(row), await listExternalAuthGroups(env.DB, row.id));
}

async function listExternalAuthGroups(db: D1Database, userId: string): Promise<string[]> {
  const result = await db
    .prepare(
      `select g.name
       from groups g
       join user_groups ug on ug.group_id = g.id
       where ug.user_id = ?
       order by g.name asc`
    )
    .bind(userId)
    .all<ExternalAuthGroupRow>();

  return result.results.map((row) => row.name);
}

function mapExternalAuthUser(row: ExternalAuthUserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    passwordHash: row.password_hash,
    isDisabled: row.is_disabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
