import type { Env } from "../env";
import type { UserRecord } from "../storage/interfaces";
import { principalFromUser, type AuthPrincipal, type UserPrincipal } from "./principal";

const AUTH_TOKEN_KEY = "auth_token";
const JWT_ISSUER = "dokuwiki";

interface AuthTokenPayload {
  iss: string;
  sub: string;
  iat: number;
  exp?: number;
}

interface StoredAuthToken {
  token: string;
  issuedAt: number;
}

interface MetadataRow {
  value_json: string;
}

interface AuthTokenUserRow {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  is_disabled: number;
  created_at: string;
  updated_at: string;
}

interface AuthTokenGroupRow {
  name: string;
}

export async function principalFromAuthToken(
  request: Request,
  env: Env
): Promise<AuthPrincipal | null> {
  const token = authTokenFromRequest(request);
  if (!token) return null;

  const payload = await validateAuthToken(env, token);
  if (!payload) return null;

  const user = await findActiveUserByUsername(env.DB, payload.sub);
  if (!user) return null;

  const principal = principalFromUser(
    mapAuthTokenUser(user),
    await listAuthTokenGroups(env.DB, user.id)
  );
  principal.authToken = true;
  return principal;
}

export async function getOrCreateUserAuthToken(
  env: Env,
  principal: UserPrincipal
): Promise<string | null> {
  if (!authTokenSecret(env)) return null;

  const stored = await readStoredAuthToken(env.DB, principal.username);
  if (stored && (await validateAuthToken(env, stored.token, principal.username))) {
    return stored.token;
  }

  return saveNewUserAuthToken(env, principal.username);
}

export async function regenerateUserAuthToken(
  env: Env,
  principal: UserPrincipal
): Promise<string | null> {
  if (!authTokenSecret(env)) return null;
  return saveNewUserAuthToken(env, principal.username);
}

function authTokenFromRequest(request: Request): string | null {
  const dokuwikiHeader = request.headers.get("x-dokuwiki-token")?.trim();
  if (dokuwikiHeader) return dokuwikiHeader;

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function validateAuthToken(
  env: Env,
  token: string,
  expectedUsername?: string
): Promise<AuthTokenPayload | null> {
  const secret = authTokenSecret(env);
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null;
  const [encodedHeader, encodedPayload, signature] = parts as [string, string, string];
  const expectedSignature = await hmacSha256Base64(`${encodedHeader}.${encodedPayload}`, secret);
  if (!constantTimeEqual(signature, expectedSignature)) return null;

  const header = parseJsonBase64<{ alg?: unknown; typ?: unknown }>(encodedHeader);
  const payload = parseJsonBase64<AuthTokenPayload>(encodedPayload);
  if (!header || !payload) return null;
  if (header.alg !== "HS256" || header.typ !== "JWT") return null;
  if (payload.iss !== JWT_ISSUER || typeof payload.sub !== "string") return null;
  if (!Number.isFinite(payload.iat)) return null;
  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (expectedUsername && payload.sub !== expectedUsername) return null;

  const stored = await readStoredAuthToken(env.DB, payload.sub);
  if (!stored || !constantTimeEqual(stored.token, token)) return null;

  return payload;
}

async function saveNewUserAuthToken(env: Env, username: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = await createAuthToken(env, username, issuedAt);
  await writeStoredAuthToken(env.DB, username, { token, issuedAt });
  return token;
}

async function createAuthToken(env: Env, username: string, issuedAt: number): Promise<string> {
  const secret = authTokenSecret(env);
  if (!secret) throw new Error("DOKUWIKI_COOKIE_SALT is required for auth tokens.");

  const header = base64EncodeJson({ alg: "HS256", typ: "JWT" });
  const payload = base64EncodeJson({ iss: JWT_ISSUER, sub: username, iat: issuedAt });
  const signature = await hmacSha256Base64(`${header}.${payload}`, secret);
  return `${header}.${payload}.${signature}`;
}

async function readStoredAuthToken(
  db: D1Database,
  username: string
): Promise<StoredAuthToken | null> {
  const row = await db
    .prepare(
      `select value_json
       from metadata
       where subject_type = 'plugin'
         and subject_id = ?
         and key = ?`
    )
    .bind(authTokenSubject(username), AUTH_TOKEN_KEY)
    .first<MetadataRow>();

  if (!row) return null;

  try {
    const value = JSON.parse(row.value_json) as Partial<StoredAuthToken>;
    return typeof value.token === "string" && typeof value.issuedAt === "number"
      ? { token: value.token, issuedAt: value.issuedAt }
      : null;
  } catch {
    return null;
  }
}

async function writeStoredAuthToken(
  db: D1Database,
  username: string,
  token: StoredAuthToken
): Promise<void> {
  await db
    .prepare(
      `insert into metadata (subject_type, subject_id, key, value_json, updated_at)
       values ('plugin', ?, ?, ?, ?)
       on conflict(subject_type, subject_id, key) do update set
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`
    )
    .bind(
      authTokenSubject(username),
      AUTH_TOKEN_KEY,
      JSON.stringify(token),
      new Date(token.issuedAt * 1000).toISOString()
    )
    .run();
}

function authTokenSubject(username: string): string {
  return `auth-token:${username}`;
}

async function findActiveUserByUsername(
  db: D1Database,
  username: string
): Promise<AuthTokenUserRow | null> {
  return db
    .prepare(
      `select id, username, display_name, email, password_hash, is_disabled, created_at, updated_at
       from users
       where is_disabled = 0
         and username = ?
       limit 1`
    )
    .bind(username)
    .first<AuthTokenUserRow>();
}

async function listAuthTokenGroups(db: D1Database, userId: string): Promise<string[]> {
  const result = await db
    .prepare(
      `select g.name
       from groups g
       join user_groups ug on ug.group_id = g.id
       where ug.user_id = ?
       order by g.name asc`
    )
    .bind(userId)
    .all<AuthTokenGroupRow>();

  return result.results.map((row) => row.name);
}

function mapAuthTokenUser(row: AuthTokenUserRow): UserRecord {
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

function authTokenSecret(env: Env): string | null {
  return env.DOKUWIKI_COOKIE_SALT?.trim() || null;
}

async function hmacSha256Base64(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToBase64(new Uint8Array(signature));
}

function base64EncodeJson(value: unknown): string {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(value)));
}

function parseJsonBase64<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64ToBytes(value))) as T;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
