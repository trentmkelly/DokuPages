# Auth

The native auth implementation is being built around Workers-compatible primitives.

## Supported Backends

Launch auth is a native D1-backed replacement for DokuWiki's `authplain` user
model. DokuWiki's bundled `authad`, `authldap`, and `authpdo` plugins are
supported through an external sync bridge rather than runtime PHP plugin
execution: operators export users and groups from the source backend, sync those
records into D1, and authenticate requests through a trusted identity layer such
as Cloudflare Access.

## Anonymous Requests

Requests without a valid session resolve to an anonymous principal. Anonymous principals have no username, no user groups, and no revision author identity. ACL evaluation includes DokuWiki's special `@ALL` subject for anonymous visitors.

`/api/auth/session` exposes the current public principal shape for runtime checks.

Native admin-only routes use DokuWiki-style `superuser` member-list matching
from the `SUPERUSER` runtime variable. Manager-level routes such as the admin
dashboard accept either `SUPERUSER` matches or `MANAGER` matches. The defaults
preserve the native launch groups: `SUPERUSER=@admin` and `MANAGER=@manager`.

To promote an existing D1 user without manually editing rows, run:

```sh
npm run user:promote-superuser -- --username testuser
```

The operator script adds the user to the first group in `SUPERUSER` such as
`@admin`, or accepts `--group <group>` for deployments whose `SUPERUSER` setting
contains only literal usernames.
Both variables accept comma-separated usernames and `@groups`, including
`@ALL`, matching upstream member-list behavior.

## External Auth Sync Bridge

`scripts/sync-auth-bridge.mjs` accepts normalized user/group exports from
`authad`, `authldap`, or `authpdo` and emits idempotent D1 SQL for the native
`users`, `groups`, and `user_groups` tables.

```json
{
  "backend": "authldap",
  "users": [
    {
      "username": "kiwi",
      "displayName": "Kiwi Example",
      "email": "kiwi@example.test",
      "groups": ["user", "staff"]
    }
  ]
}
```

Generate and apply the SQL with:

```sh
npm run auth:sync:sql -- --input .wrangler/auth-bridge-users.json --sql-out .wrangler/auth-bridge-sync.sql
npx wrangler d1 execute dokuwiki_pages_dev --remote --file .wrangler/auth-bridge-sync.sql
```

Set `EXTERNAL_AUTH_MODE=cloudflare_access` to trust a Cloudflare Access identity
header for request principals. The default email header is
`CF-Access-Authenticated-User-Email`; override it with
`EXTERNAL_AUTH_EMAIL_HEADER`. Set `EXTERNAL_AUTH_USERNAME_HEADER` only when the
Access policy supplies a separate username header. The header identity must
match a synced D1 user by email or username, and disabled D1 users remain
blocked.

## Login Sessions

Native login uses D1-backed users with the native password hash format. Successful logins create a random session token, store only its SHA-256 hash in D1, and issue an HTTP-only `SameSite=Lax` session cookie with `Secure` on HTTPS. Logout deletes the session row and clears the cookie. Page edit lock cookies use the same `HttpOnly`, `SameSite=Lax`, and HTTPS `Secure` flags. Disabled user rows are rejected during login and when existing session cookies are resolved.

Failed login attempts are rate limited by client IP and username in KV. Five failed attempts in a 15 minute window block further attempts for that pair and return `429` with `Retry-After: 900`; a successful login clears the counter.

Upstream `auth_security_timeout` controls how long cached session auth data may
be trusted before DokuWiki rechecks the auth backend. The Pages port keeps no
cached auth principal between requests. Every request validates the opaque
session token hash, session expiry, current user row, disabled flag, and group
memberships from D1. That is equivalent to upstream's strict
`auth_security_timeout=0` behavior and keeps long-lived native sessions
server-revocable without encrypted password cookies.

