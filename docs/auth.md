# Auth

The native auth implementation is being built around Workers-compatible primitives.

## Password Hashing

New native accounts use PBKDF2-HMAC-SHA-256 through Web Crypto. Encoded hashes use:

```text
pbkdf2-sha256$iterations$saltBase64$hashBase64
```

The verifier rejects unsupported formats without throwing. Migration of existing DokuWiki `users.auth.php` hashes remains separate from native hash verification.
