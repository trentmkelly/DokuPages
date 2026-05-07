import type { LockRecord } from "./interfaces";

export interface PageLockInfo {
  subjectType: LockRecord["subjectType"];
  subjectId: string;
  ownerId: string;
  ownerName: string | null;
  expiresAt: string;
  updatedAt: string;
}

export interface PageLockRequest {
  subjectType: LockRecord["subjectType"];
  subjectId: string;
  ownerId: string;
  ownerName?: string | null;
  token: string;
  ttlSeconds?: number;
}

export type PageLockResult =
  | {
      ok: true;
      lock: PageLockInfo;
    }
  | {
      ok: false;
      lock: PageLockInfo | null;
    };

export async function acquirePageLock(
  namespace: DurableObjectNamespace,
  request: PageLockRequest
): Promise<PageLockResult> {
  return lockRequest(namespace, "acquire", request);
}

export async function refreshPageLock(
  namespace: DurableObjectNamespace,
  request: PageLockRequest
): Promise<PageLockResult> {
  return lockRequest(namespace, "refresh", request);
}

export async function releasePageLock(
  namespace: DurableObjectNamespace,
  request: PageLockRequest
): Promise<boolean> {
  const response = await lockFetch(namespace, {
    ...request,
    action: "release"
  });
  const body = (await response.json()) as { released?: boolean };

  if (!response.ok) {
    throw new Error(`Page lock release failed with status ${response.status}.`);
  }

  return Boolean(body.released);
}

async function lockRequest(
  namespace: DurableObjectNamespace,
  action: "acquire" | "refresh",
  request: PageLockRequest
): Promise<PageLockResult> {
  const response = await lockFetch(namespace, { ...request, action });
  const body = (await response.json()) as { ok?: boolean; lock?: PageLockInfo | null };

  if (response.status === 423) {
    return {
      ok: false,
      lock: body.lock ?? null
    };
  }

  if (!response.ok || !body.lock) {
    throw new Error(`Page lock ${action} failed with status ${response.status}.`);
  }

  return {
    ok: true,
    lock: body.lock
  };
}

async function lockFetch(
  namespace: DurableObjectNamespace,
  body: PageLockRequest & { action: "acquire" | "refresh" | "release" }
): Promise<Response> {
  const id = namespace.idFromName(`${body.subjectType}:${body.subjectId}`);
  const stub = namespace.get(id);

  return stub.fetch("https://page-lock.local/", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
