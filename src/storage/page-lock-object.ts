interface LockRequestBody {
  action?: "acquire" | "refresh" | "release" | "status";
  subjectType?: "page" | "media";
  subjectId?: string;
  ownerId?: string;
  ownerName?: string | null;
  token?: string;
  ttlSeconds?: number;
}

interface StoredLock {
  subjectType: "page" | "media";
  subjectId: string;
  ownerId: string;
  ownerName: string | null;
  token: string;
  expiresAt: string;
  updatedAt: string;
}

const LOCK_KEY = "lock";
const DEFAULT_LOCK_TTL_SECONDS = 15 * 60;

export class PageLockObject implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, { status: 405 });
    }

    const body = await readBody(request);

    if (!body.action) {
      return json({ error: "Missing lock action." }, { status: 400 });
    }

    if (body.action === "status") {
      return json({ lock: publicLock(await this.currentLock()) });
    }

    if (!isValidLockRequest(body)) {
      return json({ error: "Missing lock subject or token." }, { status: 400 });
    }

    if (body.action === "release") {
      const current = await this.currentLock();

      if (current?.token === body.token) {
        await this.state.storage.delete(LOCK_KEY);
        return json({ ok: true, released: true });
      }

      return json({ ok: true, released: false, lock: publicLock(current) });
    }

    const current = await this.currentLock();

    if (current && current.token !== body.token) {
      return json({ ok: false, lock: publicLock(current) }, { status: 423 });
    }

    const now = new Date();
    const lock: StoredLock = {
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      ownerId: body.ownerId,
      ownerName: body.ownerName ?? null,
      token: body.token,
      expiresAt: new Date(now.getTime() + lockTtlSeconds(body) * 1000).toISOString(),
      updatedAt: now.toISOString()
    };

    await this.state.storage.put(LOCK_KEY, lock);

    return json({ ok: true, lock: publicLock(lock) });
  }

  private async currentLock(): Promise<StoredLock | null> {
    const lock = await this.state.storage.get<StoredLock>(LOCK_KEY);

    if (!lock) return null;

    if (lock.expiresAt <= new Date().toISOString()) {
      await this.state.storage.delete(LOCK_KEY);
      return null;
    }

    return lock;
  }
}

function isValidLockRequest(
  body: LockRequestBody
): body is Required<Pick<LockRequestBody, "subjectType" | "subjectId" | "ownerId" | "token">> &
  LockRequestBody {
  return Boolean(body.subjectType && body.subjectId && body.ownerId && body.token);
}

function lockTtlSeconds(body: LockRequestBody): number {
  const ttl = Number(body.ttlSeconds);
  if (!Number.isFinite(ttl)) return DEFAULT_LOCK_TTL_SECONDS;
  return Math.max(60, Math.min(Math.floor(ttl), DEFAULT_LOCK_TTL_SECONDS));
}

function publicLock(lock: StoredLock | null): Omit<StoredLock, "token"> | null {
  if (!lock) return null;

  return {
    subjectType: lock.subjectType,
    subjectId: lock.subjectId,
    ownerId: lock.ownerId,
    ownerName: lock.ownerName,
    expiresAt: lock.expiresAt,
    updatedAt: lock.updatedAt
  };
}

async function readBody(request: Request): Promise<LockRequestBody> {
  try {
    return (await request.json()) as LockRequestBody;
  } catch {
    return {};
  }
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}
