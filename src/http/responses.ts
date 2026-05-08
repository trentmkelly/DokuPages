const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src https://challenges.cloudflare.com; img-src 'self' data:; object-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = securityHeaders(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers
  });
}

export function htmlResponse(body: string, init: ResponseInit = {}): Response {
  const headers = securityHeaders(init.headers);
  headers.set("content-type", "text/html; charset=utf-8");

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

export function redirectResponse(location: string, status = 303): Response {
  return new Response(null, {
    status,
    headers: securityHeaders({ location })
  });
}

export function securityHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  return headers;
}
