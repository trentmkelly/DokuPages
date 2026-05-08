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

When `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are both configured, login
submissions must include a valid Cloudflare Turnstile response before password
verification or rate-limit updates run.

Login success, login failure, login rate-limit, logout, and profile update events emit typed `auth_event` records through the native auth event handler boundary in `src/auth/events.ts`. The default handler writes structured logs with non-sensitive actor and request metadata. Passwords, session tokens, and cookie values are never logged.

## Profile Updates

Authenticated users can update their display name and email address at
`/profile`. Password changes are supported through the same page after the user
confirms their current password. Changing a password keeps the current session
and removes other active sessions for that user.

## Registration And Password Reset

`/register` creates native D1 users and adds them to the `user` group. When
`EMAIL_REGISTRATION_NOTIFY` is configured, the registration handler sends a
registration notification through the outbound email adapter. When Turnstile is
configured, registration submissions are verified through Cloudflare Siteverify
before the user row is created.

`/resendpwd` and `/password-reset` request password reset email. Reset tokens are
stored only as SHA-256 hashes in D1, expire after one hour, and are marked used
when the password is changed. A successful reset invalidates existing sessions
for that user.

## Deferred Account Flows

Persistent remember-me tokens are not supported for the first Pages launch.

The secure launch replacement for remember-me behavior is the HTTP-only native
session cookie. Longer-lived persistent login tokens need a separate threat
model before they are enabled.

## Password Hashing

New native accounts use PBKDF2-HMAC-SHA-256 through Web Crypto. Encoded hashes use:

```text
pbkdf2-sha256$iterations$saltBase64$hashBase64
```

Cloudflare Workers currently caps PBKDF2 at 100000 iterations, so new native
hashes use that value. Higher-iteration native hashes are treated as unsupported
credentials instead of throwing a runtime error.

The importer migrates `users.auth.php` rows into D1 users, groups, and user-group
memberships using DokuWiki `authplain` escaping rules. The login verifier accepts
the DokuWiki `passcrypt` formats needed for imported accounts: `bcrypt`, `smd5`,
`md5`, `sha1`, `ssha`, DES `crypt`, pre-4.1 MySQL `mysql`, and MySQL 4.1+
`my411`. A successful legacy-hash login immediately rewrites that user's
`password_hash` to the native PBKDF2 format; new registrations, profile password
changes, and password resets never create legacy hashes.
