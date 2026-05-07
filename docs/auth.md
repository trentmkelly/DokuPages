# Auth

The native auth implementation is being built around Workers-compatible primitives.

## Supported Backends

Launch auth will be a native D1-backed replacement for DokuWiki's `authplain` user model. LDAP, Active Directory, and PDO backends are not direct Pages runtime dependencies; they require a later import/sync bridge or an external identity layer such as Cloudflare Access.

## Anonymous Requests

Requests currently resolve to an anonymous principal until session cookies are implemented. Anonymous principals have no username, no user groups, and no revision author identity. ACL evaluation should still include DokuWiki's special `@ALL` subject for anonymous visitors.

`/api/auth/session` exposes the current public principal shape for runtime checks.

## Password Hashing

New native accounts use PBKDF2-HMAC-SHA-256 through Web Crypto. Encoded hashes use:

```text
pbkdf2-sha256$iterations$saltBase64$hashBase64
```

The verifier rejects unsupported formats without throwing. Migration of existing DokuWiki `users.auth.php` hashes remains separate from native hash verification.
