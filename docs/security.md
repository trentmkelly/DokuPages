# Security

## CSRF

State-changing POST routes require a DokuWiki-style `sectok` value or `x-csrf-token` header that matches the `DW_CSRF_TOKEN` cookie. The cookie is HTTP-only, `SameSite=Lax`, and marked `Secure` on HTTPS. Server-rendered forms include the hidden token, and editor JavaScript forwards it for draft autosave and edit-lock refresh or release requests.

Preview rendering is exempt because it does not write storage.
