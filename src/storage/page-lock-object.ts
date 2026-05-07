export class PageLockObject implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    const token = url.searchParams.get("token");

    if (!key || !token) {
      return new Response("Missing key or token", { status: 400 });
    }

    if (request.method === "PUT") {
      await this.state.storage.put(key, {
        token,
        expiresAt:
          url.searchParams.get("expiresAt") ?? new Date(Date.now() + 15 * 60_000).toISOString()
      });
      return new Response("locked");
    }

    if (request.method === "DELETE") {
      const current = await this.state.storage.get<{ token: string }>(key);
      if (current?.token === token) {
        await this.state.storage.delete(key);
      }
      return new Response("released");
    }

    return new Response("Method not allowed", { status: 405 });
  }
}
