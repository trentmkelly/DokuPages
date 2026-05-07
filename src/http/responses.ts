export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");

  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers
  });
}

export function htmlResponse(body: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");

  return new Response(body, {
    ...init,
    headers
  });
}

export function notFoundResponse(message: string): Response {
  return jsonResponse({ error: message }, { status: 404 });
}

export function conflictResponse(message: string): Response {
  return jsonResponse({ error: message }, { status: 409 });
}

export function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location
    }
  });
}
