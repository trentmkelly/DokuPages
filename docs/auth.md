# Auth

The native auth implementation is being built around Workers-compatible primitives.

## Supported Backends

Launch auth will be a native D1-backed replacement for DokuWiki's `authplain` user model. LDAP, Active Directory, and PDO backends are not direct Pages runtime dependencies; they require a later import/sync bridge or an external identity layer such as Cloudflare Access.

## Anonymous Requests

Requests without a valid session resolve to an anonymous principal. Anonymous principals have no username, no user groups, and no revision author identity. ACL evaluation includes DokuWiki's special `@ALL` subject for anonymous visitors.

`/api/auth/session` exposes the current public principal shape for runtime checks.

Native admin-only routes require membership in the `admin` group. Manager-level routes such as the admin dashboard accept either the `manager` or `admin` group; ACL editing remains admin-only.

## Login Sessions

Native login uses D1-backed users with the native password hash format. Successful logins create a random session token, store only its SHA-256 hash in D1, and issue an HTTP-only `SameSite=Lax` session cookie with `Secure` on HTTPS. Logout deletes the session row and clears the cookie. Page edit lock cookies use the same `HttpOnly`, `SameSite=Lax`, and HTTPS `Secure` flags. Disabled user rows are rejected during login and when existing session cookies are resolved.

Failed login attempts are rate limited by client IP and username in KV. Five failed attempts in a 15 minute window block further attempts for that pair and return `429` with `Retry-After: 900`; a successful login clears the counter.

Login success, login failure, login rate-limit, and logout events emit structured `auth_event` logs with non-sensitive actor and request metadata. Passwords, session tokens, and cookie values are never logged.

## Deferred Account Flows

Registration, profile editing, password reset, and persistent remember-me tokens
are not supported for the first Pages launch. Direct native paths, matching
`/api/auth/*` paths, and legacy DokuWiki actions return explicit `501` JSON
instead of falling through to unrelated page views.

The secure launch replacement for remember-me behavior is the HTTP-only native
session cookie. Longer-lived persistent login tokens need a separate threat
model before they are enabled.

## Password Hashing

New native accounts use PBKDF2-HMAC-SHA-256 through Web Crypto. Encoded hashes use:

```text
pbkdf2-sha256$iterations$saltBase64$hashBase64
```

The importer migrates `users.auth.php` rows into D1 users, groups, and user-group memberships using DokuWiki `authplain` escaping rules. Migrated legacy hashes are preserved for auditability, but the native verifier rejects unsupported hash formats without throwing until a reset or rehash path converts those accounts.
