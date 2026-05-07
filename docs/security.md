# Security

## CSRF

State-changing POST routes require a DokuWiki-style `sectok` value or `x-csrf-token` header that matches the `DW_CSRF_TOKEN` cookie. The cookie is HTTP-only, `SameSite=Lax`, and marked `Secure` on HTTPS. Server-rendered forms include the hidden token, and editor JavaScript forwards it for draft autosave and edit-lock refresh or release requests.

Preview rendering is exempt because it does not write storage.

## ACL

ACL records use DokuWiki permission levels: none `0`, read `1`, edit `2`, create `4`,
upload `8`, and delete `16`. Imported `acl.auth.php` rules are normalized with a
principal type of `all`, `group`, or `user` before they are stored in D1.

The ACL matcher follows DokuWiki's precedence model: exact page or media rules are
checked first, then namespace wildcard rules from the nearest namespace outward,
then the root `*` rule. If multiple rules match within the same scope, the highest
applicable permission wins. `%USER%` and `%GROUP%` rules are expanded for the
active principal before matching.

Route enforcement applies the matcher to page reads, page edit/create saves, page
revision/diff/source/revert actions, drafts, edit locks, media reads, media
manager access, media uploads, media deletes, and media reverts. Search, recent
changes, namespace indexes, backlinks, wanted/orphan reports, sitemap, RSS, and
Atom responses filter out pages that are hidden by `HIDE_PAGES` or unreadable by
the active principal. `SNEAKY_INDEX=1` prevents namespace indexes from listing a
namespace that lacks namespace-level read permission.

`/admin/acl` provides a native ACL manager for users in the `admin` group. It can
add, update, and delete D1-backed ACL rules and uses the same CSRF protection as
other state-changing routes.
