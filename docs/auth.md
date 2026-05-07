# Auth

The native auth implementation is being built around Workers-compatible primitives.

## Supported Backends

Launch auth will be a native D1-backed replacement for DokuWiki's `authplain` user model. LDAP, Active Directory, and PDO backends are not direct Pages runtime dependencies; they require a later import/sync bridge or an external identity layer such as Cloudflare Access.

## Anonymous Requests

Requests without a valid session resolve to an anonymous principal. Anonymous principals have no username, no user groups, and no revision author identity. ACL evaluation includes DokuWiki's special `@ALL` subject for anonymous visitors.

`/api/auth/session` exposes the current public principal shape for runtime checks.

Native admin-only routes currently require membership in the `admin` group.

## Login Sessions

Native login uses D1-backed users with the native password hash format. Successful logins create a random session token, store only its SHA-256 hash in D1, and issue an HTTP-only `SameSite=Lax` session cookie with `Secure` on HTTPS. Logout deletes the session row and clears the cookie. Page edit lock cookies use the same `HttpOnly`, `SameSite=Lax`, and HTTPS `Secure` flags.

## Password Hashing

New native accounts use PBKDF2-HMAC-SHA-256 through Web Crypto. Encoded hashes use:

```text
pbkdf2-sha256$iterations$saltBase64$hashBase64
```

The verifier rejects unsupported formats without throwing. Migration of existing DokuWiki `users.auth.php` hashes remains separate from native hash verification.
