import type { UserRecord } from "../storage/interfaces";
import { verifyPassword } from "./password";
import { anonymousPrincipal, principalFromUser, type AuthPrincipal } from "./principal";

const SESSION_TOKEN_BYTES = 32;
const SESSION_TTL_SECONDS = 60 * 60 * 24;

export interface LoginSession {
  id: string;
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

interface SessionCookie {
  id: string;
  token: string;
}

interface SessionUserRow {
  session_id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  is_disabled: number;
  created_at: string;
  updated_at: string;
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  is_disabled: number;
  created_at: string;
  updated_at: string;
}

interface GroupRow {
  name: string;
}

export async function authenticateUser(
  db: D1Database,
  username: string,
  password: string
): Promise<UserRecord | null> {
  const user = await getUserByUsername(db, username);
  if (!user || user.isDisabled || !user.passwordHash) return null;

  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

export async function createLoginSession(
  db: D1Database,
  userId: string,
  now = new Date()
): Promise<LoginSession> {
  const id = crypto.randomUUID();
  const token = randomToken();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();

  await db
    .prepare(
      `insert into sessions (id, user_id, token_hash, expires_at, created_at)
       values (?, ?, ?, ?, ?)`
    )
    .bind(id, userId, await sha256(token), expiresAt, createdAt)
    .run();

  return { id, token, userId, expiresAt, createdAt };
}

export async function principalFromSessionCookie(
  db: D1Database,
  cookieValue: string | null,
  now = new Date()
): Promise<AuthPrincipal> {
  const cookie = parseSessionCookieValue(cookieValue);
  if (!cookie) return anonymousPrincipal();

  const row = await db
    .prepare(
      `select s.id as session_id, s.user_id, s.token_hash, s.expires_at,
              u.id, u.username, u.display_name, u.email, u.password_hash,
              u.is_disabled, u.created_at, u.updated_at
       from sessions s
       join users u on u.id = s.user_id
       where s.id = ?`
    )
    .bind(cookie.id)
    .first<SessionUserRow>();

  if (!row || row.is_disabled === 1 || row.expires_at <= now.toISOString()) {
    return anonymousPrincipal();
  }

  if (!constantTimeEqual(await sha256(cookie.token), row.token_hash)) {
    return anonymousPrincipal();
  }

  return principalFromUser(mapUser(row), await listUserGroups(db, row.user_id));
}

export async function deleteLoginSession(
  db: D1Database,
  cookieValue: string | null
): Promise<void> {
  const cookie = parseSessionCookieValue(cookieValue);
  if (!cookie) return;

  await db.prepare("delete from sessions where id = ?").bind(cookie.id).run();
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      return rawValue.join("=") || "";
    }
  }

  return null;
}

export function sessionCookieHeader(name: string, session: LoginSession, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${session.id}.${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearSessionCookieHeader(name: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

async function getUserByUsername(db: D1Database, username: string): Promise<UserRecord | null> {
  const row = await db
    .prepare(
      `select id, username, display_name, email, password_hash, is_disabled, created_at, updated_at
       from users
       where username = ?`
    )
    .bind(username)
    .first<UserRow>();

  return row ? mapUser(row) : null;
}

async function listUserGroups(db: D1Database, userId: string): Promise<string[]> {
  const result = await db
    .prepare(
      `select g.name
       from groups g
       join user_groups ug on ug.group_id = g.id
       where ug.user_id = ?
       order by g.name asc`
    )
    .bind(userId)
    .all<GroupRow>();

  return result.results.map((row) => row.name);
}

function parseSessionCookieValue(value: string | null): SessionCookie | null {
  if (!value) return null;

  const [id, token] = value.split(".");
  if (!id || !token) return null;

  return { id, token };
}

function mapUser(row: UserRow): UserRecord {
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

function randomToken(): string {
  const bytes = new Uint8Array(SESSION_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