When `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are both configured, login
submissions must include a valid Cloudflare Turnstile response before password
verification or rate-limit updates run.

Login success, login failure, login rate-limit, logout, profile update, and
profile delete events emit typed `auth_event` records through the native auth
event handler boundary in `src/auth/events.ts`. The default handler writes
structured logs with non-sensitive actor and request metadata. Passwords,
session tokens, and cookie values are never logged.

## Authentication Tokens

The profile page includes a DokuWiki-compatible authentication token form. It
matches upstream `Authtoken.php` behavior by requiring a valid `sectok` before
regenerating the token, then redirecting back to the profile page. Tokens use
the same JWT-shaped HS256 format as upstream DokuWiki with `iss=dokuwiki`,
`sub=<username>`, and `iat=<issued timestamp>`.

`DOKUWIKI_COOKIE_SALT` signs auth tokens. The current token is stored in D1
metadata for revocation, so generating a new token invalidates the previous
token. Requests can authenticate with either `Authorization: Bearer <token>` or
`X-DokuWiki-Token: <token>`.

## Localized Auth Text

Login, logout, registration, password reset, permission denied, and page-lock
views use generated language resources from upstream DokuWiki `inc/lang/<lang>`
files. `WIKI_LANG` selects the localized copy with English fallback. Regenerate
the native TypeScript resource with `npm run lang:auth` after updating the
upstream DokuWiki checkout.

Imported `conf/lang/<lang>/lang.php` and matching auth page `.txt` files are
loaded from D1 at request time and override the generated bundle. This covers
custom strings such as `btn_login` plus page intros such as `login.txt`,
`register.txt`, `resendpwd.txt`, `resetpwd.txt`, `denied.txt`, and `locked.txt`.

## Profile Updates

Authenticated users can update their display name and email address at
`/profile`. By default, `PROFILECONFIRM=1` matches upstream DokuWiki and
requires the current password before any profile change is saved. Setting
`PROFILECONFIRM=0` disables that confirmation step. Password changes keep the
current session and remove other active sessions for that user.

The profile page also implements DokuWiki's own-account delete flow when
`profile_delete` is not listed in `DISABLE_ACTIONS`. Deletion requires the
confirmation checkbox, CSRF token, and current password when `PROFILECONFIRM` is
enabled. It removes the D1 user, sessions, groups, subscriptions, reset tokens,
and drafts, then clears the browser session cookie. Historical page and media
author names are preserved like upstream `authplain` history.

## Registration And Password Reset

`/register` creates native D1 users and adds them to the `user` group. When
`EMAIL_REGISTRATION_NOTIFY` is configured, the registration handler sends a
registration notification through the outbound email adapter. The DokuWiki
aliases `REGISTERNOTIFY`, `MAILFROM`, `MAILRETURNPATH`, `MAILPREFIX`, and
`HTMLMAIL` are supported by the adapter, and outgoing subjects receive the same
`[wiki title]` or `[mailprefix]` prefix as upstream. When Turnstile is
configured, registration submissions are verified through Cloudflare Siteverify
before the user row is created.

With `AUTOPASSWD=1`, registration follows DokuWiki's generated-password mode:
the password fields are hidden, a pronounceable DokuWiki-style password is
generated, and the password is emailed to the new account address before the
user row is created. Generated-password registration requires outbound email to
be configured and does not create an immediate login session.

`/resendpwd` and `/password-reset` request password reset email. Reset tokens are
stored only as SHA-256 hashes in D1, expire after one hour, and are marked used
when the password is changed. A successful reset invalidates existing sessions
for that user.

## Deferred Account Flows

Upstream DokuWiki's `rememberme` sticky-cookie format is intentionally not
implemented in the Pages port. That format persists encrypted password-derived
credentials in a client cookie for up to one year, which does not match the
native Workers security model.

The permanent replacement is the native D1-backed session cookie. Sessions use
random opaque tokens, store only SHA-256 token hashes in D1, expire after 24
hours, and can be revoked server-side on logout, password reset, password
change, or account disablement. Login submissions that include upstream
remember-me fields are accepted for form compatibility but still receive only
the native session cookie.

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
`password_hash` to the native PBKDF2 format; new registrations, generated
passwords, profile password changes, and password resets never create legacy
hashes.
